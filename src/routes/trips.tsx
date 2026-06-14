import { createFileRoute, Link } from "@tanstack/react-router";
import { Route as RouteIcon, Download, Calendar, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { SectionHero } from "@/components/SectionHero";
import { EmptyState } from "@/components/PageHeader";
import { useApp } from "@/lib/store";
import { fmtDuration } from "@/lib/format";
import { confirm, notify } from "@/components/ConfirmDialog";
import { downloadGPX } from "@/lib/trip-path";
import illusTracking from "@/assets/illus-tracking.png";

export const Route = createFileRoute("/trips")({
  head: () => ({
    meta: [{ title: "Trajets — AutoTrack" }],
  }),
  component: TripsPage,
});

const PERIODS = ["Aujourd'hui", "7 jours", "30 jours", "Tout"] as const;
type PeriodKey = (typeof PERIODS)[number];

function periodStart(period: PeriodKey): number {
  const now = new Date();
  switch (period) {
    case "Aujourd'hui": {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    }
    case "7 jours":
      return Date.now() - 7 * 86_400_000;
    case "30 jours":
      return Date.now() - 30 * 86_400_000;
    case "Tout":
      return 0;
  }
}

function TripsPage() {
  const device = useApp((s) => s.device);
  const trips = useApp((s) => s.trips);
  const [period, setPeriod] = useState<PeriodKey>("7 jours");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const start = periodStart(period);
    const byPeriod = trips.filter((t) => t.date >= start);
    const q = query.trim().toLowerCase();
    if (!q) return byPeriod;
    return byPeriod.filter(
      (t) =>
        t.startAddress.toLowerCase().includes(q) ||
        t.endAddress.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q),
    );
  }, [trips, period, query]);

  const dateRange = useMemo(() => {
    if (filtered.length === 0) return "—";
    const dates = filtered.map((t) => t.date);
    const fmt = (ts: number) => new Date(ts).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
    return `${fmt(Math.min(...dates))} → ${fmt(Math.max(...dates))}`;
  }, [filtered]);

  const onExportAll = async () => {
    if (!device) return;
    const ok = await confirm({
      title: `Exporter ${filtered.length} trajet${filtered.length > 1 ? "s" : ""} ?`,
      description: "Un fichier GPX par trajet sera téléchargé.",
      tone: "info",
      confirmLabel: "Exporter",
    });
    if (ok) {
      for (const t of filtered) await downloadGPX(device.id, t);
      await notify({ title: "Export terminé", description: `${filtered.length} fichier(s) GPX téléchargé(s).`, tone: "success" });
    }
  };

  const totalKm = filtered.reduce((s, t) => s + t.distanceKm, 0);

  return (
    <AppShell>
      <div className="p-4 md:p-8 pb-24 max-w-7xl mx-auto">
        <SectionHero
          eyebrow="Historique des trajets"
          icon={RouteIcon}
          title={`${filtered.length} trajets · ${totalKm.toFixed(1)} km`}
          description="Rejouez chaque trajet seconde par seconde, exportez en GPX pour vos outils favoris ou partagez un lien public temporaire avec vos proches."
          image={illusTracking}
          actions={
            filtered.length > 0 && (
              <button onClick={onExportAll} className="h-10 px-4 rounded-md bg-[var(--accent-primary)] text-[var(--accent-milk)] text-xs font-semibold inline-flex items-center gap-2 hover:opacity-90">
                <Download className="size-4" /> Exporter tout
              </button>
            )
          }
        />

        <div className="flex flex-wrap items-center gap-2 mb-6">
          {PERIODS.map((f) => (
            <button
              key={f}
              onClick={() => setPeriod(f)}
              className={`h-8 px-3 rounded-md text-xs transition-colors ${period === f ? "bg-[var(--accent-primary)]/15 text-[var(--accent-primary)]" : "bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
            >
              {f}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <div className="flex items-center gap-2 h-8 px-3 rounded-md bg-[var(--bg-surface)] border border-[var(--border)]">
              <Calendar className="size-3.5 text-[var(--text-secondary)]" />
              <span className="text-xs mono">{dateRange}</span>
            </div>
            <div className="flex items-center gap-2 h-8 px-3 rounded-md bg-[var(--bg-surface)] border border-[var(--border)] min-w-[180px]">
              <Search className="size-3.5 text-[var(--text-secondary)]" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Adresse, date…"
                className="bg-transparent text-xs flex-1 outline-none placeholder:text-[var(--text-dim)]"
              />
            </div>
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState icon={RouteIcon} title="Aucun trajet" description="Aucun trajet enregistré pour cette période." />
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

                <Link to="/trips/$id" params={{ id: t.id }} className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="text-[11px] mono text-[var(--text-secondary)]">#{t.id}</span>
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
                  <button
                    onClick={async (e) => {
                      e.preventDefault();
                      if (!device) return;
                      const ok = await confirm({
                        title: "Télécharger le GPX ?",
                        description: `Trajet #${t.id} · ${t.distanceKm.toFixed(1)} km`,
                        tone: "info",
                        confirmLabel: "Télécharger",
                      });
                      if (ok) await downloadGPX(device.id, t);
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
