import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import {
  Wrench, Plus, Truck, Fuel, Clock, AlertTriangle,
  CheckCircle2, XCircle, Calendar, ChevronRight, Trash2,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { confirm, notify } from "@/components/ConfirmDialog";
import { supabase } from "@/integrations/supabase/client";
import { relTime } from "@/lib/format";

export const Route = createFileRoute("/maintenance")({
  head: () => ({ meta: [{ title: "Maintenance — AutoTrack" }] }),
  component: MaintenancePage,
});

// JMC Grand Avenue specs — source: jmcg-global.com/products_details/12
const JMC_SPECS = {
  engine: "2.0T Diesel (JX4D20A6L)",
  power: "163 ch / 3600 tr/min",
  torque: "360 Nm / 1600-2600 tr/min",
  transmission: "ZF 8AT",
  fuelTank: "75 L",
  fuelConsumption: 8.5, // L/100km NEDC
  oilChangeKm: 10000,
  oilChangeMonths: 6,
  majorServiceKm: 40000,
  tireRotationKm: 15000,
  brakeInspectionKm: 30000,
  coolantChangeKm: 60000,
  transmissionFluidKm: 80000,
  dimensions: "5365×1900×1815 mm",
  wheelbase: "3120 mm",
  payload: "1030 kg",
  towingCapacity: "2500 kg",
};

const AVAILABILITY_META: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  available:   { label: "Disponible",    color: "var(--accent-green)", icon: CheckCircle2 },
  in_use:      { label: "En service",    color: "var(--accent-cyan)",  icon: Truck },
  maintenance: { label: "En maintenance", color: "var(--accent-amber)", icon: Wrench },
  broken:      { label: "En panne",      color: "var(--accent-red)",   icon: XCircle },
  reserved:    { label: "Réservé",       color: "var(--accent-violet)", icon: Clock },
};

const RECORD_TYPES: Record<string, string> = {
  maintenance: "Entretien",
  repair: "Réparation",
  inspection: "Inspection",
  tire: "Pneumatiques",
  oil: "Vidange",
};

interface Device { id: string; name: string; internal_id: string | null; vehicle_model: string | null; vehicle_year: number | null }
interface MaintenanceRecord {
  id: string; device_id: string; record_type: string; title: string; description: string | null;
  cost_xof: number; mileage_km: number | null; performed_at: string; next_due_at: string | null;
  parts_replaced: string[] | null; garage: string | null; status: string; created_at: string;
}
interface VehicleStatus {
  device_id: string; availability: string; total_km: number; avg_fuel_lph: number | null;
  engine_hours: number; last_maintenance_at: string | null; next_maintenance_at: string | null; notes: string | null;
}

function MaintenancePage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [statuses, setStatuses] = useState<Record<string, VehicleStatus>>({});
  const [showAdd, setShowAdd] = useState(false);
  const [view, setView] = useState<"fleet" | "detail">("fleet");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("devices")
        .select("id, name, internal_id, vehicle_model, vehicle_year")
        .order("created_at", { ascending: false });
      if (data) setDevices(data as Device[]);

      const { data: vs } = await supabase.from("vehicle_status").select("*");
      if (vs) {
        const map: Record<string, VehicleStatus> = {};
        for (const s of vs) map[s.device_id] = s as VehicleStatus;
        setStatuses(map);
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    (async () => {
      const { data } = await supabase.from("maintenance_records")
        .select("*").eq("device_id", selectedId)
        .order("performed_at", { ascending: false }).limit(50);
      if (data) setRecords(data as MaintenanceRecord[]);
    })();
  }, [selectedId]);

  const totalCosts = useMemo(() => {
    const byDevice: Record<string, number> = {};
    records.forEach((r) => { byDevice[r.device_id] = (byDevice[r.device_id] ?? 0) + r.cost_xof; });
    return byDevice;
  }, [records]);

  const fleetStats = useMemo(() => {
    const total = devices.length;
    const available = devices.filter((d) => (statuses[d.id]?.availability ?? "available") === "available").length;
    const inMaintenance = devices.filter((d) => statuses[d.id]?.availability === "maintenance").length;
    const broken = devices.filter((d) => statuses[d.id]?.availability === "broken").length;
    return { total, available, inMaintenance, broken, utilizationPct: total > 0 ? Math.round((available / total) * 100) : 0 };
  }, [devices, statuses]);

  const selectedDevice = devices.find((d) => d.id === selectedId);
  const selectedStatus = selectedId ? statuses[selectedId] : null;

  const updateAvailability = async (deviceId: string, availability: string) => {
    await supabase.from("vehicle_status").upsert({ device_id: deviceId, availability, updated_at: new Date().toISOString() }, { onConflict: "device_id" });
    setStatuses((s) => ({ ...s, [deviceId]: { ...(s[deviceId] ?? { device_id: deviceId, total_km: 0, engine_hours: 0, avg_fuel_lph: null, last_maintenance_at: null, next_maintenance_at: null, notes: null, updated_at: new Date().toISOString() }), availability, updated_at: new Date().toISOString() } }));
  };

  const addRecord = async (r: Omit<MaintenanceRecord, "id" | "created_at">) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data, error } = await supabase.from("maintenance_records")
      .insert({ ...r, owner_id: user.id }).select().single();
    if (error) { await notify({ title: "Erreur", description: error.message, tone: "danger" }); return; }
    setRecords((prev) => [data as MaintenanceRecord, ...prev]);
    await notify({ title: "Enregistrement ajouté", tone: "success" });
    setShowAdd(false);
  };

  const deleteRecord = async (id: string) => {
    const ok = await confirm({ title: "Supprimer cet enregistrement ?", description: "Cette action est irréversible.", tone: "danger", confirmLabel: "Supprimer" });
    if (!ok) return;
    await supabase.from("maintenance_records").delete().eq("id", id);
    setRecords((prev) => prev.filter((r) => r.id !== id));
  };

  return (
    <AppShell>
      <div className="p-4 md:p-6 pb-24 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-lg bg-[var(--accent-amber)]/10 grid place-items-center">
              <Wrench className="size-4 text-[var(--accent-amber)]" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Maintenance & santé</h1>
              <p className="text-xs text-[var(--text-secondary)]">JMC Grand Avenue · {devices.length} véhicule{devices.length !== 1 ? "s" : ""}</p>
            </div>
          </div>
          <div className="flex gap-1 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg p-0.5">
            <button onClick={() => setView("fleet")} className={`px-3 py-1 text-xs rounded-md ${view === "fleet" ? "bg-[var(--accent-primary)] text-[var(--accent-milk)]" : "text-[var(--text-secondary)]"}`}>Flotte</button>
            <button onClick={() => { if (selectedId) setView("detail"); }} className={`px-3 py-1 text-xs rounded-md ${view === "detail" ? "bg-[var(--accent-primary)] text-[var(--accent-milk)]" : "text-[var(--text-secondary)]"}`}>Détail</button>
          </div>
        </div>

        {view === "fleet" ? (
          <>
            {/* Fleet overview stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
              {[
                { label: "Disponibles", value: fleetStats.available, color: "var(--accent-green)" },
                { label: "En service", value: fleetStats.total - fleetStats.available - fleetStats.inMaintenance - fleetStats.broken, color: "var(--accent-cyan)" },
                { label: "En maintenance", value: fleetStats.inMaintenance, color: "var(--accent-amber)" },
                { label: "En panne", value: fleetStats.broken, color: "var(--accent-red)" },
              ].map((s) => (
                <div key={s.label} className="card-elev p-3">
                  <div className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">{s.label}</div>
                  <div className="text-xl font-bold mono mt-1" style={{ color: s.color }}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* JMC Specs card */}
            <div className="card-elev p-4 mb-5">
              <h3 className="text-sm font-semibold mb-3">Spécifications JMC Grand Avenue</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2 text-xs">
                {[
                  { k: "Moteur", v: JMC_SPECS.engine },
                  { k: "Puissance", v: JMC_SPECS.power },
                  { k: "Couple", v: JMC_SPECS.torque },
                  { k: "Boîte", v: JMC_SPECS.transmission },
                  { k: "Réservoir", v: JMC_SPECS.fuelTank },
                  { k: "Conso. réf.", v: `${JMC_SPECS.fuelConsumption} L/100km` },
                  { k: "Charge utile", v: JMC_SPECS.payload },
                  { k: "Remorquage", v: JMC_SPECS.towingCapacity },
                ].map((s) => (
                  <div key={s.k} className="flex justify-between py-1 border-b border-[var(--border)] last:border-0">
                    <span className="text-[var(--text-secondary)]">{s.k}</span>
                    <span className="mono font-medium">{s.v}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 pt-3 border-t border-[var(--border)]">
                <p className="text-[10px] text-[var(--text-secondary)] font-semibold uppercase tracking-wider mb-2">Intervalles d'entretien recommandés</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                  {[
                    { k: "Vidange", v: `${(JMC_SPECS.oilChangeKm / 1000).toFixed(0)}k km / ${JMC_SPECS.oilChangeMonths} mois` },
                    { k: "Rotation pneus", v: `${(JMC_SPECS.tireRotationKm / 1000).toFixed(0)}k km` },
                    { k: "Freins", v: `${(JMC_SPECS.brakeInspectionKm / 1000).toFixed(0)}k km` },
                    { k: "Révision majeure", v: `${(JMC_SPECS.majorServiceKm / 1000).toFixed(0)}k km` },
                    { k: "Liquide refroid.", v: `${(JMC_SPECS.coolantChangeKm / 1000).toFixed(0)}k km` },
                    { k: "Huile boîte", v: `${(JMC_SPECS.transmissionFluidKm / 1000).toFixed(0)}k km` },
                  ].map((s) => (
                    <div key={s.k} className="p-2 rounded-lg bg-[var(--bg-elevated)] flex justify-between">
                      <span className="text-[var(--text-secondary)]">{s.k}</span>
                      <span className="mono">{s.v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Vehicle list */}
            <h3 className="text-xs uppercase tracking-wider text-[var(--text-secondary)] font-semibold mb-3">Véhicules ({devices.length})</h3>
            <div className="space-y-2">
              {devices.map((d) => {
                const st = statuses[d.id];
                const avail = st?.availability ?? "available";
                const meta = AVAILABILITY_META[avail] ?? AVAILABILITY_META.available;
                const Icon = meta.icon;
                return (
                  <div key={d.id} className="card-elev p-3 flex items-center gap-3 cursor-pointer hover:bg-[var(--bg-elevated)]/50 transition-colors"
                    onClick={() => { setSelectedId(d.id); setView("detail"); }}>
                    <div className="size-8 rounded-lg grid place-items-center" style={{ background: `${meta.color}15`, color: meta.color }}>
                      <Icon className="size-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{d.internal_id ?? d.name}</div>
                      <div className="text-[11px] text-[var(--text-secondary)]">{d.vehicle_model ?? "JMC Grand Avenue"} {d.vehicle_year ? `· ${d.vehicle_year}` : ""}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: `${meta.color}15`, color: meta.color }}>{meta.label}</span>
                      {st?.total_km ? <span className="text-[11px] mono text-[var(--text-secondary)]">{st.total_km.toFixed(0)} km</span> : null}
                      <ChevronRight className="size-4 text-[var(--text-dim)]" />
                    </div>
                  </div>
                );
              })}
              {devices.length === 0 && (
                <div className="card-elev p-6 text-center text-sm text-[var(--text-secondary)]">
                  Aucun véhicule enregistré. <a href="/fleet" className="text-[var(--accent-primary)] hover:underline">Ajouter un véhicule</a>
                </div>
              )}
            </div>
          </>
        ) : selectedDevice ? (
          <>
            {/* Detail view */}
            <button onClick={() => setView("fleet")} className="flex items-center gap-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] mb-4">
              ← Retour à la flotte
            </button>

            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold">{selectedDevice.internal_id ?? selectedDevice.name}</h2>
                <p className="text-xs text-[var(--text-secondary)]">{selectedDevice.vehicle_model ?? "JMC Grand Avenue"} {selectedDevice.vehicle_year ?? ""}</p>
              </div>
              <div className="flex gap-2">
                <select
                  value={selectedStatus?.availability ?? "available"}
                  onChange={(e) => updateAvailability(selectedId, e.target.value)}
                  className="h-8 px-2 text-xs rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] outline-none"
                >
                  {Object.entries(AVAILABILITY_META).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
                <button onClick={() => setShowAdd(true)} className="h-8 px-3 text-xs rounded-lg bg-[var(--accent-primary)] text-[var(--accent-milk)] font-medium flex items-center gap-1">
                  <Plus className="size-3.5" /> Ajouter
                </button>
              </div>
            </div>

            {/* Vehicle health cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
              <div className="card-elev p-3">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[var(--text-secondary)] mb-1"><Truck className="size-3" /> Kilométrage</div>
                <div className="text-lg font-bold mono">{(selectedStatus?.total_km ?? 0).toFixed(0)} <span className="text-xs font-normal">km</span></div>
              </div>
              <div className="card-elev p-3">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[var(--text-secondary)] mb-1"><Fuel className="size-3" /> Conso. moy.</div>
                <div className="text-lg font-bold mono">
                  {selectedStatus?.avg_fuel_lph ? selectedStatus.avg_fuel_lph.toFixed(1) : "—"}
                  <span className="text-xs font-normal"> L/100km</span>
                </div>
                {selectedStatus?.avg_fuel_lph && (
                  <div className={`text-[10px] mt-0.5 ${selectedStatus.avg_fuel_lph > JMC_SPECS.fuelConsumption * 1.2 ? "text-[var(--accent-red)]" : "text-[var(--accent-green)]"}`}>
                    {selectedStatus.avg_fuel_lph > JMC_SPECS.fuelConsumption * 1.2 ? "↑ Supérieur" : "✓ Normal"} vs réf. {JMC_SPECS.fuelConsumption}
                  </div>
                )}
              </div>
              <div className="card-elev p-3">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[var(--text-secondary)] mb-1"><Clock className="size-3" /> Heures moteur</div>
                <div className="text-lg font-bold mono">{(selectedStatus?.engine_hours ?? 0).toFixed(0)} <span className="text-xs font-normal">h</span></div>
              </div>
              <div className="card-elev p-3">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[var(--text-secondary)] mb-1"><Calendar className="size-3" /> Proch. entretien</div>
                <div className="text-sm font-medium">
                  {selectedStatus?.next_maintenance_at ? new Date(selectedStatus.next_maintenance_at).toLocaleDateString("fr-FR") : "Non planifié"}
                </div>
                {selectedStatus?.next_maintenance_at && (
                  <div className={`text-[10px] mt-0.5 ${new Date(selectedStatus.next_maintenance_at) < new Date() ? "text-[var(--accent-red)]" : "text-[var(--text-secondary)]"}`}>
                    {new Date(selectedStatus.next_maintenance_at) < new Date() ? "⚠ En retard" : relTime(new Date(selectedStatus.next_maintenance_at).getTime())}
                  </div>
                )}
              </div>
            </div>

            {/* Maintenance alerts based on JMC specs */}
            {selectedStatus?.total_km ? (
              <div className="space-y-2 mb-5">
                {[
                  { label: "Vidange", interval: JMC_SPECS.oilChangeKm, icon: "🛢" },
                  { label: "Rotation pneus", interval: JMC_SPECS.tireRotationKm, icon: "🔧" },
                  { label: "Inspection freins", interval: JMC_SPECS.brakeInspectionKm, icon: "🛑" },
                  { label: "Révision majeure", interval: JMC_SPECS.majorServiceKm, icon: "⚙" },
                ].map((item) => {
                  const km = selectedStatus.total_km;
                  const remaining = item.interval - (km % item.interval);
                  const pct = Math.round(((item.interval - remaining) / item.interval) * 100);
                  const urgent = remaining < item.interval * 0.1;
                  return (
                    <div key={item.label} className="card-elev p-3 flex items-center gap-3">
                      <AlertTriangle className={`size-4 shrink-0 ${urgent ? "text-[var(--accent-red)]" : "text-[var(--text-dim)]"}`} />
                      <div className="flex-1">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="font-medium">{item.label}</span>
                          <span className="mono text-[var(--text-secondary)]">{remaining.toFixed(0)} km restants</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-[var(--bg-elevated)] overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: urgent ? "var(--accent-red)" : pct > 70 ? "var(--accent-amber)" : "var(--accent-green)" }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}

            {/* Maintenance history */}
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs uppercase tracking-wider text-[var(--text-secondary)] font-semibold">Historique ({records.length})</h3>
              {records.length > 0 && (
                <span className="text-xs mono text-[var(--text-secondary)]">
                  Total : {records.reduce((a, r) => a + r.cost_xof, 0).toLocaleString("fr-FR")} FCFA
                </span>
              )}
            </div>
            {records.length === 0 ? (
              <div className="card-elev p-6 text-center text-sm text-[var(--text-secondary)]">
                Aucun enregistrement. Cliquez sur "Ajouter" pour créer le premier.
              </div>
            ) : (
              <div className="space-y-2">
                {records.map((r) => (
                  <div key={r.id} className="card-elev p-3 flex items-start gap-3">
                    <div className={`size-8 rounded-lg grid place-items-center shrink-0 ${r.record_type === "repair" ? "bg-[var(--accent-red)]/10 text-[var(--accent-red)]" : "bg-[var(--accent-amber)]/10 text-[var(--accent-amber)]"}`}>
                      <Wrench className="size-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{r.title}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-elevated)] text-[var(--text-secondary)]">{RECORD_TYPES[r.record_type] ?? r.record_type}</span>
                      </div>
                      {r.description && <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">{r.description}</p>}
                      <div className="flex items-center gap-3 mt-1 text-[10px] text-[var(--text-dim)] mono">
                        <span>{new Date(r.performed_at).toLocaleDateString("fr-FR")}</span>
                        {r.cost_xof > 0 && <span>{r.cost_xof.toLocaleString("fr-FR")} FCFA</span>}
                        {r.mileage_km && <span>{r.mileage_km.toFixed(0)} km</span>}
                        {r.garage && <span>{r.garage}</span>}
                      </div>
                    </div>
                    <button onClick={() => deleteRecord(r.id)} className="size-7 grid place-items-center rounded hover:bg-[var(--bg-elevated)] text-[var(--text-dim)] hover:text-[var(--accent-red)]">
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="card-elev p-6 text-center text-sm text-[var(--text-secondary)]">
            Sélectionnez un véhicule pour voir son historique.
          </div>
        )}
      </div>

      {/* Add record modal */}
      {showAdd && selectedId && <AddRecordModal deviceId={selectedId} onClose={() => setShowAdd(false)} onAdd={addRecord} />}
    </AppShell>
  );
}

function AddRecordModal({ deviceId, onClose, onAdd }: { deviceId: string; onClose: () => void; onAdd: (r: any) => void }) {
  const [type, setType] = useState("maintenance");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [cost, setCost] = useState("");
  const [mileage, setMileage] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [garage, setGarage] = useState("");

  const submit = () => {
    if (!title.trim()) return;
    onAdd({
      device_id: deviceId,
      record_type: type,
      title: title.trim(),
      description: description.trim() || null,
      cost_xof: parseInt(cost) || 0,
      mileage_km: parseFloat(mileage) || null,
      performed_at: date,
      garage: garage.trim() || null,
      status: "completed",
      parts_replaced: null,
      next_due_at: null,
      next_due_km: null,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl w-full max-w-md shadow-2xl p-6">
        <h2 className="text-base font-semibold mb-4">Nouvel enregistrement</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-1.5">Type</label>
            <select value={type} onChange={(e) => setType(e.target.value)} className="w-full h-9 px-3 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] text-sm outline-none">
              {Object.entries(RECORD_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-1.5">Titre</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ex: Vidange + filtre huile" className="w-full h-9 px-3 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] text-sm outline-none focus:border-[var(--accent-primary)]" />
          </div>
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-1.5">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] text-sm outline-none focus:border-[var(--accent-primary)] resize-none" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-1.5">Coût (FCFA)</label>
              <input value={cost} onChange={(e) => setCost(e.target.value)} type="number" placeholder="50000" className="w-full h-9 px-3 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] text-sm outline-none focus:border-[var(--accent-primary)]" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-1.5">Km</label>
              <input value={mileage} onChange={(e) => setMileage(e.target.value)} type="number" placeholder="12500" className="w-full h-9 px-3 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] text-sm outline-none focus:border-[var(--accent-primary)]" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-1.5">Date</label>
              <input value={date} onChange={(e) => setDate(e.target.value)} type="date" className="w-full h-9 px-3 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] text-sm outline-none focus:border-[var(--accent-primary)]" />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-1.5">Garage</label>
            <input value={garage} onChange={(e) => setGarage(e.target.value)} placeholder="Nom du garage" className="w-full h-9 px-3 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] text-sm outline-none focus:border-[var(--accent-primary)]" />
          </div>
        </div>
        <div className="flex gap-2 justify-end mt-5">
          <button onClick={onClose} className="h-9 px-4 text-sm rounded-lg border border-[var(--border)] text-[var(--text-secondary)]">Annuler</button>
          <button onClick={submit} disabled={!title.trim()} className="h-9 px-4 text-sm rounded-lg bg-[var(--accent-primary)] text-[var(--accent-milk)] font-medium disabled:opacity-40">Enregistrer</button>
        </div>
      </div>
    </div>
  );
}
