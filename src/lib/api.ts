import { SearchParams, SearchResponse, POI, BBox } from '@/types/poi';
import { initDuckDB, isInitialized, LogCallback } from './duckdb';

const OVERTURE_PATH = 's3://overturemaps-us-west-2/release/2026-01-21.0/theme=places/type=place/*.parquet';
const GEOJSON_URL = 'https://raw.githubusercontent.com/datasets/geo-boundaries-world-110m/master/countries.geojson';

// Cache for country geometries
let countriesGeoJSON: any = null;

async function fetchCountryBoundary(countryCode: string, onLog?: LogCallback): Promise<{ bbox: BBox; wkt: string } | null> {
  onLog?.(`🗺️ Fetching country boundary for ${countryCode}...`);
  
  if (!countriesGeoJSON) {
    onLog?.('📥 Downloading world boundaries GeoJSON...');
    const response = await fetch(GEOJSON_URL);
    countriesGeoJSON = await response.json();
    onLog?.(`✅ Downloaded ${countriesGeoJSON.features.length} country boundaries`);
  }

  // Find country feature by ISO code
  const feature = countriesGeoJSON.features.find((f: any) => 
    f.properties.ISO_A2 === countryCode || 
    f.properties.iso_a2 === countryCode ||
    f.properties.ISO_A3 === countryCode ||
    f.properties.iso_a3 === countryCode
  );

  if (!feature) {
    onLog?.(`❌ Country ${countryCode} not found in boundaries`);
    return null;
  }

  onLog?.(`✅ Found boundary for ${feature.properties.name || countryCode}`);

  // Calculate bounding box from geometry
  const coords = feature.geometry.coordinates;
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;

  const processCoords = (c: any) => {
    if (typeof c[0] === 'number') {
      minLon = Math.min(minLon, c[0]);
      maxLon = Math.max(maxLon, c[0]);
      minLat = Math.min(minLat, c[1]);
      maxLat = Math.max(maxLat, c[1]);
    } else {
      c.forEach(processCoords);
    }
  };
  processCoords(coords);

  // Convert GeoJSON geometry to WKT for DuckDB
  const geometryToWKT = (geom: any): string => {
    if (geom.type === 'Polygon') {
      const rings = geom.coordinates.map((ring: number[][]) => 
        '(' + ring.map((c: number[]) => `${c[0]} ${c[1]}`).join(', ') + ')'
      ).join(', ');
      return `POLYGON(${rings})`;
    } else if (geom.type === 'MultiPolygon') {
      const polygons = geom.coordinates.map((poly: number[][][]) => 
        '(' + poly.map((ring: number[][]) => 
          '(' + ring.map((c: number[]) => `${c[0]} ${c[1]}`).join(', ') + ')'
        ).join(', ') + ')'
      ).join(', ');
      return `MULTIPOLYGON(${polygons})`;
    }
    return '';
  };

  return {
    bbox: {
      west: minLon,
      east: maxLon,
      south: minLat,
      north: maxLat,
    },
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
    // Initialize DuckDB if not already done
    if (!isInitialized()) {
      await initDuckDB(log);
    }

    const conn = await initDuckDB();

    let bbox: BBox;

    // STEP 1: Resolve search area
    log('🗺️ STEP 1: RESOLVING SEARCH AREA');

    if (params.mode === 'country' && params.countryCode) {
      const countryData = await fetchCountryBoundary(params.countryCode, log);
      if (!countryData) {
        throw new Error(`Country ${params.countryCode} not found`);
      }
      bbox = countryData.bbox;
      log(`   Bounding box: [${bbox.west.toFixed(2)}, ${bbox.south.toFixed(2)}] to [${bbox.east.toFixed(2)}, ${bbox.north.toFixed(2)}]`);
    } else if (params.mode === 'coordinate' && params.latitude && params.longitude && params.radius) {
      // Convert radius (km) to approximate degree offset
      const offset = params.radius / 111.0; // ~111km per degree
      bbox = {
        west: params.longitude - offset,
        east: params.longitude + offset,
        south: params.latitude - offset,
        north: params.latitude + offset,
      };
      log(`   Center: (${params.latitude}, ${params.longitude}), Radius: ${params.radius}km`);
      log(`   Bounding box: [${bbox.west.toFixed(4)}, ${bbox.south.toFixed(4)}] to [${bbox.east.toFixed(4)}, ${bbox.north.toFixed(4)}]`);
    } else if (params.bbox) {
      bbox = params.bbox;
      log(`   Using viewport bbox: [${bbox.west.toFixed(2)}, ${bbox.south.toFixed(2)}] to [${bbox.east.toFixed(2)}, ${bbox.north.toFixed(2)}]`);
    } else {
      throw new Error('Invalid search parameters: missing location data');
    }

    // STEP 2: Query Overture S3 with DuckDB-WASM (Memory-Optimized)
    log('📥 STEP 2: QUERYING OVERTURE S3 DATA');
    log(`   Keyword: '${params.keyword}'`);
    log(`   Similarity threshold: 0.9`);

    const limit = Math.min(params.limit || 20, 500); // Cap at 500 to prevent memory issues
    const keyword = params.keyword.toLowerCase().replace(/'/g, "''"); // Escape and lowercase

    // MEMORY-OPTIMIZED QUERY STRATEGY:
    // 1. First pass: Select only IDs and scores with LIMIT (minimal memory)
    // 2. This prevents loading full rows into WASM memory
    log('🔍 Phase 1: Scanning for matching IDs (memory-optimized)...');
    const startTime = Date.now();

    // Optimized SQL: Only select essential columns, use pre-filter with LIKE
    // to reduce the number of rows before computing similarity scores
    const sql = `
      SELECT 
        id,
        names.primary as name,
        categories.primary as category,
        ST_X(ST_GeomFromWKB(geometry)) as longitude,
        ST_Y(ST_GeomFromWKB(geometry)) as latitude,
        GREATEST(
          COALESCE(jaro_winkler_similarity(lower(names.primary), '${keyword}'), 0),
          COALESCE(jaro_winkler_similarity(lower(categories.primary), '${keyword}'), 0)
        ) as poi_sim_score
      FROM read_parquet('${OVERTURE_PATH}', hive_partitioning=1)
      WHERE 
        bbox.xmin > ${bbox.west} AND bbox.xmax < ${bbox.east}
        AND bbox.ymin > ${bbox.south} AND bbox.ymax < ${bbox.north}
        AND (
          lower(names.primary) LIKE '%${keyword.substring(0, 4)}%'
          OR lower(categories.primary) LIKE '%${keyword.substring(0, 4)}%'
        )
      ORDER BY poi_sim_score DESC
      LIMIT ${limit}
    `;

    log('🔍 Executing optimized SQL query...');
    
    const result = await conn.query(sql);
    
    const queryTime = Date.now() - startTime;
    log(`✅ Query completed in ${queryTime}ms`);

    // Convert Arrow result to POI array
    const rows = result.toArray();
    
    // Filter for similarity >= 0.9 in JS (more reliable than SQL HAVING)
    const filteredRows = rows.filter((row: any) => row.poi_sim_score >= 0.9);
    log(`📊 Found ${filteredRows.length} POIs with similarity >= 0.9`);

    const pois: POI[] = filteredRows.map((row: any) => ({
      id: row.id || `poi-${Math.random().toString(36).substr(2, 9)}`,
      names: {
        primary: row.name || 'Unknown',
      },
      categories: {
        primary: row.category || 'unknown',
      },
      addresses: [],
      latitude: row.latitude,
      longitude: row.longitude,
      poi_sim_score: row.poi_sim_score,
    }));

    log(`✅ STEP 3: COMPLETE - Returning ${pois.length} results`);

    return {
      pois,
      total_candidates: rows.length,
      filtered_count: filteredRows.length,
      bbox: {
        xmin: bbox.west,
        xmax: bbox.east,
        ymin: bbox.south,
        ymax: bbox.north,
      },
      logs,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    log(`❌ Error: ${errorMsg}`);
    
    return {
      pois: [],
      total_candidates: 0,
      filtered_count: 0,
      bbox: null,
      logs,
    };
  }
}
