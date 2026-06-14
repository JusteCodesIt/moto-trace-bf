import { createFileRoute } from "@tanstack/react-router";
import { BarChart3 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { BarChart, Bar, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { useApp } from "@/lib/store";
import { supabase } from "@/integrations/supabase/client";
import { fmtDuration } from "@/lib/format";

export const Route = createFileRoute("/stats")({
  head: () => ({ meta: [{ title: "Analytics — AutoTrack" }] }),
  component: StatsPage,
});

const PERIODS = { "7 jours": 7, "Mois": 30, "Trimestre": 90, "Année": 365 } as const;
type Period = keyof typeof PERIODS;

// Cadence nominale du firmware : 1 trame / 30s (mode normal)
const SAMPLE_INTERVAL_SEC = 30;
const SHOCK_THRESHOLD_G = 2.5;
const SPEED_LIMIT_KMH = 80;
// Capte les sauts de position (device hors-ligne puis reconnecté loin) sans les compter comme distance parcourue
const MAX_REALISTIC_HOP_KM = 3;

type TelRow = {
  lat: number; lng: number;
  speed_kmh: number | null;
  battery_main: number | null;
  accel_x: number | null; accel_y: number | null; accel_z: number | null;
  gps_source: string | null;
  recorded_at: string;
};

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371, toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function computeStats(rows: TelRow[]) {
  // Daily distance — last 7 calendar days present in the dataset
  const byDay = new Map<string, TelRow[]>();
  for (const r of rows) {
    const day = r.recorded_at.slice(0, 10);
    (byDay.get(day) ?? byDay.set(day, []).get(day)!).push(r);
  }
  const days = [...byDay.keys()].sort().slice(-7);
  const dailyDistance = days.map((day) => {
    const pts = byDay.get(day)!;
    let km = 0;
    for (let i = 1; i < pts.length; i++) {
      const d = haversineKm(pts[i - 1].lat, pts[i - 1].lng, pts[i].lat, pts[i].lng);
      if (d <= MAX_REALISTIC_HOP_KM) km += d;
    }
    const date = new Date(day);
    return { day: date.toLocaleDateString("fr-FR", { weekday: "short" }), km };
  });

  // Average speed per hour-of-day across the whole period
  const byHour = new Map<number, number[]>();
  for (const r of rows) {
    const h = new Date(r.recorded_at).getHours();
    (byHour.get(h) ?? byHour.set(h, []).get(h)!).push(r.speed_kmh ?? 0);
  }
  const hourlySpeed = Array.from({ length: 24 }, (_, h) => {
    const vs = byHour.get(h);
    return { h: `${h}h`, v: vs?.length ? vs.reduce((a, b) => a + b, 0) / vs.length : 0 };
  });

  const totalKm = dailyDistance.reduce((s, d) => s + d.km, 0);
  const maxSpeed = rows.reduce((m, r) => Math.max(m, r.speed_kmh ?? 0), 0);
  const movingSamples = rows.filter((r) => (r.speed_kmh ?? 0) > 3).length;
  const drivingMin = Math.round((movingSamples * SAMPLE_INTERVAL_SEC) / 60);

  let speedScore: number | null = null;
  let stabilityScore: number | null = null;
  let gpsScore: number | null = null;
  let avgBattery: number | null = null;
  if (rows.length > 0) {
    speedScore = Math.round((rows.filter((r) => (r.speed_kmh ?? 0) <= SPEED_LIMIT_KMH).length / rows.length) * 100);
    stabilityScore = Math.round(
      (rows.filter((r) => Math.max(Math.abs(r.accel_x ?? 0), Math.abs(r.accel_y ?? 0), Math.abs(r.accel_z ?? 0)) < SHOCK_THRESHOLD_G).length / rows.length) * 100,
    );
    gpsScore = Math.round((rows.filter((r) => r.gps_source === "SIM7080G_PRIMARY").length / rows.length) * 100);
    avgBattery = Math.round(rows.reduce((s, r) => s + (r.battery_main ?? 0), 0) / rows.length);
  }
  const overallScore = speedScore !== null && stabilityScore !== null && gpsScore !== null
    ? Math.round((speedScore + stabilityScore + gpsScore) / 3)
    : null;

  return { dailyDistance, hourlySpeed, totalKm, maxSpeed, drivingMin, speedScore, stabilityScore, gpsScore, avgBattery, overallScore };
}

function StatsPage() {
  const device = useApp((s) => s.device);
  const trips = useApp((s) => s.trips);
  const periods = Object.keys(PERIODS) as Period[];
  const [period, setPeriod] = useState<Period>("7 jours");
  const [rows, setRows] = useState<TelRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!device) { setLoading(false); return; }
    let mounted = true;
    setLoading(true);
    const since = new Date(Date.now() - PERIODS[period] * 86400_000).toISOString();
    supabase
      .from("telemetry")
      .select("lat,lng,speed_kmh,battery_main,accel_x,accel_y,accel_z,gps_source,recorded_at")
      .eq("device_id", device.id)
      .gte("recorded_at", since)
      .order("recorded_at", { ascending: true })
      .limit(5000)
      .then(({ data }) => {
        if (!mounted) return;
        setRows((data as TelRow[]) ?? []);
        setLoading(false);
      });
    return () => { mounted = false; };
  }, [device, period]);

  const stats = useMemo(() => computeStats(rows), [rows]);
  const hasData = rows.length > 0;

  const scoreLabel = (s: number | null) => {
    if (s === null) return "Pas encore de données";
    if (s >= 80) return "Excellent conducteur";
    if (s >= 60) return "Bon conducteur";
    if (s >= 40) return "Conduite à surveiller";
    return "Conduite risquée";
  };

  const KPIS = [
    { label: "Total km", value: `${stats.totalKm.toFixed(1)}` },
    { label: "Temps de conduite", value: hasData ? fmtDuration(stats.drivingMin) : "—" },
    { label: "Trajets", value: `${trips.length}` },
    { label: "Vitesse max", value: hasData ? `${Math.round(stats.maxSpeed)} km/h` : "—" },
  ];

  const SUBSCORES = [
    { label: "Vitesse maîtrisée", value: stats.speedScore },
    { label: "Stabilité (chocs)", value: stats.stabilityScore },
    { label: "Disponibilité GPS", value: stats.gpsScore },
    { label: "Batterie moyenne", value: stats.avgBattery },
  ];

  return (
    <AppShell>
      <PageHeader
        title="Analytics & score conducteur"
        subtitle={`Insights — ${period}`}
        icon={BarChart3}
      />

      <div className="p-4 md:p-8 pb-24 max-w-7xl mx-auto space-y-6">
        {/* Period */}
        <div className="flex bg-[var(--bg-surface)] rounded-md p-1 w-fit border border-[var(--border)]">
          {periods.map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`h-8 px-4 text-xs rounded transition-colors ${period === p ? "bg-[var(--bg-elevated)] text-[var(--text-primary)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
            >
              {p}
            </button>
          ))}
        </div>

        {!device ? (
          <div className="card-elev p-4 text-xs text-[var(--text-secondary)] text-center">
            Aucun tracker associé à ce compte.
          </div>
        ) : !loading && !hasData ? (
          <div className="card-elev p-4 text-xs text-[var(--text-secondary)] text-center">
            Aucune donnée de télémétrie pour cette période.
          </div>
        ) : null}

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {KPIS.map((k) => (
            <div key={k.label} className="card-elev p-4">
              <div className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">{k.label}</div>
              <div className="text-2xl font-bold mono mt-1">{k.value}</div>
            </div>
          ))}
        </div>

        {/* Driver score */}
        <div className="card-elev p-6">
          <div className="grid md:grid-cols-[auto_1fr] gap-8 items-center">
            <div className="flex items-center gap-5">
              <ScoreGauge score={stats.overallScore ?? 0} />
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">
                  Score conducteur
                </div>
                <div className="text-4xl font-bold mono text-[var(--accent-violet)]">
                  {stats.overallScore ?? "—"}
                  {stats.overallScore !== null && <span className="text-base text-[var(--text-secondary)]">/100</span>}
                </div>
                <div className="text-xs text-[var(--text-secondary)] mt-1">{scoreLabel(stats.overallScore)}</div>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {SUBSCORES.map((s) => (
                <div key={s.label}>
                  <div className="text-[10px] text-[var(--text-secondary)]">{s.label}</div>
                  <div className="text-lg font-bold mono">{s.value ?? "—"}{s.value !== null && "%"}</div>
                  <div className="h-1 bg-[var(--bg-elevated)] rounded-full mt-1 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${s.value ?? 0}%`,
                        background: (s.value ?? 0) > 80 ? "var(--accent-green)" : (s.value ?? 0) > 60 ? "var(--accent-amber)" : "var(--accent-red)",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Charts */}
        <div className="grid md:grid-cols-2 gap-4">
          <div className="card-elev p-5">
            <h3 className="text-xs uppercase tracking-wider text-[var(--text-secondary)] font-semibold mb-4">
              Distance par jour (7 derniers jours)
            </h3>
            <div className="h-[200px]">
              <ResponsiveContainer>
                <BarChart data={stats.dailyDistance}>
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
                    formatter={(v: number) => [`${v.toFixed(1)} km`, "Distance"]}
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
                <LineChart data={stats.hourlySpeed}>
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
                    formatter={(v: number) => [`${v.toFixed(0)} km/h`, "Vitesse moy."]}
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
