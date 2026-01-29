import { SearchParams, SearchResponse, POI } from "@/types/poi";
import * as duckdb from "@duckdb/duckdb-wasm";

// Config for WASM Bundles
const MANUAL_BUNDLES: duckdb.DuckDBBundles = {
  mvp: {
    mainModule: "https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/dist/duckdb-mvp.wasm",
    mainWorker: "https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/dist/duckdb-browser-mvp.worker.js",
  },
  eh: {
    mainModule: "https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/dist/duckdb-eh.wasm",
    mainWorker: "https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/dist/duckdb-browser-eh.worker.js",
  },
};

let db: duckdb.AsyncDuckDB | null = null;

async function initDB() {
  if (db) return db;
  const bundle = await duckdb.selectBundle(MANUAL_BUNDLES);
  const worker = new Worker(bundle.mainWorker!);
  const logger = new duckdb.ConsoleLogger();
  db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);

  const conn = await db.connect();
  await conn.query(`
        INSTALL spatial; LOAD spatial;
        INSTALL httpfs; LOAD httpfs;
        SET s3_region='us-west-2';
    `);
  await conn.close();
  return db;
}

export async function searchPOIs(params: SearchParams): Promise<SearchResponse> {
  const logs: string[] = [];
  logs.push("🚀 Initializing DuckDB-WASM...");

  const database = await initDB();
  const conn = await database.connect();

  const keyword = params.keyword.toLowerCase();
  const overturePath = "s3://overturemaps-us-west-2/release/2026-01-21.0/theme=places/type=place/*.parquet";

  let spatialFilter = "";
  if (params.mode === "coordinate" && params.latitude && params.longitude) {
    const offset = (params.radius || 5) / 111.0;
    spatialFilter = `
            bbox.xmin > ${params.longitude - offset} AND bbox.xmax < ${params.longitude + offset} AND
            bbox.ymin > ${params.latitude - offset} AND bbox.ymax < ${params.latitude + offset}
        `;
  } else if (params.mode === "country" && params.countryCode) {
    // Use your Polygon resolution logic here if implemented, or address filter for speed
    spatialFilter = `lower(addresses[1].country) = lower('${params.countryCode}')`;
  }

  // THE FULL SIMILARITY QUERY
  const sql = `
        SELECT 
            id,
            names,
            categories,
            addresses,
            confidence,
            ST_X(geometry) as longitude,
            ST_Y(geometry) as latitude,
            GREATEST(
                jaro_winkler_similarity(lower(names.primary), '${keyword}'),
                jaro_winkler_similarity(lower(basic_category), '${keyword}'),
                jaro_winkler_similarity(lower(taxonomy.primary), '${keyword}'),
                (SELECT max(jaro_winkler_similarity(lower(x), '${keyword}')) FROM unnest(taxonomy.hierarchy) t(x))
            ) as poi_sim_score
        FROM read_parquet('${overturePath}', hive_partitioning=1)
        WHERE (${spatialFilter})
          AND poi_sim_score >= 0.9
        ORDER BY poi_sim_score DESC
        LIMIT ${params.limit || 50};
    `;

  logs.push(`🔍 Executing SQL Search for '${keyword}'...`);

  try {
    const result = await conn.query(sql);
    const rows = result.toArray().map((row) => ({
      ...row,
      // DuckDB-WASM returns BigInt for some fields, convert to number
      poi_sim_score: Number(row.poi_sim_score),
      confidence: Number(row.confidence),
    }));

    await conn.close();

    return {
      pois: rows as any[],
      total_candidates: rows.length,
      filtered_count: rows.length,
      bbox: null,
      logs,
    };
  } catch (err) {
    logs.push(`❌ Query failed: ${err}`);
    await conn.close();
    throw err;
  }
}
