"""
FastAPI backend for Global POI Explorer
Deploy to Railway, Render, or any Python host
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Any
import duckdb
import json
from difflib import SequenceMatcher

app = FastAPI(title="Global POI Explorer API")

# CORS - allow your Lovable frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict to your domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class SearchRequest(BaseModel):
    keyword: str
    mode: str  # 'country' or 'coordinate'
    country_code: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    radius: Optional[float] = None  # km
    bbox: Optional[dict] = None  # For viewport-based queries: {north, south, east, west}
    limit: int = 20

class POI(BaseModel):
    id: str
    names: dict
    categories: dict
    addresses: Optional[List[dict]] = None
    latitude: float
    longitude: float
    poi_sim_score: float
    confidence: Optional[float] = None

class SearchResponse(BaseModel):
    pois: List[dict]
    total_candidates: int
    filtered_count: int
    bbox: Optional[dict] = None
    logs: List[str]

def get_sim(a, b):
    """Calculate similarity ratio between two strings."""
    if not a or not b:
        return 0
    return SequenceMatcher(None, str(a).lower(), str(b).lower()).ratio()

def safe_get(d, key, default=None):
    """Safely get a value from a dict that might be None."""
    if d is None:
        return default
    return d.get(key, default) if isinstance(d, dict) else default

@app.post("/search", response_model=SearchResponse)
async def search_pois(request: SearchRequest):
    logs = []
    
    con = duckdb.connect()
    con.execute("INSTALL spatial; LOAD spatial; INSTALL httpfs; LOAD httpfs; INSTALL json; LOAD json;")
    con.execute("SET s3_region='us-west-2'; SET s3_access_key_id=''; SET s3_secret_access_key='';")

    boundary_url = "https://raw.githubusercontent.com/datasets/geo-boundaries-world-110m/master/countries.geojson"
    overture_path = "s3://overturemaps-us-west-2/release/2026-01-21.0/theme=places/type=place/*.parquet"

    bbox = None
    
    if request.mode == 'country' and request.country_code:
        logs.append(f"🗺️ STEP 1: RESOLVING POLYGON FOR '{request.country_code}'")
        
        try:
            setup_query = f"""
                CREATE OR REPLACE TEMP TABLE target_country AS
                SELECT 
                    ST_GeomFromGeoJSON(feat.geometry::json) as geom,
                    ST_XMin(geom) as xmin, ST_XMax(geom) as xmax,
                    ST_YMin(geom) as ymin, ST_YMax(geom) as ymax
                FROM (
                    SELECT unnest(features) as feat 
                    FROM read_json('{boundary_url}', format='unstructured')
                ) 
                WHERE lower(feat.properties.iso_a2::varchar) = lower('{request.country_code}')
                   OR lower(feat.properties.name::varchar) = lower('{request.country_code}');
            """
            con.execute(setup_query)
            bbox_row = con.execute("SELECT xmin, xmax, ymin, ymax FROM target_country").fetchone()
            bbox = {"xmin": bbox_row[0], "xmax": bbox_row[1], "ymin": bbox_row[2], "ymax": bbox_row[3]}
            logs.append(f"✅ Polygon found. BBox: {bbox}")
        except Exception as e:
            logs.append(f"❌ Polygon resolution failed: {e}")
            raise HTTPException(status_code=400, detail=f"Country resolution failed: {e}")
    
    elif request.mode == 'coordinate' and request.latitude and request.longitude and request.radius:
        # Calculate bbox from center point + radius
        # Rough conversion: 1 degree ≈ 111 km
        delta = request.radius / 111.0
        bbox = {
            "xmin": request.longitude - delta,
            "xmax": request.longitude + delta,
            "ymin": request.latitude - delta,
            "ymax": request.latitude + delta
        }
        logs.append(f"📍 Using coordinate mode. Center: ({request.latitude}, {request.longitude}), Radius: {request.radius}km")
        logs.append(f"✅ Calculated BBox: {bbox}")
    
    elif request.bbox:
        # Viewport-based query
        bbox = {
            "xmin": request.bbox["west"],
            "xmax": request.bbox["east"],
            "ymin": request.bbox["south"],
            "ymax": request.bbox["north"]
        }
        logs.append(f"🖼️ Using viewport bbox: {bbox}")
    
    else:
        raise HTTPException(status_code=400, detail="Invalid search parameters")

    logs.append(f"📥 STEP 2: DOWNLOADING FROM S3 WITH BBOX FILTER")

    # Query with bbox filter
    if request.mode == 'country' and request.country_code:
        sql = f"""
            SELECT *, ST_X(ST_GeomFromWKB(geometry)) as longitude, ST_Y(ST_GeomFromWKB(geometry)) as latitude
            FROM read_parquet('{overture_path}', hive_partitioning=1)
            WHERE bbox.xmin > {bbox['xmin']} AND bbox.xmax < {bbox['xmax']}
              AND bbox.ymin > {bbox['ymin']} AND bbox.ymax < {bbox['ymax']}
              AND ST_Intersects(ST_GeomFromWKB(geometry), (SELECT geom FROM target_country))
        """
    else:
        sql = f"""
            SELECT *, ST_X(ST_GeomFromWKB(geometry)) as longitude, ST_Y(ST_GeomFromWKB(geometry)) as latitude
            FROM read_parquet('{overture_path}', hive_partitioning=1)
            WHERE bbox.xmin > {bbox['xmin']} AND bbox.xmax < {bbox['xmax']}
              AND bbox.ymin > {bbox['ymin']} AND bbox.ymax < {bbox['ymax']}
        """

    try:
        raw_df = con.execute(sql).df()
        total_candidates = len(raw_df)
        logs.append(f"✅ Downloaded {total_candidates} candidates from S3. Now filtering by similarity...")
    except Exception as e:
        logs.append(f"❌ S3 query failed: {e}")
        raise HTTPException(status_code=500, detail=f"S3 query failed: {e}")

    # STEP 3: LOCAL STRICT FILTERING
    keyword = request.keyword.lower()
    results = []
    
    for _, row in raw_df.iterrows():
        # Check Name similarity
        names = row.get('names') or {}
        name_sim = get_sim(safe_get(names, 'primary'), keyword)
        
        # Check Categories (Primary + Alternate)
        cats = row.get('categories') or {}
        cat_primary_sim = get_sim(safe_get(cats, 'primary'), keyword)
        cat_alt = safe_get(cats, 'alternate', [])
        cat_alt_sim = max([get_sim(alt, keyword) for alt in cat_alt]) if isinstance(cat_alt, list) and cat_alt else 0
        cat_sim = max(cat_primary_sim, cat_alt_sim)
        
        # Check Taxonomy (Primary + Hierarchy)
        tax = row.get('taxonomy') or {}
        tax_primary_sim = get_sim(safe_get(tax, 'primary'), keyword)
        tax_hier = safe_get(tax, 'hierarchy', [])
        tax_hier_sim = max([get_sim(h, keyword) for h in tax_hier]) if isinstance(tax_hier, list) and tax_hier else 0
        tax_sim = max(tax_primary_sim, tax_hier_sim)
        
        best_sim = max(name_sim, cat_sim, tax_sim)

        if best_sim >= 0.9:
            poi_data = {
                "id": row.get('id', str(hash(row.get('names', {}).get('primary', '')))),
                "names": row.get('names') or {"primary": "Unknown"},
                "categories": row.get('categories') or {"primary": "unknown"},
                "addresses": row.get('addresses') if isinstance(row.get('addresses'), list) else [],
                "latitude": float(row['latitude']),
                "longitude": float(row['longitude']),
                "poi_sim_score": round(best_sim, 4),
                "confidence": float(row.get('confidence', 0.0)) if row.get('confidence') else None
            }
            results.append(poi_data)

    # Sort by score descending
    results.sort(key=lambda x: x['poi_sim_score'], reverse=True)
    
    # Limit results
    limited_results = results[:request.limit]
    
    logs.append(f"🔍 STEP 3: Similarity filtering complete")
    logs.append(f"   - Keyword: '{request.keyword}'")
    logs.append(f"   - Threshold: 0.9")
    logs.append(f"   - Matched: {len(results)} POIs (showing top {len(limited_results)})")

    if not results:
        logs.append("⚠️ No matches found above 0.9 similarity threshold")

    con.close()

    return SearchResponse(
        pois=limited_results,
        total_candidates=total_candidates,
        filtered_count=len(results),
        bbox=bbox,
        logs=logs
    )

@app.get("/health")
async def health():
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
