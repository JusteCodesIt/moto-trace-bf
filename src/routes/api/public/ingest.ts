import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

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
  events: z.array(z.object({
    kind: z.string().max(40),
    severity: z.enum(["critical", "warning", "info"]),
    title: z.string().max(120),
    message: z.string().max(400).optional(),
  })).max(10).optional(),
});


const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-device-id, x-signature",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS } });

export const Route = createFileRoute("/api/public/ingest")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const deviceId = request.headers.get("x-device-id");
        const signature = request.headers.get("x-signature");
        if (!deviceId || !signature) return json({ error: "missing headers" }, 400);

        const raw = await request.text();

        // Look up HMAC secret (admin bypasses RLS on device_keys)
        const { data: key } = await supabaseAdmin
          .from("device_keys").select("hmac_secret").eq("device_id", deviceId).maybeSingle();
        if (!key) return json({ error: "unknown device" }, 401);

        const expected = createHmac("sha256", key.hmac_secret).update(raw).digest("hex");
        let sigOk = false;
        try {
          sigOk = signature.length === expected.length &&
            timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"));
        } catch { sigOk = false; }
        if (!sigOk) return json({ error: "bad signature" }, 401);

        let parsed: z.infer<typeof Schema>;
        try { parsed = Schema.parse(JSON.parse(raw)); }
        catch (e: any) { return json({ error: "invalid payload", details: String(e?.message ?? e) }, 400); }

        const recordedAt = parsed.recorded_at ?? new Date().toISOString();

        const { error: tErr } = await supabaseAdmin.from("telemetry").insert({
          device_id: deviceId,
          recorded_at: recordedAt,
          lat: parsed.lat, lng: parsed.lng,
          speed_kmh: parsed.speed_kmh, heading: parsed.heading,
          altitude: parsed.altitude, satellites: parsed.satellites, hdop: parsed.hdop,
          battery_main: parsed.battery_main, battery_backup: parsed.battery_backup,
          gsm_bars: parsed.gsm_bars, gsm_carrier: parsed.gsm_carrier,
          engine_on: parsed.engine_on,
          accel_x: parsed.accel?.x, accel_y: parsed.accel?.y, accel_z: parsed.accel?.z,
          raw: parsed as any,
        });
        if (tErr) return json({ error: tErr.message }, 500);

        // Optional events → alerts
        if (parsed.events?.length) {
          const rows = parsed.events.map((e) => ({
            device_id: deviceId,
            kind: e.kind, severity: e.severity, title: e.title, message: e.message ?? null,
            lat: parsed.lat, lng: parsed.lng,
          }));
          await supabaseAdmin.from("alerts").insert(rows);
        }

        // Server-side geofence evaluation (exit alerts)
        const { data: zones } = await supabaseAdmin
          .from("geofences")
          .select("id, name, lat, lng, radius_m, alert_on_exit")
          .eq("device_id", deviceId).eq("active", true).eq("alert_on_exit", true);
        if (zones?.length) {
          const exits = zones.filter((z) => {
            const d = haversine(parsed.lat, parsed.lng, z.lat, z.lng);
            return d > z.radius_m;
          });
          if (exits.length) {
            await supabaseAdmin.from("alerts").insert(exits.map((z) => ({
              device_id: deviceId, kind: "geofence", severity: "warning",
              title: "Sortie de géozone", message: `Le véhicule a quitté « ${z.name} »`,
              lat: parsed.lat, lng: parsed.lng,
            })));
          }
        }

        // Return pending commands so the device can act on them
        const { data: pending } = await supabaseAdmin
          .from("commands").select("id, kind, payload")
          .eq("device_id", deviceId).eq("status", "pending").limit(5);
        if (pending?.length) {
          await supabaseAdmin.from("commands")
            .update({ status: "sent", sent_at: new Date().toISOString() })
            .in("id", pending.map((c) => c.id));
        }
        return json({ ok: true, commands: pending ?? [] });
      },
    },
  },
});

function haversine(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000, toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
