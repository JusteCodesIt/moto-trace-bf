import { createFileRoute } from "@tanstack/react-router";
import { MapPin, Plus, Trash2, Home } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { MapCanvas } from "@/components/MapCanvas";
import { useApp } from "@/lib/store";

export const Route = createFileRoute("/geofence")({
  head: () => ({ meta: [{ title: "Géozone — MotoTrack BF" }] }),
  component: GeofencePage,
});

function GeofencePage() {
  const telemetry = useApp((s) => s.telemetry);

  return (
    <AppShell fullBleed>
      <div className="absolute inset-0">
        <MapCanvas
          center={[telemetry.lat, telemetry.lng]}
          heading={telemetry.heading}
          followVehicle={false}
        />
      </div>

      {/* Status card */}
      <div className="absolute top-3 right-3 z-20 glass-strong px-4 py-3 flex items-center gap-3">
        <span className="size-2.5 rounded-full bg-[var(--accent-green)] pulse-dot" style={{ color: "var(--accent-green)" }} />
        <div>
          <div className="text-xs font-semibold text-[var(--accent-green)]">Véhicule dans la zone</div>
          <div className="text-[10px] mono text-[var(--text-secondary)]">Distance du centre: 184 m</div>
        </div>
      </div>

      {/* Editor */}
      <aside className="absolute top-3 left-3 bottom-3 z-20 w-[320px] glass-strong overflow-y-auto p-5 space-y-5">
        <div className="flex items-center gap-2">
          <MapPin className="size-5 text-[var(--accent-primary)]" />
          <h2 className="text-base font-semibold">Géozones</h2>
        </div>

        <div className="space-y-2">
          <Label>Nom de la zone</Label>
          <input
            defaultValue="Maison"
            className="w-full h-10 px-3 rounded-md bg-[var(--bg-elevated)] border border-[var(--border)] text-sm focus:border-[var(--accent-primary)] outline-none"
          />
        </div>

        <div className="space-y-2">
          <Label>Forme</Label>
          <div className="flex bg-[var(--bg-elevated)] rounded-md p-1">
            {[
              { id: "circle", label: "Cercle" },
              { id: "rect", label: "Rectangle" },
              { id: "poly", label: "Polygone" },
            ].map((s, i) => (
              <button
                key={s.id}
                className={`flex-1 h-7 text-[11px] rounded ${i === 0 ? "bg-[var(--bg-surface)] text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label>LAT</Label>
            <input className="w-full h-9 px-2.5 rounded-md bg-[var(--bg-elevated)] border border-[var(--border)] text-xs mono outline-none" defaultValue="12.364012" />
          </div>
          <div className="space-y-1.5">
            <Label>LNG</Label>
            <input className="w-full h-9 px-2.5 rounded-md bg-[var(--bg-elevated)] border border-[var(--border)] text-xs mono outline-none" defaultValue="-1.533847" />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Rayon</Label>
            <span className="text-xs mono text-[var(--accent-cyan)]">250m</span>
          </div>
          <input type="range" min="50" max="5000" step="10" defaultValue="250" className="w-full accent-[var(--accent-primary)]" />
        </div>

        <div className="space-y-2 pt-2 border-t border-[var(--border)]">
          <Label>Alertes</Label>
          <Toggle label="Alerte à la sortie" checked />
          <Toggle label="Alerte à l'entrée" />
        </div>

        <button className="w-full h-11 rounded-md bg-[var(--accent-primary)] text-[var(--bg-base)] text-sm font-semibold hover:opacity-90 transition-opacity">
          Enregistrer la zone
        </button>

        <div className="pt-4 border-t border-[var(--border)] space-y-2">
          <Label>Zones existantes</Label>
          {[
            { name: "Maison", icon: Home, status: "in" },
            { name: "Bureau", icon: MapPin, status: "out" },
            { name: "Parking HETEC", icon: MapPin, status: "out" },
          ].map((z) => (
            <div key={z.name} className="card-elev p-2.5 flex items-center gap-2.5">
              <z.icon className="size-4 text-[var(--text-secondary)]" />
              <span className="text-xs flex-1">{z.name}</span>
              <span
                className="size-2 rounded-full"
                style={{ background: z.status === "in" ? "var(--accent-green)" : "var(--text-dim)" }}
              />
              <button className="text-[var(--text-secondary)] hover:text-[var(--accent-red)]">
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
          <button className="w-full h-9 rounded-md border border-dashed border-[var(--border-active)] text-xs text-[var(--text-secondary)] hover:text-[var(--accent-primary)] hover:border-[var(--accent-primary)] flex items-center justify-center gap-1.5">
            <Plus className="size-3.5" /> Nouvelle zone
          </button>
        </div>
      </aside>
    </AppShell>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-semibold">
      {children}
    </label>
  );
}

function Toggle({ label, checked = false }: { label: string; checked?: boolean }) {
  return (
    <label className="flex items-center justify-between cursor-pointer">
      <span className="text-xs">{label}</span>
      <span
        className={`relative w-9 h-5 rounded-full transition-colors ${checked ? "bg-[var(--accent-primary)]" : "bg-[var(--bg-elevated)]"}`}
      >
        <span
          className={`absolute top-0.5 size-4 rounded-full bg-white transition-transform ${checked ? "translate-x-[18px]" : "translate-x-0.5"}`}
        />
      </span>
    </label>
  );
}
