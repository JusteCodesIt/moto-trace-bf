import { createFileRoute } from "@tanstack/react-router";
import { BarChart3, TrendingUp, TrendingDown } from "lucide-react";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { BarChart, Bar, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";

export const Route = createFileRoute("/stats")({
  head: () => ({ meta: [{ title: "Analytics — MotoTrack BF" }] }),
  component: StatsPage,
});

const weekData = Array.from({ length: 7 }, (_, i) => ({
  day: ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"][i],
  km: 10 + Math.random() * 30,
}));

const speedData = Array.from({ length: 24 }, (_, i) => ({
  h: `${i}h`,
  v: 20 + Math.random() * 40,
}));

const KPIS = [
  { label: "Total km", value: "247.8", delta: "+12%", up: true },
  { label: "Temps trajet", value: "14h 23", delta: "+8%", up: true },
  { label: "Trajets", value: "32", delta: "-3%", up: false },
  { label: "Vitesse max", value: "94 km/h", delta: "+5%", up: false },
];

const SUBSCORES = [
  { label: "Accélérations", value: 82 },
  { label: "Freinages", value: 75 },
  { label: "Virages", value: 88 },
  { label: "Excès vitesse", value: 65 },
  { label: "Conduite nuit", value: 90 },
];

function StatsPage() {
  return (
    <AppShell>
      <PageHeader
        title="Analytics & score conducteur"
        subtitle="Insights sur les 7 derniers jours"
        icon={BarChart3}
      />

      <div className="p-4 md:p-8 pb-24 max-w-7xl mx-auto space-y-6">
        {/* Period */}
        <div className="flex bg-[var(--bg-surface)] rounded-md p-1 w-fit border border-[var(--border)]">
          {["7 jours", "Mois", "Trimestre", "Année"].map((p, i) => (
            <button
              key={p}
              className={`h-8 px-4 text-xs rounded ${i === 0 ? "bg-[var(--bg-elevated)] text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}`}
            >
              {p}
            </button>
          ))}
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {KPIS.map((k) => (
            <div key={k.label} className="card-elev p-4">
              <div className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">{k.label}</div>
              <div className="text-2xl font-bold mono mt-1">{k.value}</div>
              <div
                className="text-[11px] mono mt-1 flex items-center gap-1"
                style={{ color: k.up ? "var(--accent-green)" : "var(--accent-red)" }}
              >
                {k.up ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                {k.delta}
              </div>
            </div>
          ))}
        </div>

        {/* Driver score */}
        <div className="card-elev p-6">
          <div className="grid md:grid-cols-[auto_1fr] gap-8 items-center">
            <div className="flex items-center gap-5">
              <ScoreGauge score={78} />
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">
                  Score conducteur
                </div>
                <div className="text-4xl font-bold mono text-[var(--accent-violet)]">78<span className="text-base text-[var(--text-secondary)]">/100</span></div>
                <div className="text-xs text-[var(--text-secondary)] mt-1">Bon conducteur</div>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {SUBSCORES.map((s) => (
                <div key={s.label}>
                  <div className="text-[10px] text-[var(--text-secondary)]">{s.label}</div>
                  <div className="text-lg font-bold mono">{s.value}</div>
                  <div className="h-1 bg-[var(--bg-elevated)] rounded-full mt-1 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${s.value}%`,
                        background: s.value > 80 ? "var(--accent-green)" : s.value > 60 ? "var(--accent-amber)" : "var(--accent-red)",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-6 p-3 rounded-md bg-[var(--accent-amber)]/10 border border-[var(--accent-amber)]/30 text-xs text-[var(--accent-amber)]">
            ⚠ 3 freinages forts détectés mardi — vérifiez la distance de sécurité
          </div>
        </div>

        {/* Charts */}
        <div className="grid md:grid-cols-2 gap-4">
          <div className="card-elev p-5">
            <h3 className="text-xs uppercase tracking-wider text-[var(--text-secondary)] font-semibold mb-4">
              Distance par jour
            </h3>
            <div className="h-[200px]">
              <ResponsiveContainer>
                <BarChart data={weekData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="day" stroke="var(--text-secondary)" fontSize={11} />
                  <YAxis stroke="var(--text-secondary)" fontSize={11} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--bg-elevated)",
                      border: "1px solid var(--border-active)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="km" fill="var(--accent-cyan)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card-elev p-5">
            <h3 className="text-xs uppercase tracking-wider text-[var(--text-secondary)] font-semibold mb-4">
              Vitesse moyenne par heure
            </h3>
            <div className="h-[200px]">
              <ResponsiveContainer>
                <LineChart data={speedData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="h" stroke="var(--text-secondary)" fontSize={11} interval={3} />
                  <YAxis stroke="var(--text-secondary)" fontSize={11} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--bg-elevated)",
                      border: "1px solid var(--border-active)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="v"
                    stroke="var(--accent-violet)"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function ScoreGauge({ score }: { score: number }) {
  const r = 44;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 100 100" className="w-24 h-24 -rotate-90 shrink-0">
      <circle cx="50" cy="50" r={r} stroke="var(--bg-elevated)" strokeWidth="7" fill="none" />
      <circle
        cx="50"
        cy="50"
        r={r}
        stroke="var(--accent-violet)"
        strokeWidth="7"
        fill="none"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c - (score / 100) * c}
      />
    </svg>
  );
}
