import { createFileRoute } from "@tanstack/react-router";
import { ChevronDown, MapPin, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { MapCanvas } from "@/components/MapCanvas";
import { useApp, type Zone } from "@/lib/store";
import { confirm, notify } from "@/components/ConfirmDialog";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/geofence")({
  head: () => ({ meta: [{ title: "Géozone — MotoTrack BF" }] }),
  component: GeofencePage,
});

type EditDraft = {
  id: string | null;
  name: string;
  shape: "circle" | "rect";
  lat: number;
  lng: number;
  radius: number;
  alertExit: boolean;
  alertEnter: boolean;
};

function GeofencePage() {
  const telemetry = useApp((s) => s.telemetry);
  const zones = useApp((s) => s.zones);
  const device = useApp((s) => s.device);
  const [panelOpen, setPanelOpen] = useState(false);

  const [editing, setEditing] = useState<EditDraft>({
    id: null, name: "", shape: "circle",
    lat: telemetry.lat, lng: telemetry.lng,
    radius: 250, alertExit: true, alertEnter: false,
  });

  const select = (z: Zone) =>
    setEditing({
      id: z.id, name: z.name, shape: z.shape, lat: z.lat, lng: z.lng,
      radius: z.radius, alertExit: z.alertExit, alertEnter: z.alertEnter,
    });

  const reset = () =>
    setEditing({
      id: null, name: "", shape: "circle",
      lat: telemetry.lat, lng: telemetry.lng,
      radius: 250, alertExit: true, alertEnter: false,
    });

  const save = async () => {
    if (!device) { await notify({ title: "Tracker non provisionné", tone: "warning" }); return; }
    if (!editing.name.trim()) {
      await notify({ title: "Nom requis", description: "Donnez un nom à la zone.", tone: "warning" });
      return;
    }
    const ok = await confirm({
      title: editing.id ? "Enregistrer les modifications ?" : "Créer cette nouvelle zone ?",
      description: `« ${editing.name} » — rayon ${editing.radius} m.`,
      tone: "warning",
      confirmLabel: editing.id ? "Enregistrer" : "Créer",
    });
    if (!ok) return;

    const payload = {
      device_id: device.id,
      name: editing.name.trim(),
      shape: editing.shape,
      lat: editing.lat, lng: editing.lng,
      radius_m: editing.radius,
      alert_on_exit: editing.alertExit,
      alert_on_enter: editing.alertEnter,
      active: true,
    };
    const { error } = editing.id
      ? await supabase.from("geofences").update(payload).eq("id", editing.id)
      : await supabase.from("geofences").insert(payload);
    if (error) { await notify({ title: "Erreur", description: error.message, tone: "danger" }); return; }
    await notify({ title: "Zone enregistrée", tone: "success" });
    reset();
  };

  const remove = async (z: Zone) => {
    const ok = await confirm({
      title: "Supprimer cette zone ?",
      description: `« ${z.name} » sera retirée et les alertes associées arrêtées.`,
      tone: "danger", confirmLabel: "Supprimer",
    });
    if (!ok) return;
    const { error } = await supabase.from("geofences").delete().eq("id", z.id);
    if (error) { await notify({ title: "Erreur", description: error.message, tone: "danger" }); return; }
    if (editing.id === z.id) reset();
  };

  // Compute live distance to centre of editing zone
  const distToEdit = haversine(telemetry.lat, telemetry.lng, editing.lat, editing.lng);
  const inside = distToEdit <= editing.radius;

  return (
    <AppShell fullBleed>
      <div className="absolute inset-0">
        <MapCanvas
          center={[telemetry.lat, telemetry.lng]}
          heading={telemetry.heading}
          followVehicle={false}
          zones={zones.map((z) => ({
            id: z.id, shape: z.shape, lat: z.lat, lng: z.lng, radius: z.radius, name: z.name,
            status: haversine(telemetry.lat, telemetry.lng, z.lat, z.lng) <= z.radius ? "in" : "out",
          }))}
          editingZone={{
            id: editing.id ?? "draft", shape: editing.shape,
            lat: editing.lat, lng: editing.lng, radius: editing.radius,
          }}
          onMapClick={(lat, lng) => setEditing((e) => ({ ...e, lat, lng }))}
        />
      </div>

      <div className="absolute top-3 right-3 z-20 glass-strong px-4 py-3 flex items-center gap-3">
        <span
          className="size-2.5 rounded-full pulse-dot"
          style={{ background: inside ? "var(--accent-green)" : "var(--accent-amber)" }}
        />
        <div>
          <div
            className="text-xs font-semibold"
            style={{ color: inside ? "var(--accent-green)" : "var(--accent-amber)" }}
          >
            {inside ? "Véhicule dans la zone" : "Véhicule hors zone"}
          </div>
          <div className="text-[10px] mono text-[var(--text-secondary)]">
            Distance: {Math.round(distToEdit)} m
          </div>
        </div>
      </div>

      <aside className="absolute top-3 left-3 bottom-3 z-20 w-[320px] glass-strong overflow-y-auto p-5 space-y-5">
        <div className="flex items-center gap-2">
          <MapPin className="size-5 text-[var(--accent-primary)]" />
          <h2 className="text-base font-semibold">Géozones</h2>
        </div>

        <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed -mt-2">
          Cliquez sur la carte pour déplacer le centre de la zone en édition.
        </p>

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
            {([{ id: "circle", label: "Cercle" }, { id: "rect", label: "Rectangle" }] as const).map((s) => (
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
          <Field label="LAT" value={editing.lat.toFixed(6)} onChange={(v) => setEditing({ ...editing, lat: parseFloat(v) || 0 })} />
          <Field label="LNG" value={editing.lng.toFixed(6)} onChange={(v) => setEditing({ ...editing, lng: parseFloat(v) || 0 })} />
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
            <span className="text-xs mono text-[var(--accent-cyan)]">{editing.radius} m</span>
          </div>
          <input
            type="range" min={50} max={5000} step={10}
            value={editing.radius}
            onChange={(e) => setEditing({ ...editing, radius: parseInt(e.target.value) })}
            className="w-full accent-[var(--accent-primary)]"
          />
        </div>

        <div className="space-y-2 pt-2 border-t border-[var(--border)]">
          <Label>Alertes</Label>
          <Toggle label="Alerte à la sortie" checked={editing.alertExit} onChange={(v) => setEditing({ ...editing, alertExit: v })} />
          <Toggle label="Alerte à l'entrée" checked={editing.alertEnter} onChange={(v) => setEditing({ ...editing, alertEnter: v })} />
        </div>

        <button
          onClick={save}
          className="w-full h-11 rounded-md bg-[var(--accent-primary)] text-[var(--accent-milk)] text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          {editing.id ? "Enregistrer la zone" : "Créer la zone"}
        </button>

        <div className="pt-4 border-t border-[var(--border)] space-y-2">
          <Label>Zones existantes ({zones.length})</Label>
          {zones.length === 0 && (
            <p className="text-[11px] text-[var(--text-secondary)]">Aucune zone définie pour le moment.</p>
          )}
          {zones.map((z) => {
            const inZone = haversine(telemetry.lat, telemetry.lng, z.lat, z.lng) <= z.radius;
            return (
              <div
                key={z.id}
                className={`card-elev p-2.5 flex items-center gap-2.5 cursor-pointer transition-colors ${editing.id === z.id ? "ring-1 ring-[var(--accent-primary)]" : "hover:bg-[var(--bg-elevated)]"}`}
                onClick={() => select(z)}
              >
                <MapPin className="size-4 text-[var(--text-secondary)]" />
                <span className="text-xs flex-1 truncate">{z.name}</span>
                <span className="size-2 rounded-full" style={{ background: inZone ? "var(--accent-green)" : "var(--text-dim)" }} />
                <button
                  onClick={(e) => { e.stopPropagation(); remove(z); }}
                  className="text-[var(--text-secondary)] hover:text-[var(--accent-red)]"
                  aria-label={`Supprimer ${z.name}`}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            );
          })}
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

function haversine(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000, toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-9 px-2.5 rounded-md bg-[var(--bg-elevated)] border border-[var(--border)] text-xs mono outline-none"
      />
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-semibold">{children}</label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="w-full flex items-center justify-between gap-3 py-2.5 px-1 rounded-md hover:bg-[var(--bg-elevated)]/40 transition-colors text-left"
    >
      <span className="text-xs flex-1">{label}</span>
      <span
        className={`relative inline-flex shrink-0 w-11 h-6 rounded-full transition-colors ${checked ? "bg-[var(--accent-primary)]" : "bg-[var(--bg-elevated)] border border-[var(--border)]"}`}
      >
        <span
          className={`absolute top-0.5 size-5 rounded-full bg-white shadow-md transition-transform duration-200 ${checked ? "translate-x-[22px]" : "translate-x-0.5"}`}
        />
      </span>
    </button>
  );
}
