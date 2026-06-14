import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Public read-only endpoint backing /share/$token.
 * The share_links table has no anon SELECT policy — only this
 * service-role-backed route can resolve a token to live position data,
 * so tokens can't be enumerated via PostgREST.
 */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS } });

export const Route = createFileRoute("/api/public/share/$token")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ params }) => {
        const { token } = params;

        const { data: link } = await supabaseAdmin
          .from("share_links").select("device_id, expires_at").eq("token", token).maybeSingle();
        if (!link) return json({ error: "not_found" }, 404);
        if (new Date(link.expires_at).getTime() < Date.now()) return json({ error: "expired" }, 410);

        const [{ data: device }, { data: lastT }, { data: trail }] = await Promise.all([
          supabaseAdmin.from("devices").select("name").eq("id", link.device_id).maybeSingle(),
          supabaseAdmin.from("telemetry").select("lat,lng,speed_kmh,heading,recorded_at")
            .eq("device_id", link.device_id).order("recorded_at", { ascending: false }).limit(1).maybeSingle(),
          supabaseAdmin.from("telemetry").select("lat,lng")
            .eq("device_id", link.device_id).order("recorded_at", { ascending: false }).limit(50),
        ]);

        return json({
          deviceName: device?.name ?? "AutoTrack",
          expiresAt: link.expires_at,
          telemetry: lastT
            ? { lat: lastT.lat, lng: lastT.lng, speed: lastT.speed_kmh ?? 0, heading: lastT.heading ?? 0, recordedAt: lastT.recorded_at }
            : null,
          trail: (trail ?? []).reverse().map((r) => ({ lat: r.lat, lng: r.lng })),
        });
      },
    },
  },
});
