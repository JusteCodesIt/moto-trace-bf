import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTheme } from "@/lib/theme";
import type { LiveDevice } from "@/lib/multi-device";

interface LatLng { lat: number; lng: number }

export interface GeoZone {
  id: string;
  shape: "circle" | "rect" | "poly";
  lat: number;
  lng: number;
  radius: number;
  status?: "in" | "out";
  name?: string;
}

/** A fleet vehicle carrying an optional traveled-route trail for map rendering. */
type MapVehicle = LiveDevice & { trail?: LatLng[] };

interface Props {
  center: [number, number];
  heading?: number;
  trail?: Array<LatLng>;
  fullPath?: Array<LatLng>;
  /** Colored speed heatmap: pass trip points with speed to activate */
  heatmapPath?: Array<{ lat: number; lng: number; speed: number }>;
  startPoint?: LatLng;
  endPoint?: LatLng;
  fitToPath?: boolean;
  style?: "streets" | "satellite";
  followVehicle?: boolean;
  className?: string;
  recenterTick?: number;
  searchQuery?: string;
  onSearchResult?: (ok: boolean, address?: string) => void;
  measuring?: boolean;
  onMeasure?: (distanceMeters: number) => void;
  zones?: GeoZone[];
  editingZone?: GeoZone | null;
  onMapClick?: (lat: number, lng: number) => void;
  extraVehicles?: Array<MapVehicle>;
  primaryVehicleId?: string;
  /** Full data for the primary vehicle, used for its click popup. */
  primaryVehicle?: LiveDevice | null;
  onVehicleHover?: (deviceId: string | null) => void;
  /** Fired when a vehicle marker is clicked — used to select it (route turns orange). */
  onVehicleClick?: (deviceId: string) => void;
  /** Currently selected vehicle: its route is highlighted orange + waypoints. */
  selectedVehicleId?: string | null;
  /** Waypoints rendered along the active route (orange dots). */
  waypoints?: Array<LatLng>;
  /** When false, the dedicated primary-vehicle marker stays hidden — used until a device is created and paired. */
  showPrimary?: boolean;
  /** Bump to fit the viewport around every vehicle marker (primary + fleet). */
  fitFleetTick?: number;
  /** Keep the full route invisible (progressive replay) while still fitting bounds to it. */
  hideFullPath?: boolean;
  /** Glide markers smoothly between updates (dashboard). Off for replay so the marker tracks the trail tip. */
  markerGlide?: boolean;
}

const TILES_DARK = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const TILES_LIGHT = "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
const TILES_SATELLITE = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const TILE_ATTR = '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>';

const VEHICLE_ICON_URL = "/vehicle-jmc.png";
// Native ratio of vehicle-jmc.png (370×250 ⇒ 1.48). Keep markers proportional.
const VEHICLE_RATIO = 370 / 250;
const ROUTE_ORANGE = "#FF8C00"; // selected (clicked) route
const ROUTE_CYAN = "#00D4FF";   // default route colour (not clicked)
// Waypoint dots only appear once the user zooms in on a route; the route line
// itself stays visible at every zoom level.
const WAYPOINT_MIN_ZOOM = 15;

/** Proportional vehicle marker; the selected/primary vehicle is rendered larger. */
function vehicleIcon(emphasis: boolean): L.Icon {
  const w = emphasis ? 62 : 46;
  const h = Math.round(w / VEHICLE_RATIO);
  return L.icon({ iconUrl: VEHICLE_ICON_URL, iconSize: [w, h], iconAnchor: [Math.round(w / 2), h] });
}

function svgIcon(url: string, size: [number, number], anchor: [number, number]): L.Icon {
  return L.icon({ iconUrl: url, iconSize: size, iconAnchor: anchor });
}

function pinSvg(color: string, label: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="40" viewBox="0 0 28 36"><path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.27 21.73 0 14 0z" fill="${color}"/><circle cx="14" cy="14" r="6" fill="#07080F"/><text x="14" y="17" font-family="ui-sans-serif,system-ui" font-size="9" font-weight="700" fill="#fff" text-anchor="middle">${label}</text></svg>`,
  )}`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

/** Compact info card shown inside the Leaflet popup when a vehicle is clicked. */
function vehiclePopupHtml(v: LiveDevice): string {
  const speed = Math.round(v.speed);
  const bat = Math.round(v.batteryMain);
  const ageS = Math.max(0, Math.floor((Date.now() - v.timestamp) / 1000));
  const age = ageS < 60 ? `${ageS} s` : ageS < 3600 ? `${Math.floor(ageS / 60)} min` : `${Math.floor(ageS / 3600)} h`;
  const eng = v.engineOn ? "Moteur ON" : "Moteur OFF";
  const engColor = v.engineOn ? "#059669" : "#dc2626";
  const row = (k: string, val: string, color?: string) =>
    `<span style="color:#64748b">${k}</span><b style="text-align:right${color ? `;color:${color}` : ""}">${val}</b>`;
  return (
    `<div style="min-width:186px;font-family:system-ui,-apple-system,sans-serif">` +
    `<div style="font-weight:700;font-size:13px;margin-bottom:6px;color:#0f172a">${escapeHtml(v.name)}</div>` +
    `<div style="display:grid;grid-template-columns:auto 1fr;gap:3px 12px;font-size:11px;color:#0f172a;font-variant-numeric:tabular-nums">` +
    row("Vitesse", `${speed} km/h`) +
    row("État", eng, engColor) +
    row("Batterie", `${bat} %`) +
    row("GSM", `${v.gsmBars}/5 · ${escapeHtml(v.gsmCarrier)}`) +
    row("Cap", `${Math.round(v.heading)}°`) +
    row("Mise à jour", `il y a ${age}`) +
    `</div>` +
    `<div style="margin-top:6px;font-size:10px;color:#94a3b8;font-family:ui-monospace,monospace">${v.lat.toFixed(5)}, ${v.lng.toFixed(5)}</div>` +
    `</div>`
  );
}

export function MapCanvas({
  center,
  heading = 0,
  trail = [],
  fullPath,
  heatmapPath,
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
  primaryVehicle,
  onVehicleHover,
  onVehicleClick,
  selectedVehicleId,
  waypoints,
  showPrimary = true,
  fitFleetTick,
  hideFullPath = false,
  markerGlide = true,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const trailRef = useRef<L.Polyline | null>(null);
  const fullPathRef = useRef<L.Polyline | null>(null);
  const pinsRef = useRef<L.Marker[]>([]);
  const zoneShapesRef = useRef<Map<string, { overlay: L.Circle | L.Rectangle; shape: GeoZone["shape"]; lat: number; lng: number; radius: number }>>(new Map());
  const editingShapeRef = useRef<L.Circle | L.Rectangle | null>(null);
  const measureRef = useRef<{ pts: L.LatLng[]; line: L.Polyline | null; markers: L.CircleMarker[] }>({ pts: [], line: null, markers: [] });
  const fittedRef = useRef(false);
  const extraMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const extraTrailsRef = useRef<Map<string, L.Polyline>>(new Map());
  const waypointsRef = useRef<L.CircleMarker[]>([]);
  const heatmapLinesRef = useRef<L.Polyline[]>([]);
  const onVehicleHoverRef = useRef(onVehicleHover);
  const onVehicleClickRef = useRef(onVehicleClick);
  useLayoutEffect(() => { onVehicleHoverRef.current = onVehicleHover; });
  useLayoutEffect(() => { onVehicleClickRef.current = onVehicleClick; });

  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(14);
  const { theme } = useTheme();

  // init
  useEffect(() => {
    if (!containerRef.current || typeof window === "undefined") return;

    const map = L.map(containerRef.current, {
      center: [center[0], center[1]],
      zoom: 14,
      zoomControl: true,
      attributionControl: true,
      preferCanvas: true, // fast rendering for the long (15 km) fleet trails
    });
    mapRef.current = map;
    setZoom(map.getZoom());
    // Suspend the marker glide transition during zoom (avoids lag), and track
    // zoom so waypoints can appear only when zoomed in.
    map.on("zoomstart", () => containerRef.current?.classList.add("atk-zooming"));
    map.on("zoomend", () => { containerRef.current?.classList.remove("atk-zooming"); setZoom(map.getZoom()); });

    const tileUrl = style === "satellite" ? TILES_SATELLITE : (theme === "dark" ? TILES_DARK : TILES_LIGHT);
    tileRef.current = L.tileLayer(tileUrl, { attribution: TILE_ATTR, maxZoom: 19, subdomains: "abcd" }).addTo(map);

    setTimeout(() => map.invalidateSize(), 100);

    markerRef.current = L.marker([center[0], center[1]], {
      icon: vehicleIcon(true),
      zIndexOffset: 999,
    });
    if (showPrimary) {
      markerRef.current.addTo(map);
      if (markerGlide) requestAnimationFrame(() => markerRef.current?.getElement()?.classList.add("atk-vehicle"));
    }

    fullPathRef.current = L.polyline([], { color: "#5a6378", opacity: 0.5, weight: 3 }).addTo(map);
    trailRef.current = L.polyline([], { color: ROUTE_CYAN, opacity: 0.9, weight: 4, lineCap: "round" }).addTo(map);

    setReady(true);

    return () => {
      pinsRef.current.forEach((m) => m.remove());
      pinsRef.current = [];
      zoneShapesRef.current.forEach((z) => z.overlay.remove());
      zoneShapesRef.current.clear();
      editingShapeRef.current?.remove();
      editingShapeRef.current = null;
      measureRef.current.line?.remove();
      measureRef.current.markers.forEach((m) => m.remove());
      measureRef.current = { pts: [], line: null, markers: [] };
      heatmapLinesRef.current.forEach((l) => l.remove());
      heatmapLinesRef.current = [];
      extraMarkersRef.current.forEach((m) => m.remove());
      extraMarkersRef.current.clear();
      extraTrailsRef.current.forEach((l) => l.remove());
      extraTrailsRef.current.clear();
      waypointsRef.current.forEach((m) => m.remove());
      waypointsRef.current = [];
      markerRef.current?.remove();
      trailRef.current?.remove();
      fullPathRef.current?.remove();
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      trailRef.current = null;
      fullPathRef.current = null;
      tileRef.current = null;
      fittedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // style/theme → swap tile layer
  useEffect(() => {
    if (!ready || !mapRef.current || !tileRef.current) return;
    const tileUrl = style === "satellite" ? TILES_SATELLITE : (theme === "dark" ? TILES_DARK : TILES_LIGHT);
    tileRef.current.setUrl(tileUrl);
  }, [style, theme, ready]);

  // vehicle position
  useEffect(() => {
    if (!ready) return;
    const pos: L.LatLngExpression = [center[0], center[1]];
    markerRef.current?.setLatLng(pos);
    if (showPrimary && followVehicle && mapRef.current) mapRef.current.panTo(pos);
  }, [center, heading, followVehicle, ready, showPrimary]);

  // primary marker visibility — hidden until a device is created & paired (sending frames)
  useEffect(() => {
    if (!ready || !mapRef.current || !markerRef.current) return;
    const m = markerRef.current;
    if (showPrimary) {
      if (!mapRef.current.hasLayer(m)) {
        m.addTo(mapRef.current);
        if (markerGlide) requestAnimationFrame(() => m.getElement()?.classList.add("atk-vehicle"));
      }
    } else if (mapRef.current.hasLayer(m)) {
      m.remove();
    }
  }, [showPrimary, ready]);

  // primary marker popup (info window) + click-to-select
  useEffect(() => {
    if (!ready || !markerRef.current) return;
    const m = markerRef.current;
    if (primaryVehicle) {
      if (!m.getPopup()) m.bindPopup(vehiclePopupHtml(primaryVehicle), { closeButton: true, offset: [0, -44] });
      else if (m.isPopupOpen()) m.setPopupContent(vehiclePopupHtml(primaryVehicle));
    }
  }, [primaryVehicle, ready]);

  useEffect(() => {
    if (!ready || !markerRef.current || !primaryVehicleId) return;
    const id = primaryVehicleId;
    const m = markerRef.current;
    const onClick = () => onVehicleClickRef.current?.(id);
    m.on("click", onClick);
    return () => { m.off("click", onClick); };
  }, [ready, primaryVehicleId]);

  // imperative recenter
  useEffect(() => {
    if (!ready || recenterTick === undefined || !mapRef.current) return;
    mapRef.current.setView([center[0], center[1]], 16);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recenterTick, ready]);

  // fit viewport to the whole fleet (primary + extra vehicles)
  useEffect(() => {
    if (!ready || fitFleetTick === undefined || !mapRef.current) return;
    const pts: L.LatLngTuple[] = [];
    extraMarkersRef.current.forEach((m) => { const ll = m.getLatLng(); pts.push([ll.lat, ll.lng]); });
    if (showPrimary && markerRef.current) { const ll = markerRef.current.getLatLng(); pts.push([ll.lat, ll.lng]); }
    if (pts.length === 1) mapRef.current.setView(pts[0], 15);
    else if (pts.length > 1) mapRef.current.fitBounds(L.latLngBounds(pts), { padding: [60, 60], maxZoom: 15 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitFleetTick, ready]);

  // search (geocode via Nominatim)
  useEffect(() => {
    if (!ready || !searchQuery || !mapRef.current) return;
    const map = mapRef.current;
    fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=json&limit=1`)
      .then((r) => r.json())
      .then((results: Array<{ lat: string; lon: string; display_name: string }>) => {
        if (results.length > 0) {
          const r = results[0];
          map.setView([parseFloat(r.lat), parseFloat(r.lon)], 15);
          onSearchResult?.(true, r.display_name);
        } else {
          onSearchResult?.(false);
        }
      })
      .catch(() => onSearchResult?.(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, ready]);

  // primary trail — cyan by default, orange when the primary vehicle is selected
  useEffect(() => {
    if (!ready || !trailRef.current) return;
    trailRef.current.setLatLngs(trail.map((p) => [p.lat, p.lng] as L.LatLngTuple));
    const selected = !!selectedVehicleId && selectedVehicleId === primaryVehicleId;
    trailRef.current.setStyle(
      selected ? { color: ROUTE_ORANGE, opacity: 0.95, weight: 5 } : { color: ROUTE_CYAN, opacity: 0.8, weight: 3 },
    );
    if (selected) trailRef.current.bringToFront();
  }, [trail, selectedVehicleId, primaryVehicleId, ready]);

  // full path + fit
  useEffect(() => {
    if (!ready || !fullPathRef.current || !mapRef.current) return;
    const coords = (fullPath ?? []).map((p) => [p.lat, p.lng] as L.LatLngTuple);
    fullPathRef.current.setLatLngs(coords);
    if (fitToPath && !fittedRef.current && coords.length > 1) {
      mapRef.current.fitBounds(L.latLngBounds(coords), { padding: [80, 80] });
      fittedRef.current = true;
    }
  }, [fullPath, fitToPath, ready]);

  // waypoints — orange dots along the active route, shown ONLY when zoomed in
  // (the route line itself always stays visible, regardless of zoom).
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    waypointsRef.current.forEach((m) => m.remove());
    waypointsRef.current = [];
    if (zoom < WAYPOINT_MIN_ZOOM) return;
    for (const p of (waypoints ?? [])) {
      const cm = L.circleMarker([p.lat, p.lng], {
        radius: 5, color: "#ffffff", weight: 2, fillColor: ROUTE_ORANGE, fillOpacity: 1, interactive: false,
      }).addTo(mapRef.current);
      waypointsRef.current.push(cm);
    }
  }, [waypoints, zoom, ready]);

  // speed heatmap — colored polyline segments grouped by speed band
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    heatmapLinesRef.current.forEach((l) => l.remove());
    heatmapLinesRef.current = [];

    if (!heatmapPath || heatmapPath.length < 2) {
      // In progressive-replay mode keep the full route invisible so the
      // itinerary draws itself as the vehicle advances.
      fullPathRef.current?.setStyle({ opacity: hideFullPath ? 0 : 0.5 });
      return;
    }

    fullPathRef.current?.setStyle({ opacity: 0 });

    const colorOf = (spd: number) =>
      spd > 90 ? "#FF3B30" : spd > 60 ? "#FF8C00" : spd > 30 ? "#FFE600" : "#10F58F";

    // Group consecutive same-color points into segments (avoids N-1 individual polylines)
    let curColor = colorOf(heatmapPath[0].speed);
    let curCoords: [number, number][] = [[heatmapPath[0].lat, heatmapPath[0].lng]];

    const flush = () => {
      if (curCoords.length < 2) return;
      heatmapLinesRef.current.push(
        L.polyline(curCoords, { color: curColor, weight: 5, opacity: 0.9, lineCap: "round" }).addTo(mapRef.current!),
      );
    };

    for (let i = 1; i < heatmapPath.length; i++) {
      const p = heatmapPath[i];
      const c = colorOf(p.speed);
      curCoords.push([p.lat, p.lng]);
      if (c !== curColor) {
        flush();
        curColor = c;
        // overlap by one point so there's no gap between segments
        curCoords = [[heatmapPath[i - 1].lat, heatmapPath[i - 1].lng], [p.lat, p.lng]];
      }
    }
    flush();
  }, [heatmapPath, hideFullPath, ready]);

  // start/end pins
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    pinsRef.current.forEach((m) => m.remove());
    pinsRef.current = [];
    if (startPoint) {
      pinsRef.current.push(
        L.marker([startPoint.lat, startPoint.lng], {
          icon: svgIcon(pinSvg("#10F58F", "A"), [32, 40], [16, 40]),
        }).addTo(mapRef.current),
      );
    }
    if (endPoint) {
      pinsRef.current.push(
        L.marker([endPoint.lat, endPoint.lng], {
          icon: svgIcon(pinSvg("#FF3B30", "B"), [32, 40], [16, 40]),
        }).addTo(mapRef.current),
      );
    }
  }, [startPoint, endPoint, ready]);

  // zones
  useEffect(() => {
    if (!ready || !mapRef.current) return;
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
        existing.overlay.setStyle({ color, fillColor: color });
        return;
      }
      existing?.overlay.remove();
      let overlay: L.Circle | L.Rectangle;
      if (z.shape === "rect") {
        const d = z.radius / 111320;
        overlay = L.rectangle(
          [[z.lat - d, z.lng - d], [z.lat + d, z.lng + d]],
          { color, weight: 2, opacity: 0.9, fillColor: color, fillOpacity: 0.08, interactive: false },
        ).addTo(map);
      } else {
        overlay = L.circle([z.lat, z.lng], {
          radius: z.radius, color, weight: 2, opacity: 0.9, fillColor: color, fillOpacity: 0.08, interactive: false,
        }).addTo(map);
      }
      zoneShapesRef.current.set(z.id, { overlay, shape: z.shape, lat: z.lat, lng: z.lng, radius: z.radius });
    });
    for (const [id, entry] of zoneShapesRef.current) {
      if (!seen.has(id)) {
        entry.overlay.remove();
        zoneShapesRef.current.delete(id);
      }
    }
  }, [zones, ready]);

  // editing zone
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    editingShapeRef.current?.remove();
    editingShapeRef.current = null;
    if (!editingZone) return;
    const color = "#FFE600";
    if (editingZone.shape === "rect") {
      const d = editingZone.radius / 111320;
      editingShapeRef.current = L.rectangle(
        [[editingZone.lat - d, editingZone.lng - d], [editingZone.lat + d, editingZone.lng + d]],
        { color, weight: 2.5, opacity: 1, fillColor: color, fillOpacity: 0.12, interactive: false },
      ).addTo(mapRef.current);
    } else {
      editingShapeRef.current = L.circle([editingZone.lat, editingZone.lng], {
        radius: editingZone.radius, color, weight: 2.5, opacity: 1, fillColor: color, fillOpacity: 0.12, interactive: false,
      }).addTo(mapRef.current);
    }
  }, [editingZone, ready]);

  // click handler + measuring
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const map = mapRef.current;
    const handler = (e: L.LeafletMouseEvent) => {
      if (measuring) {
        const m = measureRef.current;
        m.pts.push(e.latlng);
        m.markers.push(
          L.circleMarker(e.latlng, { radius: 5, fillColor: "#FFE600", fillOpacity: 1, color: "#06121F", weight: 2 }).addTo(map),
        );
        if (m.pts.length === 2) {
          m.line?.remove();
          m.line = L.polyline([m.pts[0], m.pts[1]], { color: "#FFE600", opacity: 0.95, weight: 3, dashArray: "6 4" }).addTo(map);
          const dist = m.pts[0].distanceTo(m.pts[1]);
          onMeasure?.(dist);
          setTimeout(() => {
            m.line?.remove(); m.line = null;
            m.markers.forEach((mk) => mk.remove()); m.markers = [];
            m.pts = [];
          }, 4000);
        }
        return;
      }
      onMapClick?.(e.latlng.lat, e.latlng.lng);
    };
    map.on("click", handler);
    return () => { map.off("click", handler); };
  }, [ready, measuring, onMapClick, onMeasure]);

  // hover on primary marker
  useEffect(() => {
    if (!ready || !markerRef.current || !primaryVehicleId) return;
    const devId = primaryVehicleId;
    const marker = markerRef.current;
    const over = () => onVehicleHoverRef.current?.(devId);
    const out = () => onVehicleHoverRef.current?.(null);
    marker.on("mouseover", over);
    marker.on("mouseout", out);
    return () => { marker.off("mouseover", over); marker.off("mouseout", out); };
  }, [ready, primaryVehicleId]);

  // extra vehicle trails (faint by default, orange when selected)
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const map = mapRef.current;
    const seen = new Set<string>();
    for (const v of (extraVehicles ?? [])) {
      const pts = v.trail;
      if (!pts || pts.length < 2) continue;
      seen.add(v.id);
      const coords = pts.map((p) => [p.lat, p.lng] as L.LatLngTuple);
      const selected = v.id === selectedVehicleId;
      const st = selected
        ? { color: ROUTE_ORANGE, opacity: 0.95, weight: 5 }
        : { color: ROUTE_CYAN, opacity: 0.5, weight: 2.5 };
      let line = extraTrailsRef.current.get(v.id);
      if (line) {
        line.setLatLngs(coords);
        line.setStyle(st);
      } else {
        line = L.polyline(coords, { ...st, lineCap: "round" }).addTo(map);
        extraTrailsRef.current.set(v.id, line);
      }
      if (selected) line.bringToFront();
    }
    for (const [id, line] of extraTrailsRef.current) {
      if (!seen.has(id)) { line.remove(); extraTrailsRef.current.delete(id); }
    }
  }, [extraVehicles, selectedVehicleId, ready]);

  // extra vehicle markers — proportional icon, click popup + selection
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const map = mapRef.current;
    const seen = new Set<string>();
    for (const v of (extraVehicles ?? [])) {
      seen.add(v.id);
      const pos: L.LatLngExpression = [v.lat, v.lng];
      const selected = v.id === selectedVehicleId;
      const existing = extraMarkersRef.current.get(v.id);
      if (existing) {
        // Position only — never rebuild the icon here, so the CSS glide holds.
        existing.setLatLng(pos);
        existing.setZIndexOffset(selected ? 1000 : 998);
        if (existing.isPopupOpen()) existing.setPopupContent(vehiclePopupHtml(v));
      } else {
        const devId = v.id;
        const marker = L.marker(pos, { icon: vehicleIcon(false), zIndexOffset: selected ? 1000 : 998, title: v.name });
        marker.bindPopup(vehiclePopupHtml(v), { closeButton: true, offset: [0, -30] });
        marker.on("click", () => onVehicleClickRef.current?.(devId));
        marker.on("mouseover", () => onVehicleHoverRef.current?.(devId));
        marker.on("mouseout", () => onVehicleHoverRef.current?.(null));
        marker.addTo(map);
        // Enable the glide transition only after the initial position is set,
        // so the marker doesn't slide in from the map corner on first render.
        if (markerGlide) requestAnimationFrame(() => marker.getElement()?.classList.add("atk-vehicle"));
        extraMarkersRef.current.set(v.id, marker);
      }
    }
    for (const [id, marker] of extraMarkersRef.current) {
      if (!seen.has(id)) {
        marker.remove();
        extraMarkersRef.current.delete(id);
      }
    }
  }, [extraVehicles, selectedVehicleId, ready]);

  return (
    <div className={className ?? "absolute inset-0"}>
      <div ref={containerRef} className="absolute inset-0" style={{ background: theme === "dark" ? "#07080F" : "#e8eef7" }} />
      <style>{`
        .atk-vehicle { transition: transform 500ms linear; }
        .atk-zooming .atk-vehicle { transition: none !important; }
      `}</style>
    </div>
  );
}
