/// <reference types="google.maps" />
import { useEffect, useRef, useState } from "react";

interface LatLng { lat: number; lng: number }

export interface GeoZone {
  id: string;
  shape: "circle" | "rect" | "poly";
  lat: number;
  lng: number;
  radius: number; // meters
  status?: "in" | "out";
  name?: string;
}

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

  /** Increment to imperatively recenter on the vehicle (pan + zoom). */
  recenterTick?: number;
  /** When changed (non-empty), geocode and pan to result. */
  searchQuery?: string;
  onSearchResult?: (ok: boolean, address?: string) => void;

  /** Enable measure tool — click two points to get distance. */
  measuring?: boolean;
  onMeasure?: (distanceMeters: number) => void;

  /** Geofence zones drawn permanently. */
  zones?: GeoZone[];
  /** Currently-edited zone, highlighted. */
  editingZone?: GeoZone | null;
  /** Click on the map to pick a coordinate. */
  onMapClick?: (lat: number, lng: number) => void;
}

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
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&loading=async&callback=__mtInitMap&libraries=geometry,places${channel ? `&channel=${channel}` : ""}`;
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
  recenterTick,
  searchQuery,
  onSearchResult,
  measuring = false,
  onMeasure,
  zones,
  editingZone,
  onMapClick,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const trailRef = useRef<google.maps.Polyline | null>(null);
  const fullPathRef = useRef<google.maps.Polyline | null>(null);
  const pinsRef = useRef<google.maps.Marker[]>([]);
  const zoneShapesRef = useRef<Array<google.maps.Circle | google.maps.Rectangle>>([]);
  const editingShapeRef = useRef<google.maps.Circle | google.maps.Rectangle | null>(null);
  const measureRef = useRef<{
    pts: google.maps.LatLng[];
    line: google.maps.Polyline | null;
    markers: google.maps.Marker[];
  }>({ pts: [], line: null, markers: [] });
  const clickListenerRef = useRef<google.maps.MapsEventListener | null>(null);
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
          icon: { url: VEHICLE_ICON, scaledSize: new g.maps.Size(44, 44), anchor: new g.maps.Point(22, 22) },
          optimized: false,
          zIndex: 999,
        });

        fullPathRef.current = new g.maps.Polyline({ map, path: [], strokeColor: "#5a6378", strokeOpacity: 0.5, strokeWeight: 3 });
        trailRef.current = new g.maps.Polyline({ map, path: [], strokeColor: "#00D4FF", strokeOpacity: 0.9, strokeWeight: 4 });

        setReady(true);
      })
      .catch((e) => setError(e.message ?? "Map error"));

    return () => {
      cancelled = true;
      pinsRef.current.forEach((m) => m.setMap(null));
      pinsRef.current = [];
      zoneShapesRef.current.forEach((s) => s.setMap(null));
      zoneShapesRef.current = [];
      editingShapeRef.current?.setMap(null);
      editingShapeRef.current = null;
      measureRef.current.line?.setMap(null);
      measureRef.current.markers.forEach((m) => m.setMap(null));
      measureRef.current = { pts: [], line: null, markers: [] };
      clickListenerRef.current?.remove();
      clickListenerRef.current = null;
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

  // imperative recenter
  useEffect(() => {
    if (!ready || recenterTick === undefined || !mapRef.current) return;
    mapRef.current.panTo({ lat: center[0], lng: center[1] });
    mapRef.current.setZoom(16);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recenterTick, ready]);

  // search (geocode)
  useEffect(() => {
    if (!ready || !searchQuery || !mapRef.current) return;
    const g = (window as any).google as typeof google;
    const geo = new g.maps.Geocoder();
    geo.geocode({ address: searchQuery }, (results, status) => {
      if (status === "OK" && results && results[0]) {
        const loc = results[0].geometry.location;
        mapRef.current!.panTo(loc);
        mapRef.current!.setZoom(15);
        onSearchResult?.(true, results[0].formatted_address);
      } else {
        onSearchResult?.(false);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, ready]);

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

  // zones (persisted)
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const g = (window as any).google as typeof google;
    zoneShapesRef.current.forEach((s) => s.setMap(null));
    zoneShapesRef.current = [];
    (zones ?? []).forEach((z) => {
      const color = z.status === "in" ? "#10F58F" : "#22d3ff";
      if (z.shape === "rect") {
        const d = z.radius / 111320; // approx deg per meter
        zoneShapesRef.current.push(new g.maps.Rectangle({
          map: mapRef.current!,
          bounds: { north: z.lat + d, south: z.lat - d, east: z.lng + d, west: z.lng - d },
          strokeColor: color, strokeOpacity: 0.9, strokeWeight: 2,
          fillColor: color, fillOpacity: 0.08, clickable: false,
        }));
      } else {
        zoneShapesRef.current.push(new g.maps.Circle({
          map: mapRef.current!, center: { lat: z.lat, lng: z.lng }, radius: z.radius,
          strokeColor: color, strokeOpacity: 0.9, strokeWeight: 2,
          fillColor: color, fillOpacity: 0.08, clickable: false,
        }));
      }
    });
  }, [zones, ready]);

  // editing zone (highlighted)
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const g = (window as any).google as typeof google;
    editingShapeRef.current?.setMap(null);
    editingShapeRef.current = null;
    if (!editingZone) return;
    const color = "#FFE600";
    if (editingZone.shape === "rect") {
      const d = editingZone.radius / 111320;
      editingShapeRef.current = new g.maps.Rectangle({
        map: mapRef.current,
        bounds: { north: editingZone.lat + d, south: editingZone.lat - d, east: editingZone.lng + d, west: editingZone.lng - d },
        strokeColor: color, strokeOpacity: 1, strokeWeight: 2.5,
        fillColor: color, fillOpacity: 0.12, clickable: false, zIndex: 50,
      });
    } else {
      editingShapeRef.current = new g.maps.Circle({
        map: mapRef.current, center: { lat: editingZone.lat, lng: editingZone.lng }, radius: editingZone.radius,
        strokeColor: color, strokeOpacity: 1, strokeWeight: 2.5,
        fillColor: color, fillOpacity: 0.12, clickable: false, zIndex: 50,
      });
    }
  }, [editingZone, ready]);

  // click handler (map click + measuring)
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const g = (window as any).google as typeof google;
    clickListenerRef.current?.remove();
    clickListenerRef.current = mapRef.current.addListener("click", (e: google.maps.MapMouseEvent) => {
      if (!e.latLng) return;
      if (measuring) {
        const m = measureRef.current;
        m.pts.push(e.latLng);
        m.markers.push(new g.maps.Marker({
          position: e.latLng, map: mapRef.current!,
          icon: { path: g.maps.SymbolPath.CIRCLE, scale: 5, fillColor: "#FFE600", fillOpacity: 1, strokeColor: "#06121F", strokeWeight: 2 },
        }));
        if (m.pts.length === 2) {
          m.line?.setMap(null);
          m.line = new g.maps.Polyline({
            map: mapRef.current!, path: m.pts,
            strokeColor: "#FFE600", strokeOpacity: 0.95, strokeWeight: 3, icons: [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 1, scale: 3 }, offset: "0", repeat: "10px" }],
          });
          const dist = g.maps.geometry.spherical.computeDistanceBetween(m.pts[0], m.pts[1]);
          onMeasure?.(dist);
          // reset after a short delay so user can place a new measure
          setTimeout(() => {
            m.line?.setMap(null); m.line = null;
            m.markers.forEach((mk) => mk.setMap(null)); m.markers = [];
            m.pts = [];
          }, 4000);
        }
        return;
      }
      onMapClick?.(e.latLng.lat(), e.latLng.lng());
    });
    return () => clickListenerRef.current?.remove();
  }, [ready, measuring, onMapClick, onMeasure]);

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
