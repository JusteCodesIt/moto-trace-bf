import { createFileRoute } from "@tanstack/react-router";
import { FileUp, MapPin, Route as RouteIcon, Clock, Gauge, X } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { MapCanvas } from "@/components/MapCanvas";
import { haversineKm } from "@/lib/geo";

export const Route = createFileRoute("/gpx")({
  head: () => ({ meta: [{ title: "Visualiseur GPX — AutoTrack" }] }),
  component: GpxViewerPage,
});

interface GpxPoint {
  lat: number;
  lng: number;
  ele?: number;
  time?: string;
  speed?: number;
}

interface GpxTrack {
  name: string;
  points: GpxPoint[];
  distanceKm: number;
  durationMin: number;
  maxSpeed: number;
  avgSpeed: number;
  elevGain: number;
}

function parseGpx(xml: string): GpxTrack[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "application/xml");
  const tracks: GpxTrack[] = [];

  const trks = doc.querySelectorAll("trk");
  for (const trk of trks) {
    const nameEl = trk.querySelector("name");
    const name = nameEl?.textContent ?? "Trace sans nom";
    const points: GpxPoint[] = [];

    const trkpts = trk.querySelectorAll("trkpt");
    for (const pt of trkpts) {
      const lat = parseFloat(pt.getAttribute("lat") ?? "0");
      const lng = parseFloat(pt.getAttribute("lon") ?? "0");
      const eleEl = pt.querySelector("ele");
      const timeEl = pt.querySelector("time");
      const speedEl = pt.querySelector("speed");
      points.push({
        lat, lng,
        ele: eleEl ? parseFloat(eleEl.textContent ?? "0") : undefined,
        time: timeEl?.textContent ?? undefined,
        speed: speedEl ? parseFloat(speedEl.textContent ?? "0") * 3.6 : undefined,
      });
    }

    // Also check for waypoints outside tracks (rte > rtept)
    if (points.length === 0) {
      const rtepts = trk.querySelectorAll("rtept");
      for (const pt of rtepts) {
        const lat = parseFloat(pt.getAttribute("lat") ?? "0");
        const lng = parseFloat(pt.getAttribute("lon") ?? "0");
        points.push({ lat, lng });
      }
    }

    if (points.length < 2) continue;

    let distanceKm = 0;
    let elevGain = 0;
    let maxSpeed = 0;
    let speedSum = 0;
    let speedCount = 0;

    for (let i = 1; i < points.length; i++) {
      const d = haversineKm(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng);
      distanceKm += d;

      if (points[i].ele !== undefined && points[i - 1].ele !== undefined) {
        const diff = points[i].ele! - points[i - 1].ele!;
        if (diff > 0) elevGain += diff;
      }

      // Compute speed from distance/time if not embedded
      let spd = points[i].speed;
      if (spd === undefined && points[i].time && points[i - 1].time) {
        const dt = (new Date(points[i].time!).getTime() - new Date(points[i - 1].time!).getTime()) / 1000;
        if (dt > 0) spd = (d / dt) * 3600;
      }
      if (spd !== undefined) {
        points[i].speed = spd;
        maxSpeed = Math.max(maxSpeed, spd);
        speedSum += spd;
        speedCount++;
      }
    }

    let durationMin = 0;
    if (points[0].time && points[points.length - 1].time) {
      durationMin = (new Date(points[points.length - 1].time!).getTime() - new Date(points[0].time!).getTime()) / 60000;
    }

    tracks.push({
      name,
      points,
      distanceKm: +distanceKm.toFixed(2),
      durationMin: Math.round(durationMin),
      maxSpeed: Math.round(maxSpeed),
      avgSpeed: speedCount > 0 ? Math.round(speedSum / speedCount) : 0,
      elevGain: Math.round(elevGain),
    });
  }

  // Also parse standalone waypoints (wpt elements) as a pseudo-track
  if (tracks.length === 0) {
    const wpts = doc.querySelectorAll("wpt");
    if (wpts.length >= 2) {
      const points: GpxPoint[] = [];
      for (const pt of wpts) {
        points.push({
          lat: parseFloat(pt.getAttribute("lat") ?? "0"),
          lng: parseFloat(pt.getAttribute("lon") ?? "0"),
        });
      }
      let distanceKm = 0;
      for (let i = 1; i < points.length; i++) {
        distanceKm += haversineKm(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng);
      }
      tracks.push({ name: "Waypoints", points, distanceKm: +distanceKm.toFixed(2), durationMin: 0, maxSpeed: 0, avgSpeed: 0, elevGain: 0 });
    }
  }

  return tracks;
}

function fmtDuration(min: number): string {
  if (min < 1) return "< 1 min";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${m} min`;
}

function GpxViewerPage() {
  const [tracks, setTracks] = useState<GpxTrack[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    if (!file.name.toLowerCase().endsWith(".gpx")) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const xml = e.target?.result as string;
      const parsed = parseGpx(xml);
      setTracks(parsed);
      setSelectedIdx(0);
    };
    reader.readAsText(file);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const track = tracks[selectedIdx] ?? null;

  const heatmapPath = useMemo(() => {
    if (!track) return undefined;
    if (!track.points.some((p) => p.speed !== undefined)) return undefined;
    return track.points.map((p) => ({ lat: p.lat, lng: p.lng, speed: p.speed ?? 0 }));
  }, [track]);

  const fullPath = useMemo(() => track?.points.map((p) => ({ lat: p.lat, lng: p.lng })) ?? [], [track]);
  const startPoint = track ? { lat: track.points[0].lat, lng: track.points[0].lng } : undefined;
  const endPoint = track ? { lat: track.points[track.points.length - 1].lat, lng: track.points[track.points.length - 1].lng } : undefined;

  return (
    <AppShell fullBleed>
      <div className="absolute inset-0">
        {track ? (
          <MapCanvas
            center={[track.points[0].lat, track.points[0].lng]}
            heading={0}
            fullPath={fullPath}
            heatmapPath={heatmapPath}
            startPoint={startPoint}
            endPoint={endPoint}
            fitToPath
            followVehicle={false}
            showPrimary={false}
          />
        ) : (
          <div className="absolute inset-0 bg-[var(--bg-base)]" />
        )}
      </div>

      {/* Drop zone / empty state */}
      {!track && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center p-6"
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          <div
            className={`w-full max-w-md p-10 rounded-2xl border-2 border-dashed text-center transition-all ${
              dragOver
                ? "border-[var(--accent-primary)] bg-[var(--accent-primary)]/5 scale-[1.02]"
                : "border-[var(--border-active)] bg-[var(--bg-surface)]"
            }`}
          >
            <div className="size-16 mx-auto mb-4 rounded-2xl bg-[var(--accent-primary)]/10 grid place-items-center">
              <FileUp className="size-8 text-[var(--accent-primary)]" />
            </div>
            <h2 className="text-lg font-semibold mb-2">Visualiseur GPX</h2>
            <p className="text-sm text-[var(--text-secondary)] mb-6">
              Glissez un fichier .gpx ici ou cliquez pour sélectionner.
              Le tracé sera affiché sur la carte avec les données de vitesse en couleur.
            </p>
            <button
              onClick={() => inputRef.current?.click()}
              className="h-11 px-6 rounded-lg bg-[var(--accent-primary)] text-[var(--accent-milk)] text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              Choisir un fichier GPX
            </button>
            <input
              ref={inputRef}
              type="file"
              accept=".gpx"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
          </div>
        </div>
      )}

      {/* Stats bar */}
      {track && (
        <div className="absolute top-3 left-3 right-3 z-20 flex items-center gap-3 flex-wrap pointer-events-none">
          <div className="glass-strong px-4 py-2.5 flex items-center gap-3 pointer-events-auto">
            <RouteIcon className="size-4 text-[var(--accent-primary)]" />
            <span className="text-sm font-semibold truncate max-w-[200px]">{track.name}</span>
            {fileName && (
              <span className="text-[10px] mono text-[var(--text-secondary)] hidden sm:inline">{fileName}</span>
            )}
            <button
              onClick={() => { setTracks([]); setFileName(null); }}
              className="size-6 grid place-items-center rounded hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)]"
              title="Fermer"
            >
              <X className="size-3.5" />
            </button>
          </div>

          <div className="glass-strong px-3 py-2 flex items-center gap-4 pointer-events-auto">
            <Stat icon={MapPin} label="Distance" value={`${track.distanceKm} km`} />
            {track.durationMin > 0 && <Stat icon={Clock} label="Durée" value={fmtDuration(track.durationMin)} />}
            {track.maxSpeed > 0 && <Stat icon={Gauge} label="Max" value={`${track.maxSpeed} km/h`} />}
            {track.elevGain > 0 && <Stat label="D+" value={`${track.elevGain} m`} />}
          </div>

          {tracks.length > 1 && (
            <div className="glass-strong px-3 py-2 flex items-center gap-1 pointer-events-auto">
              {tracks.map((t, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedIdx(i)}
                  className={`h-7 px-2.5 text-[11px] rounded transition-colors ${
                    i === selectedIdx
                      ? "bg-[var(--accent-primary)] text-[var(--accent-milk)]"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
                  }`}
                >
                  {t.name.length > 15 ? t.name.slice(0, 15) + "…" : t.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Reload button when viewing */}
      {track && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20">
          <button
            onClick={() => inputRef.current?.click()}
            className="glass-strong h-10 px-5 rounded-full flex items-center gap-2 text-xs font-semibold hover:bg-[var(--bg-elevated)] transition-colors"
          >
            <FileUp className="size-4" />
            Charger un autre fichier
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".gpx"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
        </div>
      )}
    </AppShell>
  );
}

function Stat({ icon: Icon, label, value }: { icon?: typeof MapPin; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5">
      {Icon && <Icon className="size-3.5 text-[var(--text-secondary)]" />}
      <div>
        <div className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider">{label}</div>
        <div className="text-xs font-semibold mono">{value}</div>
      </div>
    </div>
  );
}
