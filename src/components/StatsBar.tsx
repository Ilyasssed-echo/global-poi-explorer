import { Database, Globe, Zap, Clock } from 'lucide-react';
import { POI } from '@/types/poi';

interface StatsBarProps {
  pois: POI[];
  searchTime: number | null;
  lastSearch: string | null;
}

export function StatsBar({ pois, searchTime, lastSearch }: StatsBarProps) {
  const avgScore = pois.length > 0 
    ? (pois.reduce((acc, poi) => acc + poi.poi_sim_score, 0) / pois.length * 100).toFixed(1)
    : '0';

  const uniqueCountries = pois.length > 0 
    ? new Set(pois.map((poi) => poi.addresses?.[0]?.country).filter(Boolean)).size
    : 0;

  return (
    <div className="glass-panel rounded-lg p-3">
      <div className="flex items-center justify-between gap-6">
        <div className="flex items-center gap-6">
          {/* POI Count */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-primary/20 flex items-center justify-center">
              <Database className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total POIs</p>
              <p className="text-sm font-mono font-semibold text-foreground">{pois.length}</p>
            </div>
          </div>

          {/* Countries */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-data-success/20 flex items-center justify-center">
              <Globe className="w-4 h-4 text-data-success" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Countries</p>
              <p className="text-sm font-mono font-semibold text-foreground">{uniqueCountries}</p>
            </div>
          </div>

          {/* Avg Score */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-data-warning/20 flex items-center justify-center">
              <Zap className="w-4 h-4 text-data-warning" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Avg Score</p>
              <p className="text-sm font-mono font-semibold text-foreground">{avgScore}%</p>
            </div>
          </div>

          {/* Query Time */}
          {searchTime !== null && (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-md bg-data-info/20 flex items-center justify-center">
                <Clock className="w-4 h-4 text-data-info" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Query Time</p>
                <p className="text-sm font-mono font-semibold text-foreground">{searchTime}ms</p>
              </div>
            </div>
          )}
        </div>

        {/* Last Search */}
        {lastSearch && (
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Last Search</p>
            <p className="text-sm font-mono text-primary">{lastSearch}</p>
          </div>
        )}
      </div>
    </div>
  );
}
