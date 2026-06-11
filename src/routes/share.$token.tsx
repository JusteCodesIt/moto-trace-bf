import { createFileRoute } from "@tanstack/react-router";
import { MapCanvas } from "@/components/MapCanvas";
import { useApp } from "@/lib/store";
import { speedColor } from "@/lib/format";

export const Route = createFileRoute("/share/$token")({
  head: () => ({
    meta: [
      { title: "Position partagée — AutoTrack" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SharePage,
});

function SharePage() {
  const { telemetry, trail } = useApp();

  return (
    <div className="h-screen w-screen relative bg-[var(--bg-base)] text-[var(--text-primary)] overflow-hidden">
      <MapCanvas
        center={[telemetry.lat, telemetry.lng]}
        heading={telemetry.heading}
        trail={trail}
      />

      <div className="absolute top-4 left-4 right-4 z-20 flex items-center gap-3">
        <div className="glass-strong px-4 h-12 flex items-center gap-3 flex-1 max-w-md">
          <div className="size-8 rounded-md bg-[var(--accent-primary)] grid place-items-center text-[10px] font-bold text-[var(--bg-base)]">
            MT
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold truncate">AutoTrack #BF-001</div>
            <div className="text-[10px] mono text-[var(--text-secondary)]">Position partagée en direct</div>
          </div>
        </div>
        <div className="glass-strong px-3 h-12 hidden md:flex items-center gap-2 text-xs">
          <span className="text-[var(--text-secondary)]">Expire dans</span>
          <span className="mono text-[var(--accent-amber)]">3h 42min</span>
        </div>
      </div>

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 glass-strong px-6 py-3">
        <div className="flex items-baseline gap-2 justify-center">
          <span
            className="text-4xl font-bold mono tabular-nums"
            style={{ color: speedColor(telemetry.speed) }}
          >
            {Math.round(telemetry.speed)}
          </span>
          <span className="text-xs mono text-[var(--text-secondary)] uppercase">km/h</span>
        </div>
      </div>

      <div className="absolute bottom-2 right-3 z-20 text-[10px] mono text-[var(--text-dim)]">
        Partagé via AutoTrack
      </div>
    </div>
  );
}
