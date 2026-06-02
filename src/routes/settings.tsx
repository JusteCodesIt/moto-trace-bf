import { createFileRoute } from "@tanstack/react-router";
import { Settings as SettingsIcon, Bell, Shield, Smartphone, User, Sliders, Sparkles, Copy, RefreshCw, Wifi, Radio, Download, CheckCircle2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { SectionHero } from "@/components/SectionHero";
import { useState } from "react";
import { confirm, notify } from "@/components/ConfirmDialog";
import illusSettings from "@/assets/illus-settings.png";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Paramètres — MotoTrack BF" }] }),
  component: SettingsPage,
});

const SECTIONS = [
  { id: "notif", label: "Notifications", icon: Bell },
  { id: "thresholds", label: "Alertes & seuils", icon: Sliders },
  { id: "antitheft", label: "Anti-vol & PIN", icon: Shield },
  { id: "device", label: "Appareil & réseau", icon: Smartphone },
  { id: "account", label: "Compte", icon: User },
];

function SettingsPage() {
  const [active, setActive] = useState("notif");

  return (
    <AppShell>
      <div className="p-4 md:p-8 pb-24 max-w-6xl mx-auto">
        <SectionHero
          eyebrow="Configuration"
          icon={Sparkles}
          title="Paramètres du compte & de l'appareil"
          description="Contrôlez vos notifications, vos seuils d'alerte, votre code PIN anti-vol et la connectivité du module ESP32-S3 — tout est centralisé ici."
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
            {active === "notif" && <NotifSection />}
            {active === "thresholds" && <ThresholdsSection />}
            {active === "antitheft" && <AntiTheftSection />}
            {active === "device" && <DeviceSection />}
            {active === "account" && <AccountSection />}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function Card({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="card-elev p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function NotifSection() {
  const onTest = async () => {
    const ok = await confirm({
      title: "Envoyer une notification de test ?",
      description: "Une notification push sera envoyée à cet appareil.",
      tone: "info",
      confirmLabel: "Envoyer",
    });
    if (ok) await notify({ title: "Notification envoyée", description: "Vérifiez votre centre de notifications.", tone: "success" });
  };
  return (
    <>
      <Card title="Notifications push">
        <p className="text-xs text-[var(--text-secondary)] mb-3">
          Recevez des alertes en temps réel sur votre appareil.
        </p>
        <div className="flex items-center justify-between p-3 rounded-md bg-[var(--bg-elevated)]">
          <div>
            <div className="text-sm font-medium">Statut</div>
            <div className="text-xs text-[var(--accent-green)] mono">Activé · Chrome desktop</div>
          </div>
          <button onClick={onTest} className="h-8 px-3 text-xs rounded-md bg-[var(--bg-surface)] hover:bg-[var(--border-active)]">
            Tester
          </button>
        </div>
      </Card>

      <Card title="Notifications SMS">
        <div className="text-xs text-[var(--text-secondary)] mb-3">
          Quota: <span className="mono text-[var(--accent-primary)]">14 / 100</span> ce mois
        </div>
        <input
          defaultValue="+226 70 12 34 56"
          className="w-full h-10 px-3 rounded-md bg-[var(--bg-elevated)] border border-[var(--border)] text-sm mono outline-none focus:border-[var(--accent-primary)]"
        />
      </Card>

      <Card title="Matrice d'alertes">
        <div className="space-y-2">
          {["Choc détecté", "Sortie géozone", "Batterie faible", "Excès de vitesse"].map((t) => (
            <div key={t} className="grid grid-cols-[1fr_repeat(3,80px)] gap-2 items-center py-2 border-b border-[var(--border)] last:border-0">
              <span className="text-sm">{t}</span>
              {["Push", "SMS", "Email"].map((c) => (
                <Toggle key={c} label={c} defaultChecked={c !== "SMS"} />
              ))}
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

function ThresholdsSection() {
  const onSave = async () => {
    const ok = await confirm({
      title: "Enregistrer les seuils ?",
      description: "Les nouveaux seuils seront appliqués immédiatement au tracker.",
      tone: "warning",
      confirmLabel: "Enregistrer",
    });
    if (ok) await notify({ title: "Seuils mis à jour", tone: "success" });
  };
  return (
    <Card
      title="Seuils d'alerte"
      action={
        <button onClick={onSave} className="h-8 px-3 text-xs rounded-md bg-[var(--accent-primary)] text-[var(--accent-milk)] font-semibold hover:opacity-90">
          Enregistrer
        </button>
      }
    >
      <div className="space-y-4">
        {[
          { label: "Limite vitesse", value: "90", unit: "km/h" },
          { label: "Sensibilité choc", value: "2.5", unit: "g" },
          { label: "Délai sortie géozone", value: "30", unit: "s" },
          { label: "Seuil batterie faible", value: "20", unit: "%" },
        ].map((f) => (
          <div key={f.label} className="grid grid-cols-[1fr_auto] gap-3 items-center">
            <label className="text-sm">{f.label}</label>
            <div className="flex items-center gap-2">
              <input
                defaultValue={f.value}
                className="w-20 h-9 px-3 rounded-md bg-[var(--bg-elevated)] border border-[var(--border)] text-sm mono text-right outline-none"
              />
              <span className="text-xs text-[var(--text-secondary)] mono w-10">{f.unit}</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function AntiTheftSection() {
  const [pin, setPin] = useState(["", "", "", ""]);
  const onSavePin = async () => {
    if (pin.some((d) => d === "")) {
      await notify({ title: "PIN incomplet", description: "Entrez les 4 chiffres.", tone: "warning" });
      return;
    }
    const ok = await confirm({
      title: "Définir ce nouveau PIN ?",
      description: "Ce code sera requis pour les commandes moteur et la désactivation du suivi.",
      tone: "danger",
      confirmLabel: "Définir",
    });
    if (ok) {
      await notify({ title: "PIN enregistré", tone: "success" });
      setPin(["", "", "", ""]);
    }
  };
  return (
    <>
      <Card
        title="Code PIN à 4 chiffres"
        action={
          <button onClick={onSavePin} className="h-8 px-3 text-xs rounded-md bg-[var(--accent-primary)] text-[var(--accent-milk)] font-semibold hover:opacity-90">
            Définir
          </button>
        }
      >
        <p className="text-xs text-[var(--text-secondary)] mb-3">
          Requis pour les commandes moteur et la désactivation du suivi.
        </p>
        <div className="flex gap-2">
          {pin.map((v, i) => (
            <input
              key={i}
              type="password"
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
        <Toggle label="Verrouiller après 10 min moteur coupé" defaultChecked />
        <Toggle label="Mode furtif (LED off)" />
        <Toggle label="Détection sabotage" defaultChecked />
      </Card>
    </>
  );
}

function DeviceSection() {
  const [device, setDevice] = useState<{ id: string; name: string; pairing_code: string | null } | null>(null);
  const [hmacSecret, setHmacSecret] = useState<string>("");
  const [keyRotatedAt, setKeyRotatedAt] = useState<string | null>(null);
  const [ingestUrl, setIngestUrl] = useState("/api/public/ingest");
  const [apiUrl, setApiUrl] = useState("https://api.mototrack.bf/ingest");
  const [apn, setApn] = useState("internet.orange.bf");
  const [wifiSsid, setWifiSsid] = useState("MotoTrack-Home");
  const [wifiPwd, setWifiPwd] = useState("");

  useState(() => {
    (async () => {
      const { ensureMyDevice } = await import("@/lib/devices.functions");
      const res = await ensureMyDevice();
      setDevice(res.device);
      setHmacSecret(res.hmacSecret ?? "");
      setKeyRotatedAt(res.keyRotatedAt);
      setIngestUrl(`${window.location.origin}${res.ingestUrl}`);
    })();
  });

  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      await notify({ title: `${label} copié`, tone: "success" });
    } catch {
      await notify({ title: "Copie impossible", tone: "warning" });
    }
  };

  const onReboot = async () => {
    if (!device) return;
    const ok = await confirm({
      title: "Redémarrer le module ESP32-S3 ?",
      description: "Le tracker exécutera la commande à sa prochaine connexion 4G.",
      tone: "warning",
      confirmLabel: "Redémarrer",
    });
    if (!ok) return;
    const { supabase } = await import("@/integrations/supabase/client");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("commands").insert({ device_id: device.id, kind: "reboot", issued_by: user.id });
    await notify({ title: "Reboot programmé", tone: "success" });
  };

  const onPair = async () => {
    if (!device?.pairing_code) return;
    await notify({
      title: "Code de jumelage",
      description: `Saisissez « ${device.pairing_code} » dans le firmware ESP32-S3 puis flashez avec le device-id et la clé HMAC.`,
      tone: "info",
    });
  };

  const onRotateHmac = async () => {
    if (!device) return;
    const ok = await confirm({
      title: "Générer une nouvelle clé HMAC ?",
      description: "L'ancienne clé sera invalidée immédiatement. Vous devrez re-flasher le firmware avec la nouvelle clé.",
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
    if (ok) await notify({ title: "Configuration envoyée", description: "Le module redémarre pour appliquer.", tone: "success" });
  };

  const onSaveWifi = async () => {
    if (!wifiSsid.trim()) {
      await notify({ title: "SSID requis", tone: "warning" });
      return;
    }
    const ok = await confirm({
      title: "Provisionner ce Wi-Fi ?",
      description: `SSID: ${wifiSsid}. Le module basculera en Wi-Fi quand disponible (économie de data GSM).`,
      tone: "info",
      confirmLabel: "Provisionner",
    });
    if (ok) await notify({ title: "Identifiants Wi-Fi envoyés", tone: "success" });
  };

  const onOTA = async () => {
    const ok = await confirm({
      title: "Lancer la mise à jour OTA ?",
      description: "Le firmware v1.5.0 sera téléchargé puis flashé. ~3 min hors-ligne.",
      tone: "warning",
      confirmLabel: "Mettre à jour",
    });
    if (ok) await notify({ title: "OTA initié", description: "Suivez la progression dans le journal du tracker.", tone: "success" });
  };

  const onPing = async () => {
    if (!device) return;
    const { supabase } = await import("@/integrations/supabase/client");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("commands").insert({ device_id: device.id, kind: "ping", issued_by: user.id });
    if (error) await notify({ title: "Erreur", description: error.message, tone: "danger" });
    else await notify({ title: "Ping mis en file", description: "Le tracker répondra à sa prochaine connexion 4G.", tone: "success" });
  };

  return (
    <>
      <Card
        title="État du module"
        action={
          <span className={`text-[10px] mono px-2 py-0.5 rounded ${device ? "bg-[var(--accent-green)]/15 text-[var(--accent-green)]" : "bg-[var(--accent-amber)]/15 text-[var(--accent-amber)]"}`}>
            {device ? "COUPLÉ" : "EN ATTENTE"}
          </span>
        }
      >
        <div className="space-y-2 text-xs">
          <Row k="Device ID" v={device?.id ?? "—"} />
          <Row k="Nom" v={device?.name ?? "—"} />
          <Row k="Endpoint d'ingestion" v={ingestUrl} />
          <Row k="Clé rotée" v={keyRotatedAt ? new Date(keyRotatedAt).toLocaleString("fr-FR") : "—"} />
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={onPing} className="flex-1 h-9 text-xs rounded-md bg-[var(--bg-elevated)] hover:bg-[var(--border-active)] flex items-center justify-center gap-1.5">
            <Radio className="size-3.5" /> Tester (envoie ping)
          </button>
          <button onClick={onPair} className="flex-1 h-9 text-xs rounded-md bg-[var(--accent-primary)] text-[var(--accent-milk)] font-semibold hover:opacity-90 flex items-center justify-center gap-1.5">
            <CheckCircle2 className="size-3.5" /> Voir code d'appairage
          </button>
        </div>
      </Card>

      <Card title="Identifiants à flasher dans le firmware ESP32-S3">
        <p className="text-xs text-[var(--text-secondary)] mb-3 leading-relaxed">
          Ces trois valeurs doivent être compilées dans le firmware. Le tracker les utilise pour
          signer chaque trame POST sur <code className="mono text-[var(--accent-cyan)]">/api/public/ingest</code> via HMAC-SHA256.
        </p>
        <div className="space-y-2">
          <CodeRow label="DEVICE_ID" value={device?.id ?? ""} onCopy={copy} />
          <CodeRow label="HMAC_SECRET" value={hmacSecret} onCopy={copy} mask />
          <CodeRow label="INGEST_URL" value={ingestUrl} onCopy={copy} />
        </div>
        {device?.pairing_code && (
          <div className="mt-3 text-[11px] text-[var(--text-secondary)]">
            Code de jumelage (1ère mise en service) : <span className="mono text-[var(--accent-primary)] font-bold">{device.pairing_code}</span>
          </div>
        )}
      </Card>

      <Card
        title="Endpoint backend & APN"
        action={
          <button onClick={onSaveEndpoint} className="h-8 px-3 text-xs rounded-md bg-[var(--accent-primary)] text-[var(--accent-milk)] font-semibold hover:opacity-90">
            Envoyer
          </button>
        }
      >
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

      <Card
        title="Wi-Fi de secours"
        action={
          <button onClick={onSaveWifi} className="h-8 px-3 text-xs rounded-md bg-[var(--accent-primary)] text-[var(--accent-milk)] font-semibold hover:opacity-90 flex items-center gap-1.5">
            <Wifi className="size-3.5" /> Provisionner
          </button>
        }
      >
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
            placeholder="Mot de passe"
            className="h-10 px-3 rounded-md bg-[var(--bg-elevated)] border border-[var(--border)] text-sm outline-none focus:border-[var(--accent-primary)]"
          />
        </div>
      </Card>

      <Card
        title="Clé HMAC (signature des trames)"
        action={
          <button onClick={onRotateHmac} className="h-8 px-3 text-xs rounded-md bg-[var(--bg-elevated)] hover:bg-[var(--border-active)] flex items-center gap-1.5">
            <RefreshCw className="size-3.5" /> Régénérer
          </button>
        }
      >
        <p className="text-xs text-[var(--text-secondary)] mb-3">
          Cette clé authentifie chaque trame GPS/télémétrie envoyée par l'ESP32-S3. À flasher dans le firmware.
        </p>
        <div className="flex items-center gap-2 p-3 rounded-md bg-[var(--bg-elevated)]">
          <code className="flex-1 text-[11px] mono break-all text-[var(--accent-cyan)]">{hmacSecret}</code>
          <button onClick={() => copy("Clé HMAC", hmacSecret)} className="size-8 grid place-items-center rounded-md hover:bg-[var(--bg-surface)] shrink-0">
            <Copy className="size-3.5" />
          </button>
        </div>
      </Card>

      <Card
        title="Maintenance & OTA"
        action={
          <div className="flex gap-2">
            <button onClick={onOTA} className="h-8 px-3 text-xs rounded-md bg-[var(--accent-cyan)]/15 text-[var(--accent-cyan)] font-semibold hover:bg-[var(--accent-cyan)]/25 flex items-center gap-1.5">
              <Download className="size-3.5" /> OTA v1.5.0
            </button>
            <button onClick={onReboot} className="h-8 px-3 text-xs rounded-md bg-[var(--accent-red)]/15 text-[var(--accent-red)] font-semibold hover:bg-[var(--accent-red)]/25">
              Redémarrer
            </button>
          </div>
        }
      >
        <p className="text-xs text-[var(--text-secondary)]">
          Forcer un redémarrage à distance ou installer la dernière version du firmware OTA via SIM7600G.
        </p>
      </Card>
    </>
  );
}

function AccountSection() {
  const onLogout = async () => {
    const ok = await confirm({
      title: "Se déconnecter ?",
      description: "Vous devrez vous reconnecter pour suivre votre moto.",
      tone: "warning",
      confirmLabel: "Déconnecter",
    });
    if (ok) await notify({ title: "Déconnecté", tone: "success" });
  };
  return (
    <>
      <Card title="Profil">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nom" defaultValue="Ouédraogo Y." />
            <Field label="Téléphone" defaultValue="+226 70 12 34 56" />
          </div>
          <Field label="Email" defaultValue="user@mototrack.bf" />
        </div>
      </Card>
      <Card
        title="Session"
        action={
          <button onClick={onLogout} className="h-8 px-3 text-xs rounded-md bg-[var(--bg-elevated)] hover:bg-[var(--accent-red)]/15 hover:text-[var(--accent-red)]">
            Se déconnecter
          </button>
        }
      >
        <p className="text-xs text-[var(--text-secondary)]">Session active depuis Ouagadougou · Chrome desktop.</p>
      </Card>
    </>
  );
}

function Field({ label, defaultValue }: { label: string; defaultValue: string }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-semibold">{label}</label>
      <input defaultValue={defaultValue} className="mt-1 w-full h-10 px-3 rounded-md bg-[var(--bg-elevated)] border border-[var(--border)] text-sm outline-none focus:border-[var(--accent-primary)]" />
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between py-1.5 border-b border-[var(--border)] last:border-0">
      <span className="text-[var(--text-secondary)]">{k}</span>
      <span className="mono">{v}</span>
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

function Toggle({ label, defaultChecked = false }: { label: string; defaultChecked?: boolean }) {
  const [checked, setChecked] = useState(defaultChecked);
  return (
    <label className="flex items-center justify-between cursor-pointer py-1.5">
      <span className="text-xs">{label}</span>
      <button
        type="button"
        onClick={() => setChecked((c) => !c)}
        className={`relative w-9 h-5 rounded-full transition-colors ${checked ? "bg-[var(--accent-primary)]" : "bg-[var(--bg-elevated)]"}`}
      >
        <span className={`absolute top-0.5 size-4 rounded-full bg-white transition-transform ${checked ? "translate-x-[18px]" : "translate-x-0.5"}`} />
      </button>
    </label>
  );
}
