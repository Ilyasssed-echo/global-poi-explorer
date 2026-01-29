import * as duckdb from '@duckdb/duckdb-wasm';

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

    // Get available bundles from CDN
    const BUNDLES = duckdb.getJsDelivrBundles();

    // Select a bundle based on browser capabilities
    let bundle = await duckdb.selectBundle(BUNDLES);
    
    // Force the 'eh' (Exception Handling) bundle to fix _setThrew error
    // The 'eh' bundle has better memory handling and ZSTD decompression support
    if (bundle.mainWorker && !bundle.mainWorker.includes('-eh')) {
      onLog?.('⚙️ Forcing EH bundle for better stability...');
      const ehBundle = BUNDLES.eh!;
      bundle = {
        mainModule: ehBundle.mainModule,
        mainWorker: ehBundle.mainWorker,
        pthreadWorker: (ehBundle as any).pthreadWorker ?? null,
      };
    }
    
    onLog?.('📦 Loading EH WASM bundle...');
    
    // Fetch the worker URL
    const workerUrl = URL.createObjectURL(
      new Blob([`importScripts("${bundle.mainWorker!}");`], { type: 'text/javascript' })
    );

    // Instantiate the async DuckDB
    const worker = new Worker(workerUrl);
    const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING);
    db = new duckdb.AsyncDuckDB(logger, worker);
    
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    URL.revokeObjectURL(workerUrl);
    
    onLog?.('✅ DuckDB-WASM (EH) instantiated');

    // Open a connection
    connection = await db.connect();
    onLog?.('✅ Database connection established');

    // Set memory limit to prevent crashes on large datasets
    onLog?.('🧠 Setting memory limit to 2GB...');
    await connection.query("SET max_memory='2GB';");
    onLog?.('✅ Memory limit configured');

    // Install and load required extensions
    onLog?.('📦 Installing spatial extension...');
    await connection.query('INSTALL spatial;');
    await connection.query('LOAD spatial;');
    onLog?.('✅ Spatial extension loaded');

    onLog?.('📦 Installing httpfs extension...');
    await connection.query('INSTALL httpfs;');
    await connection.query('LOAD httpfs;');
    onLog?.('✅ HTTPFS extension loaded');

    // Configure S3 access for Overture Maps (public bucket, no auth needed)
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
