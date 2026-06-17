// =============================================================================
// AutoTrack v3.0 - Edge Function : daily-maintenance-reminders
//
// Deno runtime, declenchee par cron quotidien Supabase (06:00 UTC).
//
// 1) Lit user_settings.maintenance (Record<deviceId, MaintRecord>)
// 2) Pour chaque engin, compare prochainEntretien a la date du jour
// 3) Si J-7 ou J-1 (ou en retard), invoque l'Edge Function send-push pour
//    notifier le proprietaire de l'engin (via push_subscriptions)
// 4) Idempotence : table maintenance_reminders_sent garantit qu'un rappel
//    pour une date d'echeance donnee n'est emis qu'une seule fois
//
// Configuration cron a definir cote Supabase Dashboard :
//   Settings -> Database -> Cron -> Add cron job
//   Schedule : "0 6 * * *"
//   SQL : SELECT net.http_post(
//           'https://<project>.supabase.co/functions/v1/daily-maintenance-reminders',
//           '{}'::jsonb,
//           '{"Authorization": "Bearer <SERVICE_ROLE_KEY>"}'::jsonb
//         );
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.1";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const SEND_PUSH_URL = `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-push`;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface MaintRecord {
  conducteur?: string;
  chantier?: string;
  prochainEntretien?: string;
  derniereRevision?: string;
  heuresMoteur?: number;
  notes?: string;
}

function daysUntil(isoDate: string): number {
  const target = new Date(isoDate + "T00:00:00Z");
  const today  = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

async function sendPush(userId: string, title: string, body: string, url: string) {
  return fetch(SEND_PUSH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({
      user_id: userId, title, body, url,
      tag: "maintenance-reminder",
      requireInteraction: true,
    }),
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  // Auth service_role uniquement
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401 });

  const today = new Date().toISOString().slice(0, 10);

  // 1) Lire tous les user_settings non vides
  const { data: settings, error: settingsErr } = await admin
    .from("user_settings")
    .select("user_id, data");
  if (settingsErr) {
    console.error("settings query failed:", settingsErr);
    return new Response(JSON.stringify({ error: settingsErr.message }), { status: 500 });
  }

  let totalRemindersSent = 0;
  let totalSkippedIdempotent = 0;

  for (const row of settings ?? []) {
    const maintenance = (row.data?.maintenance ?? {}) as Record<string, MaintRecord>;
    if (!maintenance || Object.keys(maintenance).length === 0) continue;

    for (const [deviceId, rec] of Object.entries(maintenance)) {
      if (!rec.prochainEntretien) continue;

      const d = daysUntil(rec.prochainEntretien);
      let reminderType: "J-7" | "J-1" | "OVERDUE" | null = null;
      if (d === 7) reminderType = "J-7";
      else if (d === 1) reminderType = "J-1";
      else if (d < 0)   reminderType = "OVERDUE";

      if (!reminderType) continue;

      // 2) Idempotence : verifier maintenance_reminders_sent
      const { data: existing } = await admin
        .from("maintenance_reminders_sent")
        .select("device_id")
        .eq("device_id", deviceId)
        .eq("reminder_type", reminderType)
        .eq("target_date", rec.prochainEntretien)
        .maybeSingle();

      if (existing) {
        totalSkippedIdempotent++;
        continue;
      }

      // 3) Recuperer infos engin
      const { data: device } = await admin
        .from("devices")
        .select("id, name, internal_id, vehicle_type")
        .eq("id", deviceId)
        .maybeSingle();
      if (!device) continue;

      const engineLabel = device.internal_id ?? device.name;
      const title =
        reminderType === "J-7"     ? `Entretien dans 7 jours : ${engineLabel}`
        : reminderType === "J-1"   ? `Entretien demain : ${engineLabel}`
        : `Entretien en retard : ${engineLabel}`;
      const body =
        reminderType === "OVERDUE"
          ? `L'entretien planifie le ${rec.prochainEntretien} n'a pas ete effectue. Programmez-le rapidement.`
          : `Prevoyez l'entretien planifie le ${rec.prochainEntretien}.`;

      try {
        await sendPush(row.user_id, title, body, `/fleet`);
        await admin.from("maintenance_reminders_sent").insert({
          device_id: deviceId,
          reminder_type: reminderType,
          target_date: rec.prochainEntretien,
        });
        totalRemindersSent++;
      } catch (e) {
        console.error(`send-push failed for ${deviceId}:`, e);
      }
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      today,
      reminders_sent: totalRemindersSent,
      skipped_idempotent: totalSkippedIdempotent,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
});
