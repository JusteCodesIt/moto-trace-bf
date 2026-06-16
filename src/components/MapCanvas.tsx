/// <reference types="google.maps" />
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTheme } from "@/lib/theme";
import vehicleAsset from "@/assets/vehicle-jmc.png.asset.json";
import type { LiveDevice } from "@/lib/multi-device";


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

  /** Additional vehicles to show as secondary markers on the map. */
  extraVehicles?: Pick<LiveDevice, "id" | "lat" | "lng" | "name" | "engineOn" | "speed">[];
  /**
   * Device ID of the primary vehicle (the one controlled by `center`/`heading`).
   * When provided, hovering the primary marker also triggers `onVehicleHover`.
   */
  primaryVehicleId?: string;
  /** Called with a deviceId on marker mouseover, null on mouseout. */
  onVehicleHover?: (deviceId: string | null) => void;
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

const VEHICLE_ICON = vehicleAsset.url;

/** Teardrop SVG pin for secondary vehicles — shows initial + engine-status color. */
function vehiclePinUrl(name: string, engineOn: boolean): string {
  const color = engineOn ? "#10F58F" : "#FF3B30";
  const letter = (name.charAt(0) || "?").toUpperCase();
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 36 44"><path d="M18 1C9 1 2 8 2 17c0 12.5 16 26 16 26S34 29.5 34 17C34 8 27 1 18 1z" fill="${color}" stroke="#07080F" stroke-width="1.5"/><circle cx="18" cy="17" r="6.5" fill="#07080F" fill-opacity="0.45"/><text x="18" y="21.5" font-family="ui-sans-serif,system-ui,sans-serif" font-size="10" font-weight="700" fill="#fff" text-anchor="middle">${letter}</text></svg>`,
  )}`;
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
  recenterTick,
  searchQuery,
  onSearchResult,
  measuring = false,
  onMeasure,
  zones,
  editingZone,
  onMapClick,
  extraVehicles,
  primaryVehicleId,
  onVehicleHover,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const trailRef = useRef<google.maps.Polyline | null>(null);
  const fullPathRef = useRef<google.maps.Polyline | null>(null);
  const pinsRef = useRef<google.maps.Marker[]>([]);
  const zoneShapesRef = useRef<Map<string, { overlay: google.maps.Circle | google.maps.Rectangle; shape: GeoZone["shape"]; lat: number; lng: number; radius: number }>>(new Map());
  const editingShapeRef = useRef<google.maps.Circle | google.maps.Rectangle | null>(null);
  const measureRef = useRef<{
    pts: google.maps.LatLng[];
    line: google.maps.Polyline | null;
    markers: google.maps.Marker[];
  }>({ pts: [], line: null, markers: [] });
  const clickListenerRef = useRef<google.maps.MapsEventListener | null>(null);
  const fittedRef = useRef(false);

  // Extra-vehicle markers — keyed by device ID for efficient diffing
  const extraMarkersRef = useRef<Map<string, google.maps.Marker>>(new Map());
  // Listeners on the primary marker for hover events
  const primaryHoverListenersRef = useRef<google.maps.MapsEventListener[]>([]);
  // Stable ref so marker listeners always call the latest onVehicleHover
  const onVehicleHoverRef = useRef(onVehicleHover);
  useLayoutEffect(() => { onVehicleHoverRef.current = onVehicleHover; });

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { theme } = useTheme();


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
          styles: style === "satellite" ? undefined : (theme === "dark" ? DARK_STYLE : undefined),
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "greedy",
          backgroundColor: theme === "dark" ? "#07080F" : "#e8eef7",
          clickableIcons: false,
        });
        mapRef.current = map;

        markerRef.current = new g.maps.Marker({
          position: { lat: center[0], lng: center[1] },
          map,
          icon: { url: VEHICLE_ICON, scaledSize: new g.maps.Size(56, 32), anchor: new g.maps.Point(28, 16) },
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
      zoneShapesRef.current.forEach((z) => z.overlay.setMap(null));
      zoneShapesRef.current.clear();
      editingShapeRef.current?.setMap(null);
      editingShapeRef.current = null;
      measureRef.current.line?.setMap(null);
      measureRef.current.markers.forEach((m) => m.setMap(null));
      measureRef.current = { pts: [], line: null, markers: [] };
      clickListenerRef.current?.remove();
      clickListenerRef.current = null;
      // Extra-vehicle markers cleanup
      extraMarkersRef.current.forEach((m) => m.setMap(null));
      extraMarkersRef.current.clear();
      // Primary hover listeners cleanup
      primaryHoverListenersRef.current.forEach((l) => l.remove());
      primaryHoverListenersRef.current = [];
      markerRef.current?.setMap(null);
      trailRef.current?.setMap(null);
      fullPathRef.current?.setMap(null);
      mapRef.current = null;
      markerRef.current = null;
      trailRef.current = null;
      fullPathRef.current = null;
      fittedRef.current = false;
    };
    // Mount-only: re-init only on actual remount, not on style/theme changes
    // (those are applied live below without rebuilding the map instance).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // style/theme — live restyle without rebuilding the map instance
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const g = (window as any).google as typeof google;
    mapRef.current.setOptions({
      mapTypeId: style === "satellite" ? g.maps.MapTypeId.HYBRID : g.maps.MapTypeId.ROADMAP,
      styles: style === "satellite" ? undefined : (theme === "dark" ? DARK_STYLE : null),
      backgroundColor: theme === "dark" ? "#07080F" : "#e8eef7",
    });
  }, [style, theme, ready]);

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

  // zones (persisted) — diff against previous overlays so a position-driven
  // in/out status change only updates colors instead of recreating every
  // shape on each telemetry tick.
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const g = (window as any).google as typeof google;
    const map = mapRef.current;
    const seen = new Set<string>();
    (zones ?? []).forEach((z) => {
      seen.add(z.id);
      const color = z.status === "in" ? "#10F58F" : "#22d3ff";
      const existing = zoneShapesRef.current.get(z.id);
      const geomChanged =
        !existing || existing.shape !== z.shape || existing.lat !== z.lat ||
        existing.lng !== z.lng || existing.radius !== z.radius;
      if (!geomChanged) {
        existing.overlay.setOptions({ strokeColor: color, fillColor: color });
        return;
      }
      existing?.overlay.setMap(null);
      let overlay: google.maps.Circle | google.maps.Rectangle;
      if (z.shape === "rect") {
        const d = z.radius / 111320; // approx deg per meter
        overlay = new g.maps.Rectangle({
          map,
          bounds: { north: z.lat + d, south: z.lat - d, east: z.lng + d, west: z.lng - d },
          strokeColor: color, strokeOpacity: 0.9, strokeWeight: 2,
          fillColor: color, fillOpacity: 0.08, clickable: false,
        });
      } else {
        overlay = new g.maps.Circle({
          map, center: { lat: z.lat, lng: z.lng }, radius: z.radius,
          strokeColor: color, strokeOpacity: 0.9, strokeWeight: 2,
          fillColor: color, fillOpacity: 0.08, clickable: false,
        });
      }
      zoneShapesRef.current.set(z.id, { overlay, shape: z.shape, lat: z.lat, lng: z.lng, radius: z.radius });
    });
    // remove overlays for zones no longer present
    for (const [id, entry] of zoneShapesRef.current) {
      if (!seen.has(id)) {
        entry.overlay.setMap(null);
        zoneShapesRef.current.delete(id);
      }
    }
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

  // ── Hover listeners on the primary vehicle marker ──
  useEffect(() => {
    if (!ready || !markerRef.current || !primaryVehicleId) return;
    const devId = primaryVehicleId;
    primaryHoverListenersRef.current.forEach((l) => l.remove());
    primaryHoverListenersRef.current = [
      markerRef.current.addListener("mouseover", () => onVehicleHoverRef.current?.(devId)),
      markerRef.current.addListener("mouseout",  () => onVehicleHoverRef.current?.(null)),
    ];
    return () => {
      primaryHoverListenersRef.current.forEach((l) => l.remove());
      primaryHoverListenersRef.current = [];
    };
  }, [ready, primaryVehicleId]);

  // ── Secondary vehicle markers — diff update on each position change ──
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const g = (window as any).google as typeof google;
    const seen = new Set<string>();

    for (const v of (extraVehicles ?? [])) {
      seen.add(v.id);
      const pos = { lat: v.lat, lng: v.lng };
      const existing = extraMarkersRef.current.get(v.id);
      if (existing) {
        // Only update position and icon color — no marker recreation
        existing.setPosition(pos);
        existing.setIcon({
          url: vehiclePinUrl(v.name, v.engineOn),
          scaledSize: new g.maps.Size(36, 44),
          anchor: new g.maps.Point(18, 44),
        });
      } else {
        const devId = v.id;
        const marker = new g.maps.Marker({
          position: pos,
          map: mapRef.current!,
          icon: {
            url: vehiclePinUrl(v.name, v.engineOn),
            scaledSize: new g.maps.Size(36, 44),
            anchor: new g.maps.Point(18, 44),
          },
          // optimized:true → Google Maps composite les marqueurs sur un canvas
          // WebGL unique au lieu de créer un DOM node par marqueur.
          // Indispensable pour 100+ marqueurs simultanés sans dégradation.
          optimized: true,
          zIndex: 998,
          title: v.name,
        });
        // devId is stable (UUID) — safe to capture in closure
        marker.addListener("mouseover", () => onVehicleHoverRef.current?.(devId));
        marker.addListener("mouseout",  () => onVehicleHoverRef.current?.(null));
        extraMarkersRef.current.set(v.id, marker);
      }
    }

    // Remove stale markers (device removed or filtered out)
    for (const [id, marker] of extraMarkersRef.current) {
      if (!seen.has(id)) {
        marker.setMap(null);
        extraMarkersRef.current.delete(id);
      }
    }
  }, [extraVehicles, ready]);

  return (
    <div className={className ?? "absolute inset-0"}>
      <div ref={containerRef} className="absolute inset-0" style={{ background: theme === "dark" ? "#07080F" : "#e8eef7" }} />
      {error && (
        <div className="absolute bottom-3 left-3 z-30 glass px-3 py-2 text-[11px] text-[var(--accent-red,#FF3B30)]">
          Carte indisponible — {error}
        </div>
      )}
    </div>
  );
}
