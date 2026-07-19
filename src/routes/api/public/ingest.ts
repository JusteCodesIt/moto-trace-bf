import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { checkIpIngestRate, checkDeviceIngestRate, checkAlertRate, extractIp } from "@/lib/rate-limiter";
import { haversineM } from "@/lib/geo";
import { log } from "@/lib/logger";

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
  cellular_mode: z.string().max(20).nullish(),
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
  log.warn("ingest_audit", { action, ip, deviceId });
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

        // SEC-15: Reject frames with unreasonable timestamps
        const recordedMs = new Date(recordedAt).getTime();
        const nowMs = Date.now();
        if (recordedMs < nowMs - 7 * 86400_000) {
          return json({ error: "recorded_at too old (> 7 days)" }, 400);
        }
        if (recordedMs > nowMs + 5 * 60_000) {
          return json({ error: "recorded_at in the future (> 5 min)" }, 400);
        }

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
          cellular_mode:     parsed.cellular_mode      ?? null,
        });
        if (tErr) return json({ error: tErr.message }, 500);

        // ── 8. Optional events → alerts ──
        let eventsInserted = false;
        if (parsed.events?.length && checkAlertRate(deviceId, parsed.events.length)) {
          const rows = parsed.events.map((e) => ({
            device_id: deviceId,
            kind: e.kind, severity: e.severity, title: e.title, message: e.message ?? null,
            lat: parsed.lat, lng: parsed.lng,
          }));
          await supabaseAdmin.from("alerts").insert(rows);
          eventsInserted = true;
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
        const alertsToInsert: Array<{ device_id: string; kind: string; severity: string; title: string; message: string; lat: number; lng: number }> = [];
        if (zones?.length) {
          // 1) Charger les etats precedents pour ce device
          const { data: prevStates } = await (supabaseAdmin as any)
            .from("geofence_states")
            .select("geofence_id, inside")
            .eq("device_id", deviceId);
          const prevMap = new Map<string, boolean>(
            (prevStates ?? []).map((s: any) => [s.geofence_id, s.inside]),
          );
          const stateUpserts: Array<Record<string, unknown>> = [];

          for (const z of zones) {
            const dist = haversineM(parsed.lat, parsed.lng, z.lat, z.lng);
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
            await (supabaseAdmin as any).from("alerts").insert(alertsToInsert);
          }
          if (stateUpserts.length) {
            await (supabaseAdmin as any)
              .from("geofence_states")
              .upsert(stateUpserts, { onConflict: "device_id,geofence_id" });
          }
        }

        // ── 9bis. Fire-and-forget push notification for critical alerts ──
        const criticalKinds = ["geofence_exit"];
        const allAlerts = [
          ...(parsed.events?.filter(() => eventsInserted).map((e) => ({ kind: e.kind, severity: e.severity, title: e.title, message: e.message ?? "" })) ?? []),
          ...alertsToInsert.map((a) => ({ kind: a.kind, severity: a.severity, title: a.title, message: a.message ?? "" })),
        ];
        const criticalAlerts = allAlerts.filter((a) => criticalKinds.includes(a.kind));
        if (criticalAlerts.length > 0) {
          const { data: dev } = await supabaseAdmin
            .from("devices").select("owner_id").eq("id", deviceId).maybeSingle();
          if (dev?.owner_id) {
            const supabaseUrl = process.env.SUPABASE_URL ?? "";
            const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
            if (supabaseUrl && serviceKey) {
              const alert = criticalAlerts[0];
              fetch(`${supabaseUrl}/functions/v1/send-push`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${serviceKey}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                  user_id: dev.owner_id,
                  title: alert.title,
                  body: alert.message,
                  tag: alert.kind,
                  requireInteraction: alert.severity === "critical",
                }),
              }).catch(() => {});
            }
          }
        }

        // ── 9ter. Fire-and-forget maintenance check (every 10th frame to avoid spam) ──
        if (Math.random() < 0.1) {
          const supabaseUrl = process.env.SUPABASE_URL ?? "";
          const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
          if (supabaseUrl && serviceKey) {
            fetch(`${supabaseUrl}/functions/v1/maintenance-check`, {
              method: "POST",
              headers: { "Authorization": `Bearer ${serviceKey}`, "Content-Type": "application/json" },
              body: "{}",
            }).catch(() => {});
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
