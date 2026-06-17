// =============================================================================
// AutoTrack v3.1 - Edge Function : driver-score
//
// Calcule un score conducteur normalise (0 a 100) pour chaque badge actif,
// sur une periode glissante de 7 jours, et persiste dans driver_scores.
//
// Formule de scoring (additive avec saturation a 100) :
//   penalite = 8 * shock + 3 * brake + 2 * accel + 25 * rollover
//            + 1.5 * (nightMinutes / 60)
//            + 5 * (overspeedCount / kmDriven * 100)
//   score = max(0, 100 - penalite)
//
// Cron : "0 5 * * 1" (chaque lundi 05:00 UTC, score de la semaine ecoulee).
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.1";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

interface BadgeAgg {
  shock: number;
  brake: number;
  accel: number;
  rollover: number;
  nightMinutes: number;
  overspeed: number;
  km: number;
  // diff cumule pour calculer km depuis fuel_total_l si dispo
  fuelStart: number | null;
  fuelEnd: number | null;
}

function emptyAgg(): BadgeAgg {
  return { shock: 0, brake: 0, accel: 0, rollover: 0, nightMinutes: 0, overspeed: 0, km: 0, fuelStart: null, fuelEnd: null };
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

  // 1) Recuperer toutes les trames telemetry de la semaine, avec badge non nul
  const { data: rows, error } = await admin
    .from("telemetry")
    .select("device_id, driver_badge_id, recorded_at, lat, lng, speed_kmh, shock_count, brake_count, accel_count, rollover_count, fuel_total_l")
    .gte("recorded_at", periodStart.toISOString())
    .lt("recorded_at", periodEnd.toISOString())
    .not("driver_badge_id", "is", null)
    .order("recorded_at", { ascending: true });
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  // 2) Charger la table badges pour owner_id
  const { data: badges } = await admin
    .from("driver_badges")
    .select("owner_id, badge_uid, driver_name");
  const ownerByBadge = new Map<string, string>();
  for (const b of badges ?? []) ownerByBadge.set(b.badge_uid, b.owner_id);

  // 3) Agreger par badge (par jour, puis cumule)
  type Key = string; // badge_uid
  const aggByBadge = new Map<Key, BadgeAgg>();
  const lastPosByBadge = new Map<Key, { lat: number; lng: number; ts: number; prevShock: number; prevBrake: number; prevAccel: number; prevRoll: number }>();

  for (const r of rows ?? []) {
    const uid = r.driver_badge_id as string;
    if (!uid) continue;
    const agg = aggByBadge.get(uid) ?? emptyAgg();
    aggByBadge.set(uid, agg);

    // Compteurs IMU : differentiel par rapport au dernier echantillon de ce badge
    const prev = lastPosByBadge.get(uid);
    const cShock = r.shock_count ?? 0;
    const cBrake = r.brake_count ?? 0;
    const cAccel = r.accel_count ?? 0;
    const cRoll  = r.rollover_count ?? 0;
    if (prev) {
      // Diff toujours >= 0 (les compteurs sont remis a zero par le firmware
      // a chaque envoi, donc la valeur cumulee = valeur recue)
      agg.shock    += cShock;
      agg.brake    += cBrake;
      agg.accel    += cAccel;
      agg.rollover += cRoll;
      // km
      agg.km += haversineKm(prev.lat, prev.lng, r.lat, r.lng);
    } else {
      agg.shock    += cShock;
      agg.brake    += cBrake;
      agg.accel    += cAccel;
      agg.rollover += cRoll;
    }

    const ts = new Date(r.recorded_at).getTime();
    lastPosByBadge.set(uid, { lat: r.lat, lng: r.lng, ts, prevShock: cShock, prevBrake: cBrake, prevAccel: cAccel, prevRoll: cRoll });

    // Activite nocturne 22h-04h UTC
    const hh = new Date(r.recorded_at).getUTCHours();
    if (hh >= 22 || hh < 4) {
      if (prev) {
        const dtMin = (ts - prev.ts) / 60000;
        if (dtMin < 30) agg.nightMinutes += dtMin;
      }
    }

    // Overspeed (> 90 km/h)
    if ((r.speed_kmh ?? 0) > 90) agg.overspeed += 1;

    // Carburant (si J1939 dispo)
    if (r.fuel_total_l != null) {
      if (agg.fuelStart === null) agg.fuelStart = r.fuel_total_l;
      agg.fuelEnd = r.fuel_total_l;
    }
  }

  // 4) Calcul du score et upsert
  let inserted = 0;
  for (const [badgeUid, agg] of aggByBadge) {
    const ownerId = ownerByBadge.get(badgeUid);
    if (!ownerId) continue;

    const penalty =
      8 * agg.shock +
      3 * agg.brake +
      2 * agg.accel +
      25 * agg.rollover +
      1.5 * (agg.nightMinutes / 60) +
      (agg.km > 0 ? 5 * (agg.overspeed / agg.km * 100) : 0);

    const score = Math.round(clamp(100 - penalty, 0, 100));

    await admin.from("driver_scores").upsert({
      owner_id: ownerId,
      driver_badge_id: badgeUid,
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
    }, { onConflict: "owner_id,driver_badge_id,period_start,period_end" });

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
