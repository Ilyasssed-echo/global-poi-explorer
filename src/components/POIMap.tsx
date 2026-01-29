import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { POI, BBox } from "@/types/poi";

// NOTE: We intentionally use plain Leaflet (not react-leaflet) to avoid the
// React Context consumer crash: `render2 is not a function`.

const createCustomIcon = (score: number) => {
  const color = score >= 0.95 ? "#22d3ee" : score >= 0.9 ? "#10b981" : "#f59e0b";
  return L.divIcon({
    className: "custom-marker",
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

interface POIMapProps {
  pois: POI[];
  onSelectPOI: (poi: POI) => void;
  selectedPOI: POI | null;
  onBoundsChange?: (bbox: BBox) => void;
  resultBbox?: { xmin: number; xmax: number; ymin: number; ymax: number } | null;
}

export function POIMap({ pois, onSelectPOI, onBoundsChange, resultBbox }: POIMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const bboxLayerRef = useRef<L.Rectangle | null>(null);
  const isInitialFitRef = useRef(true);
  const isProgrammaticMoveRef = useRef(false);

  const tileConfig = useMemo(
    () => ({
      url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }),
    [],
  );

  // Create map once.
  useEffect(() => {
    if (!containerRef.current) return;
    if (mapRef.current) return;

    const map = L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: true,
      preferCanvas: true,
    }).setView([20, 0], 2);

    L.tileLayer(tileConfig.url, {
      attribution: tileConfig.attribution,
      maxZoom: 19,
    }).addTo(map);

    const markersLayer = L.layerGroup().addTo(map);

    // Listen for zoom/pan changes (debounced)
    let debounceTimer: ReturnType<typeof setTimeout>;
    map.on('moveend', () => {
      // Skip if this was a programmatic move (like fitBounds)
      if (isProgrammaticMoveRef.current) {
        isProgrammaticMoveRef.current = false;
        return;
      }
      
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (onBoundsChange) {
          const bounds = map.getBounds();
          onBoundsChange({
            north: bounds.getNorth(),
            south: bounds.getSouth(),
            east: bounds.getEast(),
            west: bounds.getWest(),
          });
        }
      }, 800); // Increased debounce to 800ms
    });

    mapRef.current = map;
    markersLayerRef.current = markersLayer;

    return () => {
      clearTimeout(debounceTimer);
      markersLayer.clearLayers();
      map.remove();
      mapRef.current = null;
      markersLayerRef.current = null;
    };
  }, [tileConfig, onBoundsChange]);

  // Draw bounding box when result bbox changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Remove existing bbox
    if (bboxLayerRef.current) {
      map.removeLayer(bboxLayerRef.current);
      bboxLayerRef.current = null;
    }

    if (resultBbox) {
      const bounds = L.latLngBounds(
        [resultBbox.ymin, resultBbox.xmin],
        [resultBbox.ymax, resultBbox.xmax]
      );
      
      bboxLayerRef.current = L.rectangle(bounds, {
        color: '#22d3ee',
        weight: 2,
        fillOpacity: 0.05,
        dashArray: '5, 5',
      }).addTo(map);
    }
  }, [resultBbox]);

  // Render markers whenever POIs change.
  useEffect(() => {
    const map = mapRef.current;
    const markersLayer = markersLayerRef.current;
    if (!map || !markersLayer) return;

    markersLayer.clearLayers();

    if (pois.length === 0) return;

    for (const poi of pois) {
      const marker = L.marker([poi.latitude, poi.longitude], {
        icon: createCustomIcon(poi.poi_sim_score),
        title: poi.names.primary,
      });

      marker.on("click", () => onSelectPOI(poi));

      const category = poi.categories.primary.replace(/_/g, " ");
      const similarity = `${(poi.poi_sim_score * 100).toFixed(1)}%`;
      const location = poi.addresses?.[0]
        ? [poi.addresses[0].locality, poi.addresses[0].country].filter(Boolean).join(", ")
        : null;

      // Enhanced tooltip with name, lat/long, and address on hover
      const tooltipContent = `
        <div style="font-weight: 600; font-size: 13px;">${escapeHtml(poi.names.primary)}</div>
        <div style="font-size: 11px; opacity: 0.7; font-family: monospace;">
          ${poi.latitude.toFixed(5)}, ${poi.longitude.toFixed(5)}
        </div>
        ${location ? `<div style="font-size: 11px; opacity: 0.6;">${escapeHtml(location)}</div>` : ''}
      `.trim();
      
      marker.bindTooltip(tooltipContent, {
        permanent: false,
        direction: 'top',
        offset: [0, -12],
        className: 'poi-tooltip',
      });

      // Popup for click (more details)
      marker.bindPopup(
        `
          <div style="min-width: 200px;">
            <div style="font-weight: 600; font-size: 14px; margin-bottom: 4px;">${escapeHtml(
              poi.names.primary,
            )}</div>
            <div style="font-size: 12px; opacity: 0.8; margin-bottom: 8px;">${escapeHtml(
              category,
            )}</div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 11px; opacity: 0.65;">Similarity:</span>
              <span style="font-size: 12px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; font-weight: 600; color: #22d3ee;">${escapeHtml(
                similarity,
              )}</span>
            </div>
            <div style="font-size: 11px; opacity: 0.65; margin-top: 8px; font-family: monospace;">
              ${poi.latitude.toFixed(5)}, ${poi.longitude.toFixed(5)}
            </div>
            ${
              location
                ? `<div style="font-size: 11px; opacity: 0.65; margin-top: 4px;">${escapeHtml(
                    location,
                  )}</div>`
                : ""
            }
          </div>
        `.trim(),
      );

      marker.addTo(markersLayer);
    }

    // Only fit bounds on initial search (not on viewport re-queries)
    if (isInitialFitRef.current && pois.length > 0) {
      isProgrammaticMoveRef.current = true;
      const bounds = L.latLngBounds(pois.map((p) => [p.latitude, p.longitude] as [number, number]));
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
      isInitialFitRef.current = false;
    }
  }, [pois, onSelectPOI]);

  return (
    <div className="h-full w-full rounded-lg overflow-hidden border border-border glow-effect">
      <div ref={containerRef} className="h-full w-full" />
      <style>{`
        .poi-tooltip {
          background: rgba(0, 0, 0, 0.85);
          border: 1px solid rgba(34, 211, 238, 0.3);
          border-radius: 6px;
          padding: 8px 12px;
          color: white;
          font-size: 12px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
        }
        .poi-tooltip::before {
          border-top-color: rgba(0, 0, 0, 0.85) !important;
        }
      `}</style>
    </div>
  );
}

// Reset initial fit flag when search params change
export function resetMapFit() {
  // This will be called from parent when a new search is initiated
}

function escapeHtml(input: string) {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
