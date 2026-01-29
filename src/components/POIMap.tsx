import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { POI } from '@/types/poi';

// Custom marker icon
const createCustomIcon = (score: number) => {
  const color = score >= 0.95 ? '#22d3ee' : score >= 0.90 ? '#10b981' : '#f59e0b';
  return L.divIcon({
    className: 'custom-marker',
    html: `
      <div style="
        width: 24px;
        height: 24px;
        background: ${color};
        border: 2px solid rgba(255,255,255,0.8);
        border-radius: 50%;
        box-shadow: 0 2px 8px rgba(0,0,0,0.4), 0 0 12px ${color}40;
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <div style="width: 8px; height: 8px; background: white; border-radius: 50%;"></div>
      </div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12],
  });
};

interface MapControllerProps {
  pois: POI[];
}

function MapController({ pois }: MapControllerProps) {
  const map = useMap();

  useEffect(() => {
    if (pois.length > 0) {
      const bounds = L.latLngBounds(pois.map((poi) => [poi.latitude, poi.longitude]));
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
    }
  }, [pois, map]);

  return null;
}

interface POIMapProps {
  pois: POI[];
  onSelectPOI: (poi: POI) => void;
  selectedPOI: POI | null;
}

export function POIMap({ pois, onSelectPOI }: POIMapProps) {
  return (
    <div className="h-full w-full rounded-lg overflow-hidden border border-border glow-effect">
      <MapContainer
        center={[20, 0]}
        zoom={2}
        className="h-full w-full"
        zoomControl={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapController pois={pois} />
        {pois.map((poi) => (
          <Marker
            key={poi.id}
            position={[poi.latitude, poi.longitude]}
            icon={createCustomIcon(poi.poi_sim_score)}
            eventHandlers={{
              click: () => onSelectPOI(poi),
            }}
          >
            <Popup>
              <div className="min-w-[200px]">
                <h3 className="font-semibold text-base mb-1">{poi.names.primary}</h3>
                <p className="text-sm opacity-80 mb-2">{poi.categories.primary.replace(/_/g, ' ')}</p>
                <div className="flex items-center gap-2">
                  <span className="text-xs opacity-60">Similarity:</span>
                  <span className="text-sm font-mono font-medium" style={{ color: '#22d3ee' }}>
                    {(poi.poi_sim_score * 100).toFixed(1)}%
                  </span>
                </div>
                {poi.addresses?.[0] && (
                  <p className="text-xs opacity-60 mt-2">
                    {poi.addresses[0].locality}, {poi.addresses[0].country}
                  </p>
                )}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
