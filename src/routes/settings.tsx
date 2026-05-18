import { createFileRoute } from "@tanstack/react-router";
import { Settings as SettingsIcon, Bell, Shield, Smartphone, User, Sliders } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { useState } from "react";

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
      <PageHeader title="Paramètres" subtitle="Notifications, anti-vol et compte" icon={SettingsIcon} />

      <div className="p-4 md:p-8 pb-24 max-w-6xl mx-auto grid md:grid-cols-[220px_1fr] gap-6">
        <nav className="space-y-1 md:sticky md:top-24 md:self-start">
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
          {active === "device" && <Placeholder title="Appareil & connectivité" />}
          {active === "account" && <Placeholder title="Compte & sécurité" />}
        </div>
      </div>
    </AppShell>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card-elev p-5">
      <h3 className="text-sm font-semibold mb-4">{title}</h3>
      {children}
    </div>
  );
}

function NotifSection() {
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
          <button className="h-8 px-3 text-xs rounded-md bg-[var(--bg-surface)] hover:bg-[var(--border-active)]">
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
                <Toggle key={c} label={c} checked={c !== "SMS"} />
              ))}
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

function ThresholdsSection() {
  return (
    <Card title="Seuils d'alerte">
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
  return (
    <>
      <Card title="Code PIN à 4 chiffres">
        <p className="text-xs text-[var(--text-secondary)] mb-3">
          Requis pour les commandes moteur et la désactivation du suivi.
        </p>
        <div className="flex gap-2">
          {[1, 2, 3, 4].map((i) => (
            <input
              key={i}
              type="password"
              maxLength={1}
              className="size-12 text-center text-xl mono rounded-md bg-[var(--bg-elevated)] border border-[var(--border)] outline-none focus:border-[var(--accent-primary)]"
            />
          ))}
        </div>
      </Card>
      <Card title="Verrouillage auto">
        <Toggle label="Verrouiller après 10 min moteur coupé" checked />
        <Toggle label="Mode furtif (LED off)" />
        <Toggle label="Détection sabotage" checked />
      </Card>
    </>
  );
}

function Placeholder({ title }: { title: string }) {
  return (
    <Card title={title}>
      <p className="text-xs text-[var(--text-secondary)]">
        Configuration disponible dans la prochaine itération.
      </p>
    </Card>
  );
}

function Toggle({ label, checked = false }: { label: string; checked?: boolean }) {
  return (
    <label className="flex items-center justify-between cursor-pointer py-1.5">
      <span className="text-xs">{label}</span>
      <span className={`relative w-9 h-5 rounded-full transition-colors ${checked ? "bg-[var(--accent-primary)]" : "bg-[var(--bg-elevated)]"}`}>
        <span className={`absolute top-0.5 size-4 rounded-full bg-white transition-transform ${checked ? "translate-x-[18px]" : "translate-x-0.5"}`} />
      </span>
    </label>
  );
}
