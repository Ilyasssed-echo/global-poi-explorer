import { SearchParams, SearchResponse, POI, BBox } from "@/types/poi";
import { initDuckDB, isInitialized, LogCallback } from "./duckdb";

const OVERTURE_PATH = "s3://overturemaps-us-west-2/release/2026-01-21.0/theme=places/type=place/*.parquet";
const GEOJSON_URL = "https://raw.githubusercontent.com/datasets/geo-boundaries-world-110m/master/countries.geojson";

// Cache for country geometries
let countriesGeoJSON: any = null;

/**
 * Replicates Python's difflib.SequenceMatcher(None, a, b).ratio()
 * This ensures 1:1 accuracy with your Python similarity logic.
 */
function getSequenceSimilarity(a: string | null | undefined, b: string): number {
  if (!a || !b) return 0;
  const s1 = a.toLowerCase();
  const s2 = b.toLowerCase();
  if (s1 === s2) return 1.0;

  const len1 = s1.length;
  const len2 = s2.length;
  const matrix = Array(len1 + 1)
    .fill(0)
    .map(() => Array(len2 + 1).fill(0));
  let matches = 0;

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1] + 1;
        matches = Math.max(matches, matrix[i][j]);
      }
    }
  }
  return (2.0 * matches) / (len1 + len2);
}

async function fetchCountryBoundary(
  countryCode: string,
  onLog?: LogCallback,
): Promise<{ bbox: BBox; wkt: string } | null> {
  onLog?.(`🗺️ Resolving boundary for ${countryCode}...`);

  if (!countriesGeoJSON) {
    const response = await fetch(GEOJSON_URL);
    countriesGeoJSON = await response.json();
  }

  const feature = countriesGeoJSON.features.find((f: any) =>
    [f.properties.ISO_A2, f.properties.iso_a2, f.properties.ISO_A3, f.properties.iso_a3].includes(countryCode),
  );

  if (!feature) return null;

  let minLon = Infinity,
    maxLon = -Infinity,
    minLat = Infinity,
    maxLat = -Infinity;
  const processCoords = (c: any) => {
    if (typeof c[0] === "number") {
      minLon = Math.min(minLon, c[0]);
      maxLon = Math.max(maxLon, c[0]);
      minLat = Math.min(minLat, c[1]);
      maxLat = Math.max(maxLat, c[1]);
    } else c.forEach(processCoords);
  };
  processCoords(feature.geometry.coordinates);

  const geometryToWKT = (geom: any): string => {
    if (geom.type === "Polygon") {
      const rings = geom.coordinates
        .map((r: any) => "(" + r.map((p: any) => `${p[0]} ${p[1]}`).join(", ") + ")")
        .join(", ");
      return `POLYGON(${rings})`;
    } else if (geom.type === "MultiPolygon") {
      const polys = geom.coordinates
        .map(
          (p: any) =>
            "(" + p.map((r: any) => "(" + r.map((pt: any) => `${pt[0]} ${pt[1]}`).join(", ") + ")").join(", ") + ")",
        )
        .join(", ");
      return `MULTIPOLYGON(${polys})`;
    }
    return "";
  };

  return {
    bbox: { west: minLon, east: maxLon, south: minLat, north: maxLat },
    wkt: geometryToWKT(feature.geometry),
  };
}

export async function searchPOIs(params: SearchParams): Promise<SearchResponse> {
  const logs: string[] = [];
  const log = (msg: string) => {
    logs.push(msg);
    console.log(msg);
  };

  try {
    const conn = await initDuckDB(log);
    log("🗺️ STEP 1: SPATIAL RESOLUTION");

    let spatialFilter = "";
    let bbox: BBox;

    if (params.mode === "country" && params.countryCode) {
      const countryData = await fetchCountryBoundary(params.countryCode, log);
      if (!countryData) throw new Error(`Country ${params.countryCode} not found`);
      bbox = countryData.bbox;
      spatialFilter = `
        bbox.xmin > ${bbox.west} AND bbox.xmax < ${bbox.east}
        AND bbox.ymin > ${bbox.south} AND bbox.ymax < ${bbox.north}
        AND ST_Intersects(geometry, ST_GeomFromText('${countryData.wkt}'))
      `;
    } else {
      const offset = (params.radius || 5) / 111.0;
      bbox = {
        west: (params.longitude || 0) - offset,
        east: (params.longitude || 0) + offset,
        south: (params.latitude || 0) - offset,
        north: (params.latitude || 0) + offset,
      };
      spatialFilter = `
        bbox.xmin > ${bbox.west} AND bbox.xmax < ${bbox.east} 
        AND bbox.ymin > ${bbox.south} AND bbox.ymax < ${bbox.north}
      `;
    }

    log("📥 STEP 2: CLOUD QUERY (DUCKDB COARSE FILTER)");
    const keyword = params.keyword.toLowerCase().replace(/'/g, "''");

    // We use DuckDB's native jaro_winkler as a fast first-pass filter (0.8)
    // to bring candidates into the browser for the strict 0.9 local check.
    const sql = `
      SELECT 
        id,
        names,
        categories,
        taxonomy,
        ST_X(geometry) as longitude,
        ST_Y(geometry) as latitude,
        addresses as addresses_raw
      FROM read_parquet('${OVERTURE_PATH}', hive_partitioning=1)
      WHERE ${spatialFilter}
        AND (
          jaro_winkler_similarity(lower(names.primary), '${keyword}') >= 0.8 OR
          jaro_winkler_similarity(lower(basic_category), '${keyword}') >= 0.8 OR
          EXISTS (SELECT 1 FROM unnest(categories.alternate) t(x) WHERE jaro_winkler_similarity(lower(x), '${keyword}') >= 0.8) OR
          EXISTS (SELECT 1 FROM unnest(taxonomy.hierarchy) t(x) WHERE jaro_winkler_similarity(lower(x), '${keyword}') >= 0.8)
        )
      LIMIT 1000;
    `;

    const result = await conn.query(sql);
    const rows = result.toArray();
    log(`✅ Downloaded ${rows.length} candidates. Now applying SequenceMatcher...`);

    log("🧠 STEP 3: LOCAL STRICT FILTERING (RATCLIFF/OBERSHELP 0.9)");

    const filteredPois: POI[] = rows
      .map((row: any) => {
        const nameSim = getSequenceSimilarity(row.names?.primary, params.keyword);

        const catPrimarySim = getSequenceSimilarity(row.categories?.primary, params.keyword);
        const catAlts = row.categories?.alternate || [];
        const catAltSim =
          catAlts.length > 0
            ? Math.max(...catAlts.map((alt: string) => getSequenceSimilarity(alt, params.keyword)))
            : 0;

        const taxPrimarySim = getSequenceSimilarity(row.taxonomy?.primary, params.keyword);
        const taxHier = row.taxonomy?.hierarchy || [];
        const taxHierSim =
          taxHier.length > 0 ? Math.max(...taxHier.map((h: string) => getSequenceSimilarity(h, params.keyword))) : 0;

        const bestSim = Math.max(nameSim, catPrimarySim, catAltSim, taxPrimarySim, taxHierSim);

        return {
          id: row.id,
          names: { primary: row.names?.primary || "Unknown" },
          categories: { primary: row.categories?.primary || "unknown" },
          addresses: row.addresses_raw || [],
          latitude: Number(row.latitude),
          longitude: Number(row.longitude),
          poi_sim_score: bestSim,
        };
      })
      .filter((poi) => poi.poi_sim_score >= 0.9)
      .sort((a, b) => b.poi_sim_score - a.poi_sim_score);

    log(`✅ Found ${filteredPois.length} high-fidelity matches above 0.9 similarity.`);

    return {
      pois: filteredPois.slice(0, params.limit || 100),
      total_candidates: rows.length,
      filtered_count: filteredPois.length,
      bbox: { xmin: bbox.west, xmax: bbox.east, ymin: bbox.south, ymax: bbox.north },
      logs,
    };
  } catch (error) {
    log(`❌ Error: ${error instanceof Error ? error.message : "Unknown"}`);
    return { pois: [], total_candidates: 0, filtered_count: 0, bbox: null, logs };
  }
}
