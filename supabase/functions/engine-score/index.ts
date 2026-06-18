// =============================================================================
// AutoTrack v3.1 - Edge Function : engine-score
//
// Calcule un score d'usage par engin (device_id) sur les 7 derniers jours,
// et persiste dans engine_scores.
//
// Formule additive avec saturation a 100 :
//   penalite = 8*shock + 3*brake + 2*accel + 25*rollover
//            + 1.5*(nightMinutes/60)
//            + 5*(overspeedCount/kmDriven*100)
//   score = max(0, 100 - penalite)
//
// Cron : "0 5 * * 1" (chaque lundi 05:00 UTC).
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.1";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

interface Agg {
  shock: number;
  brake: number;
  accel: number;
  rollover: number;
  nightMinutes: number;
  overspeed: number;
  km: number;
}

function emptyAgg(): Agg {
  return { shock: 0, brake: 0, accel: 0, rollover: 0, nightMinutes: 0, overspeed: 0, km: 0 };
}

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }

function haversineKm(la1: number, ln1: number, la2: number, ln2: number) {
  const R = 6371;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(la2 - la1);
  const dLng = toRad(ln2 - ln1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(la1)) * Math.cos(toRad(la2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401 });

  const now = new Date();
  const periodEnd = new Date(now); periodEnd.setUTCHours(0, 0, 0, 0);
  const periodStart = new Date(periodEnd); periodStart.setUTCDate(periodEnd.getUTCDate() - 7);

  // 1) Trames telemetry de la semaine
  const { data: rows, error } = await admin
    .from("telemetry")
    .select("device_id, recorded_at, lat, lng, speed_kmh, shock_count, brake_count, accel_count, rollover_count")
    .gte("recorded_at", periodStart.toISOString())
    .lt("recorded_at", periodEnd.toISOString())
    .order("recorded_at", { ascending: true });
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  // 2) Devices pour owner_id
  const { data: devices } = await admin
    .from("devices")
    .select("id, owner_id");
  const ownerByDevice = new Map<string, string>();
  for (const d of devices ?? []) ownerByDevice.set(d.id, d.owner_id);

  // 3) Agreger par engin
  const aggByDevice = new Map<string, Agg>();
  const lastPosByDevice = new Map<string, { lat: number; lng: number; ts: number }>();

  for (const r of rows ?? []) {
    const did = r.device_id as string;
    const agg = aggByDevice.get(did) ?? emptyAgg();
    aggByDevice.set(did, agg);

    agg.shock    += r.shock_count    ?? 0;
    agg.brake    += r.brake_count    ?? 0;
    agg.accel    += r.accel_count    ?? 0;
    agg.rollover += r.rollover_count ?? 0;

    const prev = lastPosByDevice.get(did);
    const ts = new Date(r.recorded_at).getTime();
    if (prev) {
      agg.km += haversineKm(prev.lat, prev.lng, r.lat, r.lng);
      const hh = new Date(r.recorded_at).getUTCHours();
      if (hh >= 22 || hh < 4) {
        const dtMin = (ts - prev.ts) / 60000;
        if (dtMin < 30) agg.nightMinutes += dtMin;
      }
    }
    lastPosByDevice.set(did, { lat: r.lat, lng: r.lng, ts });

    if ((r.speed_kmh ?? 0) > 90) agg.overspeed += 1;
  }

  // 4) Calcul et upsert
  let inserted = 0;
  for (const [deviceId, agg] of aggByDevice) {
    const ownerId = ownerByDevice.get(deviceId);
    if (!ownerId) continue;

    const penalty =
      8 * agg.shock +
      3 * agg.brake +
      2 * agg.accel +
      25 * agg.rollover +
      1.5 * (agg.nightMinutes / 60) +
      (agg.km > 0 ? 5 * (agg.overspeed / agg.km * 100) : 0);

    const score = Math.round(clamp(100 - penalty, 0, 100));

    await admin.from("engine_scores").upsert({
      owner_id: ownerId,
      device_id: deviceId,
      period_start: periodStart.toISOString().slice(0, 10),
      period_end:   periodEnd.toISOString().slice(0, 10),
      shock_count: agg.shock,
      hard_brake_count: agg.brake,
      hard_accel_count: agg.accel,
      rollover_count: agg.rollover,
      night_minutes: Math.round(agg.nightMinutes),
      overspeed_count: agg.overspeed,
      km_driven: agg.km,
      score,
      computed_at: new Date().toISOString(),
    }, { onConflict: "owner_id,device_id,period_start,period_end" });

    inserted++;
  }

  return new Response(
    JSON.stringify({
      ok: true,
      period_start: periodStart.toISOString().slice(0, 10),
      period_end:   periodEnd.toISOString().slice(0, 10),
      scores_computed: inserted,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
});
