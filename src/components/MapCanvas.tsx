import { useEffect, useRef } from "react";
import maplibregl, { type Map as MLMap, type StyleSpecification } from "maplibre-gl";

const DARK_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    "raster-dark": {
      type: "raster",
      tiles: ["https://basemaps.cartocdn.com/dark_matter/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap, © CARTO",
    },
  },
  layers: [
    { id: "bg", type: "background", paint: { "background-color": "#07080F" } },
    { id: "raster-dark", type: "raster", source: "raster-dark", paint: { "raster-opacity": 0.85 } },
  ],
};

const SATELLITE_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    sat: {
      type: "raster",
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      attribution: "© Esri",
    },
  },
  layers: [{ id: "sat", type: "raster", source: "sat" }],
};

interface LatLng { lat: number; lng: number }

interface Props {
  center: [number, number];
  heading?: number;
  trail?: Array<LatLng>;
  /** Optional full route shown dimmed beneath the live trail (used for replay). */
  fullPath?: Array<LatLng>;
  /** Optional start/end pins. */
  startPoint?: LatLng;
  endPoint?: LatLng;
  /** Auto-fit bounds to fullPath on first load. */
  fitToPath?: boolean;
  style?: "streets" | "satellite";
  followVehicle?: boolean;
  className?: string;
}

function makePin(color: string, label: string) {
  const el = document.createElement("div");
  el.innerHTML = `
    <div style="position:relative;width:28px;height:36px;">
      <div style="position:absolute;inset:0;display:grid;place-items:center;">
        <svg width="28" height="36" viewBox="0 0 28 36" fill="none">
          <path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.27 21.73 0 14 0z" fill="${color}"/>
          <circle cx="14" cy="14" r="5" fill="#07080F"/>
        </svg>
      </div>
      <div style="position:absolute;top:8px;left:0;right:0;text-align:center;font:600 10px/1 ui-sans-serif,system-ui;color:#fff;">${label}</div>
    </div>`;
  return el;
}

export function MapCanvas({
  center,
  heading = 0,
  trail = [],
  fullPath,
  startPoint,
  endPoint,
  fitToPath = false,
  style = "streets",
  followVehicle = true,
  className,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const markerRef = useRef<HTMLDivElement | null>(null);
  const markerInstance = useRef<maplibregl.Marker | null>(null);
  const pinsRef = useRef<maplibregl.Marker[]>([]);
  const fittedRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: style === "satellite" ? SATELLITE_STYLE : DARK_STYLE,
      center: [center[1], center[0]],
      zoom: 14,
      attributionControl: false,
      dragRotate: false,
    });
    mapRef.current = map;

    const el = document.createElement("div");
    el.innerHTML = `
      <div style="position:relative;width:48px;height:48px;display:grid;place-items:center;">
        <div style="position:absolute;inset:0;border-radius:999px;background:rgba(0,212,255,0.18);animation:pulse-ring 2s ease-out infinite;"></div>
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.5" style="filter: drop-shadow(0 2px 6px rgba(0,0,0,0.6));">
          <path d="M5 17a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm14 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" fill="#FF6B35" />
          <path d="M5 14h6l2-5h4l2 5" />
          <path d="M11 14l4-5" />
        </svg>
      </div>`;
    el.style.transition = "transform 500ms linear";
    markerRef.current = el;
    markerInstance.current = new maplibregl.Marker({ element: el, rotationAlignment: "map" })
      .setLngLat([center[1], center[0]])
      .addTo(map);

    map.on("load", () => {
      map.addSource("full-path", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "full-path-line",
        type: "line",
        source: "full-path",
        paint: {
          "line-color": "#5a6378",
          "line-width": 3,
          "line-opacity": 0.45,
          "line-dasharray": [2, 1.5],
        },
        layout: { "line-cap": "round", "line-join": "round" },
      });

      map.addSource("trail", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "trail-line",
        type: "line",
        source: "trail",
        paint: {
          "line-color": "#00D4FF",
          "line-width": 4,
          "line-opacity": 0.9,
          "line-blur": 0.4,
        },
        layout: { "line-cap": "round", "line-join": "round" },
      });
    });

    return () => {
      pinsRef.current.forEach((m) => m.remove());
      pinsRef.current = [];
      map.remove();
      mapRef.current = null;
      fittedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [style]);

  // marker
  useEffect(() => {
    if (markerInstance.current) markerInstance.current.setLngLat([center[1], center[0]]);
    if (markerRef.current) {
      const svg = markerRef.current.querySelector("svg");
      if (svg) (svg as SVGElement).style.transform = `rotate(${heading}deg)`;
    }
    if (followVehicle && mapRef.current) {
      mapRef.current.easeTo({ center: [center[1], center[0]], duration: 500 });
    }
  }, [center, heading, followVehicle]);

  // trail (traveled portion)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const src = map.getSource("trail") as maplibregl.GeoJSONSource | undefined;
      if (!src) return;
      src.setData({
        type: "FeatureCollection",
        features: [{
          type: "Feature", properties: {},
          geometry: { type: "LineString", coordinates: trail.map((p) => [p.lng, p.lat]) },
        }],
      });
    };
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [trail]);

  // full path (dimmed)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const src = map.getSource("full-path") as maplibregl.GeoJSONSource | undefined;
      if (!src) return;
      src.setData({
        type: "FeatureCollection",
        features: fullPath && fullPath.length > 1 ? [{
          type: "Feature", properties: {},
          geometry: { type: "LineString", coordinates: fullPath.map((p) => [p.lng, p.lat]) },
        }] : [],
      });

      if (fitToPath && !fittedRef.current && fullPath && fullPath.length > 1) {
        const bounds = fullPath.reduce(
          (b, p) => b.extend([p.lng, p.lat]),
          new maplibregl.LngLatBounds([fullPath[0].lng, fullPath[0].lat], [fullPath[0].lng, fullPath[0].lat]),
        );
        map.fitBounds(bounds, { padding: 80, duration: 600, maxZoom: 15 });
        fittedRef.current = true;
      }
    };
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [fullPath, fitToPath]);

  // start/end pins
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    pinsRef.current.forEach((m) => m.remove());
    pinsRef.current = [];
    if (startPoint) {
      pinsRef.current.push(
        new maplibregl.Marker({ element: makePin("#10F58F", "A"), anchor: "bottom" })
          .setLngLat([startPoint.lng, startPoint.lat]).addTo(map),
      );
    }
    if (endPoint) {
      pinsRef.current.push(
        new maplibregl.Marker({ element: makePin("#FF3B30", "B"), anchor: "bottom" })
          .setLngLat([endPoint.lng, endPoint.lat]).addTo(map),
      );
    }
  }, [startPoint, endPoint]);

  return <div ref={containerRef} className={className ?? "absolute inset-0"} />;
}
