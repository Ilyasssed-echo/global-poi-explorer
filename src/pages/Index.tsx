import { useState, useCallback } from 'react';
import { SearchPanel } from '@/components/SearchPanel';
import { POIMap } from '@/components/POIMap';
import { ResultsTable } from '@/components/ResultsTable';
import { StatsBar } from '@/components/StatsBar';
import { POI, SearchParams } from '@/types/poi';
import { mockPOIs } from '@/data/mockPOIs';

const Index = () => {
  const [pois, setPois] = useState<POI[]>([]);
  const [selectedPOI, setSelectedPOI] = useState<POI | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTime, setSearchTime] = useState<number | null>(null);
  const [lastSearch, setLastSearch] = useState<string | null>(null);

  const handleSearch = useCallback(async (params: SearchParams) => {
    setIsLoading(true);
    const startTime = Date.now();
    
    // Simulate API call with mock data
    await new Promise((resolve) => setTimeout(resolve, 1500));
    
    // Filter mock data based on search params
    const filtered = mockPOIs.filter((poi) => {
      const matchesKeyword = 
        poi.names.primary.toLowerCase().includes(params.keyword.toLowerCase()) ||
        poi.categories.primary.toLowerCase().includes(params.keyword.toLowerCase());

      if (params.mode === 'country' && params.countryCode) {
        const matchesCountry = poi.addresses?.[0]?.country === params.countryCode;
        return matchesKeyword && matchesCountry;
      }

      if (params.mode === 'coordinate' && params.latitude && params.longitude && params.radius) {
        // Simple distance check (not accurate but good for demo)
        const latDiff = Math.abs(poi.latitude - params.latitude);
        const lngDiff = Math.abs(poi.longitude - params.longitude);
        const approxDistance = Math.sqrt(latDiff ** 2 + lngDiff ** 2) * 111; // rough km conversion
        return matchesKeyword && approxDistance <= params.radius;
      }

      return matchesKeyword;
    });

    const endTime = Date.now();
    setSearchTime(endTime - startTime);
    setLastSearch(`"${params.keyword}" ${params.mode === 'country' ? `in ${params.countryCode}` : `@ ${params.latitude?.toFixed(2)}, ${params.longitude?.toFixed(2)}`}`);
    setPois(filtered.length > 0 ? filtered : mockPOIs);
    setIsLoading(false);
  }, []);

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
        <aside className="w-80 flex-shrink-0 p-4">
          <SearchPanel onSearch={handleSearch} isLoading={isLoading} />
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col gap-4 p-4 pl-0">
          {/* Stats Bar */}
          <StatsBar pois={pois} searchTime={searchTime} lastSearch={lastSearch} />

          {/* Map and Results Grid */}
          <div className="flex-1 grid grid-cols-5 gap-4 min-h-0">
            {/* Map - 3 columns */}
            <div className="col-span-3 min-h-0">
              <POIMap pois={pois} selectedPOI={selectedPOI} onSelectPOI={setSelectedPOI} />
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
