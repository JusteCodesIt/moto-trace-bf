import { createFileRoute, Link } from "@tanstack/react-router";
import { Route as RouteIcon, Download, Calendar, Search, Truck, Play, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { SectionHero } from "@/components/SectionHero";
import { EmptyState } from "@/components/PageHeader";
import { useApp, type Trip } from "@/lib/store";
import { fmtDuration } from "@/lib/format";
import { confirm, notify } from "@/components/ConfirmDialog";
import { downloadGPX, deriveTrips } from "@/lib/trip-path";
import { supabase } from "@/integrations/supabase/client";
import illusTracking from "@/assets/illus-tracking.png";

export const Route = createFileRoute("/trips")({
  head: () => ({
    meta: [{ title: "Trajets — AutoTrack" }],
  }),
  component: TripsPage,
});

function fmtISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function TripsPage() {
  const primaryDevice = useApp((s) => s.device);
  const storeTrips = useApp((s) => s.trips);

  const [devices, setDevices] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");

  const today = new Date();
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const [dateFrom, setDateFrom] = useState(fmtISODate(weekAgo));
  const [dateTo, setDateTo] = useState(fmtISODate(today));
  const [timeFrom, setTimeFrom] = useState("00:00");
  const [timeTo, setTimeTo] = useState("23:59");
  const [query, setQuery] = useState("");

  const [dbTrips, setDbTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Load device list on mount
  useEffect(() => {
    (async () => {
      const { listMyDevices } = await import("@/lib/devices.functions");
      const list = await listMyDevices();
      const mapped = list.map((d: any) => ({ id: d.id, name: d.internal_id ?? d.name }));
      setDevices(mapped);
      if (primaryDevice) setSelectedDeviceId(primaryDevice.id);
      else if (mapped.length > 0) setSelectedDeviceId(mapped[0].id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Trips to display: either from store (current device, realtime) or from DB search
  const isCurrentDevice = selectedDeviceId === primaryDevice?.id;
  const activeTrips = hasSearched ? dbTrips : (isCurrentDevice ? storeTrips : []);

  const filtered = useMemo(() => {
    const fromMs = new Date(dateFrom + "T00:00:00").getTime();
    const toMs = new Date(dateTo + "T23:59:59").getTime();
    const byDate = activeTrips.filter((t) => t.date >= fromMs && t.date <= toMs);
    const q = query.trim().toLowerCase();
    if (!q) return byDate;
    return byDate.filter(
      (t) =>
        t.startAddress.toLowerCase().includes(q) ||
        t.endAddress.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q),
    );
  }, [activeTrips, dateFrom, dateTo, query]);

  const loadHistory = async () => {
    if (!selectedDeviceId) return;
    setLoading(true);
    setHasSearched(true);
    try {
      const from = new Date(dateFrom + "T00:00:00").toISOString();
      const to = new Date(dateTo + "T23:59:59").toISOString();
      const { data } = await supabase
        .from("telemetry")
        .select("lat,lng,speed_kmh,heading,engine_on,recorded_at")
        .eq("device_id", selectedDeviceId)
        .gte("recorded_at", from)
        .lte("recorded_at", to)
        .order("recorded_at", { ascending: true })
        .limit(10000);

      if (data && data.length > 0) {
        const trips = deriveTrips(data as any, false);
        setDbTrips(trips);
      } else {
        setDbTrips([]);
      }
    } catch {
      await notify({ title: "Erreur de chargement", tone: "danger" });
      setDbTrips([]);
    } finally {
      setLoading(false);
    }
  };

  // Auto-load when switching devices (if not the primary one already in store)
  useEffect(() => {
    if (!selectedDeviceId) return;
    if (isCurrentDevice && !hasSearched) return;
    setHasSearched(false);
    setDbTrips([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDeviceId]);

  const totalKm = filtered.reduce((s, t) => s + t.distanceKm, 0);
  const selectedDeviceName = devices.find((d) => d.id === selectedDeviceId)?.name ?? "—";

  const onExportAll = async () => {
    if (!selectedDeviceId) return;
    const ok = await confirm({
      title: `Exporter ${filtered.length} trajet${filtered.length > 1 ? "s" : ""} ?`,
      description: "Un fichier GPX par trajet sera téléchargé.",
      tone: "info",
      confirmLabel: "Exporter",
    });
    if (ok) {
      for (const t of filtered) await downloadGPX(selectedDeviceId, t);
      await notify({ title: "Export terminé", description: `${filtered.length} fichier(s) GPX téléchargé(s).`, tone: "success" });
    }
  };

  const dateRange = useMemo(() => {
    if (filtered.length === 0) return "—";
    const dates = filtered.map((t) => t.date);
    const fmt = (ts: number) => new Date(ts).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
    return `${fmt(Math.min(...dates))} → ${fmt(Math.max(...dates))}`;
  }, [filtered]);

  // ISO bounds for the whole-vehicle "trajet complet" replay (date + heure).
  const isoBound = (d: string, t: string, sec: string) => {
    const x = new Date(`${d}T${t || "00:00"}:${sec}`);
    return isNaN(x.getTime()) ? "" : x.toISOString();
  };
  const journeyFrom = isoBound(dateFrom, timeFrom, "00");
  const journeyTo = isoBound(dateTo, timeTo, "59");

  return (
    <AppShell>
      <div className="p-4 md:p-8 pb-24 max-w-7xl mx-auto">
        <SectionHero
          eyebrow="Historique des trajets"
          icon={RouteIcon}
          title={`${filtered.length} trajets · ${totalKm.toFixed(1)} km`}
          description="Consultez l'historique de chaque véhicule, rejouez les trajets et exportez en GPX."
          image={illusTracking}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {selectedDeviceId && journeyFrom && journeyTo && (
                <Link
                  to="/trips/$id"
                  params={{ id: "journey" }}
                  search={{ device: selectedDeviceId, from: journeyFrom, to: journeyTo }}
                  className="h-10 px-4 rounded-md bg-[var(--accent-primary)] text-[var(--accent-milk)] text-xs font-semibold inline-flex items-center gap-2 hover:opacity-90"
                  title="Rejouer l'ensemble du trajet du véhicule sur la période sélectionnée"
                >
                  <Play className="size-4" fill="currentColor" /> Rejouer le trajet complet
                </Link>
              )}
              {filtered.length > 0 && (
                <button onClick={onExportAll} className="h-10 px-4 rounded-md bg-[var(--bg-elevated)] border border-[var(--border)] text-xs font-semibold inline-flex items-center gap-2 hover:opacity-90">
                  <Download className="size-4" /> Exporter tout
                </button>
              )}
            </div>
          }
        />

        {/* Filters bar */}
        <div className="card-elev p-3 mb-5">
          <div className="flex flex-wrap items-end gap-3">
            {/* Vehicle selector */}
            <div className="flex-1 min-w-[180px]">
              <label className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-semibold mb-1 block">Véhicule</label>
              <div className="flex items-center gap-2 h-9 px-3 rounded-md bg-[var(--bg-elevated)] border border-[var(--border)]">
                <Truck className="size-3.5 text-[var(--text-secondary)] shrink-0" />
                <select
                  value={selectedDeviceId}
                  onChange={(e) => setSelectedDeviceId(e.target.value)}
                  className="bg-transparent text-sm flex-1 outline-none appearance-none cursor-pointer"
                >
                  {devices.length === 0 && <option value="">Aucun véhicule</option>}
                  {devices.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Date from */}
            <div className="min-w-[140px]">
              <label className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-semibold mb-1 block">Du</label>
              <div className="flex items-center gap-2 h-9 px-3 rounded-md bg-[var(--bg-elevated)] border border-[var(--border)]">
                <Calendar className="size-3.5 text-[var(--text-secondary)] shrink-0" />
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="bg-transparent text-xs mono flex-1 outline-none"
                />
              </div>
            </div>

            {/* Date to */}
            <div className="min-w-[140px]">
              <label className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-semibold mb-1 block">Au</label>
              <div className="flex items-center gap-2 h-9 px-3 rounded-md bg-[var(--bg-elevated)] border border-[var(--border)]">
                <Calendar className="size-3.5 text-[var(--text-secondary)] shrink-0" />
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="bg-transparent text-xs mono flex-1 outline-none"
                />
              </div>
            </div>

            {/* Heure début */}
            <div className="min-w-[110px]">
              <label className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-semibold mb-1 block">Heure début</label>
              <div className="flex items-center gap-2 h-9 px-3 rounded-md bg-[var(--bg-elevated)] border border-[var(--border)]">
                <input
                  type="time"
                  value={timeFrom}
                  onChange={(e) => setTimeFrom(e.target.value)}
                  className="bg-transparent text-xs mono flex-1 outline-none"
                />
              </div>
            </div>

            {/* Heure fin */}
            <div className="min-w-[110px]">
              <label className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-semibold mb-1 block">Heure fin</label>
              <div className="flex items-center gap-2 h-9 px-3 rounded-md bg-[var(--bg-elevated)] border border-[var(--border)]">
                <input
                  type="time"
                  value={timeTo}
                  onChange={(e) => setTimeTo(e.target.value)}
                  className="bg-transparent text-xs mono flex-1 outline-none"
                />
              </div>
            </div>

            {/* Search button */}
            <button
              onClick={loadHistory}
              disabled={loading || !selectedDeviceId}
              className="h-9 px-4 rounded-md bg-[var(--accent-primary)] text-[var(--accent-milk)] text-xs font-semibold inline-flex items-center gap-2 hover:opacity-90 disabled:opacity-40 shrink-0"
            >
              {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}
              Rechercher
            </button>
          </div>

          {/* Text search */}
          <div className="flex items-center gap-2 mt-2">
            <div className="flex items-center gap-2 h-8 px-3 rounded-md bg-[var(--bg-elevated)] border border-[var(--border)] flex-1">
              <Search className="size-3.5 text-[var(--text-secondary)]" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filtrer par adresse…"
                className="bg-transparent text-xs flex-1 outline-none placeholder:text-[var(--text-dim)]"
              />
            </div>
            <div className="flex items-center gap-2 h-8 px-3 rounded-md bg-[var(--bg-surface)] border border-[var(--border)] shrink-0">
              <span className="text-xs mono text-[var(--text-secondary)]">{dateRange}</span>
            </div>
          </div>
        </div>

        {/* Results */}
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-[var(--text-secondary)]">
            <Loader2 className="size-5 animate-spin" />
            Chargement des trajets de {selectedDeviceName}…
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={RouteIcon}
            title="Aucun trajet"
            description={
              hasSearched
                ? `Aucun trajet trouvé pour ${selectedDeviceName} sur cette période.`
                : isCurrentDevice
                  ? "Aucun trajet enregistré pour cette période. Essayez d'élargir la plage de dates."
                  : "Cliquez « Rechercher » pour charger l'historique de ce véhicule."
            }
          />
        ) : (
          <div className="space-y-2">
            {filtered.map((t) => (
              <div
                key={t.id}
                className="card-elev p-4 flex items-center gap-4 hover:border-[var(--border-active)] hover:bg-[var(--bg-elevated)]/40 transition-all group"
              >
                <div className="hidden md:grid w-[140px] h-[70px] rounded-md bg-[var(--bg-elevated)] border border-[var(--border)] shrink-0 place-items-center">
                  <RouteIcon className="size-6 text-[var(--accent-cyan)]/60" />
                </div>

                <Link to="/trips/$id" params={{ id: t.id }} search={{ device: selectedDeviceId }} className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="text-xs text-[var(--text-secondary)]" suppressHydrationWarning>
                      {new Date(t.date).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })}
                    </span>
                    <StatusBadge status={t.status} />
                  </div>
                  <div className="text-sm font-medium truncate">
                    {t.startAddress} <span className="text-[var(--text-dim)]">→</span> {t.endAddress}
                  </div>
                </Link>

                <div className="hidden md:flex items-center gap-5 shrink-0">
                  <Metric label="km" value={t.distanceKm.toFixed(1)} />
                  <Metric label="durée" value={fmtDuration(t.durationMin)} />
                  <Metric label="moy" value={`${t.avgSpeed}`} />
                  <Metric label="max" value={`${t.maxSpeed}`} tone="amber" />
                  <Link
                    to="/trips/$id"
                    params={{ id: t.id }}
                    search={{ device: selectedDeviceId }}
                    className="size-8 grid place-items-center rounded text-[var(--text-secondary)] hover:text-[var(--accent-primary)] hover:bg-[var(--bg-elevated)]"
                    title="Relire le trajet"
                  >
                    <Play className="size-4" fill="currentColor" />
                  </Link>
                  <button
                    onClick={async (e) => {
                      e.preventDefault();
                      if (!selectedDeviceId) return;
                      const ok = await confirm({
                        title: "Télécharger le GPX ?",
                        description: `Trajet · ${t.distanceKm.toFixed(1)} km`,
                        tone: "info",
                        confirmLabel: "Télécharger",
                      });
                      if (ok) await downloadGPX(selectedDeviceId, t);
                    }}
                    className="size-8 grid place-items-center rounded text-[var(--text-secondary)] hover:text-[var(--accent-primary)] hover:bg-[var(--bg-elevated)]"
                    aria-label="Exporter GPX"
                  >
                    <Download className="size-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "amber" }) {
  return (
    <div className="text-right">
      <div
        className="text-sm font-semibold mono"
        style={{ color: tone === "amber" ? "var(--accent-amber)" : undefined }}
      >
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">{label}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: "completed" | "active" | "interrupted" }) {
  const map = {
    completed: { label: "Complété", color: "var(--accent-green)" },
    active: { label: "En cours", color: "var(--accent-cyan)" },
    interrupted: { label: "Interrompu", color: "var(--accent-amber)" },
  } as const;
  const s = map[status];
  return (
    <span
      className="text-[9px] mono uppercase tracking-wider px-1.5 py-0.5 rounded"
      style={{ background: `${s.color}20`, color: s.color }}
    >
      {s.label}
    </span>
  );
}
