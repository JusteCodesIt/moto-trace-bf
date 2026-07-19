import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Pause, Play, SkipBack, SkipForward, Download, Flame } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { MapCanvas } from "@/components/MapCanvas";
import { useApp, type Trip } from "@/lib/store";
import { fmtDuration, bearingToCompass, speedColor } from "@/lib/format";
import { getTripPath, getDeviceJourneyPath, deriveTrips, downloadGPX, type TripPoint } from "@/lib/trip-path";
import { haversineKm } from "@/lib/geo";
import { supabase } from "@/integrations/supabase/client";
import { notify } from "@/components/ConfirmDialog";
import { reverseGeocode } from "@/lib/geocode";

export const Route = createFileRoute("/trips/$id")({
  validateSearch: (s: Record<string, unknown>): { device?: string; from?: string; to?: string } => ({
    device: typeof s.device === "string" ? s.device : undefined,
    from: typeof s.from === "string" ? s.from : undefined,
    to: typeof s.to === "string" ? s.to : undefined,
  }),
  component: TripDetail,
});

const SPEEDS = [1, 2, 4, 8] as const;

function coordLabel(lat: number, lng: number) {
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

/** Synthesise trip metadata for a whole-device journey (date/time range). */
function buildJourneyTrip(path: TripPoint[], fromISO: string, toISO: string): Trip {
  let dist = 0, maxS = 0, sumS = 0;
  for (let i = 0; i < path.length; i++) {
    maxS = Math.max(maxS, path[i].speed);
    sumS += path[i].speed;
    if (i > 0) {
      const d = haversineKm(path[i - 1].lat, path[i - 1].lng, path[i].lat, path[i].lng);
      if (d <= 3) dist += d;
    }
  }
  const t0 = new Date(fromISO).getTime();
  return {
    id: "journey",
    date: t0,
    durationMin: Math.max(1, Math.round((new Date(toISO).getTime() - t0) / 60_000)),
    distanceKm: +dist.toFixed(2),
    maxSpeed: Math.round(maxS),
    avgSpeed: path.length ? Math.round(sumS / path.length) : 0,
    startAddress: path[0] ? coordLabel(path[0].lat, path[0].lng) : "—",
    endAddress: path.length ? coordLabel(path[path.length - 1].lat, path[path.length - 1].lng) : "—",
    status: "completed",
  };
}

function TripDetail() {
  const { id } = Route.useParams();
  const search = Route.useSearch();
  const storeDevice = useApp((s) => s.device);
  // Replay the vehicle passed in the URL (?device=…), falling back to the
  // currently selected device.
  const deviceId = search.device ?? storeDevice?.id;
  // Journey mode: replay the vehicle's ENTIRE path over a date/time window
  // (?from=…&to=…), not a single completed trip.
  const journeyMode = !!(search.from && search.to);
  const storeTrip = useApp((s) => s.trips.find((t) => t.id === id));

  const [trip, setTrip] = useState<Trip | undefined>(journeyMode ? undefined : storeTrip);
  const [path, setPath] = useState<TripPoint[]>([]);
  const [loading, setLoading] = useState(true);

  // Resolve trip metadata + path for both single-trip and device-journey modes.
  useEffect(() => {
    if (!deviceId) { setLoading(false); return; }
    let mounted = true;
    setLoading(true);
    (async () => {
      if (journeyMode) {
        const pts = await getDeviceJourneyPath(deviceId, search.from!, search.to!);
        if (!mounted) return;
        setPath(pts);
        setTrip(buildJourneyTrip(pts, search.from!, search.to!));
        setLoading(false);
        return;
      }
      let t: Trip | undefined = storeTrip;
      if (!t) {
        const tripStartMs = Number(id);
        if (Number.isFinite(tripStartMs)) {
          const start = new Date(tripStartMs - 60_000).toISOString();
          const end = new Date(tripStartMs + 24 * 3600_000).toISOString();
          const { data } = await supabase
            .from("telemetry")
            .select("lat,lng,speed_kmh,heading,engine_on,recorded_at")
            .eq("device_id", deviceId)
            .gte("recorded_at", start)
            .lte("recorded_at", end)
            .order("recorded_at", { ascending: true })
            .limit(5000);
          if (data) t = deriveTrips(data as any, false).find((x) => x.id === id);
        }
      }
      if (!mounted) return;
      setTrip(t);
      if (t) {
        const pts = await getTripPath(deviceId, t);
        if (mounted) { setPath(pts); setLoading(false); }
      } else {
        setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [journeyMode, deviceId, id, search.from, search.to, storeTrip]);

  const [startAddr, setStartAddr] = useState("");
  const [endAddr, setEndAddr] = useState("");

  useEffect(() => {
    if (!trip) return;
    let mounted = true;
    const coords = trip.startAddress.split(",").map((s) => parseFloat(s.trim()));
    if (coords.length === 2 && coords.every(Number.isFinite)) {
      reverseGeocode(coords[0], coords[1]).then((a) => { if (mounted) setStartAddr(a); });
    }
    const ec = trip.endAddress.split(",").map((s) => parseFloat(s.trim()));
    if (ec.length === 2 && ec.every(Number.isFinite)) {
      reverseGeocode(ec[0], ec[1]).then((a) => { if (mounted) setEndAddr(a); });
    }
    return () => { mounted = false; };
  }, [trip]);

  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(2);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(0);

  // animation loop — advances idx based on real-time × speed
  useEffect(() => {
    if (!playing || path.length === 0) return;
    const stepIntervalMs = 1000 / speed; // 1 simulated point per (1/speed)s real
    const tick = (now: number) => {
      if (!lastTickRef.current) lastTickRef.current = now;
      const delta = now - lastTickRef.current;
      if (delta >= stepIntervalMs) {
        const advance = Math.floor(delta / stepIntervalMs);
        lastTickRef.current = now;
        setIdx((i) => {
          const next = i + advance;
          if (next >= path.length - 1) {
            setPlaying(false);
            return path.length - 1;
          }
          return next;
        });
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lastTickRef.current = 0;
    };
  }, [playing, speed, path.length]);

  if (loading) {
    return (
      <AppShell>
        <div className="p-8 text-sm text-[var(--text-secondary)]">Chargement du trajet…</div>
      </AppShell>
    );
  }
  if (!trip) {
    return (
      <AppShell>
        <div className="p-8 text-sm text-[var(--text-secondary)]">Trajet introuvable.</div>
      </AppShell>
    );
  }
  if (path.length === 0) {
    return (
      <AppShell>
        <div className="p-8 text-sm text-[var(--text-secondary)]">Aucune donnée de tracé disponible pour ce trajet.</div>
      </AppShell>
    );
  }

  const current = path[idx] ?? path[0];
  const traveled = path.slice(0, idx + 1).map((p) => ({ lat: p.lat, lng: p.lng }));
  const fullCoords = path.map((p) => ({ lat: p.lat, lng: p.lng }));
  const start = path[0];
  const end = path[path.length - 1];

  // Waypoints appear progressively along the portion already travelled, spaced
  // by DISTANCE (~350 m) so several stay visible once zoomed in (MapCanvas hides
  // them below WAYPOINT_MIN_ZOOM).
  const travelWaypoints: Array<{ lat: number; lng: number }> = (() => {
    if (traveled.length < 4) return [];
    const STEP_KM = 0.35;
    const MAX = 90;
    const wp: Array<{ lat: number; lng: number }> = [];
    let acc = 0;
    for (let i = 1; i < traveled.length && wp.length < MAX; i++) {
      acc += haversineKm(traveled[i - 1].lat, traveled[i - 1].lng, traveled[i].lat, traveled[i].lng);
      if (acc >= STEP_KM) { wp.push(traveled[i]); acc = 0; }
    }
    return wp;
  })();
  const elapsedSec = current?.t ?? 0;
  const totalSec = path[path.length - 1]?.t ?? trip.durationMin * 60;
  const progress = totalSec > 0 ? elapsedSec / totalSec : 0;
  // Real timestamp: trip.id = epoch ms of trip start
  const tripStartMs = Number.isFinite(Number(trip.id)) ? Number(trip.id) : 0;
  const absoluteTime = tripStartMs > 0 ? new Date(tripStartMs + elapsedSec * 1000) : null;

  const togglePlay = () => {
    if (idx >= path.length - 1) setIdx(0);
    setPlaying((p) => !p);
  };
  const skip = (sec: number) => {
    const targetSec = Math.max(0, Math.min(totalSec, elapsedSec + sec));
    const stepSec = path[1] ? path[1].t - path[0].t : 5;
    setIdx(Math.max(0, Math.min(path.length - 1, Math.round(targetSec / stepSec))));
  };
  const onScrub = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const r = (e.clientX - rect.left) / rect.width;
    setIdx(Math.max(0, Math.min(path.length - 1, Math.round(r * (path.length - 1)))));
  };
  const onExport = async () => {
    if (!deviceId) return;
    await downloadGPX(deviceId, trip);
    await notify({ title: `autotrack-${trip.id}.gpx téléchargé`, tone: "success" });
  };

  return (
    <AppShell fullBleed>
      <div className="absolute inset-0">
        <MapCanvas
          center={[current.lat, current.lng]}
          heading={current.heading}
          trail={traveled}
          fullPath={fullCoords}
          heatmapPath={showHeatmap ? path : undefined}
          waypoints={showHeatmap ? undefined : travelWaypoints}
          startPoint={start}
          endPoint={end}
          fitToPath
          hideFullPath
          markerGlide={false}
          followVehicle={false}
        />
      </div>

      {/* Top bar */}
      <div className="absolute top-3 left-3 right-3 z-20 flex items-center gap-2 md:gap-3">
        <Link
          to="/trips"
          className="glass h-11 px-3 flex items-center gap-2 text-sm hover:bg-[var(--bg-elevated)]"
        >
          <ArrowLeft className="size-4" /> <span className="hidden md:inline">Trajets</span>
        </Link>
        <div className="glass flex-1 h-11 px-4 flex items-center gap-3 min-w-0">
          <span className="text-[11px] mono text-[var(--text-secondary)] shrink-0">{journeyMode ? "Trajet complet" : `#${trip.id}`}</span>
          <span className="text-sm font-medium truncate">
            {startAddr || trip.startAddress} → {endAddr || trip.endAddress}
          </span>
        </div>
        <button
          onClick={() => setShowHeatmap((v) => !v)}
          title="Heatmap de vitesse"
          className={`glass h-11 px-3 flex items-center gap-2 text-sm transition-colors ${showHeatmap ? "bg-[var(--accent-amber)]/20 text-[var(--accent-amber)]" : "hover:bg-[var(--bg-elevated)]"}`}
        >
          <Flame className="size-4" />
          <span className="hidden md:inline">Heatmap</span>
        </button>
        <button
          onClick={onExport}
          className="glass h-11 px-3 flex items-center gap-2 text-sm hover:bg-[var(--bg-elevated)]"
        >
          <Download className="size-4" /> <span className="hidden md:inline">GPX</span>
        </button>
      </div>

      {/* Cockpit */}
      <div className="absolute top-20 right-3 z-20 glass-strong p-4 w-[220px] hidden md:block">
        <div className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] mb-1">
          Vitesse (replay)
        </div>
        <div
          className="text-4xl font-bold mono leading-none"
          style={{ color: speedColor(current.speed) }}
        >
          {Math.round(current.speed)}
        </div>
        <div className="text-[10px] mono text-[var(--text-secondary)] mt-1">
          km/h · cap {bearingToCompass(current.heading)} {Math.round(current.heading)}°
        </div>
        <div className="h-px bg-[var(--border)] my-3" />
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div>
            <div className="text-[var(--text-secondary)]">Distance</div>
            <div className="mono">{trip.distanceKm} km</div>
          </div>
          <div>
            <div className="text-[var(--text-secondary)]">Durée</div>
            <div className="mono">{fmtDuration(trip.durationMin)}</div>
          </div>
          <div>
            <div className="text-[var(--text-secondary)]">Vit. moy</div>
            <div className="mono">{trip.avgSpeed} km/h</div>
          </div>
          <div>
            <div className="text-[var(--text-secondary)]">Vit. max</div>
            <div className="mono text-[var(--accent-amber)]">{trip.maxSpeed} km/h</div>
          </div>
        </div>
        <div className="h-px bg-[var(--border)] my-3" />
        {absoluteTime && (
          <div className="text-[10px] mono text-[var(--accent-primary)] mb-1">
            {absoluteTime.toLocaleDateString("fr-FR")} · {absoluteTime.toLocaleTimeString("fr-FR")}
          </div>
        )}
        <div className="text-[10px] mono text-[var(--text-secondary)]">
          {current.lat.toFixed(5)}, {current.lng.toFixed(5)}
        </div>
      </div>

      {/* Heatmap legend */}
      {showHeatmap && (
        <div className="absolute bottom-[140px] md:bottom-[92px] left-1/2 -translate-x-1/2 z-20 glass px-3 py-1.5 rounded-lg flex items-center gap-3 text-[10px] mono pointer-events-none">
          {([["#10F58F", "0–30"], ["#FFE600", "30–60"], ["#FF8C00", "60–90"], ["#FF3B30", "90+"]]) .map(([c, l]) => (
            <span key={l} className="flex items-center gap-1">
              <span className="size-2 rounded-full shrink-0" style={{ background: c }} />
              <span className="text-[var(--text-secondary)]">{l} km/h</span>
            </span>
          ))}
        </div>
      )}

      {/* Replay controls */}
      <div className="absolute bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-20 glass-strong px-4 py-3 flex items-center gap-2 w-[calc(100%-1.5rem)] max-w-[520px]">
        <button
          onClick={() => skip(-30)}
          className="size-9 grid place-items-center rounded-md hover:bg-[var(--bg-elevated)]"
          aria-label="Reculer 30s"
        >
          <SkipBack className="size-4" />
        </button>
        <button
          onClick={togglePlay}
          className="size-11 grid place-items-center rounded-full bg-[var(--accent-primary)] text-[var(--bg-base)] hover:opacity-90"
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? <Pause className="size-5" fill="currentColor" /> : <Play className="size-5" fill="currentColor" />}
        </button>
        <button
          onClick={() => skip(30)}
          className="size-9 grid place-items-center rounded-md hover:bg-[var(--bg-elevated)]"
          aria-label="Avancer 30s"
        >
          <SkipForward className="size-4" />
        </button>
        <div className="flex-1 mx-2 min-w-0">
          <div
            onClick={onScrub}
            className="h-2 bg-[var(--bg-elevated)] rounded-full overflow-hidden cursor-pointer relative group"
          >
            <div
              className="h-full bg-gradient-to-r from-[var(--accent-cyan)] to-[var(--accent-primary)] rounded-full transition-[width] duration-75"
              style={{ width: `${progress * 100}%` }}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 size-3 rounded-full bg-white shadow-md shadow-black/50 opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ left: `calc(${progress * 100}% - 6px)` }}
            />
          </div>
          <div className="flex justify-between text-[10px] mono text-[var(--text-secondary)] mt-1">
            <span>
              {absoluteTime
                ? absoluteTime.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
                : fmtTime(elapsedSec)}
            </span>
            <span>{fmtTime(totalSec)}</span>
          </div>
        </div>
        <div className="flex items-center gap-0.5 text-[10px] mono shrink-0">
          {SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              className={`h-7 px-1.5 rounded ${s === speed ? "bg-[var(--accent-primary)]/15 text-[var(--accent-primary)]" : "text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"}`}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>
    </AppShell>
  );
}

function fmtTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}
