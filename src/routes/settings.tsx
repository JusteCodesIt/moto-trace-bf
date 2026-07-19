import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Bell, Smartphone, User, Sliders, Sparkles, Copy, RefreshCw, Radio, QrCode, FileCode, LogOut, ChevronDown, ChevronUp, BookOpen, CircleDot } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { SectionHero } from "@/components/SectionHero";
import { useEffect, useState } from "react";
import { confirm, notify } from "@/components/ConfirmDialog";
import illusSettings from "@/assets/illus-settings.png";
import { getMySettings, updateMySettings, type UserSettings } from "@/lib/settings.functions";
import { signOut } from "@/lib/auth";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Paramètres — AutoTrack" }] }),
  component: SettingsPage,
});

const SECTIONS = [
  { id: "notif", label: "Notifications", icon: Bell },
  { id: "thresholds", label: "Alertes & seuils", icon: Sliders },

  { id: "device", label: "Appareil & réseau", icon: Smartphone },
  { id: "account", label: "Compte", icon: User },
];

const ALERT_TYPES = ["Choc détecté", "Sortie géozone", "Batterie faible", "Excès de vitesse"];


function SettingsPage() {
  const [active, setActive] = useState("notif");
  const [settings, setSettings] = useState<UserSettings | null>(null);

  useEffect(() => {
    getMySettings().then((s) => setSettings(s ?? {}));
  }, []);

  const save = async (patch: Partial<UserSettings>) => {
    const next = await updateMySettings({ data: { patch } });
    setSettings(next);
    return next;
  };

  return (
    <AppShell>
      <div className="p-4 md:p-6 pb-24 max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <div className="size-9 rounded-lg bg-[var(--accent-primary)]/10 grid place-items-center">
            <Sparkles className="size-4 text-[var(--accent-primary)]" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Paramètres</h1>
            <p className="text-xs text-[var(--text-secondary)]">Notifications, seuils, sécurité, appareil & compte</p>
          </div>
        </div>

        <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setActive(s.id)}
              className={`shrink-0 h-8 px-3 rounded-lg flex items-center gap-2 text-xs transition-colors ${active === s.id ? "bg-[var(--accent-primary)]/15 text-[var(--accent-primary)] font-medium" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)]"}`}
            >
              <s.icon className="size-3.5" /> {s.label}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          {!settings ? (
            <div className="card-elev p-4 text-xs text-[var(--text-secondary)]">Chargement…</div>
          ) : (
            <>
              {active === "notif" && <NotifSection settings={settings} save={save} />}
              {active === "thresholds" && <ThresholdsSection settings={settings} save={save} />}

              {active === "device" && <DeviceSection settings={settings} save={save} />}
              {active === "account" && <AccountSection settings={settings} save={save} />}
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function Card({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="card-elev p-4">
      <div className="flex items-center justify-between mb-3 gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

type SectionProps = { settings: UserSettings; save: (p: Partial<UserSettings>) => Promise<UserSettings> };

function NotifSection({ settings, save }: SectionProps) {
  const notif = settings.notif ?? {};
  const matrix = notif.matrix ?? {};
  const [smsPhone, setSmsPhone] = useState(notif.smsPhone ?? "+226 70 00 00 00");
  const [pushStatus, setPushStatus] = useState<
    "loading" | "subscribed" | "unsubscribed" | "denied" | "unsupported" | "vapid_missing"
  >("loading");
  const [pushWorking, setPushWorking] = useState(false);

  useEffect(() => {
    (async () => {
      const { isPushSupported, hasVapidKey, getExistingSubscription } = await import(
        "@/lib/push-notifications"
      );
      if (!isPushSupported()) { setPushStatus("unsupported"); return; }
      if (!hasVapidKey()) { setPushStatus("vapid_missing"); return; }
      if (Notification.permission === "denied") { setPushStatus("denied"); return; }
      const sub = await getExistingSubscription();
      setPushStatus(sub ? "subscribed" : "unsubscribed");
    })();
  }, []);

  const onTest = async () => {
    const ok = await confirm({
      title: "Envoyer une notification de test ?",
      description:
        pushStatus === "subscribed"
          ? "Une notification push sera affichée via le service worker."
          : "Une notification locale sera affichée.",
      tone: "info",
      confirmLabel: "Envoyer",
    });
    if (!ok) return;
    if (pushStatus === "subscribed") {
      try {
        const { supabase } = await import("@/integrations/supabase/client");
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { error } = await supabase.functions.invoke("send-push", {
            body: { user_id: user.id, title: "AutoTrack — Test", body: "Pipeline push fonctionnel ✓", tag: "test" },
          });
          if (error) throw error;
          await notify({ title: "Notification push envoyée", tone: "success" });
          return;
        }
      } catch {
        await notify({ title: "Échec de l'envoi push — vérifiez la configuration VAPID", tone: "danger" });
        return;
      }
    }
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification("AutoTrack", { body: "Notification de test reçue." });
    }
    await notify({ title: "Notification locale envoyée", tone: "success" });
  };

  const togglePush = async () => {
    setPushWorking(true);
    try {
      const {
        subscribePush,
        unsubscribePush,
        saveSubscriptionToDb,
        deleteSubscriptionFromDb,
      } = await import("@/lib/push-notifications");

      if (pushStatus === "subscribed") {
        const ok = await confirm({
          title: "Désactiver les notifications push ?",
          description: "Vous ne recevrez plus d'alertes de flotte sur cet appareil.",
          tone: "warning",
          confirmLabel: "Désactiver",
        });
        if (!ok) return;
        await unsubscribePush();
        await deleteSubscriptionFromDb();
        await save({ notif: { ...notif, pushEnabled: false } });
        setPushStatus("unsubscribed");
        await notify({ title: "Notifications push désactivées", tone: "success" });
      } else {
        const { sub, error } = await subscribePush();
        if (error === "vapid_manquant") {
          await notify({
            title: "Configuration manquante",
            description:
              "Clé VAPID absente. Exécutez : npx web-push generate-vapid-keys puis définissez VITE_VAPID_PUBLIC_KEY dans .env",
            tone: "danger",
          });
          setPushStatus("vapid_missing");
          return;
        }
        if (error === "permission_refusée") {
          setPushStatus("denied");
          await notify({
            title: "Permission refusée",
            description: "Autorisez les notifications dans les paramètres du navigateur.",
            tone: "warning",
          });
          return;
        }
        if (!sub) {
          await notify({ title: "Échec de l'abonnement", description: error ?? "", tone: "danger" });
          return;
        }
        await saveSubscriptionToDb(sub);
        await save({ notif: { ...notif, pushEnabled: true } });
        setPushStatus("subscribed");
        await notify({ title: "Notifications push activées sur cet appareil", tone: "success" });
      }
    } finally {
      setPushWorking(false);
    }
  };

  const onSaveSms = async () => {
    await save({ notif: { ...notif, smsPhone } });
    await notify({ title: "Numéro SMS enregistré", tone: "success" });
  };

  const setMatrix = async (alert: string, channel: "push" | "sms", v: boolean) => {
    const row = matrix[alert] ?? { push: true, sms: false };
    const updated = { ...matrix, [alert]: { ...row, [channel]: v } };
    await save({ notif: { ...notif, matrix: updated } });
  };

  const STATUS_META = {
    loading:       { label: "Vérification…",            cls: "text-[var(--text-secondary)]" },
    subscribed:    { label: "Actif sur cet appareil",   cls: "text-[var(--accent-green)]" },
    unsubscribed:  { label: "Désactivé",                cls: "text-[var(--text-secondary)]" },
    denied:        { label: "Bloqué par le navigateur", cls: "text-[var(--accent-amber)]" },
    unsupported:   { label: "Non supporté",             cls: "text-[var(--text-secondary)]" },
    vapid_missing: { label: "Configuration manquante",  cls: "text-[var(--accent-red)]" },
  } as const;

  return (
    <>
      <Card title="Notifications push">
        <div className="flex items-center justify-between p-3 rounded-md bg-[var(--bg-elevated)] gap-3">
          <div>
            <div className="text-sm font-medium">Statut</div>
            <div className={`text-xs mono ${STATUS_META[pushStatus].cls}`}>
              {STATUS_META[pushStatus].label}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={togglePush}
              disabled={
                pushWorking ||
                pushStatus === "loading" ||
                pushStatus === "unsupported" ||
                pushStatus === "denied"
              }
              className="h-8 px-3 text-xs rounded-md bg-[var(--bg-surface)] hover:bg-[var(--border-active)] disabled:opacity-40"
            >
              {pushWorking ? "…" : pushStatus === "subscribed" ? "Désactiver" : "Activer"}
            </button>
            <button
              onClick={onTest}
              disabled={pushStatus === "loading"}
              className="h-8 px-3 text-xs rounded-md bg-[var(--accent-primary)] text-[var(--accent-milk)] font-semibold hover:opacity-90 disabled:opacity-40"
            >
              Tester
            </button>
          </div>
        </div>
        {pushStatus === "vapid_missing" && (
          <p className="mt-2 text-[11px] text-[var(--accent-amber)] leading-relaxed">
            Générez les clés :{" "}
            <code className="mono bg-[var(--bg-elevated)] px-1 rounded">
              npx web-push generate-vapid-keys
            </code>
            {" "}puis définissez{" "}
            <code className="mono bg-[var(--bg-elevated)] px-1 rounded">VITE_VAPID_PUBLIC_KEY</code>{" "}
            dans <code className="mono bg-[var(--bg-elevated)] px-1 rounded">.env</code> et{" "}
            <code className="mono bg-[var(--bg-elevated)] px-1 rounded">VAPID_PUBLIC_KEY</code> +{" "}
            <code className="mono bg-[var(--bg-elevated)] px-1 rounded">VAPID_PRIVATE_KEY</code>{" "}
            dans les secrets de l'Edge Function <code className="mono bg-[var(--bg-elevated)] px-1 rounded">send-push</code>.
          </p>
        )}
        {pushStatus === "denied" && (
          <p className="mt-2 text-[11px] text-[var(--accent-amber)] leading-relaxed">
            Le navigateur a bloqué les notifications. Ouvrez les paramètres du site et autorisez les notifications, puis actualisez la page.
          </p>
        )}
      </Card>

      <Card title="Notifications SMS" action={
        <button onClick={onSaveSms} className="h-8 px-3 text-xs rounded-md bg-[var(--accent-primary)] text-[var(--accent-milk)] font-semibold hover:opacity-90">
          Enregistrer
        </button>
      }>
        <input
          value={smsPhone}
          onChange={(e) => setSmsPhone(e.target.value)}
          placeholder="+226 70 00 00 00"
          className="w-full h-10 px-3 rounded-md bg-[var(--bg-elevated)] border border-[var(--border)] text-sm mono outline-none focus:border-[var(--accent-primary)]"
        />
      </Card>

      <Card title="Matrice d'alertes">
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_repeat(2,64px)] gap-2 items-center text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-semibold pb-1 border-b border-[var(--border)]">
            <span>Type</span><span className="text-center">Push</span><span className="text-center">SMS</span>
          </div>
          {ALERT_TYPES.map((t) => {
            const row = matrix[t] ?? { push: true, sms: false };
            return (
              <div key={t} className="grid grid-cols-[1fr_repeat(2,64px)] gap-2 items-center py-2 border-b border-[var(--border)] last:border-0">
                <span className="text-sm">{t}</span>
                {(["push", "sms"] as const).map((c) => (
                  <div key={c} className="flex justify-center">
                    <ToggleSwitch checked={row[c]} onChange={(v) => setMatrix(t, c, v)} />
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </Card>
    </>
  );
}

function ThresholdsSection({ settings, save }: SectionProps) {
  const t = settings.thresholds ?? {};
  const [speed, setSpeed] = useState(String(t.speedKmh ?? 90));
  const [shock, setShock] = useState(String(t.shockG ?? 2.5));
  const [geo, setGeo] = useState(String(t.geofenceDelaySec ?? 30));
  const [batt, setBatt] = useState(String(t.lowBatteryPct ?? 20));

  const onSave = async () => {
    const ok = await confirm({
      title: "Enregistrer les seuils ?",
      description: "Les nouveaux seuils seront appliqués aux alertes générées par l'application.",
      tone: "warning",
      confirmLabel: "Enregistrer",
    });
    if (!ok) return;
    await save({
      thresholds: {
        speedKmh: Number(speed) || 0,
        shockG: Number(shock) || 0,
        geofenceDelaySec: Number(geo) || 0,
        lowBatteryPct: Number(batt) || 0,
      },
    });
    await notify({ title: "Seuils enregistrés", tone: "success" });
  };

  const fields = [
    { label: "Limite vitesse", value: speed, set: setSpeed, unit: "km/h" },
    { label: "Sensibilité choc", value: shock, set: setShock, unit: "g" },
    { label: "Délai sortie géozone", value: geo, set: setGeo, unit: "s" },
    { label: "Seuil batterie faible", value: batt, set: setBatt, unit: "%" },
  ];

  return (
    <Card title="Seuils d'alerte" action={
      <button onClick={onSave} className="h-8 px-3 text-xs rounded-md bg-[var(--accent-primary)] text-[var(--accent-milk)] font-semibold hover:opacity-90">
        Enregistrer
      </button>
    }>
      <div className="space-y-4">
        {fields.map((f) => (
          <div key={f.label} className="grid grid-cols-[1fr_auto] gap-3 items-center">
            <label className="text-sm">{f.label}</label>
            <div className="flex items-center gap-2">
              <input
                value={f.value}
                onChange={(e) => f.set(e.target.value)}
                className="w-20 h-9 px-3 rounded-md bg-[var(--bg-elevated)] border border-[var(--border)] text-sm mono text-right outline-none focus:border-[var(--accent-primary)]"
              />
              <span className="text-xs text-[var(--text-secondary)] mono w-10">{f.unit}</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}


function DeviceSection({ settings, save }: SectionProps) {
  const net = settings.network ?? {};
  const [devices, setDevices] = useState<Array<{ id: string; name: string; internal_id?: string }>>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const device = devices.find((d) => d.id === selectedId) ?? null;
  const [hmacSecret, setHmacSecret] = useState<string>("");
  const [keyRotatedAt, setKeyRotatedAt] = useState<string | null>(null);
  const [ingestUrl, setIngestUrl] = useState("/api/public/ingest");
  const [apiUrl, setApiUrl] = useState(net.apiUrl || "");
  const [apn, setApn] = useState(net.apn || "internet");
  const [qrUrl, setQrUrl] = useState<string>("");
  const [showQr, setShowQr] = useState(false);
  const [qrMode, setQrMode] = useState<"serial" | "portal">("serial");
  const [showGuide, setShowGuide] = useState(devices.length === 0);

  useEffect(() => {
    (async () => {
      const { listMyDevices } = await import("@/lib/devices.functions");
      const list = await listMyDevices();
      setDevices(list.map((d: any) => ({ id: d.id, name: d.name, internal_id: d.internal_id })));
      const url = `${window.location.origin}/api/public/ingest`;
      setIngestUrl(url);
      if (!apiUrl) setApiUrl(url);
      if (list.length > 0) setSelectedId(list[0].id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    (async () => {
      const { getDeviceCredentials } = await import("@/lib/devices.functions");
      const res = await getDeviceCredentials({ data: { deviceId: selectedId } });
      setHmacSecret(res.hmacSecret ?? "");
      setKeyRotatedAt(res.keyRotatedAt);
    })();
  }, [selectedId]);

  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      await notify({ title: `${label} copié`, tone: "success" });
    } catch {
      await notify({ title: "Copie impossible", tone: "warning" });
    }
  };

  const onShowQr = async () => {
    if (!device || !hmacSecret) {
      await notify({ title: "Sélectionnez un traceur et attendez le chargement des clés", tone: "warning" });
      return;
    }
    try {
      const QRCode = (await import("qrcode")).default;
      const payload = JSON.stringify({ v: 1, url: ingestUrl, id: device.id, key: hmacSecret });
      const url = await QRCode.toDataURL(payload, { width: 220, margin: 2, color: { dark: "#000000", light: "#ffffff" } });
      setQrUrl(url);
      setQrMode("serial");
      setShowQr(true);
    } catch {
      await notify({ title: "Erreur lors de la génération du QR", tone: "danger" });
    }
  };

  // QR pour le portail Wi-Fi du firmware v4 : encode l'URL que le boitier lit
  // directement (http://192.168.4.1/save?...). Une fois le telephone connecte
  // au Wi-Fi "AutoTrack-Setup", scanner ce QR configure le boitier en un scan.
  const onShowPortalQr = async () => {
    if (!device || !hmacSecret) {
      await notify({ title: "Sélectionnez un traceur et attendez le chargement des clés", tone: "warning" });
      return;
    }
    try {
      const QRCode = (await import("qrcode")).default;
      const params = new URLSearchParams({
        device_id: device.id,
        hmac_secret: hmacSecret,
        apn: apn || "internet",
      });
      const portalUrl = `http://192.168.4.1/save?${params.toString()}`;
      const url = await QRCode.toDataURL(portalUrl, { width: 220, margin: 2, color: { dark: "#000000", light: "#ffffff" } });
      setQrUrl(url);
      setQrMode("portal");
      setShowQr(true);
    } catch {
      await notify({ title: "Erreur lors de la génération du QR", tone: "danger" });
    }
  };

  const downloadSecretsH = () => {
    if (!device || !hmacSecret) return;
    const vehicleName = (device.internal_id ?? device.name).replace(/[^a-zA-Z0-9_-]/g, "_");
    const date = new Date().toLocaleDateString("fr-FR");
    const content = [
      `// ================================================================`,
      `// AutoTrack — Configuration firmware ESP32-S3`,
      `// Véhicule : ${device.internal_id ?? device.name}`,
      `// Généré   : ${date}`,
      `// ⚠  Ne jamais committer ce fichier — ajoutez-le à .gitignore`,
      `// ================================================================`,
      ``,
      `#pragma once`,
      ``,
      `// Identifiant unique du traceur (UUID v4)`,
      `#define AUTOTRACK_DEVICE_ID   "${device.id}"`,
      ``,
      `// Clé HMAC-SHA256 pour signer chaque trame POST`,
      `#define AUTOTRACK_HMAC_SECRET "${hmacSecret}"`,
      ``,
      `// Endpoint d'ingestion HTTPS`,
      `#define AUTOTRACK_INGEST_URL  "${ingestUrl}"`,
      ``,
      `// APN opérateur SIM7080G`,
      `#define AUTOTRACK_APN         "${apn || "internet"}"`,
    ].join("\n");
    const blob = new Blob([content], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `autotrack_${vehicleName}_secrets.h`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const sendCommand = async (kind: string, payload?: Record<string, unknown>) => {
    if (!selectedId) return null;
    const { supabase } = await import("@/integrations/supabase/client");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { error } = await supabase.from("commands").insert({
      device_id: selectedId, kind, issued_by: user.id, payload: (payload ?? null) as never,
    });
    if (error) {
      await notify({ title: "Erreur", description: error.message, tone: "danger" });
      return null;
    }
    return true;
  };

  const onReboot = async () => {
    const ok = await confirm({
      title: "Redémarrer le module ESP32-S3 ?",
      description: "Le tracker exécutera la commande à sa prochaine connexion 4G.",
      tone: "warning",
      confirmLabel: "Redémarrer",
    });
    if (!ok) return;
    if (await sendCommand("reboot")) await notify({ title: "Reboot programmé", tone: "success" });
  };

  const onRotateHmac = async () => {
    if (!selectedId) return;
    const ok = await confirm({
      title: "Générer une nouvelle clé HMAC ?",
      description: "L'ancienne clé sera invalidée. Re-flashez le firmware.",
      tone: "danger",
      confirmLabel: "Régénérer",
    });
    if (!ok) return;
    const { rotateDeviceKey } = await import("@/lib/devices.functions");
    const res = await rotateDeviceKey({ data: { deviceId: selectedId } });
    setHmacSecret(res.hmacSecret);
    setKeyRotatedAt(new Date().toISOString());
    await notify({ title: "Clé HMAC régénérée", tone: "success" });
  };

  const onSaveEndpoint = async () => {
    const ok = await confirm({
      title: "Enregistrer cette configuration réseau ?",
      description: `Endpoint: ${apiUrl}\nAPN: ${apn}\n\nCes valeurs sont informatives : l'URL d'ingestion et l'APN doivent être compilés dans le firmware (include/secrets.h) pour être effectifs.`,
      tone: "warning",
      confirmLabel: "Enregistrer",
    });
    if (!ok) return;
    await save({ network: { ...net, apiUrl, apn } });
    await notify({ title: "Configuration enregistrée", tone: "success" });
  };

  const onPing = async () => {
    if (await sendCommand("ping")) {
      await notify({ title: "Ping mis en file", description: "Le tracker répondra à sa prochaine connexion.", tone: "success" });
    }
  };

  return (
    <>
      {/* QR Code modal */}
      {showQr && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={() => setShowQr(false)}
        >
          <div
            className="bg-[var(--bg-surface)] border border-[var(--border)] p-5 rounded-xl max-w-[300px] w-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-center">
              {qrMode === "portal" ? "QR portail Wi-Fi" : "QR Code d'appairage"}
            </h3>
            <p className="text-[11px] text-[var(--text-secondary)] text-center mt-1 mb-4 leading-relaxed">
              {qrMode === "portal" ? (
                <>1. Connectez le téléphone au Wi-Fi <strong>AutoTrack-Setup</strong> (mot de passe <strong>autotrack</strong>).<br />2. Scannez ce QR : le boîtier se configure seul.</>
              ) : (
                <>Scannez depuis le firmware ou l'outil de provisionnement.<br />Encode : Device ID · Clé HMAC · URL serveur.</>
              )}
            </p>
            {qrUrl && (
              <div className="bg-white p-3 rounded-lg mx-auto" style={{ width: "fit-content" }}>
                <img src={qrUrl} alt="QR code d'appairage AutoTrack" width={200} height={200} />
              </div>
            )}
            <div className="mt-3 text-[10px] mono text-[var(--text-dim)] space-y-0.5">
              <div className="truncate">ID : {device?.id?.slice(0, 20)}…</div>
              <div className="truncate">URL : {ingestUrl.replace("https://", "")}</div>
            </div>
            <div className="mt-3 p-2 rounded-md bg-[var(--accent-amber)]/10 border border-[var(--accent-amber)]/20 text-[10px] text-[var(--accent-amber)] leading-relaxed">
              ⚠ Ce QR contient la clé HMAC secrète. Ne pas photographier ni partager.
            </div>
            <button
              onClick={() => setShowQr(false)}
              className="mt-3 w-full h-9 text-xs rounded-lg bg-[var(--bg-elevated)] hover:bg-[var(--border-active)] transition-colors"
            >
              Fermer
            </button>
          </div>
        </div>
      )}

      {/* Guide d'appairage */}
      <div className="card-elev overflow-hidden">
        <button
          onClick={() => setShowGuide((v) => !v)}
          className="w-full flex items-center gap-3 p-4 text-left hover:bg-[var(--bg-elevated)]/40 transition-colors"
        >
          <div className="size-8 rounded-lg bg-[var(--accent-primary)]/10 grid place-items-center shrink-0">
            <BookOpen className="size-4 text-[var(--accent-primary)]" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold">Guide d'appairage — Comment configurer un traceur ?</h3>
            <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">Suivez les 5 étapes pour connecter un traceur GPS à AutoTrack</p>
          </div>
          {showGuide ? <ChevronUp className="size-4 text-[var(--text-secondary)] shrink-0" /> : <ChevronDown className="size-4 text-[var(--text-secondary)] shrink-0" />}
        </button>

        {showGuide && (
          <div className="px-4 pb-4 space-y-3">
            <div className="h-px bg-[var(--border)]" />

            <PairingStep n={1} title="Enregistrer le véhicule" done={devices.length > 0}>
              Rendez-vous sur <a href="/fleet" className="text-[var(--accent-primary)] hover:underline font-medium">Flotte</a> et cliquez <strong>« Ajouter un véhicule »</strong>. Choisissez le modèle JMC et donnez un nom (ex: <span className="mono text-[var(--accent-cyan)]">JMC-01</span>). Un identifiant unique (<strong>Device ID</strong>) est généré automatiquement.
            </PairingStep>

            <PairingStep n={2} title="Récupérer les identifiants" done={!!hmacSecret}>
              Ci-dessous, sélectionnez le traceur dans la liste. Les champs <strong>DEVICE_ID</strong>, <strong>HMAC_SECRET</strong> et <strong>INGEST_URL</strong> s'affichent automatiquement. Vous pouvez les copier un par un ou télécharger le fichier <strong>secrets.h</strong>.
            </PairingStep>

            <PairingStep n={3} title="Flasher le firmware ESP32-S3">
              Deux options :
              <ul className="mt-1 space-y-1 text-[11px] leading-relaxed">
                <li className="flex gap-2"><span className="text-[var(--accent-primary)]">A.</span> <span><strong>Fichier secrets.h</strong> — Cliquez le bouton <FileCode className="inline size-3" /> ci-dessous, copiez le fichier dans <code className="mono bg-[var(--bg-elevated)] px-1 rounded">include/</code> de votre projet PlatformIO, puis compilez et flashez via USB.</span></li>
                <li className="flex gap-2"><span className="text-[var(--accent-primary)]">B.</span> <span><strong>QR Code</strong> — Cliquez <QrCode className="inline size-3" /> et scannez le QR depuis l'outil de provisionnement série. Les 3 valeurs sont injectées automatiquement en NVS.</span></li>
              </ul>
            </PairingStep>

            <PairingStep n={4} title="Installer et alimenter">
              Connectez le module ESP32-S3 + SIM7080G à l'alimentation 12V du véhicule. Vérifiez que la carte SIM est insérée et que l'APN correspond à votre opérateur (configurable ci-dessous). Le module démarre et se connecte au réseau 4G en ~30 secondes.
            </PairingStep>

            <PairingStep n={5} title="Vérifier la connexion">
              Revenez sur le <a href="/" className="text-[var(--accent-primary)] hover:underline font-medium">Dashboard</a>. Le véhicule doit apparaître avec un <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-[var(--accent-green)] inline-block" /> point vert</span> dans le panneau flotte. Utilisez le bouton <strong>Ping</strong> ci-dessous pour vérifier la communication bidirectionnelle.
            </PairingStep>

            <div className="p-2.5 rounded-md bg-[var(--accent-cyan)]/8 border border-[var(--accent-cyan)]/15 text-[11px] text-[var(--text-secondary)] leading-relaxed">
              <strong className="text-[var(--accent-cyan)]">Besoin d'aide ?</strong> Chaque traceur est identifié par 3 éléments : un <strong>Device ID</strong> (UUID unique), une <strong>clé HMAC</strong> (signature des trames GPS) et l'<strong>URL du serveur</strong>. Le traceur envoie une trame GPS toutes les 5 secondes, signée avec la clé HMAC, sur l'endpoint d'ingestion sécurisé via HTTPS.
            </div>
          </div>
        )}
      </div>

      <Card title="Sélection du traceur" action={
        <span className="text-[10px] mono text-[var(--text-secondary)]">{devices.length} traceur{devices.length !== 1 ? "s" : ""}</span>
      }>
        {devices.length === 0 ? (
          <p className="text-xs text-[var(--text-secondary)]">Aucun traceur enregistré. <a href="/fleet" className="text-[var(--accent-primary)] hover:underline">Ajouter un véhicule</a></p>
        ) : (
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="w-full h-10 px-3 rounded-md bg-[var(--bg-elevated)] border border-[var(--border)] text-sm outline-none focus:border-[var(--accent-primary)]"
          >
            {devices.map((d) => (
              <option key={d.id} value={d.id}>{d.internal_id ?? d.name} — {d.id.slice(0, 8)}…</option>
            ))}
          </select>
        )}
      </Card>

      <Card title="État du module" action={
        <span className={`text-[10px] mono px-2 py-0.5 rounded ${device ? "bg-[var(--accent-green)]/15 text-[var(--accent-green)]" : "bg-[var(--accent-amber)]/15 text-[var(--accent-amber)]"}`}>
          {device ? "COUPLÉ" : "AUCUN"}
        </span>
      }>
        <div className="space-y-2 text-xs">
          <Row k="Device ID" v={device?.id ?? "—"} />
          <Row k="Nom" v={device?.name ?? device?.internal_id ?? "—"} />
          <Row k="Endpoint d'ingestion" v={ingestUrl} />
          <Row k="Clé rotée" v={keyRotatedAt ? new Date(keyRotatedAt).toLocaleString("fr-FR") : "—"} />
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={onPing} className="flex-1 h-9 text-xs rounded-md bg-[var(--bg-elevated)] hover:bg-[var(--border-active)] flex items-center justify-center gap-1.5">
            <Radio className="size-3.5" /> Ping
          </button>
          <button
            onClick={onShowPortalQr}
            disabled={!hmacSecret}
            title="QR pour le portail Wi-Fi du firmware v4 (configuration en un scan)"
            className="flex-1 h-9 text-xs rounded-md bg-[var(--accent-primary)] text-[var(--accent-milk)] font-semibold hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-1.5"
          >
            <QrCode className="size-3.5" /> QR Wi-Fi
          </button>
          <button
            onClick={onShowQr}
            disabled={!hmacSecret}
            title="QR JSON pour l'outil de provisionnement série (ancien firmware)"
            className="flex-1 h-9 text-xs rounded-md bg-[var(--bg-elevated)] hover:bg-[var(--border-active)] disabled:opacity-40 flex items-center justify-center gap-1.5"
          >
            <QrCode className="size-3.5" /> QR série
          </button>
        </div>
      </Card>

      <Card title="Identifiants à flasher dans le firmware ESP32-S3" action={
        <button
          onClick={downloadSecretsH}
          disabled={!hmacSecret}
          title="Télécharger le fichier secrets.h prêt à compiler"
          className="h-8 px-3 text-xs rounded-md bg-[var(--bg-elevated)] hover:bg-[var(--border-active)] disabled:opacity-40 flex items-center gap-1.5"
        >
          <FileCode className="size-3.5" /> secrets.h
        </button>
      }>
        <p className="text-xs text-[var(--text-secondary)] mb-3 leading-relaxed">
          Ces trois valeurs doivent être compilées dans le firmware. Utilisez <strong>secrets.h</strong> pour les copier d'un coup, ou <strong>QR Code</strong> pour les scanner depuis le provisionnement firmware.
        </p>
        <div className="space-y-2">
          <CodeRow label="DEVICE_ID" value={device?.id ?? ""} onCopy={copy} />
          <CodeRow label="HMAC_SECRET" value={hmacSecret} onCopy={copy} mask />
          <CodeRow label="INGEST_URL" value={ingestUrl} onCopy={copy} />
        </div>
      </Card>

      <Card title="Endpoint backend & APN" action={
        <button onClick={onSaveEndpoint} className="h-8 px-3 text-xs rounded-md bg-[var(--accent-primary)] text-[var(--accent-milk)] font-semibold hover:opacity-90">
          Enregistrer
        </button>
      }>
        <div className="space-y-3">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-semibold">URL d'ingestion HTTPS</label>
            <input
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              className="mt-1 w-full h-10 px-3 rounded-md bg-[var(--bg-elevated)] border border-[var(--border)] text-sm mono outline-none focus:border-[var(--accent-primary)]"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-semibold">APN opérateur</label>
            <input
              value={apn}
              onChange={(e) => setApn(e.target.value)}
              className="mt-1 w-full h-10 px-3 rounded-md bg-[var(--bg-elevated)] border border-[var(--border)] text-sm mono outline-none focus:border-[var(--accent-primary)]"
            />
          </div>
        </div>
      </Card>

      <Card title="Clé HMAC (signature des trames)" action={
        <button onClick={onRotateHmac} className="h-8 px-3 text-xs rounded-md bg-[var(--bg-elevated)] hover:bg-[var(--border-active)] flex items-center gap-1.5">
          <RefreshCw className="size-3.5" /> Régénérer
        </button>
      }>
        <p className="text-xs text-[var(--text-secondary)] mb-3">
          Cette clé authentifie chaque trame GPS/télémétrie envoyée par l'ESP32-S3.
        </p>
        <div className="flex items-center gap-2 p-3 rounded-md bg-[var(--bg-elevated)]">
          <code className="flex-1 text-[11px] mono break-all text-[var(--accent-cyan)]">{hmacSecret || "—"}</code>
          <button onClick={() => copy("Clé HMAC", hmacSecret)} className="size-8 grid place-items-center rounded-md hover:bg-[var(--bg-surface)] shrink-0">
            <Copy className="size-3.5" />
          </button>
        </div>
      </Card>

      <Card title="Maintenance" action={
        <button onClick={onReboot} className="h-8 px-3 text-xs rounded-md bg-[var(--accent-red)]/15 text-[var(--accent-red)] font-semibold hover:bg-[var(--accent-red)]/25">
          Redémarrer
        </button>
      }>
        <p className="text-xs text-[var(--text-secondary)]">
          Redémarrage à distance via le réseau cellulaire SIM7080G (commande mise en file, exécutée à la prochaine connexion du tracker).
        </p>
      </Card>
    </>
  );
}

function AccountSection({ settings, save }: SectionProps) {
  const p = settings.profile ?? {};
  const navigate = useNavigate();
  const [name, setName] = useState(p.name ?? "");
  const [phone, setPhone] = useState(p.phone ?? "");
  const [email, setEmail] = useState(p.email ?? "");

  useEffect(() => {
    (async () => {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data: { user } } = await supabase.auth.getUser();
      if (user && !email) setEmail(user.email ?? "");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSave = async () => {
    await save({ profile: { name, phone } });
    await notify({ title: "Profil enregistré", tone: "success" });
  };

  const onLogout = async () => {
    const ok = await confirm({
      title: "Se déconnecter ?",
      description: "Vous devrez vous reconnecter pour suivre votre véhicule.",
      tone: "warning",
      confirmLabel: "Déconnecter",
    });
    if (!ok) return;
    await signOut();
    await notify({ title: "Déconnecté", tone: "success" });
    navigate({ to: "/auth/login", replace: true });
  };

  return (
    <>
      <Card title="Profil" action={
        <button onClick={onSave} className="h-8 px-3 text-xs rounded-md bg-[var(--accent-primary)] text-[var(--accent-milk)] font-semibold hover:opacity-90">
          Enregistrer
        </button>
      }>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nom" value={name} onChange={setName} />
            <Field label="Téléphone" value={phone} onChange={setPhone} />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-semibold">Email</label>
            <input
              value={email}
              readOnly
              className="mt-1 w-full h-10 px-3 rounded-md bg-[var(--bg-elevated)] border border-[var(--border)] text-sm outline-none opacity-60 cursor-not-allowed"
            />
            <p className="text-[10px] text-[var(--text-dim)] mt-1">L'email est lié à votre compte Supabase Auth et ne peut être modifié ici.</p>
          </div>
        </div>
      </Card>
      <Card title="Session" action={
        <button onClick={onLogout} className="h-8 px-3 text-xs rounded-md bg-[var(--bg-elevated)] hover:bg-[var(--accent-red)]/15 hover:text-[var(--accent-red)] flex items-center gap-1.5">
          <LogOut className="size-3.5" /> Se déconnecter
        </button>
      }>
        <p className="text-xs text-[var(--text-secondary)]">AutoTrack — développé par YAGO Ibrahima Juste.</p>
      </Card>
    </>
  );
}

function PairingStep({ n, title, done, children }: { n: number; title: string; done?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className={`size-6 rounded-full shrink-0 grid place-items-center text-[11px] font-bold mt-0.5 ${done ? "bg-[var(--accent-green)]/15 text-[var(--accent-green)]" : "bg-[var(--bg-elevated)] text-[var(--text-secondary)]"}`}>
        {done ? <CircleDot className="size-3.5" /> : n}
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="text-xs font-semibold">{title}</h4>
        <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 leading-relaxed">{children}</p>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, maxLength = 100 }: { label: string; value: string; onChange: (v: string) => void; maxLength?: number }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-semibold">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={maxLength}
        className="mt-1 w-full h-10 px-3 rounded-md bg-[var(--bg-elevated)] border border-[var(--border)] text-sm outline-none focus:border-[var(--accent-primary)]"
      />
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 py-1.5 border-b border-[var(--border)] last:border-0">
      <span className="text-[var(--text-secondary)] shrink-0">{k}</span>
      <span className="mono truncate text-right">{v}</span>
    </div>
  );
}

function CodeRow({ label, value, onCopy, mask }: { label: string; value: string; onCopy: (l: string, v: string) => void; mask?: boolean }) {
  const [show, setShow] = useState(!mask);
  const display = !value ? "—" : mask && !show ? "•".repeat(Math.min(40, value.length)) : value;
  return (
    <div className="card-elev p-2.5 flex items-center gap-2">
      <span className="text-[10px] uppercase mono text-[var(--text-secondary)] w-24 shrink-0">{label}</span>
      <span className="flex-1 truncate text-[11px] mono">{display}</span>
      {mask && (
        <button onClick={() => setShow((v) => !v)} className="text-[10px] text-[var(--text-secondary)] hover:text-[var(--accent-cyan)] px-1">
          {show ? "Cacher" : "Voir"}
        </button>
      )}
      <button onClick={() => onCopy(label, value)} className="size-7 grid place-items-center rounded hover:bg-[var(--bg-elevated)]">
        <Copy className="size-3.5" />
      </button>
    </div>
  );
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex shrink-0 w-11 h-6 rounded-full transition-colors ${checked ? "bg-[var(--accent-primary)]" : "bg-[var(--bg-elevated)] border border-[var(--border)]"}`}
    >
      <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow-md transition-transform duration-200 ${checked ? "translate-x-[22px]" : "translate-x-0.5"}`} />
    </button>
  );
}


