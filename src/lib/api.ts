import { SearchParams, SearchResponse, POI, BBox } from "@/types/poi";
import { initDuckDB, isInitialized, LogCallback } from "./duckdb";

const OVERTURE_PATH = "s3://overturemaps-us-west-2/release/2026-01-21.0/theme=places/type=place/*.parquet";
const GEOJSON_URL = "https://raw.githubusercontent.com/datasets/geo-boundaries-world-110m/master/countries.geojson";

let countriesGeoJSON: any = null;

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

  // Process BBox
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

  // Convert to WKT
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
        west: params.longitude! - offset,
        east: params.longitude! + offset,
        south: params.latitude! - offset,
        north: params.latitude! + offset,
      };
      spatialFilter = `
        bbox.xmin > ${bbox.west} AND bbox.xmax < ${bbox.east} 
        AND bbox.ymin > ${bbox.south} AND bbox.ymax < ${bbox.north}
      `;
    }

    log("📥 STEP 2: CLOUD QUERY (STRICT 0.9 SIMILARITY)");
    const keyword = params.keyword.toLowerCase().replace(/'/g, "''");
    const displayLimit = params.limit || 50;

    const sql = `
      SELECT 
        id,
        names.primary as name,
        categories.primary as category,
        ST_X(geometry) as longitude,
        ST_Y(geometry) as latitude,
        addresses as addresses_raw,
        GREATEST(
          jaro_winkler_similarity(lower(names.primary), '${keyword}'),
          jaro_winkler_similarity(lower(basic_category), '${keyword}'),
          jaro_winkler_similarity(lower(categories.primary), '${keyword}'),
          COALESCE((SELECT max(jaro_winkler_similarity(lower(x), '${keyword}')) FROM unnest(categories.alternate) t(x)), 0),
          COALESCE((SELECT max(jaro_winkler_similarity(lower(x), '${keyword}')) FROM unnest(taxonomy.hierarchy) t(x)), 0)
        ) as poi_sim_score
      FROM read_parquet('${OVERTURE_PATH}', hive_partitioning=1)
      WHERE ${spatialFilter}
        AND (
          lower(names.primary) LIKE '%${keyword.substring(0, 3)}%' 
          OR lower(categories.primary) LIKE '%${keyword.substring(0, 3)}%'
          OR lower(basic_category) LIKE '%${keyword.substring(0, 3)}%'
        )
      ORDER BY poi_sim_score DESC
      LIMIT 1000;
    `;

    const result = await conn.query(sql);
    const rows = result.toArray();

    const allPois: POI[] = rows
      .map((row: any) => ({
        id: row.id,
        names: { primary: row.name || "Unknown" },
        categories: { primary: row.category || "unknown" },
        addresses: row.addresses_raw || [],
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
        poi_sim_score: Number(row.poi_sim_score),
      }))
      .filter((poi) => poi.poi_sim_score >= 0.9);

    log(`✅ Found ${allPois.length} high-confidence matches.`);

    return {
      pois: allPois.slice(0, displayLimit),
      total_candidates: rows.length,
      filtered_count: allPois.length,
      bbox: { xmin: bbox.west, xmax: bbox.east, ymin: bbox.south, ymax: bbox.north },
      logs,
    };
  } catch (error) {
    log(`❌ Error: ${error instanceof Error ? error.message : "Unknown"}`);
    return { pois: [], total_candidates: 0, filtered_count: 0, bbox: null, logs };
  }
}
