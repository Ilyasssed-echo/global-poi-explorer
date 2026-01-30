export interface POI {
  id: string;
  names: {
    primary: string;
    common?: Record<string, string>;
  };
  categories: {
    primary: string;
    alternate?: string[];
  };
  addresses?: Array<{
    freeform?: string;
    locality?: string;
    region?: string;
    country?: string;
  }>;
  latitude: number;
  longitude: number;
  poi_sim_score: number;
  confidence?: number;
  websites?: string[];
  phones?: string[];
  brand?: {
    names?: {
      primary?: string;
    };
  };
}

export type SearchMode = 'coordinate' | 'country';

export interface BBox {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface SearchParams {
  keyword: string;
  mode: SearchMode;
  latitude?: number;
  longitude?: number;
  radius?: number;
  countryCode?: string;
  bbox?: BBox;
  limit?: number;
}

export interface SearchResponse {
  pois: POI[];
  total_candidates: number;
  filtered_count: number;
  uniqueCountryCount?: number;
  bbox: { xmin: number; xmax: number; ymin: number; ymax: number } | null;
  logs: string[];
}
