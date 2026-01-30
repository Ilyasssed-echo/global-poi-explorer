import { useState } from 'react';
import { Search, MapPin, Globe, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SearchMode, SearchParams } from '@/types/poi';
import { countryOptions } from '@/data/mockPOIs';

interface SearchPanelProps {
  onSearch: (params: SearchParams) => void;
  isLoading: boolean;
}

export function SearchPanel({ onSearch, isLoading }: SearchPanelProps) {
  const [keyword, setKeyword] = useState('pizza');
  const [mode, setMode] = useState<SearchMode>('country');
  const [latitude, setLatitude] = useState(40.7128);
  const [longitude, setLongitude] = useState(-74.006);
  const [radius, setRadius] = useState(10);
  const [countryCode, setCountryCode] = useState('IT');

  const handleSearch = () => {
    onSearch({
      keyword,
      mode,
      latitude: mode === 'coordinate' ? latitude : undefined,
      longitude: mode === 'coordinate' ? longitude : undefined,
      radius: mode === 'coordinate' ? radius : undefined,
      countryCode: mode === 'country' ? countryCode : undefined,
    });
  };

  return (
    <div className="h-full flex flex-col glass-panel rounded-lg p-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
            <Globe className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Global POI Explorer</h1>
            <p className="text-xs text-muted-foreground">Overture Maps Dataset</p>
          </div>
        </div>
      </div>

      {/* Search Inputs */}
      <div className="space-y-6 flex-1">
        {/* Keyword Input */}
        <div className="space-y-2">
          <Label htmlFor="keyword" className="text-sm font-medium text-muted-foreground">
            Search Keywords
          </Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              id="keyword"
              placeholder="e.g., pizza, restaurant, cafe..."
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="pl-10 bg-input border-border focus:border-primary focus:ring-primary/20"
            />
          </div>
        </div>

        {/* Mode Toggle */}
        <div className="flex flex-col gap-2 p-4 bg-secondary/60 rounded-lg border border-border/50">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium text-muted-foreground">Search Mode</Label>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <MapPin className={`w-4 h-4 ${mode === 'coordinate' ? 'text-emerald-400' : 'text-muted-foreground'}`} />
                <span className={`text-sm font-medium ${mode === 'coordinate' ? 'text-emerald-400' : 'text-muted-foreground'}`}>
                  Coordinates
                </span>
              </div>
              <Switch
                checked={mode === 'country'}
                onCheckedChange={(checked) => setMode(checked ? 'country' : 'coordinate')}
              />
              <div className="flex items-center gap-1.5">
                <span className={`text-sm font-medium ${mode === 'country' ? 'text-blue-400' : 'text-muted-foreground'}`}>
                  Country
                </span>
                <Globe className={`w-4 h-4 ${mode === 'country' ? 'text-blue-400' : 'text-muted-foreground'}`} />
              </div>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground">
            {mode === 'coordinate' 
              ? 'Search within a radius around specific lat/lng coordinates' 
              : 'Search across an entire country using ISO country code'}
          </p>
        </div>

        {/* Conditional Inputs */}
        {mode === 'coordinate' ? (
          <div className="space-y-4 animate-fade-in">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="lat" className="text-xs text-muted-foreground">Latitude</Label>
                <Input
                  id="lat"
                  type="number"
                  step="0.0001"
                  value={latitude}
                  onChange={(e) => setLatitude(parseFloat(e.target.value))}
                  className="bg-input border-border font-mono text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lng" className="text-xs text-muted-foreground">Longitude</Label>
                <Input
                  id="lng"
                  type="number"
                  step="0.0001"
                  value={longitude}
                  onChange={(e) => setLongitude(parseFloat(e.target.value))}
                  className="bg-input border-border font-mono text-sm"
                />
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Label className="text-xs text-muted-foreground">Radius</Label>
                <span className="text-xs font-mono text-primary">{radius} km</span>
              </div>
              <Slider
                value={[radius]}
                onValueChange={([value]) => setRadius(value)}
                min={1}
                max={50}
                step={1}
                className="[&_[role=slider]]:bg-primary [&_[role=slider]]:border-primary"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-2 animate-fade-in">
            <Label className="text-xs text-muted-foreground">Country Code (ISO-3166)</Label>
            <Select value={countryCode} onValueChange={setCountryCode}>
              <SelectTrigger className="bg-input border-border">
                <SelectValue placeholder="Select a country" />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border">
                {countryOptions.map((country) => (
                  <SelectItem key={country.code} value={country.code}>
                    <span className="font-mono text-primary mr-2">{country.code}</span>
                    {country.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Search Button */}
      <Button
        onClick={handleSearch}
        disabled={isLoading || !keyword.trim()}
        className="w-full mt-6 bg-primary hover:bg-primary/90 text-primary-foreground font-medium h-12 glow-effect"
      >
        {isLoading ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Querying via DuckDB-WASM...
          </>
        ) : (
          <>
            <Search className="w-4 h-4 mr-2" />
            Search POIs
          </>
        )}
      </Button>

      {/* Footer Info */}
      <div className="mt-6 pt-4 border-t border-border">
        <p className="text-xs text-muted-foreground text-center">
          Powered by DuckDB-WASM (in-browser)
        </p>
      </div>
    </div>
  );
}
