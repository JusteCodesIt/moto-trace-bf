import { createFileRoute } from "@tanstack/react-router";
import { Bell, Shield, CheckCheck, Trash2, MapPin } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PageHeader, EmptyState } from "@/components/PageHeader";
import { useApp } from "@/lib/store";
import { relTime } from "@/lib/format";
import { useState } from "react";

export const Route = createFileRoute("/alerts")({
  head: () => ({ meta: [{ title: "Alertes — MotoTrack BF" }] }),
  component: AlertsPage,
});

const FILTERS = ["Tous", "Chocs", "Mouvement", "Géozone", "Batterie", "Signal", "Vitesse"] as const;

const sevColor: Record<string, string> = {
  critical: "var(--accent-red)",
  warning: "var(--accent-amber)",
  info: "var(--accent-cyan)",
};

function AlertsPage() {
  const { alerts, markAllRead, markAlertRead, unreadAlerts } = useApp();
  const unread = unreadAlerts();
  const [filter, setFilter] = useState<string>("Tous");

  const filtered = filter === "Tous" ? alerts : alerts.filter((a) => a.title.toLowerCase().includes(filter.toLowerCase()));
  const riskScore = Math.min(100, alerts.filter((a) => !a.read).length * 12);

  return (
    <AppShell>
      <PageHeader
        title="Centre d'alertes"
        subtitle={`${unread} non lues sur ${alerts.length} totales`}
        icon={Bell}
        action={
          <button onClick={markAllRead} className="hidden md:inline-flex items-center gap-2 h-9 px-3 rounded-md bg-[var(--bg-elevated)] text-xs">
            <CheckCheck className="size-4" /> Tout marquer lu
          </button>
        }
      />

      <div className="p-4 md:p-8 pb-24 max-w-6xl mx-auto">
        {/* Risk score + counts */}
        <div className="grid md:grid-cols-4 gap-3 mb-6">
          <div className="card-elev p-4 flex items-center gap-4">
            <RiskGauge score={riskScore} />
            <div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">
                Score de risque
              </div>
              <div className="text-xl font-bold mono">{riskScore}/100</div>
            </div>
          </div>
          {[
            { label: "Chocs", value: 2, color: "var(--accent-red)" },
            { label: "Mouvements", value: 5, color: "var(--accent-amber)" },
            { label: "Géozone", value: 1, color: "var(--accent-cyan)" },
          ].map((c) => (
            <div key={c.label} className="card-elev p-4">
              <div className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">{c.label}</div>
              <div className="text-2xl font-bold mono mt-1" style={{ color: c.color }}>
                {c.value}
              </div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-4">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`h-8 px-3 rounded-md text-xs ${filter === f ? "bg-[var(--accent-primary)]/15 text-[var(--accent-primary)]" : "bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Timeline */}
        {filtered.length === 0 ? (
          <EmptyState icon={Shield} title="Tout est tranquille" description="Aucune alerte sur cette période." />
        ) : (
          <div className="space-y-2">
            {filtered.map((a) => (
              <div
                key={a.id}
                className={`card-elev p-4 flex items-start gap-4 border-l-4 ${a.read ? "opacity-60" : ""}`}
                style={{ borderLeftColor: sevColor[a.severity] }}
              >
                <div
                  className="size-9 rounded-lg grid place-items-center shrink-0"
                  style={{ background: `${sevColor[a.severity]}15`, color: sevColor[a.severity] }}
                >
                  <Bell className="size-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-semibold">{a.title}</span>
                    {!a.read && <span className="size-1.5 rounded-full bg-[var(--accent-primary)]" />}
                  </div>
                  <p className="text-xs text-[var(--text-secondary)]">{a.message}</p>
                  <div className="flex items-center gap-3 mt-2 text-[10px] mono text-[var(--text-secondary)]">
                    <span>{new Date(a.timestamp).toLocaleString("fr-FR")}</span>
                    <span>·</span>
                    <span>{relTime(a.timestamp)}</span>
                    {a.lat && (
                      <button className="flex items-center gap-1 text-[var(--accent-cyan)]">
                        <MapPin className="size-3" /> Voir
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {!a.read && (
                    <button
                      onClick={() => markAlertRead(a.id)}
                      className="size-8 grid place-items-center rounded text-[var(--text-secondary)] hover:text-[var(--accent-green)] hover:bg-[var(--bg-elevated)]"
                    >
                      <CheckCheck className="size-4" />
                    </button>
                  )}
                  <button className="size-8 grid place-items-center rounded text-[var(--text-secondary)] hover:text-[var(--accent-red)] hover:bg-[var(--bg-elevated)]">
                    <Trash2 className="size-4" />
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

function RiskGauge({ score }: { score: number }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  const color = score < 30 ? "var(--accent-green)" : score < 70 ? "var(--accent-amber)" : "var(--accent-red)";
  return (
    <svg viewBox="0 0 60 60" className="w-14 h-14 -rotate-90 shrink-0">
      <circle cx="30" cy="30" r={r} stroke="var(--bg-elevated)" strokeWidth="4" fill="none" />
      <circle
        cx="30"
        cy="30"
        r={r}
        stroke={color}
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c - (score / 100) * c}
      />
    </svg>
  );
}
