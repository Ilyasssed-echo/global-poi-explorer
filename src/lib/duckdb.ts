import * as duckdb from "@duckdb/duckdb-wasm";

let db: duckdb.AsyncDuckDB | null = null;
let connection: duckdb.AsyncDuckDBConnection | null = null;
let initPromise: Promise<duckdb.AsyncDuckDBConnection> | null = null;

export type LogCallback = (message: string) => void;

export async function initDuckDB(onLog?: LogCallback): Promise<duckdb.AsyncDuckDBConnection> {
  if (connection) return connection;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    onLog?.("🦆 Initializing DuckDB-WASM...");

    const BUNDLES = duckdb.getJsDelivrBundles();
    let bundle = await duckdb.selectBundle(BUNDLES);

    // Force EH bundle for stability and ZSTD support
    if (bundle.mainWorker && !bundle.mainWorker.includes("-eh")) {
      onLog?.("⚙️ Forcing EH bundle for stability...");
      const ehBundle = BUNDLES.eh!;
      bundle = {
        mainModule: ehBundle.mainModule,
        mainWorker: ehBundle.mainWorker,
        pthreadWorker: (ehBundle as any).pthreadWorker ?? null,
      };
    }

    onLog?.("📦 Loading WASM bundle...");

    // Fix Same-Origin policy for Worker
    const workerUrl = URL.createObjectURL(
      new Blob([`importScripts("${bundle.mainWorker!}");`], { type: "text/javascript" }),
    );

    const worker = new Worker(workerUrl);
    const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING);
    db = new duckdb.AsyncDuckDB(logger, worker);

    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    URL.revokeObjectURL(workerUrl);

    onLog?.("✅ DuckDB-WASM Instantiated");

    connection = await db.connect();

    // Configure Database
    onLog?.("🧠 Configuring Memory (2GB Limit)...");
    await connection.query("SET max_memory='2GB'; SET threads=1;");

    onLog?.("📦 Loading Extensions (Spatial, HTTPFS, JSON)...");
    await connection.query("INSTALL spatial; LOAD spatial;");
    await connection.query("INSTALL httpfs; LOAD httpfs;");
    await connection.query("INSTALL json; LOAD json;");

    onLog?.("🌐 Configuring S3 (us-west-2)...");
    await connection.query("SET s3_region='us-west-2';");

    return connection;
  })();

  return initPromise;
}

export async function getConnection(): Promise<duckdb.AsyncDuckDBConnection> {
  if (!connection) throw new Error("DuckDB not initialized");
  return connection;
}

export function isInitialized(): boolean {
  return connection !== null;
}

export async function closeDuckDB(): Promise<void> {
  if (connection) {
    await connection.close();
    connection = null;
  }
  if (db) {
    await db.terminate();
    db = null;
  }
  initPromise = null;
}
