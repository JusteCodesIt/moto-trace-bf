// Supabase Edge Function — fleet-ws
// Deno runtime (Supabase Edge / Deno Deploy)
//
// Architecture :
//   Browser  ──WebSocket──▶  fleet-ws  ──Realtime──▶  Supabase PostgreSQL
//                                         (postgres_changes, device_positions)
//
// Fonctionnement :
//   1. Upgrade HTTP → WebSocket avec vérification JWT.
//   2. Crée un client Supabase portant le JWT de l'admin → RLS actif.
//   3. Souscrit aux changements de device_positions (table) via Supabase
//      Realtime. RLS filtre automatiquement à la flotte de cet admin, sans
//      passer un filtre IN(750 UUIDs) côté client.
//   4. Accumule les mises à jour dans un buffer (Map device_id → row) pendant
//      2 secondes, puis envoie un seul message groupé au navigateur.
//   5. À la fermeture du WebSocket browser, nettoie la subscription Realtime.
//
// Sécurité :
//   • JWT obligatoire — 401 sinon.
//   • Pas de limit de connexions simultanées : chaque admin a sa propre
//     subscription RLS isolée, le runtime Deno Deploy scale horizontalement.
//   • Pas de paramètre owner_id côté client — le RLS dérive tout de auth.uid().

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Types ──────────────────────────────────────────────────────────────────

interface PositionRow {
  device_id:      string;
  lat:            number;
  lng:            number;
  speed_kmh:      number;
  heading:        number;
  altitude:       number;
  engine_on:      boolean;
  battery_main:   number;
  battery_backup: number;
  gsm_bars:       number;
  gsm_carrier:    string;
  gps_source:     string | null;
  recorded_at:    string;
}

// ── Configuration ──────────────────────────────────────────────────────────

const SUPABASE_URL  = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const BATCH_MS      = 2_000; // fenêtre de regroupement vers le browser (ms)

// ── Main handler ───────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  // ── CORS preflight ─────────────────────────────────────────────────────
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin":  "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey",
      },
    });
  }

  // ── Require WebSocket upgrade ──────────────────────────────────────────
  if ((req.headers.get("upgrade") ?? "").toLowerCase() !== "websocket") {
    return json({ error: "websocket_required" }, 426);
  }

  // ── Extract JWT ────────────────────────────────────────────────────────
  const url   = new URL(req.url);
  const token = url.searchParams.get("token")
    ?? req.headers.get("authorization")?.replace(/^bearer\s+/i, "");

  if (!token) return json({ error: "missing_token" }, 401);

  // ── Verify JWT with Supabase Auth ──────────────────────────────────────
  const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth:   { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return json({ error: "unauthorized" }, 401);

  // ── Upgrade to WebSocket ───────────────────────────────────────────────
  const { socket, response } = Deno.upgradeWebSocket(req);

  // ── Batch buffer ───────────────────────────────────────────────────────
  // Keyed by device_id : des mises à jour rapides pour le même engin fusionnent
  // (dernier état uniquement, pas une file d'attente croissante).
  const buffer = new Map<string, PositionRow>();
  let flushHandle: number | null = null;

  function scheduleFlush(): void {
    if (flushHandle !== null) return;
    flushHandle = setTimeout(() => {
      flushHandle = null;
      if (buffer.size === 0 || socket.readyState !== WebSocket.OPEN) return;
      const data = Array.from(buffer.values());
      buffer.clear();
      try {
        socket.send(JSON.stringify({ type: "positions", data }));
      } catch {
        // socket fermé entre la vérification et l'envoi — ignorer
      }
    }, BATCH_MS);
  }

  // ── Subscribe to device_positions via Supabase Realtime ───────────────
  // Le client porte le JWT de l'admin → Supabase Realtime applique le RLS
  // de device_positions → seuls les engins de cette flotte sont émis.
  // Aucun filtre IN(N UUIDs) nécessaire côté client.
  const channel = supabase
    .channel(`fleet-ws:${user.id}:${Date.now()}`)
    .on(
      // deno-lint-ignore no-explicit-any
      "postgres_changes" as any,
      { event: "*", schema: "public", table: "device_positions" },
      // deno-lint-ignore no-explicit-any
      (payload: any) => {
        const row = payload.new as PositionRow | undefined;
        if (!row?.device_id) return;
        buffer.set(row.device_id, row);
        scheduleFlush();
      },
    )
    .subscribe((status: string) => {
      if (status === "SUBSCRIBED" && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "ready", userId: user.id }));
      }
    });

  // ── WebSocket event handlers ───────────────────────────────────────────

  socket.onopen = () => {
    socket.send(JSON.stringify({ type: "connected" }));
  };

  // Messages browser → serveur (réservé pour ping/pong futur)
  socket.onmessage = (_e: MessageEvent) => { /* no-op */ };

  socket.onclose = async () => {
    if (flushHandle !== null) {
      clearTimeout(flushHandle);
      flushHandle = null;
    }
    try { await supabase.removeChannel(channel); } catch { /* best effort */ }
  };

  socket.onerror = () => socket.close();

  return response;
});

// ── Helper ─────────────────────────────────────────────────────────────────

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
