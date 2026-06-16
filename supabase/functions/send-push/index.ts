// Supabase Edge Function — send-push
// Deno runtime
//
// Délivre une notification Web Push VAPID à un utilisateur donné.
// Appelé par le serveur backend lors d'une alerte (choc, géozone, batterie…).
//
// Variables d'environnement requises (Supabase Dashboard → Edge Functions → Secrets) :
//   VAPID_PUBLIC_KEY   — clé publique VAPID base64url (65 octets, format non-compressé)
//   VAPID_PRIVATE_KEY  — clé privée VAPID base64url (32 octets)
//   SUPABASE_URL       — injecté automatiquement
//   SUPABASE_SERVICE_ROLE_KEY — injecté automatiquement
//
// Générer les clés : npx web-push generate-vapid-keys
// Puis : supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=...

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.1";
// @ts-ignore — import npm via esm.sh pour Deno
import webpush from "https://esm.sh/web-push@3.6.7";

const VAPID_PUBLIC  = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails("mailto:ibrayago06@gmail.com", VAPID_PUBLIC, VAPID_PRIVATE);
}

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, content-type",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    return new Response(
      JSON.stringify({ error: "VAPID keys not configured" }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  // Vérifier que l'appelant est le service_role (Backend → Edge Function)
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: {
    user_id?: string;
    title?: string;
    body?: string;
    url?: string;
    tag?: string;
    requireInteraction?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), { status: 400 });
  }

  const { user_id, title, body: notifBody, url, tag, requireInteraction } = body;
  if (!user_id) {
    return new Response(JSON.stringify({ error: "user_id_required" }), { status: 400 });
  }

  const { data: sub, error: dbErr } = await admin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", user_id)
    .maybeSingle();

  if (dbErr || !sub) {
    return new Response(
      JSON.stringify({ error: "no_subscription" }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  const payload = JSON.stringify({
    title:               title ?? "AutoTrack",
    body:                notifBody ?? "",
    url:                 url ?? "/",
    tag:                 tag ?? "autotrack-alert",
    requireInteraction:  requireInteraction ?? false,
  });

  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      payload,
    );
    return new Response(
      JSON.stringify({ ok: true }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    console.error("Web Push delivery error:", err);
    const status = (err as { statusCode?: number })?.statusCode ?? 500;
    if (status === 410 || status === 404) {
      // Subscription expirée — nettoyer la DB
      await admin.from("push_subscriptions").delete().eq("user_id", user_id);
      return new Response(
        JSON.stringify({ error: "subscription_expired", cleaned: true }),
        { status: 410, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
