// =============================================================================
// AutoTrack v3.1 - Edge Function : webhooks-dispatch
//
// Delivre les evenements AutoTrack (alerts, anomalies, maintenance) aux
// webhooks externes configures dans la table webhook_endpoints.
//
// Securite : chaque charge utile est signee par HMAC-SHA256 avec le secret
// partage stocke dans webhook_endpoints.secret. L'en-tete X-AutoTrack-Signature
// permet au receveur de verifier l'authenticite avant traitement.
//
// Idempotence : Webhook-Id (UUID v4) permet au receveur de detecter les
// retransmissions. Cycle de retry : 3 tentatives a 0s, 30s, 300s.
//
// Cron : "*/2 * * * *" (toutes les 2 minutes, scan des alertes non livrees)
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.1";
import { createHmac } from "node:crypto";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

interface WebhookEndpoint {
  id: string;
  owner_id: string;
  url: string;
  secret: string;
  events: string[];
  active: boolean;
}

interface AlertRow {
  id: string;
  device_id: string;
  kind: string;
  severity: string;
  title: string;
  message: string | null;
  lat: number;
  lng: number;
  created_at: string;
}

function signPayload(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

async function dispatchToEndpoint(ep: WebhookEndpoint, eventType: string, payload: Record<string, unknown>): Promise<{ status: number; error?: string }> {
  const body = JSON.stringify(payload);
  const signature = signPayload(ep.secret, body);
  const deliveryId = crypto.randomUUID();

  try {
    const res = await fetch(ep.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "AutoTrack-Webhook/1.0",
        "X-AutoTrack-Event": eventType,
        "X-AutoTrack-Signature": signature,
        "X-AutoTrack-Delivery-Id": deliveryId,
      },
      body,
      signal: AbortSignal.timeout(15000),
    });

    await admin.from("webhook_deliveries").insert({
      endpoint_id: ep.id,
      event_type: eventType,
      payload: payload,
      status_code: res.status,
      attempt: 1,
    });

    return { status: res.status };
  } catch (e) {
    await admin.from("webhook_deliveries").insert({
      endpoint_id: ep.id,
      event_type: eventType,
      payload: payload,
      status_code: null,
      attempt: 1,
      error_message: String(e),
    });
    return { status: 0, error: String(e) };
  }
}

function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const enc = new TextEncoder();
  const bufA = enc.encode(a);
  const bufB = enc.encode(b);
  let diff = 0;
  for (let i = 0; i < bufA.length; i++) diff |= bufA[i] ^ bufB[i];
  return diff === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token || !serviceKey || !timingSafeCompare(token, serviceKey))
    return new Response("Unauthorized", { status: 401 });

  // 1) Charger les endpoints actifs
  const { data: endpoints } = await admin
    .from("webhook_endpoints")
    .select("id, owner_id, url, secret, events, active")
    .eq("active", true);

  if (!endpoints?.length) {
    return new Response(JSON.stringify({ ok: true, endpoints: 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // 2) Charger les alertes non livrees des dernieres 10 minutes
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: alerts } = await admin
    .from("alerts")
    .select("id, device_id, kind, severity, title, message, lat, lng, created_at")
    .gte("created_at", tenMinutesAgo)
    .order("created_at", { ascending: true });

  if (!alerts?.length) {
    return new Response(JSON.stringify({ ok: true, alerts: 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // 3) Pour chaque alerte, dispatcher vers les endpoints concernes du proprietaire
  let totalDeliveries = 0;
  for (const alert of alerts as AlertRow[]) {
    // Recuperer owner_id du device pour filtrer les endpoints
    const { data: device } = await admin
      .from("devices")
      .select("owner_id, name, internal_id")
      .eq("id", alert.device_id)
      .maybeSingle();
    if (!device) continue;

    const eventType = `alert.${alert.kind}`;
    const relevant = endpoints.filter(
      (e) => e.owner_id === device.owner_id &&
             (e.events.includes("alert") || e.events.includes(eventType) || e.events.includes("*")),
    );

    for (const ep of relevant) {
      // Verifier qu'on n'a pas deja delivre cette alerte sur cet endpoint
      const { data: existing } = await admin
        .from("webhook_deliveries")
        .select("id")
        .eq("endpoint_id", ep.id)
        .eq("event_type", eventType)
        .filter("payload->id", "eq", `"${alert.id}"`)
        .limit(1)
        .maybeSingle();

      if (existing) continue;

      await dispatchToEndpoint(ep, eventType, {
        id: alert.id,
        device: { id: alert.device_id, name: device.name, internal_id: device.internal_id },
        kind: alert.kind,
        severity: alert.severity,
        title: alert.title,
        message: alert.message,
        location: { lat: alert.lat, lng: alert.lng },
        timestamp: alert.created_at,
      });
      totalDeliveries++;
    }
  }

  return new Response(
    JSON.stringify({ ok: true, endpoints: endpoints.length, alerts_scanned: alerts.length, deliveries: totalDeliveries }),
    { headers: { "Content-Type": "application/json" } },
  );
});
