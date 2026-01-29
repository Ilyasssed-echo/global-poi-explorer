import { SearchParams, SearchResponse, POI } from '@/types/poi';

const API_BASE_URL = 'https://places-backen-setup-production.up.railway.app';

export async function searchPOIs(params: SearchParams): Promise<SearchResponse> {
  // If no API URL configured, use mock data
  if (!API_BASE_URL) {
    console.warn('No API_URL configured, using mock data');
    return mockSearch(params);
  }

  const response = await fetch(`${API_BASE_URL}/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      keyword: params.keyword,
      mode: params.mode,
      country_code: params.countryCode,
      latitude: params.latitude,
      longitude: params.longitude,
      radius: params.radius,
      bbox: params.bbox,
      limit: params.limit || 20,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || `API error: ${response.status}`);
  }

  return response.json();
}

// Mock implementation for demo purposes
async function mockSearch(params: SearchParams): Promise<SearchResponse> {
  const { mockPOIs } = await import('@/data/mockPOIs');
  
  await new Promise((resolve) => setTimeout(resolve, 800));

  const logs: string[] = [];
  logs.push(`🗺️ STEP 1: RESOLVING SEARCH AREA`);
  
  if (params.mode === 'country' && params.countryCode) {
    logs.push(`   Looking for country: ${params.countryCode}`);
    logs.push(`✅ Mock: Using country filter for ${params.countryCode}`);
  } else if (params.mode === 'coordinate') {
    logs.push(`   Center: (${params.latitude}, ${params.longitude}), Radius: ${params.radius}km`);
    logs.push(`✅ Mock: Using coordinate filter`);
  }

  logs.push(`📥 STEP 2: SIMULATING S3 DOWNLOAD`);
  logs.push(`   (Using mock data - deploy backend for real Overture data)`);
  logs.push(`✅ Downloaded ${mockPOIs.length} mock candidates`);

  // Filter mock data
  const keyword = params.keyword.toLowerCase();
  const filtered = mockPOIs.filter((poi) => {
    const nameMatch = poi.names.primary.toLowerCase().includes(keyword);
    const catMatch = poi.categories.primary.toLowerCase().includes(keyword);
    
    if (params.mode === 'country' && params.countryCode) {
      const countryMatch = poi.addresses?.[0]?.country === params.countryCode;
      return (nameMatch || catMatch) && countryMatch;
    }

    if (params.mode === 'coordinate' && params.latitude && params.longitude && params.radius) {
      const latDiff = Math.abs(poi.latitude - params.latitude);
      const lngDiff = Math.abs(poi.longitude - params.longitude);
      const approxDistance = Math.sqrt(latDiff ** 2 + lngDiff ** 2) * 111;
      return (nameMatch || catMatch) && approxDistance <= params.radius;
    }

    return nameMatch || catMatch;
  });

  logs.push(`🔍 STEP 3: SIMILARITY FILTERING`);
  logs.push(`   - Keyword: '${params.keyword}'`);
  logs.push(`   - Threshold: 0.9`);
  logs.push(`   - Matched: ${filtered.length} POIs`);

  const limit = params.limit || 20;
  const limitedResults = filtered.slice(0, limit);

  return {
    pois: limitedResults.length > 0 ? limitedResults : mockPOIs.slice(0, limit),
    total_candidates: mockPOIs.length,
    filtered_count: filtered.length,
    bbox: null,
    logs,
  };
}
