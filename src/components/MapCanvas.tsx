/// <reference types="google.maps" />
import { useEffect, useRef, useState } from "react";

interface LatLng { lat: number; lng: number }

interface Props {
  center: [number, number];
  heading?: number;
  trail?: Array<LatLng>;
  fullPath?: Array<LatLng>;
  startPoint?: LatLng;
  endPoint?: LatLng;
  fitToPath?: boolean;
  style?: "streets" | "satellite";
  followVehicle?: boolean;
  className?: string;
}

// Dark "command center" style for Google Maps
const DARK_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#0c0f1a" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0c0f1a" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#7a8499" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#1a1f2e" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#9aa5bd" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#5a6378" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#0f1a14" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#161c2b" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#0a0d17" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#1c2336" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#243049" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#0a0d17" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#6b7691" }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ color: "#141a28" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#06101e" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#3a4a66" }] },
];

// Singleton loader for Google Maps JS API
let mapsLoader: Promise<typeof google> | null = null;
function loadGoogleMaps(): Promise<typeof google> {
  if (typeof window === "undefined") return Promise.reject(new Error("SSR"));
  if ((window as any).google?.maps) return Promise.resolve((window as any).google);
  if (mapsLoader) return mapsLoader;

  const key = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY;
  const channel = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID;

  mapsLoader = new Promise((resolve, reject) => {
    (window as any).__mtInitMap = () => resolve((window as any).google);
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&loading=async&callback=__mtInitMap&libraries=geometry${channel ? `&channel=${channel}` : ""}`;
    s.async = true;
    s.defer = true;
    s.onerror = () => reject(new Error("Failed to load Google Maps"));
    document.head.appendChild(s);
  });
  return mapsLoader;
}

function pinSvg(color: string, label: string) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="40" viewBox="0 0 28 36"><path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.27 21.73 0 14 0z" fill="${color}"/><circle cx="14" cy="14" r="6" fill="#07080F"/><text x="14" y="17" font-family="ui-sans-serif,system-ui" font-size="9" font-weight="700" fill="#fff" text-anchor="middle">${label}</text></svg>`,
  )}`;
}

const VEHICLE_ICON = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44"><circle cx="22" cy="22" r="20" fill="rgba(0,212,255,0.18)"/><circle cx="22" cy="22" r="13" fill="#07080F" stroke="#00D4FF" stroke-width="1.5"/><svg x="10" y="10" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.5"><path d="M5 17a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm14 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" fill="#FF6B35"/><path d="M5 14h6l2-5h4l2 5"/><path d="M11 14l4-5"/></svg></svg>`,
)}`;

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
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const trailRef = useRef<google.maps.Polyline | null>(null);
  const fullPathRef = useRef<google.maps.Polyline | null>(null);
  const pinsRef = useRef<google.maps.Marker[]>([]);
  const fittedRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // init
  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    loadGoogleMaps()
      .then((g) => {
        if (cancelled || !containerRef.current) return;
        const map = new g.maps.Map(containerRef.current, {
          center: { lat: center[0], lng: center[1] },
          zoom: 14,
          mapTypeId: style === "satellite" ? g.maps.MapTypeId.HYBRID : g.maps.MapTypeId.ROADMAP,
          styles: style === "satellite" ? undefined : DARK_STYLE,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "greedy",
          backgroundColor: "#07080F",
          clickableIcons: false,
        });
        mapRef.current = map;

        markerRef.current = new g.maps.Marker({
          position: { lat: center[0], lng: center[1] },
          map,
          icon: {
            url: VEHICLE_ICON,
            scaledSize: new g.maps.Size(44, 44),
            anchor: new g.maps.Point(22, 22),
          },
          optimized: false,
          zIndex: 999,
        });

        fullPathRef.current = new g.maps.Polyline({
          map,
          path: [],
          strokeColor: "#5a6378",
          strokeOpacity: 0.5,
          strokeWeight: 3,
        });

        trailRef.current = new g.maps.Polyline({
          map,
          path: [],
          strokeColor: "#00D4FF",
          strokeOpacity: 0.9,
          strokeWeight: 4,
        });

        setReady(true);
      })
      .catch((e) => setError(e.message ?? "Map error"));

    return () => {
      cancelled = true;
      pinsRef.current.forEach((m) => m.setMap(null));
      pinsRef.current = [];
      markerRef.current?.setMap(null);
      trailRef.current?.setMap(null);
      fullPathRef.current?.setMap(null);
      mapRef.current = null;
      markerRef.current = null;
      trailRef.current = null;
      fullPathRef.current = null;
      fittedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [style]);

  // vehicle position
  useEffect(() => {
    if (!ready) return;
    const pos = { lat: center[0], lng: center[1] };
    markerRef.current?.setPosition(pos);
    if (followVehicle && mapRef.current) mapRef.current.panTo(pos);
  }, [center, heading, followVehicle, ready]);

  // trail
  useEffect(() => {
    if (!ready || !trailRef.current) return;
    trailRef.current.setPath(trail.map((p) => ({ lat: p.lat, lng: p.lng })));
  }, [trail, ready]);

  // full path + fit
  useEffect(() => {
    if (!ready || !fullPathRef.current || !mapRef.current) return;
    const coords = (fullPath ?? []).map((p) => ({ lat: p.lat, lng: p.lng }));
    fullPathRef.current.setPath(coords);
    if (fitToPath && !fittedRef.current && coords.length > 1) {
      const g = (window as any).google as typeof google;
      const bounds = new g.maps.LatLngBounds();
      coords.forEach((c) => bounds.extend(c));
      mapRef.current.fitBounds(bounds, 80);
      fittedRef.current = true;
    }
  }, [fullPath, fitToPath, ready]);

  // start/end pins
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const g = (window as any).google as typeof google;
    pinsRef.current.forEach((m) => m.setMap(null));
    pinsRef.current = [];
    if (startPoint) {
      pinsRef.current.push(new g.maps.Marker({
        position: startPoint, map: mapRef.current,
        icon: { url: pinSvg("#10F58F", "A"), scaledSize: new g.maps.Size(32, 40), anchor: new g.maps.Point(16, 40) },
      }));
    }
    if (endPoint) {
      pinsRef.current.push(new g.maps.Marker({
        position: endPoint, map: mapRef.current,
        icon: { url: pinSvg("#FF3B30", "B"), scaledSize: new g.maps.Size(32, 40), anchor: new g.maps.Point(16, 40) },
      }));
    }
  }, [startPoint, endPoint, ready]);

  return (
    <div className={className ?? "absolute inset-0"}>
      <div ref={containerRef} className="absolute inset-0 bg-[#07080F]" />
      {error && (
        <div className="absolute bottom-3 left-3 z-30 glass px-3 py-2 text-[11px] text-[var(--accent-red,#FF3B30)]">
          Carte indisponible — {error}
        </div>
      )}
    </div>
  );
}
