import * as duckdb from '@duckdb/duckdb-wasm';
import duckdb_wasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import duckdb_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';

let db: duckdb.AsyncDuckDB | null = null;
let connection: duckdb.AsyncDuckDBConnection | null = null;
let initPromise: Promise<duckdb.AsyncDuckDBConnection> | null = null;

export type LogCallback = (message: string) => void;

export async function initDuckDB(onLog?: LogCallback): Promise<duckdb.AsyncDuckDBConnection> {
  // Return existing connection if available
  if (connection) {
    return connection;
  }

  // Return existing init promise to prevent multiple initializations
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    onLog?.('🦆 Initializing DuckDB-WASM...');

    const MANUAL_BUNDLES: duckdb.DuckDBBundles = {
      mvp: {
        mainModule: duckdb_wasm,
        mainWorker: duckdb_worker,
      },
      eh: {
        mainModule: duckdb_wasm,
        mainWorker: duckdb_worker,
      },
    };

    // Select a bundle based on browser capabilities
    const bundle = await duckdb.selectBundle(MANUAL_BUNDLES);
    
    // Instantiate the async DuckDB
    const worker = new Worker(bundle.mainWorker!);
    const logger = new duckdb.ConsoleLogger();
    db = new duckdb.AsyncDuckDB(logger, worker);
    
    await db.instantiate(bundle.mainModule);
    onLog?.('✅ DuckDB-WASM instantiated');

    // Open a connection
    connection = await db.connect();
    onLog?.('✅ Database connection established');

    // Install and load required extensions
    onLog?.('📦 Installing spatial extension...');
    await connection.query('INSTALL spatial;');
    await connection.query('LOAD spatial;');
    onLog?.('✅ Spatial extension loaded');

    onLog?.('📦 Installing httpfs extension...');
    await connection.query('INSTALL httpfs;');
    await connection.query('LOAD httpfs;');
    onLog?.('✅ HTTPFS extension loaded');

    // Configure S3 access for Overture Maps
    onLog?.('🌐 Configuring S3 access...');
    await connection.query("SET s3_region='us-west-2';");
    onLog?.('✅ S3 region set to us-west-2');

    return connection;
  })();

  return initPromise;
}

export async function getConnection(): Promise<duckdb.AsyncDuckDBConnection> {
  if (!connection) {
    throw new Error('DuckDB not initialized. Call initDuckDB first.');
  }
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
