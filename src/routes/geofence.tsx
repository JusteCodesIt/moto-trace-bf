import { createFileRoute } from "@tanstack/react-router";
import { ChevronDown, MapPin, Plus, Trash2, X, Layers, PenTool } from "lucide-react";
import { useCallback, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { MapCanvas } from "@/components/MapCanvas";
import { useApp, type Zone } from "@/lib/store";
import { haversineM } from "@/lib/geo";
import { confirm, notify } from "@/components/ConfirmDialog";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/geofence")({
  head: () => ({ meta: [{ title: "Géozone — AutoTrack" }] }),
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
  const [panelOpen, setPanelOpen] = useState(false);

  // Draw mode: user clicks center on map, then clicks perimeter to set radius
  const [drawMode, setDrawMode] = useState<"off" | "center" | "radius">("off");

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

  // Reload every account geofence (RLS-scoped to the owner) so a freshly saved
  // fleet-wide zone shows immediately, without waiting on the realtime event.
  const reloadZones = async () => {
    const { data } = await supabase.from("geofences").select("*");
    if (data) {
      useApp.getState().setZones(
        data.map((r: Record<string, any>) => ({
          id: r.id, name: r.name, shape: r.shape as "circle" | "rect",
          lat: r.lat, lng: r.lng, radius: r.radius_m,
          alertExit: r.alert_on_exit, alertEnter: r.alert_on_enter, active: r.active,
        })),
      );
    }
  };

  const save = async () => {
    if (!editing.name.trim()) {
      await notify({ title: "Nom requis", description: "Donnez un nom à la zone.", tone: "warning" });
      return;
    }
    if (editing.radius < 10) {
      await notify({ title: "Rayon trop petit", description: "Le rayon doit valoir au moins 10 m.", tone: "warning" });
      return;
    }
    const ok = await confirm({
      title: editing.id ? "Enregistrer les modifications ?" : "Créer cette nouvelle zone ?",
      description: `« ${editing.name} » — rayon ${fmtRadius(editing.radius)}. Valable pour tous les véhicules.`,
      tone: "warning",
      confirmLabel: editing.id ? "Enregistrer" : "Créer",
    });
    if (!ok) return;

    // Zone valable pour toute la flotte : rattachée au compte (owner, défaut SQL
    // auth.uid()) et non à un appareil. device_id = null → tous les véhicules.
    const payload = {
      device_id: null as string | null,
      name: editing.name.trim(),
      shape: editing.shape,
      lat: editing.lat, lng: editing.lng,
      radius_m: Math.round(editing.radius),
      alert_on_exit: editing.alertExit,
      alert_on_enter: editing.alertEnter,
      active: true,
    };
    const { error } = editing.id
      ? await supabase.from("geofences").update(payload).eq("id", editing.id)
      : await supabase.from("geofences").insert(payload);
    if (error) { await notify({ title: "Erreur", description: error.message, tone: "danger" }); return; }
    await reloadZones();
    await notify({ title: "Zone enregistrée", description: "Appliquée à tous les véhicules.", tone: "success" });
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
    await reloadZones();
    if (editing.id === z.id) reset();
  };

  const onMapClick = useCallback((lat: number, lng: number) => {
    if (drawMode === "center") {
      setEditing((e) => ({ ...e, lat, lng }));
      setDrawMode("radius");
    } else if (drawMode === "radius") {
      const r = Math.round(haversineM(editing.lat, editing.lng, lat, lng));
      setEditing((e) => ({ ...e, radius: Math.max(10, r) }));
      setDrawMode("off");
    } else {
      setEditing((e) => ({ ...e, lat, lng }));
    }
  }, [drawMode, editing.lat, editing.lng]);

  const startDraw = () => {
    setDrawMode("center");
    reset();
  };

  // Compute live distance to centre of editing zone
  const distToEdit = haversineM(telemetry.lat, telemetry.lng, editing.lat, editing.lng);
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
            status: haversineM(telemetry.lat, telemetry.lng, z.lat, z.lng) <= z.radius ? "in" : "out",
          }))}
          editingZone={{
            id: editing.id ?? "draft", shape: editing.shape,
            lat: editing.lat, lng: editing.lng, radius: editing.radius,
          }}
          onMapClick={onMapClick}
        />
      </div>

      <div className="absolute top-3 left-3 z-20 flex items-center gap-2">
        <div className="glass-strong px-3.5 py-2.5 flex items-center gap-2">
          <Layers className="size-4 text-[var(--accent-primary)]" />
          <span className="text-[11px] font-semibold text-[var(--text-secondary)]">
            Zones valables pour tous les véhicules
          </span>
        </div>
        <button
          onClick={startDraw}
          className={`glass-strong h-10 px-3.5 flex items-center gap-2 text-[11px] font-semibold transition-colors ${
            drawMode !== "off"
              ? "ring-2 ring-[var(--accent-primary)] text-[var(--accent-primary)]"
              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          }`}
          title="Dessiner une zone directement sur la carte"
        >
          <PenTool className="size-4" />
          Dessiner
        </button>
      </div>

      {drawMode !== "off" && (
        <div className="absolute top-16 left-3 z-20 glass-strong px-4 py-3 rounded-lg border border-[var(--accent-primary)]/40 max-w-[280px]">
          <div className="text-xs font-semibold text-[var(--accent-primary)] mb-1">
            {drawMode === "center" ? "Étape 1 / 2 — Centre" : "Étape 2 / 2 — Rayon"}
          </div>
          <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
            {drawMode === "center"
              ? "Cliquez sur la carte pour placer le centre de la géozone."
              : "Cliquez maintenant sur le périmètre souhaité pour définir le rayon."}
          </p>
          <button
            onClick={() => setDrawMode("off")}
            className="mt-2 text-[10px] text-[var(--text-secondary)] hover:text-[var(--accent-red)] underline"
          >
            Annuler
          </button>
        </div>
      )}

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

      {/* Floating launcher: visible when panel is closed */}
      {!panelOpen && (
        <button
          onClick={() => setPanelOpen(true)}
          className="absolute z-20 bottom-4 left-1/2 -translate-x-1/2 md:left-3 md:translate-x-0 md:top-3 md:bottom-auto glass-strong px-4 h-11 rounded-full flex items-center gap-2 text-xs font-semibold shadow-lg hover:bg-[var(--bg-elevated)] transition-colors"
          aria-label="Ouvrir le panneau des géozones"
        >
          <MapPin className="size-4 text-[var(--accent-primary)]" />
          Géozones ({zones.length})
          <ChevronDown className="size-3.5 -rotate-90 md:rotate-0" />
        </button>
      )}

      {/* Backdrop on mobile when panel is open */}
      {panelOpen && (
        <button
          aria-label="Fermer"
          onClick={() => setPanelOpen(false)}
          className="md:hidden absolute inset-0 z-10 bg-black/30 backdrop-blur-[2px]"
        />
      )}

      {/* Collapsible panel: bottom sheet on mobile, left drawer on desktop */}
      <aside
        className={`absolute z-20 glass-strong overflow-hidden transition-transform duration-300 ease-out
          left-0 right-0 bottom-0 max-h-[75vh] rounded-t-2xl
          md:left-3 md:right-auto md:top-3 md:bottom-3 md:w-[320px] md:max-h-none md:rounded-2xl
          ${panelOpen ? "translate-y-0 md:translate-x-0" : "translate-y-full md:translate-y-0 md:-translate-x-[110%]"}`}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-[var(--border)] sticky top-0 bg-[var(--bg-surface)]/80 backdrop-blur z-10">
          <div className="flex items-center gap-2">
            <MapPin className="size-5 text-[var(--accent-primary)]" />
            <h2 className="text-base font-semibold">Géozones</h2>
          </div>
          <button
            onClick={() => setPanelOpen(false)}
            className="size-8 grid place-items-center rounded-md hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            aria-label="Fermer le panneau"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-5" style={{ maxHeight: "calc(75vh - 56px)" }}>
        <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
          Cliquez sur la carte pour déplacer le centre, ou utilisez le bouton <strong>Dessiner</strong> pour tracer la zone manuellement (centre → périmètre).
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
            <Label>Rayon (sans limite)</Label>
            <span className="text-xs mono text-[var(--accent-cyan)]">{fmtRadius(editing.radius)}</span>
          </div>
          {/* Saisie libre en mètres — aucune restriction de taille. */}
          <div className="flex items-center gap-2">
            <input
              type="number" min={10} step={10}
              value={editing.radius}
              onChange={(e) => setEditing({ ...editing, radius: Math.max(0, parseInt(e.target.value) || 0) })}
              className="w-full h-9 px-2.5 rounded-md bg-[var(--bg-elevated)] border border-[var(--border)] text-xs mono outline-none focus:border-[var(--accent-primary)]"
            />
            <span className="text-[11px] text-[var(--text-secondary)]">m</span>
          </div>
          {/* Le curseur reste une commodité (jusqu'à 50 km) ; le champ ci-dessus
              accepte n'importe quelle valeur au-delà. */}
          <input
            type="range" min={50} max={50000} step={50}
            value={Math.min(editing.radius, 50000)}
            onChange={(e) => setEditing({ ...editing, radius: parseInt(e.target.value) })}
            className="w-full accent-[var(--accent-primary)]"
          />
          <div className="flex flex-wrap gap-1.5">
            {[500, 2000, 5000, 15000, 35000].map((r) => (
              <button
                key={r}
                onClick={() => setEditing({ ...editing, radius: r })}
                className={`px-2 h-6 rounded text-[10px] mono transition-colors ${editing.radius === r ? "bg-[var(--accent-primary)] text-[var(--accent-milk)]" : "bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
              >
                {fmtRadius(r)}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1 pt-2 border-t border-[var(--border)]">
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
            const inZone = haversineM(telemetry.lat, telemetry.lng, z.lat, z.lng) <= z.radius;
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
        </div>
      </aside>
    </AppShell>
  );
}


function fmtRadius(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(m % 1000 === 0 ? 0 : 1)} km`;
  return `${Math.round(m)} m`;
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
