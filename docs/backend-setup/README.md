# Global POI Explorer - Python Backend

This is the FastAPI backend that queries Overture Maps using DuckDB.

## Deploy to Railway (Recommended)

1. Go to [railway.app](https://railway.app) and sign in with GitHub
2. Click "New Project" → "Deploy from GitHub repo"
3. Create a new repo with these files or upload them
4. Railway will auto-detect Python and deploy

Your API will be available at: `https://your-app.up.railway.app`

## Deploy to Render

1. Go to [render.com](https://render.com)
2. New → Web Service → Connect your repo
3. Build command: `pip install -r requirements.txt`
4. Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`

## Test Locally

```bash
pip install -r requirements.txt
python main.py
# API runs at http://localhost:8000
```

## API Endpoints

### POST /search

Request body:
```json
{
  "keyword": "pizza",
  "mode": "country",
  "country_code": "IT",
  "limit": 20
}
```

Or for coordinate mode:
```json
{
  "keyword": "restaurant",
  "mode": "coordinate",
  "latitude": 40.7128,
  "longitude": -74.006,
  "radius": 10,
  "limit": 20
}
```

Or for viewport/bbox mode (used when zooming):
```json
{
  "keyword": "cafe",
  "mode": "bbox",
  "bbox": {
    "north": 41.0,
    "south": 40.5,
    "east": -73.8,
    "west": -74.2
  },
  "limit": 20
}
```

Response includes logs showing each step of the filtering process.
