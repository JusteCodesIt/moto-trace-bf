import type { LiveDevice } from "@/lib/multi-device";

/**
 * Floating card shown when hovering a vehicle marker on the map.
 * Positioned top-right of the map area; non-interactive (pointer-events-none)
 * so it never steals clicks from underlying controls.
 */
export function VehicleHoverCard({ vehicle }: { vehicle: LiveDevice | null }) {
  if (!vehicle) return null;

  const speed = Math.round(vehicle.speed);
  const ageS = Math.max(0, Math.floor((Date.now() - vehicle.timestamp) / 1000));
  const ageLabel = ageS < 60 ? `${ageS} s` : ageS < 3600 ? `${Math.floor(ageS / 60)} min` : `${Math.floor(ageS / 3600)} h`;

  return (
    <div className="absolute top-20 right-3 md:right-4 z-30 pointer-events-none animate-fade-in">
      <div className="glass px-4 py-3 min-w-[220px] shadow-xl">
        <div className="flex items-center justify-between gap-3 mb-2">
          <span className="text-sm font-semibold truncate">{vehicle.name}</span>
          <span
            className={`text-[10px] mono uppercase tracking-wider px-1.5 py-0.5 rounded ${
              vehicle.isOnline
                ? "bg-[var(--accent-green)]/15 text-[var(--accent-green)]"
                : "bg-[var(--text-secondary)]/15 text-[var(--text-secondary)]"
            }`}
          >
            {vehicle.isOnline ? "EN LIGNE" : "HORS LIGNE"}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
          <Stat k="Vitesse" v={`${speed} km/h`} />
          <Stat k="Moteur" v={vehicle.engineOn ? "ON" : "OFF"} tone={vehicle.engineOn ? "green" : "muted"} />
          <Stat k="Batterie" v={`${Math.round(vehicle.batteryMain)} %`} />
          <Stat k="GSM" v={`${vehicle.gsmBars}/5`} />
          <Stat k="Cap" v={`${Math.round(vehicle.heading)}°`} />
          <Stat k="Maj." v={`il y a ${ageLabel}`} />
        </div>
      </div>
    </div>
  );
}

function Stat({ k, v, tone }: { k: string; v: string; tone?: "green" | "muted" }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-[var(--text-secondary)]">{k}</span>
      <span
        className={`mono ${
          tone === "green"
            ? "text-[var(--accent-green)]"
            : tone === "muted"
            ? "text-[var(--text-secondary)]"
            : ""
        }`}
      >
        {v}
      </span>
    </div>
  );
}
