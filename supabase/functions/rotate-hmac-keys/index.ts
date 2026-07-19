// =============================================================================
// AutoTrack v3.1 - Edge Function : rotate-hmac-keys
//
// Roule automatiquement le secret HMAC des dispositifs dont le rotated_at
// depasse 90 jours, ET emet une commande "rotate_key" via la file commands
// pour que le firmware recupere le nouveau secret a sa prochaine connexion.
//
// Cron : "0 4 * * *" (chaque jour 04:00 UTC).
//
// Securite :
//   - L'ancien secret reste valide jusqu'a la prochaine connexion (fenetre
//     de chevauchement geree dans ingest.ts)
//   - Le nouveau secret n'est jamais retourne dans une reponse REST publique
//   - Le firmware re-applique sa cle suite a la commande rotate_key
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.1";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function generateSecret(): string {
  // 64 caracteres hex = 256 bits d'entropie (concat de 2 UUID v4)
  const a = crypto.randomUUID().replace(/-/g, "");
  const b = crypto.randomUUID().replace(/-/g, "");
  return a + b;
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

  // 1) Trouver les dispositifs dont le secret a > 90 jours
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const { data: keys, error } = await admin
    .from("device_keys")
    .select("device_id, rotated_at, rotation_count")
    .lt("rotated_at", ninetyDaysAgo);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  let rotated = 0;
  let failed = 0;
  for (const key of keys ?? []) {
    const newSecret = generateSecret();
    const now = new Date().toISOString();
    const next = new Date(Date.now() + 90 * 86_400_000).toISOString();

    const { error: upErr } = await admin
      .from("device_keys")
      .update({
        hmac_secret: newSecret,
        rotated_at: now,
        next_rotation_at: next,
        rotation_count: (key.rotation_count ?? 0) + 1,
      })
      .eq("device_id", key.device_id);
    if (upErr) { failed++; continue; }

    // 2) Emettre une commande rotate_key dans la file (le firmware lira la
    // nouvelle cle a sa prochaine connexion via /api/public/ingest)
    await admin.from("commands").insert({
      device_id: key.device_id,
      kind: "rotate_key",
      payload: { rotated_at: now, rotation_count: (key.rotation_count ?? 0) + 1 },
      status: "pending",
    });

    // 3) Audit log
    await admin.from("audit_logs").insert({
      action: "hmac_key_rotated",
      ip: "edge-function:rotate-hmac-keys",
      device_id: key.device_id,
    });

    rotated++;
  }

  return new Response(
    JSON.stringify({ ok: true, candidates: keys?.length ?? 0, rotated, failed }),
    { headers: { "Content-Type": "application/json" } },
  );
});
