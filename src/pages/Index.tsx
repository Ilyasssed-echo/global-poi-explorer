import { useState, useCallback, useRef } from 'react';
import { SearchPanel } from '@/components/SearchPanel';
import { POIMap } from '@/components/POIMap';
import { ResultsTable } from '@/components/ResultsTable';
import { StatsBar } from '@/components/StatsBar';
import { LogsPanel } from '@/components/LogsPanel';
import { POI, SearchParams, BBox } from '@/types/poi';
import { searchPOIs } from '@/lib/api';
import { toast } from '@/hooks/use-toast';

const MAX_POIS_DISPLAYED = 20;

const Index = () => {
  const [pois, setPois] = useState<POI[]>([]);
  const [selectedPOI, setSelectedPOI] = useState<POI | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTime, setSearchTime] = useState<number | null>(null);
  const [lastSearch, setLastSearch] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
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
      const response = await searchPOIs({
        ...params,
        limit: MAX_POIS_DISPLAYED,
      });
      
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
      
      toast({
        title: "Search complete",
        description: `Found ${response.filtered_count} POIs (showing top ${response.pois.length})`,
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

  // Handle map viewport changes - reload POIs for new bounds
  const handleBoundsChange = useCallback(async (bbox: BBox) => {
    const params = lastSearchParams.current;
    if (!params || isLoading) return;

    // Only do viewport-based requery if we've already searched
    if (pois.length === 0) return;
    
    // Skip the first bounds change after initial search (prevents loop)
    if (isInitialSearchRef.current) {
      isInitialSearchRef.current = false;
      return;
    }

    setIsLoading(true);
    const startTime = Date.now();

    try {
      const response = await searchPOIs({
        ...params,
        bbox,
        limit: MAX_POIS_DISPLAYED,
      });

      const endTime = Date.now();
      setSearchTime(endTime - startTime);
      setPois(response.pois);
      setLogs(response.logs);
      // Don't update resultBbox on viewport queries to keep original search area visible
    } catch (error) {
      console.error('Viewport query failed:', error);
    } finally {
      setIsLoading(false);
    }
  }, [pois.length, isLoading]);

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
    <div className="h-screen w-screen bg-background overflow-hidden">
      <div className="h-full flex">
        {/* Left Sidebar - Search Panel */}
        <aside className="w-80 flex-shrink-0 p-4 flex flex-col gap-4">
          <SearchPanel onSearch={handleSearch} isLoading={isLoading} />
          <LogsPanel logs={logs} />
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col gap-4 p-4 pl-0">
          {/* Stats Bar */}
          <StatsBar pois={pois} searchTime={searchTime} lastSearch={lastSearch} />

          {/* Map and Results Grid */}
          <div className="flex-1 grid grid-cols-5 gap-4 min-h-0">
            {/* Map - 3 columns */}
            <div className="col-span-3 min-h-0">
              <POIMap
                pois={pois}
                selectedPOI={selectedPOI}
                onSelectPOI={setSelectedPOI}
                onBoundsChange={handleBoundsChange}
                resultBbox={resultBbox}
              />
            </div>

            {/* Results Table - 2 columns */}
            <div className="col-span-2 min-h-0">
              <ResultsTable
                pois={pois}
                selectedPOI={selectedPOI}
                onSelectPOI={setSelectedPOI}
                onExportCSV={handleExportCSV}
              />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Index;
