import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const FLEET_LIMIT = 750;

// ── Lecture ──────────────────────────────────────────────────────────────────

export const listMyDevices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("devices")
      .select("id, name, plate, firmware, pairing_code, last_seen_at, is_online, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getDeviceCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { deviceId: string }) =>
    z.object({ deviceId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: dev } = await supabaseAdmin
      .from("devices")
      .select("id, name, plate, firmware, last_seen_at, is_online")
      .eq("id", data.deviceId)
      .eq("owner_id", userId)
      .maybeSingle();
    if (!dev) throw new Error("Device not found");

    const { data: keyRow } = await supabaseAdmin
      .from("device_keys")
      .select("hmac_secret, rotated_at")
      .eq("device_id", data.deviceId)
      .single();

    return {
      device: dev,
      hmacSecret: keyRow?.hmac_secret ?? null,
      keyRotatedAt: keyRow?.rotated_at ?? null,
      ingestUrl: "/api/public/ingest",
    };
  });

// ── Création ─────────────────────────────────────────────────────────────────

export const createDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { name: string; plate?: string }) =>
    z.object({
      name: z.string().min(1).max(60),
      plate: z.string().max(20).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;

    const { count } = await supabaseAdmin
      .from("devices")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", userId);
    if ((count ?? 0) >= FLEET_LIMIT) throw new Error(`Limite de ${FLEET_LIMIT} engins atteinte`);

    const pairing = Math.random().toString(36).slice(2, 8).toUpperCase();
    const { data: device, error } = await supabaseAdmin
      .from("devices")
      .insert({ owner_id: userId, name: data.name, plate: data.plate ?? null, pairing_code: pairing })
      .select("id, name, plate, firmware, pairing_code, last_seen_at, is_online")
      .single();
    if (error) throw new Error(error.message);

    const secret = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
    await supabaseAdmin.from("device_keys").insert({ device_id: device.id, hmac_secret: secret });

    return {
      device,
      hmacSecret: secret,
      ingestUrl: "/api/public/ingest",
    };
  });

// ── Modification ─────────────────────────────────────────────────────────────

export const updateDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { deviceId: string; name?: string; plate?: string }) =>
    z.object({
      deviceId: z.string().uuid(),
      name: z.string().min(1).max(60).optional(),
      plate: z.string().max(20).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("devices")
      .update({ name: data.name, plate: data.plate })
      .eq("id", data.deviceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const rotateDeviceKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { deviceId: string }) =>
    z.object({ deviceId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: dev } = await supabaseAdmin
      .from("devices").select("id").eq("id", data.deviceId).eq("owner_id", userId).maybeSingle();
    if (!dev) throw new Error("Device not found");
    const secret = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
    const { error } = await supabaseAdmin
      .from("device_keys")
      .upsert({ device_id: data.deviceId, hmac_secret: secret, rotated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    return { hmacSecret: secret };
  });

// ── Suppression ───────────────────────────────────────────────────────────────

export const deleteDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { deviceId: string }) =>
    z.object({ deviceId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { error } = await supabaseAdmin
      .from("devices")
      .delete()
      .eq("id", data.deviceId)
      .eq("owner_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ── Compatibilité ascendante (settings.tsx) ───────────────────────────────────

/** @deprecated Utiliser listMyDevices + getDeviceCredentials à la place. */
export const ensureMyDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId, supabase } = context;

    const { data: existing } = await supabase
      .from("devices")
      .select("id, name, plate, firmware, pairing_code, last_seen_at, is_online")
      .eq("owner_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    let device = existing;
    if (!device) {
      const pairing = Math.random().toString(36).slice(2, 8).toUpperCase();
      const { data: created, error } = await supabaseAdmin
        .from("devices")
        .insert({ owner_id: userId, name: "AutoTrack", pairing_code: pairing })
        .select("id, name, plate, firmware, pairing_code, last_seen_at, is_online")
        .single();
      if (error) throw new Error(error.message);
      device = created;
      const secret = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
      await supabaseAdmin.from("device_keys").insert({ device_id: device.id, hmac_secret: secret });
    }

    const { data: keyRow } = await supabaseAdmin
      .from("device_keys")
      .select("hmac_secret, rotated_at")
      .eq("device_id", device!.id)
      .single();

    return {
      device: device!,
      hmacSecret: keyRow?.hmac_secret ?? null,
      keyRotatedAt: keyRow?.rotated_at ?? null,
      ingestUrl: "/api/public/ingest",
    };
  });
