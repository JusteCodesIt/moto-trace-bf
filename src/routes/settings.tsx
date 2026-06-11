import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Bell, Shield, Smartphone, User, Sliders, Sparkles, Copy, RefreshCw, Wifi, Radio, Download, CheckCircle2, LogOut } from "lucide-react";
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
  { id: "antitheft", label: "Anti-vol & PIN", icon: Shield },
  { id: "device", label: "Appareil & réseau", icon: Smartphone },
  { id: "account", label: "Compte", icon: User },
];

const ALERT_TYPES = ["Choc détecté", "Sortie géozone", "Batterie faible", "Excès de vitesse"];

async function sha256(text: string) {
  const buf = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

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
      <div className="p-4 md:p-8 pb-24 max-w-6xl mx-auto">
        <SectionHero
          eyebrow="Configuration"
          icon={Sparkles}
          title="Paramètres du compte & de l'appareil"
          description="Notifications, seuils, code PIN anti-vol et connectivité du module ESP32-S3 — tout est centralisé ici."
          image={illusSettings}
        />

        <div className="grid md:grid-cols-[220px_1fr] gap-6">
          <nav className="space-y-1 md:sticky md:top-4 md:self-start">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => setActive(s.id)}
                className={`w-full h-10 px-3 rounded-md flex items-center gap-3 text-sm transition-colors ${active === s.id ? "bg-[var(--bg-elevated)] text-[var(--text-primary)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)]"}`}
              >
                <s.icon className="size-4" /> {s.label}
              </button>
            ))}
          </nav>

          <div className="space-y-4">
            {!settings ? (
              <div className="card-elev p-6 text-xs text-[var(--text-secondary)]">Chargement des préférences…</div>
            ) : (
              <>
                {active === "notif" && <NotifSection settings={settings} save={save} />}
                {active === "thresholds" && <ThresholdsSection settings={settings} save={save} />}
                {active === "antitheft" && <AntiTheftSection settings={settings} save={save} />}
                {active === "device" && <DeviceSection settings={settings} save={save} />}
                {active === "account" && <AccountSection settings={settings} save={save} />}
              </>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function Card({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="card-elev p-5">
      <div className="flex items-center justify-between mb-4 gap-2">
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

  const onTest = async () => {
    const ok = await confirm({
      title: "Envoyer une notification de test ?",
      description: "Une notification sera affichée en local.",
      tone: "info",
      confirmLabel: "Envoyer",
    });
    if (!ok) return;
    if ("Notification" in window) {
      const perm = Notification.permission === "granted"
        ? "granted"
        : await Notification.requestPermission();
      if (perm === "granted") {
        new Notification("AutoTrack", { body: "Notification de test reçue." });
      }
    }
    await notify({ title: "Notification envoyée", tone: "success" });
  };

  const togglePush = async () => {
    const enabled = !(notif.pushEnabled ?? true);
    if (enabled && "Notification" in window && Notification.permission !== "granted") {
      await Notification.requestPermission();
    }
    await save({ notif: { ...notif, pushEnabled: enabled } });
    await notify({ title: enabled ? "Notifications push activées" : "Notifications push désactivées", tone: "success" });
  };

  const onSaveSms = async () => {
    await save({ notif: { ...notif, smsPhone } });
    await notify({ title: "Numéro SMS enregistré", tone: "success" });
  };

  const setMatrix = async (alert: string, channel: "push" | "sms" | "email", v: boolean) => {
    const row = matrix[alert] ?? { push: true, sms: false, email: true };
    const updated = { ...matrix, [alert]: { ...row, [channel]: v } };
    await save({ notif: { ...notif, matrix: updated } });
  };

  return (
    <>
      <Card title="Notifications push">
        <div className="flex items-center justify-between p-3 rounded-md bg-[var(--bg-elevated)] gap-3">
          <div>
            <div className="text-sm font-medium">Statut</div>
            <div className={`text-xs mono ${(notif.pushEnabled ?? true) ? "text-[var(--accent-green)]" : "text-[var(--text-secondary)]"}`}>
              {(notif.pushEnabled ?? true) ? "Activé" : "Désactivé"}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={togglePush} className="h-8 px-3 text-xs rounded-md bg-[var(--bg-surface)] hover:bg-[var(--border-active)]">
              {(notif.pushEnabled ?? true) ? "Désactiver" : "Activer"}
            </button>
            <button onClick={onTest} className="h-8 px-3 text-xs rounded-md bg-[var(--accent-primary)] text-[var(--accent-milk)] font-semibold hover:opacity-90">
              Tester
            </button>
          </div>
        </div>
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
          <div className="grid grid-cols-[1fr_repeat(3,64px)] gap-2 items-center text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-semibold pb-1 border-b border-[var(--border)]">
            <span>Type</span><span className="text-center">Push</span><span className="text-center">SMS</span><span className="text-center">Email</span>
          </div>
          {ALERT_TYPES.map((t) => {
            const row = matrix[t] ?? { push: true, sms: false, email: true };
            return (
              <div key={t} className="grid grid-cols-[1fr_repeat(3,64px)] gap-2 items-center py-2 border-b border-[var(--border)] last:border-0">
                <span className="text-sm">{t}</span>
                {(["push", "sms", "email"] as const).map((c) => (
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
      description: "Les nouveaux seuils seront appliqués et envoyés au tracker.",
      tone: "warning",
      confirmLabel: "Enregistrer",
    });
    if (!ok) return;
    const patch = {
      thresholds: {
        speedKmh: Number(speed) || 0,
        shockG: Number(shock) || 0,
        geofenceDelaySec: Number(geo) || 0,
        lowBatteryPct: Number(batt) || 0,
      },
    };
    await save(patch);
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data: { user } } = await supabase.auth.getUser();
      const { data: dev } = await supabase.from("devices").select("id").eq("owner_id", user!.id).limit(1).maybeSingle();
      if (dev) {
        await supabase.from("commands").insert({
          device_id: dev.id,
          kind: "config",
          issued_by: user!.id,
          payload: patch.thresholds,
        });
      }
    } catch { /* ignore */ }
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

function AntiTheftSection({ settings, save }: SectionProps) {
  const at = settings.antitheft ?? {};
  const [pin, setPin] = useState(["", "", "", ""]);
  const hasPin = !!at.pinHash;

  const onSavePin = async () => {
    if (pin.some((d) => d === "")) {
      await notify({ title: "PIN incomplet", description: "Entrez les 4 chiffres.", tone: "warning" });
      return;
    }
    const ok = await confirm({
      title: "Définir ce nouveau PIN ?",
      description: "Ce code sera requis pour les commandes moteur.",
      tone: "danger",
      confirmLabel: "Définir",
    });
    if (!ok) return;
    const pinHash = await sha256(pin.join(""));
    await save({ antitheft: { ...at, pinHash } });
    setPin(["", "", "", ""]);
    await notify({ title: "PIN enregistré", tone: "success" });
  };

  const onToggle = async (key: "autolockMinIdle" | "stealthLed" | "tamperDetect", v: boolean) => {
    await save({ antitheft: { ...at, [key]: v } });
  };

  return (
    <>
      <Card title={hasPin ? "Changer le code PIN" : "Définir un code PIN à 4 chiffres"} action={
        <button onClick={onSavePin} className="h-8 px-3 text-xs rounded-md bg-[var(--accent-primary)] text-[var(--accent-milk)] font-semibold hover:opacity-90">
          {hasPin ? "Mettre à jour" : "Définir"}
        </button>
      }>
        <p className="text-xs text-[var(--text-secondary)] mb-3">
          {hasPin ? "Un PIN est déjà configuré. Saisissez-en un nouveau pour le remplacer." : "Requis pour les commandes moteur et la désactivation du suivi."}
        </p>
        <div className="flex gap-2">
          {pin.map((v, i) => (
            <input
              key={i}
              type="password"
              inputMode="numeric"
              maxLength={1}
              value={v}
              onChange={(e) => {
                const next = [...pin];
                next[i] = e.target.value.replace(/\D/g, "").slice(0, 1);
                setPin(next);
                if (next[i] && i < 3) {
                  const el = document.querySelectorAll<HTMLInputElement>("[data-pin]")[i + 1];
                  el?.focus();
                }
              }}
              data-pin
              className="size-12 text-center text-xl mono rounded-md bg-[var(--bg-elevated)] border border-[var(--border)] outline-none focus:border-[var(--accent-primary)]"
            />
          ))}
        </div>
      </Card>
      <Card title="Verrouillage auto">
        <LabeledToggle
          label="Verrouiller après 10 min moteur coupé"
          checked={at.autolockMinIdle ?? true}
          onChange={(v) => onToggle("autolockMinIdle", v)}
        />
        <LabeledToggle
          label="Mode furtif (LED off)"
          checked={at.stealthLed ?? false}
          onChange={(v) => onToggle("stealthLed", v)}
        />
        <LabeledToggle
          label="Détection sabotage"
          checked={at.tamperDetect ?? true}
          onChange={(v) => onToggle("tamperDetect", v)}
        />
      </Card>
    </>
  );
}

function DeviceSection({ settings, save }: SectionProps) {
  const net = settings.network ?? {};
  const [device, setDevice] = useState<{ id: string; name: string; pairing_code: string | null } | null>(null);
  const [hmacSecret, setHmacSecret] = useState<string>("");
  const [keyRotatedAt, setKeyRotatedAt] = useState<string | null>(null);
  const [ingestUrl, setIngestUrl] = useState("/api/public/ingest");
  const [apiUrl, setApiUrl] = useState(net.apiUrl || "");
  const [apn, setApn] = useState(net.apn || "internet.orange.bf");
  const [wifiSsid, setWifiSsid] = useState(net.wifiSsid || "");
  const [wifiPwd, setWifiPwd] = useState("");

  useEffect(() => {
    (async () => {
      const { ensureMyDevice } = await import("@/lib/devices.functions");
      const res = await ensureMyDevice();
      setDevice(res.device);
      setHmacSecret(res.hmacSecret ?? "");
      setKeyRotatedAt(res.keyRotatedAt);
      const url = `${window.location.origin}${res.ingestUrl}`;
      setIngestUrl(url);
      if (!apiUrl) setApiUrl(url);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      await notify({ title: `${label} copié`, tone: "success" });
    } catch {
      await notify({ title: "Copie impossible", tone: "warning" });
    }
  };

  const sendCommand = async (kind: string, payload?: Record<string, unknown>) => {
    if (!device) return null;
    const { supabase } = await import("@/integrations/supabase/client");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { error } = await supabase.from("commands").insert({
      device_id: device.id, kind, issued_by: user.id, payload: (payload ?? null) as never,
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

  const onPair = async () => {
    if (!device?.pairing_code) return;
    await notify({
      title: "Code de jumelage",
      description: `Saisissez « ${device.pairing_code} » dans le firmware ESP32-S3.`,
      tone: "info",
    });
  };

  const onRotateHmac = async () => {
    if (!device) return;
    const ok = await confirm({
      title: "Générer une nouvelle clé HMAC ?",
      description: "L'ancienne clé sera invalidée. Re-flashez le firmware.",
      tone: "danger",
      confirmLabel: "Régénérer",
    });
    if (!ok) return;
    const { rotateDeviceKey } = await import("@/lib/devices.functions");
    const res = await rotateDeviceKey({ data: { deviceId: device.id } });
    setHmacSecret(res.hmacSecret);
    setKeyRotatedAt(new Date().toISOString());
    await notify({ title: "Clé HMAC régénérée", tone: "success" });
  };

  const onSaveEndpoint = async () => {
    const ok = await confirm({
      title: "Pousser cette configuration au tracker ?",
      description: `Endpoint: ${apiUrl}\nAPN: ${apn}`,
      tone: "warning",
      confirmLabel: "Envoyer",
    });
    if (!ok) return;
    await save({ network: { ...net, apiUrl, apn } });
    if (await sendCommand("config", { apiUrl, apn })) {
      await notify({ title: "Configuration envoyée", tone: "success" });
    }
  };

  const onSaveWifi = async () => {
    if (!wifiSsid.trim()) {
      await notify({ title: "SSID requis", tone: "warning" });
      return;
    }
    const ok = await confirm({
      title: "Provisionner ce Wi-Fi ?",
      description: `SSID: ${wifiSsid}. Le module basculera en Wi-Fi quand disponible.`,
      tone: "info",
      confirmLabel: "Provisionner",
    });
    if (!ok) return;
    await save({ network: { ...net, wifiSsid, wifiPwdSaved: !!wifiPwd } });
    if (await sendCommand("wifi", { ssid: wifiSsid, password: wifiPwd })) {
      setWifiPwd("");
      await notify({ title: "Identifiants Wi-Fi envoyés", tone: "success" });
    }
  };

  const onOTA = async () => {
    const ok = await confirm({
      title: "Lancer la mise à jour OTA ?",
      description: "Le firmware sera téléchargé puis flashé. ~3 min hors-ligne.",
      tone: "warning",
      confirmLabel: "Mettre à jour",
    });
    if (!ok) return;
    if (await sendCommand("ota", { version: "latest" })) {
      await notify({ title: "OTA initié", tone: "success" });
    }
  };

  const onPing = async () => {
    if (await sendCommand("ping")) {
      await notify({ title: "Ping mis en file", description: "Le tracker répondra à sa prochaine connexion.", tone: "success" });
    }
  };

  return (
    <>
      <Card title="État du module" action={
        <span className={`text-[10px] mono px-2 py-0.5 rounded ${device ? "bg-[var(--accent-green)]/15 text-[var(--accent-green)]" : "bg-[var(--accent-amber)]/15 text-[var(--accent-amber)]"}`}>
          {device ? "COUPLÉ" : "EN ATTENTE"}
        </span>
      }>
        <div className="space-y-2 text-xs">
          <Row k="Device ID" v={device?.id ?? "—"} />
          <Row k="Nom" v={device?.name ?? "—"} />
          <Row k="Endpoint d'ingestion" v={ingestUrl} />
          <Row k="Clé rotée" v={keyRotatedAt ? new Date(keyRotatedAt).toLocaleString("fr-FR") : "—"} />
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={onPing} className="flex-1 h-9 text-xs rounded-md bg-[var(--bg-elevated)] hover:bg-[var(--border-active)] flex items-center justify-center gap-1.5">
            <Radio className="size-3.5" /> Ping
          </button>
          <button onClick={onPair} className="flex-1 h-9 text-xs rounded-md bg-[var(--accent-primary)] text-[var(--accent-milk)] font-semibold hover:opacity-90 flex items-center justify-center gap-1.5">
            <CheckCircle2 className="size-3.5" /> Code d'appairage
          </button>
        </div>
      </Card>

      <Card title="Identifiants à flasher dans le firmware ESP32-S3">
        <p className="text-xs text-[var(--text-secondary)] mb-3 leading-relaxed">
          Ces trois valeurs doivent être compilées dans le firmware. Le tracker signe chaque trame POST sur <code className="mono text-[var(--accent-cyan)]">/api/public/ingest</code> via HMAC-SHA256.
        </p>
        <div className="space-y-2">
          <CodeRow label="DEVICE_ID" value={device?.id ?? ""} onCopy={copy} />
          <CodeRow label="HMAC_SECRET" value={hmacSecret} onCopy={copy} mask />
          <CodeRow label="INGEST_URL" value={ingestUrl} onCopy={copy} />
        </div>
        {device?.pairing_code && (
          <div className="mt-3 text-[11px] text-[var(--text-secondary)]">
            Code de jumelage : <span className="mono text-[var(--accent-primary)] font-bold">{device.pairing_code}</span>
          </div>
        )}
      </Card>

      <Card title="Endpoint backend & APN" action={
        <button onClick={onSaveEndpoint} className="h-8 px-3 text-xs rounded-md bg-[var(--accent-primary)] text-[var(--accent-milk)] font-semibold hover:opacity-90">
          Envoyer
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

      <Card title="Wi-Fi de secours" action={
        <button onClick={onSaveWifi} className="h-8 px-3 text-xs rounded-md bg-[var(--accent-primary)] text-[var(--accent-milk)] font-semibold hover:opacity-90 flex items-center gap-1.5">
          <Wifi className="size-3.5" /> Provisionner
        </button>
      }>
        <p className="text-xs text-[var(--text-secondary)] mb-3">
          Quand le tracker est à portée, il bascule en Wi-Fi pour économiser le forfait data GSM.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <input
            value={wifiSsid}
            onChange={(e) => setWifiSsid(e.target.value)}
            placeholder="SSID"
            className="h-10 px-3 rounded-md bg-[var(--bg-elevated)] border border-[var(--border)] text-sm outline-none focus:border-[var(--accent-primary)]"
          />
          <input
            value={wifiPwd}
            onChange={(e) => setWifiPwd(e.target.value)}
            type="password"
            placeholder={net.wifiPwdSaved ? "•••••• (déjà enregistré)" : "Mot de passe"}
            className="h-10 px-3 rounded-md bg-[var(--bg-elevated)] border border-[var(--border)] text-sm outline-none focus:border-[var(--accent-primary)]"
          />
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

      <Card title="Maintenance & OTA" action={
        <div className="flex gap-2">
          <button onClick={onOTA} className="h-8 px-3 text-xs rounded-md bg-[var(--accent-cyan)]/15 text-[var(--accent-cyan)] font-semibold hover:bg-[var(--accent-cyan)]/25 flex items-center gap-1.5">
            <Download className="size-3.5" /> OTA
          </button>
          <button onClick={onReboot} className="h-8 px-3 text-xs rounded-md bg-[var(--accent-red)]/15 text-[var(--accent-red)] font-semibold hover:bg-[var(--accent-red)]/25">
            Redémarrer
          </button>
        </div>
      }>
        <p className="text-xs text-[var(--text-secondary)]">
          Redémarrage à distance ou mise à jour OTA via SIM7600G.
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
    await save({ profile: { name, phone, email } });
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
          <Field label="Email" value={email} onChange={setEmail} />
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

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-semibold">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
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

function LabeledToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="w-full flex items-center justify-between gap-3 py-2.5 px-1 rounded-md hover:bg-[var(--bg-elevated)]/40 transition-colors cursor-pointer text-left"
    >
      <span className="text-xs flex-1">{label}</span>
      <ToggleSwitch checked={checked} onChange={onChange} />
    </button>
  );
}
