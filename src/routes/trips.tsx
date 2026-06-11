import { createFileRoute, Link } from "@tanstack/react-router";
import { Route as RouteIcon, Download, Calendar, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { SectionHero } from "@/components/SectionHero";
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

const PERIODS = ["Aujourd'hui", "7 jours", "30 jours", "Ce mois"] as const;

function TripsPage() {
  const trips = useApp((s) => s.trips);
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>("7 jours");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return trips;
    return trips.filter(
      (t) =>
        t.startAddress.toLowerCase().includes(q) ||
        t.endAddress.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q),
    );
  }, [trips, query]);

  const onExportAll = async () => {
    const ok = await confirm({
      title: `Exporter ${filtered.length} trajet${filtered.length > 1 ? "s" : ""} ?`,
      description: "Un fichier GPX par trajet sera téléchargé.",
      tone: "info",
      confirmLabel: "Exporter",
    });
    if (ok) {
      filtered.forEach((t) => downloadGPX(t));
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
            <button onClick={onExportAll} className="h-10 px-4 rounded-md bg-[var(--accent-primary)] text-[var(--accent-milk)] text-xs font-semibold inline-flex items-center gap-2 hover:opacity-90">
              <Download className="size-4" /> Exporter tout
            </button>
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
              <span className="text-xs mono">12 mai → 19 mai</span>
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

        <div className="space-y-2">
          {filtered.map((t) => (
            <div
              key={t.id}
              className="card-elev p-4 flex items-center gap-4 hover:border-[var(--border-active)] hover:bg-[var(--bg-elevated)]/40 transition-all group"
            >
              <div className="hidden md:block w-[140px] h-[70px] rounded-md bg-[var(--bg-elevated)] border border-[var(--border)] shrink-0 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent-cyan)]/10 to-transparent" />
                <svg viewBox="0 0 140 70" className="w-full h-full">
                  <path d="M10 50 Q 40 20 70 35 T 130 25" stroke="var(--accent-cyan)" strokeWidth="2" fill="none" strokeLinecap="round" />
                  <circle cx="10" cy="50" r="3" fill="var(--accent-green)" />
                  <circle cx="130" cy="25" r="3" fill="var(--accent-red)" />
                </svg>
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
                    const ok = await confirm({
                      title: "Télécharger le GPX ?",
                      description: `Trajet #${t.id} · ${t.distanceKm.toFixed(1)} km`,
                      tone: "info",
                      confirmLabel: "Télécharger",
                    });
                    if (ok) downloadGPX(t);
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
