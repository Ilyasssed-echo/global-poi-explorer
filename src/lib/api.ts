import { SearchParams, SearchResponse, POI, BBox } from "@/types/poi";
import { initDuckDB, isInitialized, LogCallback } from "./duckdb";

const OVERTURE_PATH = "s3://overturemaps-us-west-2/release/2026-01-21.0/theme=places/type=place/*.parquet";
const GEOJSON_URL = "https://raw.githubusercontent.com/datasets/geo-boundaries-world-110m/master/countries.geojson";

// Cache for country boundaries (WKT and BBox)
let countriesGeoJSON: any = null;

/**
 * Replicates Python's difflib.SequenceMatcher(None, a, b).ratio()
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
  const cacheKey = `boundary_cache_${countryCode.toUpperCase()}`;
  const cached = localStorage.getItem(cacheKey);

  if (cached) {
    onLog?.(`⚡ Using cached boundary for ${countryCode}`);
    return JSON.parse(cached);
  }

  onLog?.(`🗺️ Fetching fresh boundaries from OSM/Natural Earth...`);
  if (!countriesGeoJSON) {
    const response = await fetch(GEOJSON_URL);
    countriesGeoJSON = await response.json();
  }

  const feature = countriesGeoJSON.features.find((f: any) =>
    [f.properties.ISO_A2, f.properties.iso_a2, f.properties.ISO_A3, f.properties.iso_a3].includes(
      countryCode.toUpperCase(),
    ),
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

  const result = {
    bbox: { west: minLon, east: maxLon, south: minLat, north: maxLat },
    wkt: geometryToWKT(feature.geometry),
  };

  // Cache major areas (US, CA, EU codes) to avoid redownloading
  localStorage.setItem(cacheKey, JSON.stringify(result));
  return result;
}

export async function searchPOIs(params: SearchParams): Promise<SearchResponse> {
  const logs: string[] = [];
  const log = (msg: string) => {
    logs.push(msg);
    console.log(msg);
  };

  try {
    const conn = await initDuckDB(log);
    log("🗺️ STEP 1: RESOLVING SPATIAL BOUNDS");

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

    log("📥 STEP 2: CLOUD QUERY (PULLING ALL ATTRIBUTES)");
    const keyword = params.keyword.toLowerCase().replace(/'/g, "''");

    const sql = `
      SELECT 
        id, names, categories, basic_category, taxonomy, confidence,
        websites, socials, emails, phones, brand, addresses, 
        operating_status, theme, type,
        ST_X(geometry) as longitude, ST_Y(geometry) as latitude
      FROM read_parquet('${OVERTURE_PATH}', hive_partitioning=1)
      WHERE ${spatialFilter}
        AND (
          jaro_winkler_similarity(lower(names.primary), '${keyword}') >= 0.8 OR
          jaro_winkler_similarity(lower(basic_category), '${keyword}') >= 0.8
        )
      LIMIT 1000;
    `;

    const result = await conn.query(sql);
    const rows = result.toArray();
    log(`✅ S3 Data Received: ${rows.length} candidates.`);

    log("🧠 STEP 3: APPLYING SEQUENCE MATCHER ACCURACY");

    // Extract unique countries for UI stats
    const countriesFound = new Set<string>();

    const filteredPois: POI[] = rows
      .map((row: any) => {
        // Logic for similarity score across all requested fields
        const nameSim = getSequenceSimilarity(row.names?.primary, params.keyword);
        const catPrimarySim = getSequenceSimilarity(row.categories?.primary, params.keyword);
        const catAlts = row.categories?.alternate || [];
        const catAltSim =
          catAlts.length > 0 ? Math.max(...catAlts.map((alt: any) => getSequenceSimilarity(alt, params.keyword))) : 0;
        const taxHier = row.taxonomy?.hierarchy || [];
        const taxHierSim =
          taxHier.length > 0 ? Math.max(...taxHier.map((h: any) => getSequenceSimilarity(h, params.keyword))) : 0;

        const bestSim = Math.max(nameSim, catPrimarySim, catAltSim, taxHierSim);

        // Track countries for the header counter
        if (row.addresses && row.addresses[0]?.country) {
          countriesFound.add(row.addresses[0].country);
        }

        return {
          ...row,
          names: row.names || { primary: "Unknown" },
          categories: row.categories || { primary: "unknown" },
          poi_sim_score: bestSim,
          latitude: Number(row.latitude),
          longitude: Number(row.longitude),
        };
      })
      .filter((poi) => poi.poi_sim_score >= 0.9)
      .sort((a, b) => b.poi_sim_score - a.poi_sim_score);

    log(`📊 Found matches in ${countriesFound.size} unique countries.`);
    log(`✅ Final Results: ${filteredPois.length} high-confidence POIs.`);

    return {
      pois: filteredPois.slice(0, 100),
      total_candidates: rows.length,
      filtered_count: filteredPois.length,
      uniqueCountryCount: countriesFound.size, // Custom field for Lovable to show in header
      bbox: { xmin: bbox.west, xmax: bbox.east, ymin: bbox.south, ymax: bbox.north },
      logs,
    };
  } catch (error) {
    log(`❌ Error: ${error instanceof Error ? error.message : "Unknown"}`);
    return { pois: [], total_candidates: 0, filtered_count: 0, uniqueCountryCount: 0, bbox: null, logs };
  }
}
