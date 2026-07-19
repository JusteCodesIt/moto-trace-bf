import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.1";
import webpush from "https://esm.sh/web-push@3.6.7";

function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const enc = new TextEncoder();
  const bufA = enc.encode(a);
  const bufB = enc.encode(b);
  if ((globalThis as any).crypto?.subtle?.timingSafeEqual) {
    return (crypto.subtle as any).timingSafeEqual(bufA, bufB);
  }
  let diff = 0;
  for (let i = 0; i < bufA.length; i++) diff |= bufA[i] ^ bufB[i];
  return diff === 0;
}

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

let vapidReady = false;

async function ensureVapid() {
  if (vapidReady) return true;
  let pub = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
  let priv = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
  if (!pub || !priv) {
    const { data } = await admin
      .from("app_config")
      .select("key, value")
      .in("key", ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"]);
    if (data) {
      for (const row of data) {
        if (row.key === "VAPID_PUBLIC_KEY") pub = row.value;
        if (row.key === "VAPID_PRIVATE_KEY") priv = row.value;
      }
    }
  }
  if (!pub || !priv) return false;
  const contact = Deno.env.get("VAPID_CONTACT_EMAIL") ?? "mailto:noreply@autotrack.bf";
  const mailto = contact.startsWith("mailto:") ? contact : `mailto:${contact}`;
  webpush.setVapidDetails(mailto, pub, priv);
  vapidReady = true;
  return true;
}

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

  const ready = await ensureVapid();
  if (!ready) {
    return new Response(
      JSON.stringify({ error: "VAPID keys not configured — set them in app_config table or Edge Function secrets" }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) {
    return new Response("Unauthorized", { status: 401 });
  }

  const isServiceRole = serviceKey && timingSafeCompare(token, serviceKey);

  let callerUserId: string | null = null;
  if (!isServiceRole) {
    const { data: { user }, error } = await admin.auth.getUser(token);
    if (error || !user) {
      return new Response("Unauthorized", { status: 401 });
    }
    callerUserId = user.id;
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

  const { user_id: requestedUserId, title, body: notifBody, url, tag, requireInteraction } = body;
  const user_id = isServiceRole ? requestedUserId : callerUserId;
  if (!user_id) {
    return new Response(JSON.stringify({ error: "user_id_required" }), { status: 400 });
  }
  if (!isServiceRole && requestedUserId && requestedUserId !== callerUserId) {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
  }

  // PSH-05: Check notification matrix preferences
  const { data: settings } = await admin
    .from("user_settings")
    .select("data")
    .eq("user_id", user_id)
    .maybeSingle();

  if (settings?.data) {
    const matrix = (settings.data as Record<string, unknown>)?.notif as Record<string, unknown> | undefined;
    const alertMatrix = matrix?.matrix as Record<string, Record<string, boolean>> | undefined;
    if (alertMatrix && tag && tag !== "test") {
      const alertPrefs = alertMatrix[tag];
      if (alertPrefs && alertPrefs.push === false) {
        return new Response(
          JSON.stringify({ ok: true, skipped: "user_preference" }),
          { headers: { "Content-Type": "application/json" } },
        );
      }
    }
  }

  // PSH-04: Query all subscriptions for this user (multi-device)
  const { data: subs, error: dbErr } = await admin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", user_id);

  if (dbErr || !subs || subs.length === 0) {
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

  const results: Array<{ endpoint: string; ok: boolean; error?: string }> = [];

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
      );
      results.push({ endpoint: sub.endpoint, ok: true });
    } catch (err: unknown) {
      console.error("Web Push delivery error:", err);
      const status = (err as { statusCode?: number })?.statusCode ?? 500;
      if (status === 410 || status === 404) {
        await admin.from("push_subscriptions").delete()
          .eq("user_id", user_id).eq("endpoint", sub.endpoint);
        results.push({ endpoint: sub.endpoint, ok: false, error: "subscription_expired" });
      } else {
        results.push({ endpoint: sub.endpoint, ok: false, error: "push_delivery_failed" });
      }
    }
  }

  const anyOk = results.some((r) => r.ok);
  return new Response(
    JSON.stringify({ ok: anyOk, delivered: results.filter((r) => r.ok).length, total: results.length }),
    { status: anyOk ? 200 : 500, headers: { "Content-Type": "application/json" } },
  );
});
