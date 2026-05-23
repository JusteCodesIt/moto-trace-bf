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
  const onReboot = async () => {
    const ok = await confirm({
      title: "Redémarrer le module ESP32-S3 ?",
      description: "Le tracker sera hors-ligne pendant ~30 secondes.",
      tone: "warning",
      confirmLabel: "Redémarrer",
    });
    if (ok) await notify({ title: "Commande envoyée", description: "Reboot demandé via SIM7600G.", tone: "success" });
  };
  return (
    <>
      <Card title="Module GPS / GSM">
        <div className="space-y-2 text-xs">
          <Row k="Identifiant" v="MT-BF-001" />
          <Row k="Firmware" v="v1.4.2 (2026-04-30)" />
          <Row k="Modem" v="SIM7600G · LTE Cat-4" />
          <Row k="GPS" v="u-blox MAX-M8Q · 9 satellites" />
          <Row k="APN" v="internet.orange.bf" />
          <Row k="Batterie" v="86%" />
        </div>
      </Card>
      <Card
        title="Maintenance"
        action={
          <button onClick={onReboot} className="h-8 px-3 text-xs rounded-md bg-[var(--accent-red)]/15 text-[var(--accent-red)] font-semibold hover:bg-[var(--accent-red)]/25">
            Redémarrer
          </button>
        }
      >
        <p className="text-xs text-[var(--text-secondary)]">
          Forcer un redémarrage à distance ou installer la dernière version du firmware OTA.
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
