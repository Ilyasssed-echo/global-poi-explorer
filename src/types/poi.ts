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

export interface SearchParams {
  keyword: string;
  mode: SearchMode;
  latitude?: number;
  longitude?: number;
  radius?: number;
  countryCode?: string;
}
