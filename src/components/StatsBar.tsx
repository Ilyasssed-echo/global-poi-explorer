import { Database, Zap, Clock } from 'lucide-react';
import { POI } from '@/types/poi';

interface StatsBarProps {
  pois: POI[];
  searchTime: number | null;
  lastSearch: string | null;
  totalMatches?: number;
}

export function StatsBar({ pois, searchTime, lastSearch, totalMatches }: StatsBarProps) {
  const avgScore = pois.length > 0 
    ? (pois.reduce((acc, poi) => acc + poi.poi_sim_score, 0) / pois.length * 100).toFixed(1)
    : '0';

  return (
    <div className="glass-panel rounded-lg p-3 overflow-x-auto">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-6 min-w-max sm:min-w-0">
        <div className="flex items-center gap-4 sm:gap-6 flex-wrap">
          {/* POI Count */}
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-md bg-primary/20 flex items-center justify-center">
              <Database className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
            </div>
            <div>
              <p className="text-[10px] sm:text-xs text-muted-foreground">Results</p>
              <p className="text-xs sm:text-sm font-mono font-semibold text-foreground">
                {totalMatches ?? pois.length}
              </p>
            </div>
          </div>


          {/* Avg Score */}
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-md bg-data-warning/20 flex items-center justify-center">
              <Zap className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-data-warning" />
            </div>
            <div>
              <p className="text-[10px] sm:text-xs text-muted-foreground">Avg Score</p>
              <p className="text-xs sm:text-sm font-mono font-semibold text-foreground">{avgScore}%</p>
            </div>
          </div>

          {/* Query Time */}
          {searchTime !== null && (
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-md bg-data-info/20 flex items-center justify-center">
                <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-data-info" />
              </div>
              <div>
                <p className="text-[10px] sm:text-xs text-muted-foreground">Query Time</p>
                <p className="text-xs sm:text-sm font-mono font-semibold text-foreground">{searchTime}ms</p>
              </div>
            </div>
          )}
        </div>

        {/* Last Search */}
        {lastSearch && (
          <div className="text-left sm:text-right">
            <p className="text-[10px] sm:text-xs text-muted-foreground">Last Search</p>
            <p className="text-xs sm:text-sm font-mono text-primary truncate max-w-[200px] sm:max-w-none">{lastSearch}</p>
          </div>
        )}
      </div>
    </div>
  );
}
