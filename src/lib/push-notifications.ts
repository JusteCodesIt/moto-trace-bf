const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? "";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function hasVapidKey(): boolean {
  return !!VAPID_PUBLIC_KEY;
}

export async function getExistingSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    return reg ? reg.pushManager.getSubscription() : null;
  } catch {
    return null;
  }
}

export type PushError =
  | "non_supporté"
  | "vapid_manquant"
  | "permission_refusée"
  | "sw_échec"
  | string;

export async function subscribePush(): Promise<{
  sub: PushSubscription | null;
  error?: PushError;
}> {
  if (!isPushSupported()) return { sub: null, error: "non_supporté" };
  if (!VAPID_PUBLIC_KEY) return { sub: null, error: "vapid_manquant" };

  const perm =
    Notification.permission === "granted"
      ? "granted"
      : await Notification.requestPermission();
  if (perm !== "granted") return { sub: null, error: "permission_refusée" };

  let reg: ServiceWorkerRegistration | null = null;
  try {
    reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
  } catch {
    return { sub: null, error: "sw_échec" };
  }

  try {
    const existing = await reg.pushManager.getSubscription();
    if (existing) return { sub: existing };
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
    return { sub };
  } catch (e) {
    return { sub: null, error: String(e) };
  }
}

export async function unsubscribePush(): Promise<void> {
  if (!isPushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    const sub = await reg?.pushManager.getSubscription();
    await sub?.unsubscribe();
  } catch {
    /* noop */
  }
}

export async function saveSubscriptionToDb(sub: PushSubscription): Promise<void> {
  const { supabase } = await import("@/integrations/supabase/client");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const json = sub.toJSON();
  const keys = json.keys as Record<string, string> | undefined;
  await (supabase as any).from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint: json.endpoint,
      p256dh: keys?.p256dh ?? "",
      auth: keys?.auth ?? "",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
}

export async function deleteSubscriptionFromDb(): Promise<void> {
  const { supabase } = await import("@/integrations/supabase/client");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await (supabase as any).from("push_subscriptions").delete().eq("user_id", user.id);
}
