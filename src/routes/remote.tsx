import { createFileRoute } from "@tanstack/react-router";
import { Power, MapPin, Lightbulb, VolumeX, RotateCw, SignalHigh, Settings as SettingsIcon, Link as LinkIcon, Shield, Zap } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { useApp } from "@/lib/store";
import toast from "react-hot-toast";

export const Route = createFileRoute("/remote")({
  head: () => ({ meta: [{ title: "Contrôle distant — MotoTrack BF" }] }),
  component: RemotePage,
});

const COMMANDS = [
  { icon: MapPin, title: "Ping GPS", desc: "Mise à jour position immédiate", cta: "Envoyer" },
  { icon: Lightbulb, title: "Clignoter LED", desc: "Localiser physiquement l'appareil", cta: "Activer" },
  { icon: VolumeX, title: "Mode silencieux", desc: "Réduire fréquence GPS", cta: "Activer" },
  { icon: RotateCw, title: "Redémarrer", desc: "Redémarre le module GPS", cta: "Redémarrer", danger: true },
  { icon: SignalHigh, title: "Test signal", desc: "Tester qualité réseau", cta: "Lancer" },
  { icon: SettingsIcon, title: "Reconfigurer", desc: "Paramètres appareil", cta: "Ouvrir" },
];

function RemotePage() {
  const t = useApp((s) => s.telemetry);

  return (
    <AppShell>
      <PageHeader title="Contrôle distant" subtitle="Commandes appareil et anti-vol" icon={Power} />

      <div className="p-4 md:p-8 pb-24 max-w-5xl mx-auto space-y-6">
        {/* Device status */}
        <div className="card-elev p-4 flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-[var(--accent-green)] pulse-dot" style={{ color: "var(--accent-green)" }} />
            <span className="text-sm font-medium text-[var(--accent-green)]">Online</span>
          </div>
          <Item label="Dernier contact" value="il y a 12 s" />
          <Item label="Réseau" value="ORANGE BF · GPRS" />
          <Item label="IP" value="41.214.92.18" mono />
          <Item label="Firmware" value="v2.1.4" mono />
          <button
            onClick={() => toast.success("Ping envoyé")}
            className="ml-auto h-9 px-4 rounded-md bg-[var(--bg-elevated)] text-xs hover:bg-[var(--border-active)]"
          >
            Check now
          </button>
        </div>

        {/* Engine hero */}
        <div className="card-elev p-6 md:p-8 text-center">
          <div className="mx-auto size-20 rounded-full grid place-items-center mb-4"
               style={{ background: t.engineOn ? "rgba(0,230,118,0.12)" : "rgba(255,61,87,0.12)" }}>
            <Power className="size-10" style={{ color: t.engineOn ? "var(--accent-green)" : "var(--accent-red)" }} />
          </div>
          <div
            className="text-2xl font-bold uppercase tracking-wider mb-2"
            style={{ color: t.engineOn ? "var(--accent-green)" : "var(--accent-red)" }}
          >
            {t.engineOn ? "Moteur en marche" : "Moteur coupé"}
          </div>
          <p className="text-sm text-[var(--text-secondary)] mb-6">
            La commande nécessite un PIN à 4 chiffres
          </p>
          <button
            onClick={() => toast("Confirmation PIN requise", { icon: "🔒" })}
            className="w-full md:w-auto md:px-12 h-16 rounded-lg text-base font-semibold transition-all"
            style={{
              background: t.engineOn ? "var(--accent-red)" : "var(--accent-green)",
              color: t.engineOn ? "#fff" : "#07080F",
            }}
          >
            {t.engineOn ? "🛑 Couper le moteur" : "🔄 Remettre en marche"}
          </button>
        </div>

        {/* Live share */}
        <div className="card-elev p-5 flex items-start gap-4">
          <div className="size-10 rounded-lg bg-[var(--accent-cyan)]/15 grid place-items-center text-[var(--accent-cyan)] shrink-0">
            <LinkIcon className="size-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold mb-1">Partager ma position en direct</h3>
            <p className="text-xs text-[var(--text-secondary)] mb-3">
              Génère un lien public temporaire (1h / 4h / 24h)
            </p>
            <div className="flex gap-2">
              {["1h", "4h", "24h"].map((d) => (
                <button
                  key={d}
                  onClick={() => {
                    const token = Math.random().toString(36).slice(2, 10);
                    const url = `${window.location.origin}/share/${token}`;
                    navigator.clipboard.writeText(url);
                    toast.success(`Lien ${d} copié`);
                  }}
                  className="h-8 px-4 text-xs rounded-md bg-[var(--bg-elevated)] hover:bg-[var(--border-active)]"
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Command grid */}
        <div>
          <h2 className="text-xs uppercase tracking-wider text-[var(--text-secondary)] font-semibold mb-3">
            Commandes
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {COMMANDS.map((c) => (
              <div key={c.title} className="card-elev p-4 flex flex-col gap-3 hover:border-[var(--border-active)] transition-colors">
                <c.icon className="size-5 text-[var(--accent-primary)]" />
                <div className="flex-1">
                  <div className="text-sm font-semibold">{c.title}</div>
                  <div className="text-xs text-[var(--text-secondary)] mt-0.5">{c.desc}</div>
                </div>
                <button
                  onClick={() => toast.success(`${c.title} envoyé`)}
                  className={`h-8 text-xs rounded-md font-medium transition-colors ${c.danger ? "bg-[var(--accent-red)]/15 text-[var(--accent-red)] hover:bg-[var(--accent-red)]/25" : "bg-[var(--bg-elevated)] hover:bg-[var(--border-active)]"}`}
                >
                  {c.cta}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Anti-theft */}
        <div className="card-elev p-5">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="size-5 text-[var(--accent-violet)]" />
            <h3 className="text-sm font-semibold">Système anti-vol — Batterie de secours</h3>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="card-elev p-4 bg-[var(--bg-base)]/40">
              <div className="text-[10px] uppercase text-[var(--text-secondary)] mb-2">Schéma</div>
              <div className="flex items-center justify-between gap-2 text-[10px] mono">
                <span>Batt. princ.</span>
                <Zap className="size-4 text-[var(--accent-green)]" />
                <span>Tracker</span>
                <Zap className="size-4 text-[var(--text-dim)]" />
                <span>Secours</span>
              </div>
            </div>
            <div className="card-elev p-4 bg-[var(--bg-base)]/40">
              <div className="text-[10px] uppercase text-[var(--text-secondary)]">Batterie secours</div>
              <div className="text-3xl font-bold mono text-[var(--accent-green)] mt-1">{Math.round(t.batteryBackup)}%</div>
              <div className="text-[10px] mono text-[var(--text-secondary)] mt-1">~6h 45 min restantes</div>
            </div>
            <div className="space-y-2">
              <Toggle label="Rester actif sur secours" checked />
              <Toggle label="Alerte coupure principale" checked />
              <Toggle label="Fréquence GPS augmentée" />
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function Item({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">{label}</div>
      <div className={`text-xs ${mono ? "mono" : ""}`}>{value}</div>
    </div>
  );
}

function Toggle({ label, checked = false }: { label: string; checked?: boolean }) {
  return (
    <label className="flex items-center justify-between cursor-pointer">
      <span className="text-xs">{label}</span>
      <span className={`relative w-9 h-5 rounded-full ${checked ? "bg-[var(--accent-primary)]" : "bg-[var(--bg-elevated)]"}`}>
        <span className={`absolute top-0.5 size-4 rounded-full bg-white transition-transform ${checked ? "translate-x-[18px]" : "translate-x-0.5"}`} />
      </span>
    </label>
  );
}
