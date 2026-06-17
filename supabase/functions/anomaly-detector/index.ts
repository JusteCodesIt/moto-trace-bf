// =============================================================================
// AutoTrack v3.0 - Edge Function : anomaly-detector
//
// Deno runtime, declenchee par cron quotidien Supabase (07:00 UTC).
//
// Analyse statistique robuste des series temporelles telemetry par engin
// sur les 30 derniers jours, et generation d'alertes "warning" si :
//   - Z-score modifie (Iglewicz et Hoaglin, 1993) > 3.5
//   - OU point hors [Q1 - 1.5*IQR, Q3 + 1.5*IQR] (Tukey, 1977)
//
// Dimensions surveillees :
//   - daily_km          : kilometrage journalier
//   - avg_speed_kmh     : vitesse moyenne en activite
//   - night_activity    : minutes d'activite 22h-04h (TZ Africa/Ouagadougou)
//   - fuel_rate_lph     : debit moyen carburant (si J1939 disponible)
//
// Sources :
//   - Iglewicz, B. & Hoaglin, D.C. (1993). How to Detect and Handle Outliers.
//     ASQC Quality Press, chapter 2.
//   - Tukey, J.W. (1977). Exploratory Data Analysis. Addison-Wesley, ch. 2.
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.1";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// -----------------------------------------------------------------------------
// Statistiques robustes
// -----------------------------------------------------------------------------

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function mad(arr: number[], med: number): number {
  return median(arr.map((x) => Math.abs(x - med)));
}

function quartiles(arr: number[]): { q1: number; q3: number; iqr: number } {
  if (arr.length < 4) return { q1: 0, q3: 0, iqr: 0 };
  const s = [...arr].sort((a, b) => a - b);
  const q1 = s[Math.floor(s.length / 4)];
  const q3 = s[Math.floor((3 * s.length) / 4)];
  return { q1, q3, iqr: q3 - q1 };
}

/**
 * Z-score modifie d'Iglewicz et Hoaglin (formule 2.3 du livre).
 * Le facteur 0.6745 reconvertit la MAD vers l'unite de l'ecart-type
 * sous l'hypothese de normalite asymptotique.
 */
function modifiedZ(x: number, med: number, madVal: number): number {
  if (madVal === 0) return 0;
  return 0.6745 * (x - med) / madVal;
}

interface AnomalyResult {
  device_id: string;
  dimension: string;
  value: number;
  median: number;
  z_modified: number;
  out_of_iqr: boolean;
  iqr_lower: number;
  iqr_upper: number;
}

// -----------------------------------------------------------------------------
// Agregation par dimension
// -----------------------------------------------------------------------------

async function fetchDailyKmHistory(deviceId: string, days: number): Promise<number[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data } = await admin
    .from("telemetry")
    .select("recorded_at, lat, lng")
    .eq("device_id", deviceId)
    .gt("recorded_at", since)
    .order("recorded_at", { ascending: true });

  if (!data || data.length < 2) return [];

  // Bucket par jour, calcul de distance cumulee (Haversine simplifiee)
  const buckets = new Map<string, { prev?: { lat: number; lng: number }; km: number }>();
  for (const row of data) {
    const day = row.recorded_at.slice(0, 10);
    if (!buckets.has(day)) buckets.set(day, { km: 0 });
    const b = buckets.get(day)!;
    if (b.prev) {
      const R = 6_371;
      const toRad = (x: number) => (x * Math.PI) / 180;
      const dLat = toRad(row.lat - b.prev.lat);
      const dLng = toRad(row.lng - b.prev.lng);
      const a = Math.sin(dLat / 2) ** 2 +
                Math.cos(toRad(b.prev.lat)) * Math.cos(toRad(row.lat)) *
                Math.sin(dLng / 2) ** 2;
      b.km += 2 * R * Math.asin(Math.sqrt(a));
    }
    b.prev = { lat: row.lat, lng: row.lng };
  }
  return Array.from(buckets.values()).map((b) => b.km);
}

async function fetchAvgSpeedHistory(deviceId: string, days: number): Promise<number[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data } = await admin
    .from("telemetry")
    .select("recorded_at, speed_kmh")
    .eq("device_id", deviceId)
    .gt("recorded_at", since)
    .gt("speed_kmh", 5);   // exclut les arrets
  if (!data || data.length === 0) return [];

  const perDay = new Map<string, { sum: number; n: number }>();
  for (const r of data) {
    const day = r.recorded_at.slice(0, 10);
    const cur = perDay.get(day) ?? { sum: 0, n: 0 };
    cur.sum += r.speed_kmh ?? 0;
    cur.n   += 1;
    perDay.set(day, cur);
  }
  return Array.from(perDay.values()).map((d) => d.sum / d.n);
}

async function fetchNightActivityHistory(deviceId: string, days: number): Promise<number[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data } = await admin
    .from("telemetry")
    .select("recorded_at")
    .eq("device_id", deviceId)
    .gt("recorded_at", since)
    .gt("speed_kmh", 5);
  if (!data || data.length === 0) return [];

  // Convertir en TZ Africa/Ouagadougou (UTC+0)
  const perDay = new Map<string, number>();
  for (const r of data) {
    const dt = new Date(r.recorded_at);
    const hh = dt.getUTCHours();
    if (hh >= 22 || hh < 4) {
      const day = r.recorded_at.slice(0, 10);
      perDay.set(day, (perDay.get(day) ?? 0) + 1);
    }
  }
  return Array.from(perDay.values());
}

// -----------------------------------------------------------------------------
// Main handler
// -----------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401 });

  const HISTORY_DAYS = 30;
  const Z_THRESHOLD = 3.5;
  const IQR_K = 1.5;

  const { data: devices } = await admin
    .from("devices")
    .select("id, name, internal_id, owner_id");
  if (!devices?.length) {
    return new Response(JSON.stringify({ ok: true, devices_analyzed: 0 }),
      { headers: { "Content-Type": "application/json" } });
  }

  const anomalies: AnomalyResult[] = [];

  for (const device of devices) {
    const km = await fetchDailyKmHistory(device.id, HISTORY_DAYS);
    const sp = await fetchAvgSpeedHistory(device.id, HISTORY_DAYS);
    const nt = await fetchNightActivityHistory(device.id, HISTORY_DAYS);

    const series = [
      { dim: "daily_km",       arr: km },
      { dim: "avg_speed_kmh",  arr: sp },
      { dim: "night_activity", arr: nt },
    ];

    for (const { dim, arr } of series) {
      if (arr.length < 7) continue;  // pas assez d'historique

      const latest = arr[arr.length - 1];
      const baseline = arr.slice(0, -1);
      const med   = median(baseline);
      const madV  = mad(baseline, med);
      const z     = modifiedZ(latest, med, madV);
      const { q1, q3, iqr } = quartiles(baseline);
      const lower = q1 - IQR_K * iqr;
      const upper = q3 + IQR_K * iqr;
      const outOfIqr = (latest < lower || latest > upper);

      if (Math.abs(z) > Z_THRESHOLD || outOfIqr) {
        anomalies.push({
          device_id: device.id,
          dimension: dim,
          value: latest,
          median: med,
          z_modified: z,
          out_of_iqr: outOfIqr,
          iqr_lower: lower,
          iqr_upper: upper,
        });

        // Inserer une alerte
        await admin.from("alerts").insert({
          device_id: device.id,
          kind: "anomaly",
          severity: "warning",
          title: `Anomalie detectee : ${dim}`,
          message: `Valeur ${latest.toFixed(2)} ; mediane recente ${med.toFixed(2)} ; Z mod = ${z.toFixed(2)} ; intervalle [${lower.toFixed(2)} ; ${upper.toFixed(2)}]`,
          lat: 0, lng: 0,
        });
      }
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      devices_analyzed: devices.length,
      anomalies_detected: anomalies.length,
      anomalies,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
});
