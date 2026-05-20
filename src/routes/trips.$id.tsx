import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Pause, Play, Share2, SkipBack, SkipForward, Download } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { AppShell } from "@/components/AppShell";
import { MapCanvas } from "@/components/MapCanvas";
import { useApp } from "@/lib/store";
import { fmtDuration, bearingToCompass, speedColor } from "@/lib/format";
import { buildTripPath, downloadGPX } from "@/lib/trip-path";

export const Route = createFileRoute("/trips/$id")({
  component: TripDetail,
});

const SPEEDS = [1, 2, 4, 8] as const;

function TripDetail() {
  const { id } = Route.useParams();
  const trip = useApp((s) => s.trips.find((t) => t.id === id));

  const path = useMemo(() => (trip ? buildTripPath(trip) : []), [trip]);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(2);
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

  if (!trip) {
    return (
      <AppShell>
        <div className="p-8 text-sm text-[var(--text-secondary)]">Trajet introuvable.</div>
      </AppShell>
    );
  }

  const current = path[idx] ?? path[0];
  const traveled = path.slice(0, idx + 1).map((p) => ({ lat: p.lat, lng: p.lng }));
  const fullCoords = path.map((p) => ({ lat: p.lat, lng: p.lng }));
  const start = path[0];
  const end = path[path.length - 1];
  const elapsedSec = current?.t ?? 0;
  const totalSec = path[path.length - 1]?.t ?? trip.durationMin * 60;
  const progress = totalSec > 0 ? elapsedSec / totalSec : 0;

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
  const onShare = async () => {
    const url = `${window.location.origin}/share/${trip.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Lien copié dans le presse-papier");
    } catch {
      toast.error("Impossible de copier");
    }
  };
  const onExport = () => {
    downloadGPX(trip);
    toast.success(`mototrack-${trip.id}.gpx téléchargé`);
  };

  return (
    <AppShell fullBleed>
      <div className="absolute inset-0">
        <MapCanvas
          center={[current.lat, current.lng]}
          heading={current.heading}
          trail={traveled}
          fullPath={fullCoords}
          startPoint={start}
          endPoint={end}
          fitToPath
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
          <span className="text-[11px] mono text-[var(--text-secondary)] shrink-0">#{trip.id}</span>
          <span className="text-sm font-medium truncate">
            {trip.startAddress} → {trip.endAddress}
          </span>
        </div>
        <button
          onClick={onExport}
          className="glass h-11 px-3 flex items-center gap-2 text-sm hover:bg-[var(--bg-elevated)]"
        >
          <Download className="size-4" /> <span className="hidden md:inline">GPX</span>
        </button>
        <button
          onClick={onShare}
          className="glass h-11 px-3 flex items-center gap-2 text-sm hover:bg-[var(--bg-elevated)]"
        >
          <Share2 className="size-4" /> <span className="hidden md:inline">Partager</span>
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
        <div className="text-[10px] mono text-[var(--text-secondary)]">
          {current.lat.toFixed(5)}, {current.lng.toFixed(5)}
        </div>
      </div>

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
            <span>{fmtTime(elapsedSec)}</span>
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
