import { createFileRoute } from "@tanstack/react-router";
import { MapPin, Plus, Trash2, Home } from "lucide-react";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { MapCanvas } from "@/components/MapCanvas";
import { useApp } from "@/lib/store";
import { confirm, notify } from "@/components/ConfirmDialog";

export const Route = createFileRoute("/geofence")({
  head: () => ({ meta: [{ title: "Géozone — MotoTrack BF" }] }),
  component: GeofencePage,
});

type Shape = "circle" | "rect" | "poly";
type Zone = {
  id: string;
  name: string;
  shape: Shape;
  lat: number;
  lng: number;
  radius: number;
  exit: boolean;
  enter: boolean;
  icon: typeof Home;
  status: "in" | "out";
};

const SEED: Zone[] = [
  { id: "z1", name: "Maison", shape: "circle", lat: 12.364012, lng: -1.533847, radius: 250, exit: true, enter: false, icon: Home, status: "in" },
  { id: "z2", name: "Bureau", shape: "circle", lat: 12.371, lng: -1.519, radius: 180, exit: true, enter: true, icon: MapPin, status: "out" },
  { id: "z3", name: "Parking HETEC", shape: "rect", lat: 12.357, lng: -1.541, radius: 120, exit: false, enter: true, icon: MapPin, status: "out" },
];

function GeofencePage() {
  const telemetry = useApp((s) => s.telemetry);
  const [zones, setZones] = useState<Zone[]>(SEED);
  const [editing, setEditing] = useState<Zone>({ ...SEED[0] });

  const select = (z: Zone) => setEditing({ ...z });

  const reset = () =>
    setEditing({
      id: `z${Date.now()}`,
      name: "",
      shape: "circle",
      lat: telemetry.lat,
      lng: telemetry.lng,
      radius: 250,
      exit: true,
      enter: false,
      icon: MapPin,
      status: "out",
    });

  const save = async () => {
    if (!editing.name.trim()) {
      await notify({ title: "Nom requis", description: "Donnez un nom à la zone avant d'enregistrer.", tone: "warning" });
      return;
    }
    const exists = zones.some((z) => z.id === editing.id);
    const ok = await confirm({
      title: exists ? "Enregistrer les modifications ?" : "Créer cette nouvelle zone ?",
      description: `« ${editing.name} » — rayon ${editing.radius} m. Le tracker sera mis à jour.`,
      tone: "warning",
      confirmLabel: exists ? "Enregistrer" : "Créer",
    });
    if (!ok) return;
    setZones((zs) => (exists ? zs.map((z) => (z.id === editing.id ? editing : z)) : [...zs, editing]));
    await notify({ title: "Zone enregistrée", tone: "success" });
  };

  const remove = async (z: Zone) => {
    const ok = await confirm({
      title: "Supprimer cette zone ?",
      description: `« ${z.name} » sera retirée et les alertes associées arrêtées.`,
      tone: "danger",
      confirmLabel: "Supprimer",
    });
    if (!ok) return;
    setZones((zs) => zs.filter((x) => x.id !== z.id));
    if (editing.id === z.id) reset();
  };

  return (
    <AppShell fullBleed>
      <div className="absolute inset-0">
        <MapCanvas
          center={[telemetry.lat, telemetry.lng]}
          heading={telemetry.heading}
          followVehicle={false}
          zones={zones}
          editingZone={editing}
          onMapClick={(lat, lng) => setEditing((e) => ({ ...e, lat, lng }))}
        />
      </div>

      <div className="absolute top-3 right-3 z-20 glass-strong px-4 py-3 flex items-center gap-3">
        <span className="size-2.5 rounded-full bg-[var(--accent-green)] pulse-dot" />
        <div>
          <div className="text-xs font-semibold text-[var(--accent-green)]">Véhicule dans la zone</div>
          <div className="text-[10px] mono text-[var(--text-secondary)]">Distance du centre: 184 m</div>
        </div>
      </div>

      <aside className="absolute top-3 left-3 bottom-3 z-20 w-[320px] glass-strong overflow-y-auto p-5 space-y-5">
        <div className="flex items-center gap-2">
          <MapPin className="size-5 text-[var(--accent-primary)]" />
          <h2 className="text-base font-semibold">Géozones</h2>
        </div>

        <div className="space-y-2">
          <Label>Nom de la zone</Label>
          <input
            value={editing.name}
            onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            placeholder="Ex. Maison"
            className="w-full h-10 px-3 rounded-md bg-[var(--bg-elevated)] border border-[var(--border)] text-sm focus:border-[var(--accent-primary)] outline-none"
          />
        </div>

        <div className="space-y-2">
          <Label>Forme</Label>
          <div className="flex bg-[var(--bg-elevated)] rounded-md p-1">
            {([
              { id: "circle", label: "Cercle" },
              { id: "rect", label: "Rectangle" },
              { id: "poly", label: "Polygone" },
            ] as const).map((s) => (
              <button
                key={s.id}
                onClick={() => setEditing({ ...editing, shape: s.id })}
                className={`flex-1 h-7 text-[11px] rounded transition-colors ${editing.shape === s.id ? "bg-[var(--bg-surface)] text-[var(--text-primary)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label>LAT</Label>
            <input
              value={editing.lat}
              onChange={(e) => setEditing({ ...editing, lat: parseFloat(e.target.value) || 0 })}
              className="w-full h-9 px-2.5 rounded-md bg-[var(--bg-elevated)] border border-[var(--border)] text-xs mono outline-none"
            />
          </div>
          <div className="space-y-1.5">
            <Label>LNG</Label>
            <input
              value={editing.lng}
              onChange={(e) => setEditing({ ...editing, lng: parseFloat(e.target.value) || 0 })}
              className="w-full h-9 px-2.5 rounded-md bg-[var(--bg-elevated)] border border-[var(--border)] text-xs mono outline-none"
            />
          </div>
        </div>

        <button
          onClick={() => setEditing({ ...editing, lat: telemetry.lat, lng: telemetry.lng })}
          className="w-full h-8 text-xs rounded-md bg-[var(--bg-elevated)] hover:bg-[var(--border-active)] transition-colors"
        >
          Utiliser la position actuelle
        </button>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Rayon</Label>
            <span className="text-xs mono text-[var(--accent-cyan)]">{editing.radius}m</span>
          </div>
          <input
            type="range"
            min={50}
            max={5000}
            step={10}
            value={editing.radius}
            onChange={(e) => setEditing({ ...editing, radius: parseInt(e.target.value) })}
            className="w-full accent-[var(--accent-primary)]"
          />
        </div>

        <div className="space-y-2 pt-2 border-t border-[var(--border)]">
          <Label>Alertes</Label>
          <Toggle
            label="Alerte à la sortie"
            checked={editing.exit}
            onChange={(v) => setEditing({ ...editing, exit: v })}
          />
          <Toggle
            label="Alerte à l'entrée"
            checked={editing.enter}
            onChange={(v) => setEditing({ ...editing, enter: v })}
          />
        </div>

        <button
          onClick={save}
          className="w-full h-11 rounded-md bg-[var(--accent-primary)] text-[var(--accent-milk)] text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          Enregistrer la zone
        </button>

        <div className="pt-4 border-t border-[var(--border)] space-y-2">
          <Label>Zones existantes ({zones.length})</Label>
          {zones.map((z) => (
            <div
              key={z.id}
              className={`card-elev p-2.5 flex items-center gap-2.5 cursor-pointer transition-colors ${editing.id === z.id ? "ring-1 ring-[var(--accent-primary)]" : "hover:bg-[var(--bg-elevated)]"}`}
              onClick={() => select(z)}
            >
              <z.icon className="size-4 text-[var(--text-secondary)]" />
              <span className="text-xs flex-1 truncate">{z.name}</span>
              <span
                className="size-2 rounded-full"
                style={{ background: z.status === "in" ? "var(--accent-green)" : "var(--text-dim)" }}
              />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  remove(z);
                }}
                className="text-[var(--text-secondary)] hover:text-[var(--accent-red)]"
                aria-label={`Supprimer ${z.name}`}
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
          <button
            onClick={reset}
            className="w-full h-9 rounded-md border border-dashed border-[var(--border-active)] text-xs text-[var(--text-secondary)] hover:text-[var(--accent-primary)] hover:border-[var(--accent-primary)] flex items-center justify-center gap-1.5"
          >
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

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="w-full flex items-center justify-between cursor-pointer py-1"
    >
      <span className="text-xs">{label}</span>
      <span
        className={`relative w-9 h-5 rounded-full transition-colors ${checked ? "bg-[var(--accent-primary)]" : "bg-[var(--bg-elevated)]"}`}
      >
        <span
          className={`absolute top-0.5 size-4 rounded-full bg-white transition-transform ${checked ? "translate-x-[18px]" : "translate-x-0.5"}`}
        />
      </span>
    </button>
  );
}
