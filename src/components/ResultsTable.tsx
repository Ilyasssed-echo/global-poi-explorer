import { Download, MapPin, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { POI } from '@/types/poi';
import { cn } from '@/lib/utils';

interface ResultsTableProps {
  pois: POI[];
  selectedPOI: POI | null;
  onSelectPOI: (poi: POI) => void;
  onExportCSV: () => void;
}

export function ResultsTable({ pois, selectedPOI, onSelectPOI, onExportCSV }: ResultsTableProps) {
  const getScoreColor = (score: number) => {
    if (score >= 0.98) return 'text-primary';
    if (score >= 0.95) return 'text-data-success';
    return 'text-data-warning';
  };

  const getScoreBg = (score: number) => {
    if (score >= 0.98) return 'bg-primary/10';
    if (score >= 0.95) return 'bg-data-success/10';
    return 'bg-data-warning/10';
  };

  return (
    <div className="h-full flex flex-col glass-panel rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-3 sm:p-4 border-b border-border gap-2">
        <div className="flex items-center gap-2 sm:gap-3">
          <h2 className="font-semibold text-sm sm:text-base text-foreground">Results</h2>
          <span className="px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-xs font-mono bg-primary/20 text-primary rounded">
            {pois.length} POIs
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onExportCSV}
          disabled={pois.length === 0}
          className="border-border hover:bg-secondary hover:text-foreground text-xs sm:text-sm px-2 sm:px-3"
        >
          <Download className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
          <span className="hidden sm:inline">Export CSV</span>
          <span className="sm:hidden">CSV</span>
        </Button>
      </div>

      {/* Table */}
      <ScrollArea className="flex-1">
        {pois.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-12 text-muted-foreground">
            <MapPin className="w-12 h-12 mb-4 opacity-30" />
            <p className="text-sm">No results yet</p>
            <p className="text-xs opacity-60">Search for POIs to see results here</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {pois.map((poi, index) => (
              <div
                key={poi.id}
                onClick={() => onSelectPOI(poi)}
                className={cn(
                  'p-4 cursor-pointer transition-all duration-200 hover:bg-secondary/50',
                  selectedPOI?.id === poi.id && 'bg-primary/10 border-l-2 border-l-primary',
                  'animate-fade-in'
                )}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium text-foreground truncate">{poi.names.primary}</h3>
                      {poi.websites?.length && (
                        <ExternalLink className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">
                      {poi.categories.primary.replace(/_/g, ' ')}
                    </p>
                    {poi.addresses?.[0] && (
                      <p className="text-xs text-muted-foreground/70 flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {[poi.addresses[0].locality, poi.addresses[0].country]
                          .filter(Boolean)
                          .join(', ')}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div className={cn('px-2 py-1 rounded text-xs font-mono', getScoreBg(poi.poi_sim_score), getScoreColor(poi.poi_sim_score))}>
                      {(poi.poi_sim_score * 100).toFixed(1)}%
                    </div>
                    <span className="text-[10px] text-muted-foreground/50 font-mono">
                      {poi.latitude.toFixed(4)}, {poi.longitude.toFixed(4)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
