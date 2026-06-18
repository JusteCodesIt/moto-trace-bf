import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { checkIpIngestRate, checkDeviceIngestRate, extractIp } from "@/lib/rate-limiter";

/**
 * Telemetry ingestion endpoint for the ESP32-S3 tracker.
 *
 * Headers:
 *   x-device-id: <uuid>
 *   x-signature: hex(HMAC-SHA256(secret, raw body))
 *
 * Body (JSON): see Schema below. All numeric fields optional except lat/lng.
 */
const Schema = z.object({
  recorded_at: z.string().datetime({ offset: true }).optional(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  speed_kmh: z.number().min(0).max(400).nullish(),
  heading: z.number().min(0).max(360).nullish(),
  altitude: z.number().min(-500).max(9000).nullish(),
  satellites: z.number().int().min(0).max(64).nullish(),
  hdop: z.number().min(0).max(99).nullish(),
  battery_main: z.number().min(0).max(100).nullish(),
  battery_backup: z.number().min(0).max(100).nullish(),
  gsm_bars: z.number().int().min(0).max(5).nullish(),
  gsm_carrier: z.string().max(40).nullish(),
  engine_on: z.boolean().nullish(),
  gps_source: z.string().max(40).nullish(),
  // Firmware sends flat accel_x/y/z (nullable). Legacy nested `accel` also accepted.
  accel_x: z.number().nullish(),
  accel_y: z.number().nullish(),
  accel_z: z.number().nullish(),
  accel: z.object({ x: z.number(), y: z.number(), z: z.number() }).nullish(),
  // v3.0 : Cellular fallback mode (CAT-M1 / AUTO / GSM_2G)
  cellular_mode: z.enum(["CAT-M1", "AUTO", "GSM_2G"]).nullish(),
  // v3.0 : J1939 engine data (PGN 61444, 65262, 65266, 65265)
  engine_rpm: z.number().min(0).max(10000).nullish(),
  engine_torque_pct: z.number().int().min(-125).max(125).nullish(),
  coolant_temp_c: z.number().int().min(-40).max(215).nullish(),
  oil_temp_c: z.number().int().min(-273).max(300).nullish(),
  fuel_rate_lph: z.number().min(0).max(3000).nullish(),
  fuel_total_l: z.number().min(0).nullish(),
  wheel_speed_kmh: z.number().min(0).max(300).nullish(),
  // v3.0 : IMU MPU6050 event counters (since last clear)
  shock_count: z.number().int().min(0).max(255).nullish(),
  brake_count: z.number().int().min(0).max(255).nullish(),
  accel_count: z.number().int().min(0).max(255).nullish(),
  rollover_count: z.number().int().min(0).max(255).nullish(),
  events: z.array(z.object({
    kind: z.string().max(40),
    severity: z.enum(["critical", "warning", "info"]),
    title: z.string().max(120),
    message: z.string().max(400).optional(),
  })).max(10).optional(),
});

const BODY_LIMIT = 8_192; // 8 KB — well above any real firmware payload (~500 B)

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-device-id, x-signature",
};

const json = (body: unknown, status = 200, extra?: Record<string, string>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS, ...extra },
  });

const noop = () => {};

/** Fire-and-forget audit log entry — never blocks the response path. */
function audit(action: string, ip: string, deviceId?: string | null) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).from("audit_logs")
    .insert({ action, ip, device_id: deviceId ?? null })
    .then(noop).catch(noop);
}

export const Route = createFileRoute("/api/public/ingest")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),

      POST: async ({ request }) => {
        // ── 1. IP rate-limit ── before any DB work to block amplification attacks ──
        const ip = extractIp(request);
        const ipCheck = checkIpIngestRate(ip);
        if (!ipCheck.allowed) {
          audit("rate_limited_ip", ip);
          return json(
            { error: "rate_limited", reason: ipCheck.reason },
            429,
            { "Retry-After": String(ipCheck.retryAfter) },
          );
        }

        // ── 2. Required headers ──
        const deviceId = request.headers.get("x-device-id");
        const signature = request.headers.get("x-signature");
        if (!deviceId || !signature) return json({ error: "missing headers" }, 400);

        // ── 3. Body size guard ──
        const cl = request.headers.get("content-length");
        if (cl && parseInt(cl, 10) > BODY_LIMIT)
          return json({ error: "payload too large" }, 413);

        const raw = await request.text();
        if (raw.length > BODY_LIMIT) return json({ error: "payload too large" }, 413);

        // ── 4. HMAC verification (admin bypasses RLS on device_keys) ──
        const { data: key } = await supabaseAdmin
          .from("device_keys").select("hmac_secret").eq("device_id", deviceId).maybeSingle();
        if (!key) {
          audit("unknown_device", ip, deviceId);
          return json({ error: "unknown device" }, 401);
        }

        const expected = createHmac("sha256", key.hmac_secret).update(raw).digest("hex");
        let sigOk = false;
        try {
          sigOk = signature.length === expected.length &&
            timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"));
        } catch { sigOk = false; }
        if (!sigOk) {
          audit("bad_signature", ip, deviceId);
          return json({ error: "bad signature" }, 401);
        }

        // ── 5. Device rate-limit ── post-auth, so deviceId is genuine ──
        const devCheck = checkDeviceIngestRate(deviceId);
        if (!devCheck.allowed) {
          audit("rate_limited_device", ip, deviceId);
          return json(
            { error: "rate_limited", reason: devCheck.reason },
            429,
            { "Retry-After": String(devCheck.retryAfter) },
          );
        }

        // ── 6. Schema validation ──
        let parsed: z.infer<typeof Schema>;
        try { parsed = Schema.parse(JSON.parse(raw)); }
        catch (e: unknown) {
          return json({ error: "invalid payload", details: String((e as Error)?.message ?? e) }, 400);
        }

        const recordedAt = parsed.recorded_at ?? new Date().toISOString();
        const ax = parsed.accel_x ?? parsed.accel?.x ?? null;
        const ay = parsed.accel_y ?? parsed.accel?.y ?? null;
        const az = parsed.accel_z ?? parsed.accel?.z ?? null;

        // ── 7. Persist telemetry (v3.0 : colonnes J1939, IMU, RFID, cellular_mode) ──
        const { error: tErr } = await (supabaseAdmin as any).from("telemetry").insert({
          device_id: deviceId,
          recorded_at: recordedAt,
          lat: parsed.lat, lng: parsed.lng,
          speed_kmh: parsed.speed_kmh ?? null, heading: parsed.heading ?? null,
          altitude: parsed.altitude ?? null, satellites: parsed.satellites ?? null, hdop: parsed.hdop ?? null,
          battery_main: parsed.battery_main ?? null, battery_backup: parsed.battery_backup ?? null,
          gsm_bars: parsed.gsm_bars ?? null, gsm_carrier: parsed.gsm_carrier ?? null,
          engine_on: parsed.engine_on ?? null,
          gps_source: parsed.gps_source ?? null,
          accel_x: ax, accel_y: ay, accel_z: az,
          // v3.0 : extensions automatisation
          cellular_mode:     parsed.cellular_mode      ?? null,
          engine_rpm:        parsed.engine_rpm         ?? null,
          engine_torque_pct: parsed.engine_torque_pct  ?? null,
          coolant_temp_c:    parsed.coolant_temp_c     ?? null,
          oil_temp_c:        parsed.oil_temp_c         ?? null,
          fuel_rate_lph:     parsed.fuel_rate_lph      ?? null,
          fuel_total_l:      parsed.fuel_total_l       ?? null,
          wheel_speed_kmh:   parsed.wheel_speed_kmh    ?? null,
          shock_count:       parsed.shock_count        ?? null,
          brake_count:       parsed.brake_count        ?? null,
          accel_count:       parsed.accel_count        ?? null,
          rollover_count:    parsed.rollover_count     ?? null,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          raw: parsed as any,
        });
        if (tErr) return json({ error: tErr.message }, 500);

        // ── 7bis. v3.0 : IMU events automatiquement convertis en alertes ──
        const imuAlerts: Array<{ kind: string; severity: "critical" | "warning"; title: string; message: string }> = [];
        if ((parsed.shock_count ?? 0) > 0)    imuAlerts.push({ kind: "imu_shock",    severity: "critical", title: "Choc detecte",        message: `${parsed.shock_count} evenement(s) de choc > 2.5 g` });
        if ((parsed.brake_count ?? 0) > 0)    imuAlerts.push({ kind: "imu_brake",    severity: "warning",  title: "Freinage brutal",     message: `${parsed.brake_count} freinage(s) > 0.5 g` });
        if ((parsed.rollover_count ?? 0) > 0) imuAlerts.push({ kind: "imu_rollover", severity: "critical", title: "Risque retournement",  message: `${parsed.rollover_count} inclinaison(s) > 60 deg` });
        if (imuAlerts.length) {
          await supabaseAdmin.from("alerts").insert(imuAlerts.map((a) => ({
            device_id: deviceId, kind: a.kind, severity: a.severity,
            title: a.title, message: a.message,
            lat: parsed.lat, lng: parsed.lng,
          })));
        }

        // ── 8. Optional events → alerts ──
        if (parsed.events?.length) {
          const rows = parsed.events.map((e) => ({
            device_id: deviceId,
            kind: e.kind, severity: e.severity, title: e.title, message: e.message ?? null,
            lat: parsed.lat, lng: parsed.lng,
          }));
          await supabaseAdmin.from("alerts").insert(rows);
        }

        // ── 9. Geofence evaluation symetrique (alert_on_exit + alert_on_enter) ──
        //
        // v3.0 : Etat precedent stocke dans geofence_states. On declenche une
        // alerte UNIQUEMENT sur transition (inside->outside ou outside->inside),
        // pas a chaque trame, ce qui evite le spam d'alertes lors d'un sejour
        // prolonge dans la zone.
        const { data: zones } = await supabaseAdmin
          .from("geofences")
          .select("id, name, lat, lng, radius_m, alert_on_exit, alert_on_enter")
          .eq("device_id", deviceId).eq("active", true);
        if (zones?.length) {
          // 1) Charger les etats precedents pour ce device
          const { data: prevStates } = await (supabaseAdmin as any)
            .from("geofence_states")
            .select("geofence_id, inside")
            .eq("device_id", deviceId);
          const prevMap = new Map<string, boolean>(
            (prevStates ?? []).map((s: any) => [s.geofence_id, s.inside]),
          );

          const alertsToInsert: Array<Record<string, unknown>> = [];
          const stateUpserts: Array<Record<string, unknown>> = [];

          for (const z of zones) {
            const dist = haversine(parsed.lat, parsed.lng, z.lat, z.lng);
            const currentlyInside = dist <= z.radius_m;
            const previouslyInside = prevMap.get(z.id);

            // Transition exit
            if (previouslyInside === true && !currentlyInside && z.alert_on_exit) {
              alertsToInsert.push({
                device_id: deviceId, kind: "geofence_exit", severity: "warning",
                title: "Sortie de geozone",
                message: `Le vehicule a quitte la zone « ${z.name} »`,
                lat: parsed.lat, lng: parsed.lng,
              });
            }
            // Transition enter (v3.0)
            if (previouslyInside === false && currentlyInside && z.alert_on_enter) {
              alertsToInsert.push({
                device_id: deviceId, kind: "geofence_enter", severity: "info",
                title: "Entree en geozone",
                message: `Le vehicule est entre dans « ${z.name} »`,
                lat: parsed.lat, lng: parsed.lng,
              });
            }

            // Persistance de l'etat courant pour la prochaine trame
            stateUpserts.push({
              device_id: deviceId,
              geofence_id: z.id,
              inside: currentlyInside,
              updated_at: new Date().toISOString(),
            });
          }

          if (alertsToInsert.length) {
            await supabaseAdmin.from("alerts").insert(alertsToInsert);
          }
          if (stateUpserts.length) {
            await (supabaseAdmin as any)
              .from("geofence_states")
              .upsert(stateUpserts, { onConflict: "device_id,geofence_id" });
          }
        }

        // ── 10. Return pending commands ──
        const { data: pending } = await supabaseAdmin
          .from("commands").select("id, kind, payload")
          .eq("device_id", deviceId).eq("status", "pending").limit(5);
        if (pending?.length) {
          await supabaseAdmin.from("commands")
            .update({ status: "sent", sent_at: new Date().toISOString() })
            .in("id", pending.map((c) => c.id));
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const commands = (pending ?? []).map((c: any) => ({
          id: c.id,
          type: c.kind,
          payload: c.payload == null ? "" : (typeof c.payload === "string" ? c.payload : JSON.stringify(c.payload)),
        }));

        audit("ingest", ip, deviceId);
        return json({ ok: true, commands });
      },
    },
  },
});

function haversine(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6_371_000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
