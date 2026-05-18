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

interface Props {
  center: [number, number];
  heading?: number;
  trail?: Array<{ lat: number; lng: number }>;
  style?: "streets" | "satellite";
  followVehicle?: boolean;
  className?: string;
}

export function MapCanvas({ center, heading = 0, trail = [], style = "streets", followVehicle = true, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const markerRef = useRef<HTMLDivElement | null>(null);
  const markerInstance = useRef<maplibregl.Marker | null>(null);

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

    // create custom marker
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
      map.addSource("trail", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "trail-line",
        type: "line",
        source: "trail",
        paint: {
          "line-color": "#00D4FF",
          "line-width": 3,
          "line-opacity": 0.7,
          "line-blur": 0.5,
        },
        layout: { "line-cap": "round", "line-join": "round" },
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [style]);

  // update marker position + heading
  useEffect(() => {
    if (markerInstance.current) {
      markerInstance.current.setLngLat([center[1], center[0]]);
    }
    if (markerRef.current) {
      const svg = markerRef.current.querySelector("svg");
      if (svg) (svg as SVGElement).style.transform = `rotate(${heading}deg)`;
    }
    if (followVehicle && mapRef.current) {
      mapRef.current.easeTo({ center: [center[1], center[0]], duration: 800 });
    }
  }, [center, heading, followVehicle]);

  // update trail
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const src = map.getSource("trail") as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    src.setData({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: trail.map((p) => [p.lng, p.lat]),
          },
        },
      ],
    });
  }, [trail]);

  return <div ref={containerRef} className={className ?? "absolute inset-0"} />;
}
