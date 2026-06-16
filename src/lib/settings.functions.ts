import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SettingsSchema = z.object({
  profile: z.object({
    name: z.string().max(120).default(""),
    phone: z.string().max(32).default(""),
    email: z.string().max(160).default(""),
  }).partial().default({}),
  notif: z.object({
    pushEnabled: z.boolean().default(true),
    smsPhone: z.string().max(32).default(""),
    matrix: z.record(z.string(), z.object({
      push: z.boolean(),
      sms: z.boolean(),
      email: z.boolean(),
    })).default({}),
  }).partial().default({}),
  thresholds: z.object({
    speedKmh: z.number().min(0).max(300).default(90),
    shockG: z.number().min(0).max(20).default(2.5),
    geofenceDelaySec: z.number().min(0).max(3600).default(30),
    lowBatteryPct: z.number().min(0).max(100).default(20),
  }).partial().default({}),
  antitheft: z.object({
    pinHash: z.string().max(200).default(""),
    autolockMinIdle: z.boolean().default(true),
    stealthLed: z.boolean().default(false),
    tamperDetect: z.boolean().default(true),
  }).partial().default({}),
  network: z.object({
    apiUrl: z.string().max(300).default(""),
    apn: z.string().max(80).default("internet.orange.bf"),
    wifiSsid: z.string().max(64).default(""),
    wifiPwdSaved: z.boolean().default(false),
  }).partial().default({}),
  maintenance: z.record(
    z.string(),
    z.object({
      conducteur:        z.string().max(80).default(""),
      chantier:          z.string().max(80).default(""),
      derniereRevision:  z.string().max(32).default(""),
      prochainEntretien: z.string().max(32).default(""),
      heuresMoteur:      z.number().min(0).max(999999).default(0),
      notes:             z.string().max(500).default(""),
    }).partial(),
  ).default({}),
}).partial();

export type UserSettings = z.infer<typeof SettingsSchema>;

export const getMySettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase
      .from("user_settings")
      .select("data")
      .eq("user_id", userId)
      .maybeSingle();
    return (data?.data ?? {}) as UserSettings;
  });

export const updateMySettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { patch: unknown }) =>
    z.object({ patch: SettingsSchema }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: existing } = await supabase
      .from("user_settings")
      .select("data")
      .eq("user_id", userId)
      .maybeSingle();
    const current = (existing?.data ?? {}) as Record<string, unknown>;
    const next: Record<string, unknown> = { ...current };
    for (const [k, v] of Object.entries(data.patch ?? {})) {
      next[k] = { ...(current[k] as object ?? {}), ...(v as object) };
    }
    const { error } = await supabase
      .from("user_settings")
      .upsert({ user_id: userId, data: next as never }, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return next as UserSettings;
  });
