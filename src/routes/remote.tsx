import { createFileRoute } from "@tanstack/react-router";
import { Power, MapPin, Lightbulb, VolumeX, RotateCw, SignalHigh, Settings as SettingsIcon, Link as LinkIcon, Shield, Zap } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { useApp } from "@/lib/store";
import { confirm, notify } from "@/components/ConfirmDialog";
import type { ConfirmTone } from "@/components/ConfirmDialog";

export const Route = createFileRoute("/remote")({
  head: () => ({ meta: [{ title: "Contrôle distant — MotoTrack BF" }] }),
  component: RemotePage,
});

type CommandTone = Exclude<ConfirmTone, "success">;

const COMMANDS: Array<{
  icon: typeof MapPin;
  title: string;
  desc: string;
  cta: string;
  danger?: boolean;
  tone: CommandTone;
  confirmTitle: string;
  confirmDesc: string;
}> = [
  {
    icon: MapPin, title: "Ping GPS", desc: "Mise à jour position immédiate", cta: "Envoyer",
    tone: "info",
    confirmTitle: "Envoyer un ping GPS ?",
    confirmDesc: "Le tracker enverra sa position actuelle immédiatement.",
  },
  {
    icon: Lightbulb, title: "Clignoter LED", desc: "Localiser physiquement l'appareil", cta: "Activer",
    tone: "info",
    confirmTitle: "Activer la LED ?",
    confirmDesc: "L'appareil clignotera pendant 30 secondes.",
  },
  {
    icon: VolumeX, title: "Mode silencieux", desc: "Réduire fréquence GPS", cta: "Activer",
    tone: "warning",
    confirmTitle: "Activer le mode silencieux ?",
    confirmDesc: "La fréquence GPS sera réduite pour économiser la batterie.",
  },
  {
    icon: RotateCw, title: "Redémarrer", desc: "Redémarre le module GPS", cta: "Redémarrer", danger: true,
    tone: "danger",
    confirmTitle: "Redémarrer le module GPS ?",
    confirmDesc: "Le tracker sera hors-ligne pendant ~30 s.",
  },
  {
    icon: SignalHigh, title: "Test signal", desc: "Tester qualité réseau", cta: "Lancer",
    tone: "info",
    confirmTitle: "Lancer le test signal ?",
    confirmDesc: "Mesure la qualité du réseau GSM courant.",
  },
  {
    icon: SettingsIcon, title: "Reconfigurer", desc: "Paramètres appareil", cta: "Ouvrir",
    tone: "warning",
    confirmTitle: "Ouvrir la reconfiguration ?",
    confirmDesc: "Cela peut modifier les paramètres de l'appareil.",
  },
];

function RemotePage() {
  const t = useApp((s) => s.telemetry);

  const runCommand = async (cmd: typeof COMMANDS[number]) => {
    const ok = await confirm({
      title: cmd.confirmTitle,
      description: cmd.confirmDesc,
      tone: cmd.tone,
      confirmLabel: cmd.cta,
    });
    if (ok) {
      await notify({
        title: `${cmd.title} envoyé`,
        description: "L'appareil a reçu la commande.",
        tone: "success",
      });
    }
  };

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
            onClick={async () => {
              const ok = await confirm({
                title: "Envoyer un check ?",
                description: "Force l'appareil à signaler immédiatement son état.",
                tone: "info",
                confirmLabel: "Envoyer",
              });
              if (ok) await notify({ title: "Check envoyé", tone: "success" });
            }}
            className="ml-auto h-9 px-4 rounded-md bg-[var(--bg-elevated)] text-xs hover:bg-[var(--border-active)]"
          >
            Check now
          </button>
        </div>

        {/* Engine hero */}
        <div className="card-elev p-6 md:p-8 text-center">
          <div className="mx-auto size-20 rounded-full grid place-items-center mb-4"
               style={{ background: t.engineOn ? "rgba(34,211,255,0.12)" : "rgba(255,61,87,0.12)" }}>
            <Power className="size-10" style={{ color: t.engineOn ? "var(--accent-cyan)" : "var(--accent-red)" }} />
          </div>
          <div
            className="text-2xl font-bold uppercase tracking-wider mb-2"
            style={{ color: t.engineOn ? "var(--accent-cyan)" : "var(--accent-red)" }}
          >
            {t.engineOn ? "Moteur en marche" : "Moteur coupé"}
          </div>
          <p className="text-sm text-[var(--text-secondary)] mb-6">
            La commande nécessite une confirmation explicite
          </p>
          <button
            onClick={async () => {
              const cutting = t.engineOn;
              const ok = await confirm({
                title: cutting ? "Couper le moteur à distance ?" : "Réactiver le moteur ?",
                description: cutting
                  ? "Le moteur sera immédiatement coupé. Ne pas utiliser si la moto est en circulation."
                  : "Le démarrage moteur sera autorisé à distance.",
                tone: cutting ? "danger" : "warning",
                confirmLabel: cutting ? "Couper le moteur" : "Réactiver",
              });
              if (ok) {
                await notify({
                  title: cutting ? "Moteur coupé" : "Moteur réactivé",
                  description: "La commande a été appliquée sur l'appareil.",
                  tone: "success",
                });
              }
            }}
            className="w-full md:w-auto md:px-12 h-16 rounded-lg text-base font-semibold transition-all"
            style={{
              background: t.engineOn ? "var(--accent-red)" : "var(--accent-cyan)",
              color: t.engineOn ? "#fff" : "#06121F",
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
                  onClick={async () => {
                    const ok = await confirm({
                      title: `Générer un lien de partage ${d} ?`,
                      description: "Toute personne avec ce lien pourra voir votre position en direct pendant la durée choisie.",
                      tone: "warning",
                      confirmLabel: "Générer",
                    });
                    if (!ok) return;
                    const token = Math.random().toString(36).slice(2, 10);
                    const url = `${window.location.origin}/share/${token}`;
                    try { await navigator.clipboard.writeText(url); } catch {}
                    await notify({
                      title: `Lien ${d} copié`,
                      description: url,
                      tone: "success",
                    });
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
                  onClick={() => runCommand(c)}
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
                <Zap className="size-4 text-[var(--accent-cyan)]" />
                <span>Tracker</span>
                <Zap className="size-4 text-[var(--text-dim)]" />
                <span>Secours</span>
              </div>
            </div>
            <div className="card-elev p-4 bg-[var(--bg-base)]/40">
              <div className="text-[10px] uppercase text-[var(--text-secondary)]">Batterie secours</div>
              <div className="text-3xl font-bold mono text-[var(--accent-cyan)] mt-1">{Math.round(t.batteryBackup)}%</div>
              <div className="text-[10px] mono text-[var(--text-secondary)] mt-1">~6h 45 min restantes</div>
            </div>
            <div className="space-y-2">
              <AntiTheftToggle label="Rester actif sur secours" defaultChecked />
              <AntiTheftToggle label="Alerte coupure principale" defaultChecked />
              <AntiTheftToggle label="Fréquence GPS augmentée" />
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

function AntiTheftToggle({ label, defaultChecked = false }: { label: string; defaultChecked?: boolean }) {
  const handle = async () => {
    const ok = await confirm({
      title: `Modifier « ${label} » ?`,
      description: "Cette option affecte le comportement de protection de l'appareil.",
      tone: "warning",
      confirmLabel: "Modifier",
    });
    if (ok) await notify({ title: "Paramètre mis à jour", tone: "success" });
  };
  return (
    <button onClick={handle} className="w-full flex items-center justify-between cursor-pointer text-left">
      <span className="text-xs">{label}</span>
      <span className={`relative w-9 h-5 rounded-full ${defaultChecked ? "bg-[var(--accent-primary)]" : "bg-[var(--bg-elevated)]"}`}>
        <span className={`absolute top-0.5 size-4 rounded-full bg-white transition-transform ${defaultChecked ? "translate-x-[18px]" : "translate-x-0.5"}`} />
      </span>
    </button>
  );
}
