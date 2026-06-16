import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const FLEET_LIMIT = 750;

// ── Types locaux ──────────────────────────────────────────────────────────────

export interface DeviceRow {
  id:               string;
  name:             string;
  plate:            string | null;
  vehicle_type:     string | null;
  vehicle_category: string | null;
  internal_id:      string | null;
  vehicle_model:    string | null;
  vehicle_year:     number | null;
  firmware:         string | null;
  pairing_code:     string | null;
  last_seen_at:     string | null;
  is_online:        boolean;
  created_at:       string;
}

// ── Lecture ──────────────────────────────────────────────────────────────────

export const listMyDevices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await (supabase as any)
      .from("devices")
      .select(
        "id, name, plate, vehicle_type, vehicle_category, internal_id, vehicle_model, vehicle_year, firmware, pairing_code, last_seen_at, is_online, created_at",
      )
      .order("created_at", { ascending: false }) as { data: DeviceRow[] | null; error: any };
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
    const { data: dev } = await (supabaseAdmin as any)
      .from("devices")
      .select(
        "id, name, plate, vehicle_type, vehicle_category, internal_id, vehicle_model, vehicle_year, firmware, last_seen_at, is_online",
      )
      .eq("id", data.deviceId)
      .eq("owner_id", userId)
      .maybeSingle() as { data: DeviceRow | null };
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
  .inputValidator((d: {
    vehicleType:     string;
    vehicleCategory: string;
    vehicleModel?:   string;
    vehicleYear?:    number;
    label?:          string;
  }) =>
    z.object({
      vehicleType:     z.string().min(2).max(4),
      vehicleCategory: z.enum(["terrassement", "transport", "levage"]),
      vehicleModel:    z.string().max(60).optional(),
      vehicleYear:     z.number().int().min(1990).max(2030).optional(),
      label:           z.string().max(60).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;

    const { count } = await supabaseAdmin
      .from("devices")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", userId);
    if ((count ?? 0) >= FLEET_LIMIT) throw new Error(`Limite de ${FLEET_LIMIT} engins atteinte`);

    // Génère l'identifiant interne via la séquence atomique en DB
    const { data: internalId, error: seqErr } = await (supabaseAdmin as any).rpc(
      "fn_next_vehicle_id",
      { p_type_code: data.vehicleType.toUpperCase() },
    ) as { data: string | null; error: any };
    if (seqErr || !internalId) throw new Error("Impossible de générer l'identifiant");

    const name = data.label?.trim() || internalId;
    const pairing = Math.random().toString(36).slice(2, 8).toUpperCase();

    const { data: device, error } = await (supabaseAdmin as any)
      .from("devices")
      .insert({
        owner_id:         userId,
        name,
        plate:            null,
        vehicle_type:     data.vehicleType.toUpperCase(),
        vehicle_category: data.vehicleCategory,
        internal_id:      internalId,
        vehicle_model:    data.vehicleModel ?? null,
        vehicle_year:     data.vehicleYear ?? null,
        pairing_code:     pairing,
      })
      .select(
        "id, name, plate, vehicle_type, vehicle_category, internal_id, vehicle_model, vehicle_year, firmware, pairing_code, last_seen_at, is_online",
      )
      .single() as { data: DeviceRow | null; error: any };
    if (error) throw new Error(error.message);

    const secret = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
    await supabaseAdmin.from("device_keys").insert({ device_id: device!.id, hmac_secret: secret });

    return { device: device!, hmacSecret: secret, ingestUrl: "/api/public/ingest" };
  });

// ── Modification ─────────────────────────────────────────────────────────────

export const updateDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { deviceId: string; name?: string; plate?: string }) =>
    z.object({
      deviceId: z.string().uuid(),
      name:     z.string().min(1).max(60).optional(),
      plate:    z.string().max(20).optional(),
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
