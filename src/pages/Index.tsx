import { useState, useCallback, useRef } from 'react';
import { SearchPanel } from '@/components/SearchPanel';
import { POIMap } from '@/components/POIMap';
import { ResultsTable } from '@/components/ResultsTable';
import { StatsBar } from '@/components/StatsBar';
import LogsPanel from '@/components/LogsPanel';
import { POI, SearchParams } from '@/types/poi';
import { searchPOIs } from '@/lib/api';
import { toast } from '@/hooks/use-toast';

// No limit - show all high-confidence matches

const Index = () => {
  const [pois, setPois] = useState<POI[]>([]);
  const [selectedPOI, setSelectedPOI] = useState<POI | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTime, setSearchTime] = useState<number | null>(null);
  const [lastSearch, setLastSearch] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [totalFilteredCount, setTotalFilteredCount] = useState<number>(0);
  const [resultBbox, setResultBbox] = useState<{ xmin: number; xmax: number; ymin: number; ymax: number } | null>(null);
  
  // Store last search params for viewport-based requery
  const lastSearchParams = useRef<SearchParams | null>(null);
  const isInitialSearchRef = useRef(true);

  const handleSearch = useCallback(async (params: SearchParams) => {
    setIsLoading(true);
    isInitialSearchRef.current = true; // Mark as initial search
    const startTime = Date.now();
    lastSearchParams.current = params;
    
    try {
      const response = await searchPOIs(params);
      
      const endTime = Date.now();
      setSearchTime(endTime - startTime);
      setLastSearch(
        `"${params.keyword}" ${
          params.mode === 'country'
            ? `in ${params.countryCode}`
            : `@ ${params.latitude?.toFixed(2)}, ${params.longitude?.toFixed(2)}`
        }`
      );
      
      setPois(response.pois);
      setLogs(response.logs);
      setResultBbox(response.bbox);
      setTotalFilteredCount(response.filtered_count);
      
      toast({
        title: "Search complete",
        description: `Found ${response.filtered_count} high-confidence matches (showing ${response.pois.length})`,
      });
    } catch (error) {
      console.error('Search failed:', error);
      setLogs([`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`]);
      toast({
        title: "Search failed",
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Removed: handleBoundsChange - map no longer auto-reloads on pan/zoom

  const handleExportCSV = useCallback(() => {
    if (pois.length === 0) return;

    const headers = ['Name', 'Category', 'Latitude', 'Longitude', 'Score', 'Location'];
    const rows = pois.map((poi) => [
      poi.names.primary,
      poi.categories.primary,
      poi.latitude.toString(),
      poi.longitude.toString(),
      (poi.poi_sim_score * 100).toFixed(1) + '%',
      [poi.addresses?.[0]?.locality, poi.addresses?.[0]?.country].filter(Boolean).join(', '),
    ]);

    const csvContent = [headers.join(','), ...rows.map((row) => row.map((cell) => `"${cell}"`).join(','))].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `poi-export-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }, [pois]);

  return (
    <div className="min-h-screen w-screen bg-background overflow-x-hidden">
      <div className="h-full flex flex-col lg:flex-row">
        {/* Left Sidebar - Search Panel */}
        <aside className="w-full lg:w-80 flex-shrink-0 p-4 flex flex-col gap-4">
          <SearchPanel onSearch={handleSearch} isLoading={isLoading} />
          <div className="hidden lg:block">
            <LogsPanel logs={logs} onClearLogs={() => setLogs([])} />
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col gap-4 p-4 lg:pl-0">
          {/* Stats Bar */}
          <StatsBar pois={pois} searchTime={searchTime} lastSearch={lastSearch} totalMatches={totalFilteredCount} />

          {/* Map and Results Grid */}
          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 min-h-[400px] lg:min-h-0">
            {/* Map */}
            <div className="col-span-1 md:col-span-1 lg:col-span-3 min-h-[300px] md:min-h-[400px] lg:min-h-0">
              <POIMap
                pois={pois}
                selectedPOI={selectedPOI}
                onSelectPOI={setSelectedPOI}
                resultBbox={resultBbox}
              />
            </div>

            {/* Results Table */}
            <div className="col-span-1 md:col-span-1 lg:col-span-2 min-h-[300px] md:min-h-[400px] lg:min-h-0">
              <ResultsTable
                pois={pois}
                selectedPOI={selectedPOI}
                onSelectPOI={setSelectedPOI}
                onExportCSV={handleExportCSV}
              />
            </div>
          </div>

          {/* Logs Panel - Mobile only */}
          <div className="lg:hidden">
            <LogsPanel logs={logs} onClearLogs={() => setLogs([])} />
          </div>
        </main>
      </div>
    </div>
  );
};

export default Index;
