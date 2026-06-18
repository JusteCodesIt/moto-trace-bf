import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { FileBarChart, AlertTriangle, Download, Loader2, TrendingDown, TrendingUp, Sparkles } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { SectionHero } from "@/components/SectionHero";
import { notify } from "@/components/ConfirmDialog";
import illusSettings from "@/assets/illus-settings.png";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reports")({
  head: () => ({ meta: [{ title: "Rapports — AutoTrack" }] }),
  component: ReportsPage,
});

interface AlertRow {
  id: string;
  device_id: string;
  kind: string;
  severity: "critical" | "warning" | "info";
  title: string;
  message: string;
  created_at: string;
}

interface EngineScoreRow {
  device_id: string;
  period_start: string;
  period_end: string;
  score: number;
  km_driven: number;
  shock_count: number;
  hard_brake_count: number;
  hard_accel_count: number;
  rollover_count: number;
  night_minutes: number;
  overspeed_count: number;
}

interface DeviceRow {
  id: string;
  internal_id: string | null;
  name: string;
}

function ReportsPage() {
  const [anomalies, setAnomalies] = useState<AlertRow[]>([]);
  const [scores, setScores] = useState<EngineScoreRow[]>([]);
  const [deviceNames, setDeviceNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<"7d" | "30d" | "90d">("30d");

  const load = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
      const since = new Date(Date.now() - days * 86400000).toISOString();

      const { data: alertRows } = await supabase
        .from("alerts")
        .select("id, device_id, kind, severity, title, message, created_at")
        .gte("created_at", since)
        .in("severity", ["warning", "critical"])
        .order("created_at", { ascending: false })
        .limit(200);
      setAnomalies((alertRows ?? []) as AlertRow[]);

      const { data: scoreRows } = await (supabase as any)
        .from("engine_scores")
        .select("*")
        .eq("owner_id", user.id)
        .gte("period_end", since.slice(0, 10))
        .order("period_end", { ascending: false });
      setScores((scoreRows ?? []) as EngineScoreRow[]);

      const { data: deviceRows } = await (supabase as any)
        .from("devices")
        .select("id, internal_id, name")
        .eq("owner_id", user.id);
      const map = new Map<string, string>();
      for (const d of (deviceRows ?? []) as DeviceRow[]) {
        map.set(d.id, d.internal_id ?? d.name);
      }
      setDeviceNames(map);
    } catch {
      await notify({ title: "Erreur de chargement", tone: "danger" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [range]);

  const stats = useMemo(() => {
    const critical = anomalies.filter((a) => a.severity === "critical").length;
    const warning = anomalies.filter((a) => a.severity === "warning").length;
    const avgScore = scores.length > 0 ? Math.round(scores.reduce((acc, s) => acc + s.score, 0) / scores.length) : null;
    return { critical, warning, avgScore };
  }, [anomalies, scores]);

  // Classement des engins par score moyen sur la période
  const topEngines = useMemo(() => {
    const byDevice = new Map<string, { sum: number; n: number; km: number }>();
    for (const s of scores) {
      const cur = byDevice.get(s.device_id) ?? { sum: 0, n: 0, km: 0 };
      cur.sum += s.score; cur.n += 1; cur.km += s.km_driven;
      byDevice.set(s.device_id, cur);
    }
    return Array.from(byDevice.entries())
      .map(([id, v]) => ({ id, name: deviceNames.get(id) ?? id, avg: Math.round(v.sum / v.n), km: v.km }))
      .sort((a, b) => b.avg - a.avg);
  }, [scores, deviceNames]);

  const exportCsv = () => {
    const rows = [
      ["Période", "Date début", "Date fin", "Engin", "Device ID", "Score", "Km", "Chocs", "Freinages", "Accélérations", "Retournements", "Nuit (min)", "Excès vitesse"],
      ...scores.map((s) => [
        `${s.period_start} → ${s.period_end}`, s.period_start, s.period_end,
        deviceNames.get(s.device_id) ?? "(inconnu)",
        s.device_id, String(s.score), s.km_driven.toFixed(1),
        String(s.shock_count), String(s.hard_brake_count), String(s.hard_accel_count),
        String(s.rollover_count), String(s.night_minutes), String(s.overspeed_count),
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `autotrack-scores-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <AppShell>
      <div className="p-4 md:p-8 pb-24 max-w-5xl mx-auto">
        <SectionHero
          eyebrow="Analyse"
          icon={FileBarChart}
          title="Rapports automatisés"
          description="Anomalies détectées par analyse statistique (Z-score modifié et IQR Tukey) et scores d'usage par engin hebdomadaires. Tous les calculs sont exécutés par Edge Function sans intervention humaine."
          image={illusSettings}
        />

        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <div className="flex gap-1 rounded-lg border border-[var(--border)] p-1">
            {(["7d", "30d", "90d"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-3 h-8 text-xs rounded-md transition-colors ${range === r ? "bg-[var(--accent-primary)] text-[var(--accent-milk)] font-semibold" : "text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"}`}
              >
                {r === "7d" ? "7 jours" : r === "30d" ? "30 jours" : "90 jours"}
              </button>
            ))}
          </div>
          <button
            onClick={exportCsv}
            disabled={scores.length === 0}
            className="flex items-center gap-2 h-9 px-4 text-sm rounded-lg border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] disabled:opacity-40"
          >
            <Download className="size-4" /> Export CSV
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
          <div className="card-elev p-4 flex items-start gap-3">
            <AlertTriangle className="size-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <div className="text-2xl font-bold">{stats.critical}</div>
              <div className="text-xs text-[var(--text-secondary)]">Alertes critiques</div>
            </div>
          </div>
          <div className="card-elev p-4 flex items-start gap-3">
            <Sparkles className="size-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <div className="text-2xl font-bold">{stats.warning}</div>
              <div className="text-xs text-[var(--text-secondary)]">Avertissements</div>
            </div>
          </div>
          <div className="card-elev p-4 flex items-start gap-3">
            {stats.avgScore !== null && stats.avgScore >= 75 ? (
              <TrendingUp className="size-5 text-green-500 shrink-0 mt-0.5" />
            ) : (
              <TrendingDown className="size-5 text-red-500 shrink-0 mt-0.5" />
            )}
            <div>
              <div className="text-2xl font-bold">{stats.avgScore ?? "—"}</div>
              <div className="text-xs text-[var(--text-secondary)]">Score moyen flotte</div>
            </div>
          </div>
        </div>

        {topEngines.length > 0 && (
          <div className="card-elev p-5 mb-5">
            <h3 className="text-sm font-semibold mb-3">Classement des engins par score d'usage</h3>
            <div className="space-y-2">
              {topEngines.slice(0, 10).map((d, i) => (
                <div key={d.id} className="flex items-center gap-3">
                  <span className="text-[10px] font-mono text-[var(--text-secondary)] w-6">#{i + 1}</span>
                  <span className="flex-1 text-sm font-mono">{d.name}</span>
                  <span className="text-xs text-[var(--text-secondary)] font-mono w-20 text-right">{d.km.toFixed(0)} km</span>
                  <div className="w-32 h-2 rounded-full bg-[var(--bg-elevated)] overflow-hidden">
                    <div className="h-full" style={{
                      width: `${d.avg}%`,
                      background: d.avg >= 75 ? "var(--accent-green)" : d.avg >= 50 ? "var(--accent-amber)" : "var(--accent-red)",
                    }} />
                  </div>
                  <span className="text-sm font-semibold w-8 text-right">{d.avg}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="card-elev p-5">
          <h3 className="text-sm font-semibold mb-3">Anomalies récentes</h3>
          {loading ? (
            <div className="flex items-center justify-center py-10 text-[var(--text-secondary)]"><Loader2 className="size-5 animate-spin" /></div>
          ) : anomalies.length === 0 ? (
            <p className="text-xs text-[var(--text-secondary)]">Aucune anomalie sur la période. Tous les indicateurs sont dans les seuils statistiques attendus.</p>
          ) : (
            <div className="space-y-2">
              {anomalies.slice(0, 30).map((a) => (
                <div key={a.id} className="flex items-start gap-3 py-2 border-b border-[var(--border)] last:border-0">
                  <div className={`size-2 rounded-full mt-1.5 ${a.severity === "critical" ? "bg-red-500" : "bg-amber-500"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium truncate">{a.title}</span>
                      <span className="text-[10px] font-mono text-[var(--text-secondary)]">{a.kind}</span>
                    </div>
                    {a.message && (
                      <p className="text-xs text-[var(--text-secondary)] mt-0.5">{a.message}</p>
                    )}
                  </div>
                  <span className="text-[10px] text-[var(--text-secondary)] font-mono shrink-0">
                    {new Date(a.created_at).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
