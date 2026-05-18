import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Play, Share2, SkipBack, SkipForward } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { MapCanvas } from "@/components/MapCanvas";
import { useApp } from "@/lib/store";
import { fmtDuration } from "@/lib/format";

export const Route = createFileRoute("/trips/$id")({
  component: TripDetail,
});

function TripDetail() {
  const { id } = Route.useParams();
  const trip = useApp((s) => s.trips.find((t) => t.id === id));
  const telemetry = useApp((s) => s.telemetry);

  if (!trip) {
    return (
      <AppShell>
        <div className="p-8 text-sm text-[var(--text-secondary)]">Trajet introuvable.</div>
      </AppShell>
    );
  }

  return (
    <AppShell fullBleed>
      <div className="absolute inset-0">
        <MapCanvas
          center={[telemetry.lat, telemetry.lng]}
          heading={telemetry.heading}
          followVehicle={false}
        />
      </div>

      <div className="absolute top-3 left-3 right-3 z-20 flex items-center gap-3">
        <Link
          to="/trips"
          className="glass h-11 px-3 flex items-center gap-2 text-sm hover:bg-[var(--bg-elevated)]"
        >
          <ArrowLeft className="size-4" /> Trajets
        </Link>
        <div className="glass flex-1 h-11 px-4 flex items-center gap-3">
          <span className="text-[11px] mono text-[var(--text-secondary)]">#{trip.id}</span>
          <span className="text-sm font-medium truncate">
            {trip.startAddress} → {trip.endAddress}
          </span>
        </div>
        <button className="glass h-11 px-3 flex items-center gap-2 text-sm hover:bg-[var(--bg-elevated)]">
          <Share2 className="size-4" /> Partager
        </button>
      </div>

      {/* Cockpit */}
      <div className="absolute top-20 right-3 z-20 glass-strong p-4 w-[200px]">
        <div className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] mb-1">
          Vitesse actuelle
        </div>
        <div className="text-4xl font-bold mono text-[var(--accent-green)]">{trip.avgSpeed}</div>
        <div className="text-[10px] mono text-[var(--text-secondary)]">km/h · max {trip.maxSpeed}</div>
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
        </div>
      </div>

      {/* Replay controls */}
      <div className="absolute bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-20 glass-strong px-4 py-3 flex items-center gap-2 min-w-[420px]">
        <button className="size-9 grid place-items-center rounded-md hover:bg-[var(--bg-elevated)]">
          <SkipBack className="size-4" />
        </button>
        <button className="size-11 grid place-items-center rounded-full bg-[var(--accent-primary)] text-[var(--bg-base)]">
          <Play className="size-5" fill="currentColor" />
        </button>
        <button className="size-9 grid place-items-center rounded-md hover:bg-[var(--bg-elevated)]">
          <SkipForward className="size-4" />
        </button>
        <div className="flex-1 mx-3">
          <div className="h-1.5 bg-[var(--bg-elevated)] rounded-full overflow-hidden">
            <div className="h-full w-1/3 bg-[var(--accent-cyan)] rounded-full" />
          </div>
          <div className="flex justify-between text-[10px] mono text-[var(--text-secondary)] mt-1">
            <span>00:00</span>
            <span>{fmtDuration(trip.durationMin)}</span>
          </div>
        </div>
        <div className="flex items-center gap-1 text-[10px] mono">
          {["1×", "2×", "4×", "8×"].map((s, i) => (
            <button
              key={s}
              className={`h-7 px-2 rounded ${i === 0 ? "bg-[var(--accent-primary)]/15 text-[var(--accent-primary)]" : "text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
