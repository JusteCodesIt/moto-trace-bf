import { createFileRoute } from "@tanstack/react-router";
import { Power, MapPin, RotateCw, BatteryLow, KeyRound, Link as LinkIcon } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { DeviceSelector } from "@/components/DeviceSelector";
import { useApp } from "@/lib/store";
import { confirm, notify } from "@/components/ConfirmDialog";
import { supabase } from "@/integrations/supabase/client";
import { relTime } from "@/lib/format";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/remote")({
  head: () => ({ meta: [{ title: "Contrôle distant — AutoTrack" }] }),
  component: RemotePage,
});

/**
 * Only commands actually supported by the AutoTrack hardware:
 * LILYGO T-SIM7080G-S3 (ESP32-S3-WROOM-1 + SIM7080G 4G/LTE + GPS NEO-6M de
 * secours + batterie LiPo).
 * No relay → no engine cut. No user LED → no flashing. No buzzer.
 */
const COMMANDS = [
  { kind: "ping" as const, icon: MapPin, title: "Ping GPS", desc: "Force une trame de position immédiate" },
  { kind: "locate" as const, icon: MapPin, title: "Fix rapide", desc: "Re-acquisition GPS (cold-warm boot)" },
  { kind: "low_power" as const, icon: BatteryLow, title: "Mode économique", desc: "Réduit la fréquence d'émission (1 trame / 5 min)" },
  { kind: "wake" as const, icon: Power, title: "Sortir du low-power", desc: "Reprend la cadence normale (1 trame / 30 s)" },
  { kind: "reboot" as const, icon: RotateCw, title: "Redémarrer", desc: "Reboot logiciel ESP32-S3 + ré-init SIM7080G" },
];

type Cmd = { id: string; kind: string; status: string; created_at: string };

function RemotePage() {
  const device = useApp((s) => s.device);
  const [selectedDeviceId, setSelectedDeviceId] = useState(device?.id ?? "");
  const activeDeviceId = selectedDeviceId || device?.id;
  const [history, setHistory] = useState<Cmd[]>([]);

  useEffect(() => {
    if (device?.id && !selectedDeviceId) setSelectedDeviceId(device.id);
  }, [device?.id, selectedDeviceId]);

  useEffect(() => {
    if (!activeDeviceId) return;
    let mounted = true;
    const load = async () => {
      const { data } = await supabase
        .from("commands").select("id, kind, status, created_at")
        .eq("device_id", activeDeviceId).order("created_at", { ascending: false }).limit(15);
      if (mounted && data) setHistory(data);
    };
    load();
    const ch = supabase.channel(`cmd:${activeDeviceId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "commands", filter: `device_id=eq.${activeDeviceId}` }, () => load())
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(ch); };
  }, [activeDeviceId]);

  const send = async (kind: typeof COMMANDS[number]["kind"], title: string, danger = false) => {
    if (!activeDeviceId) { await notify({ title: "Sélectionnez un engin", tone: "warning" }); return; }
    const ok = await confirm({
      title: `Envoyer « ${title} » ?`,
      description: "La commande sera mise en file et exécutée par l'ESP32-S3 dès la prochaine connexion 4G.",
      tone: danger ? "danger" : "warning",
      confirmLabel: "Envoyer",
    });
    if (!ok) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("commands").insert({
      device_id: activeDeviceId, kind, issued_by: user.id,
    });
    if (error) { await notify({ title: "Erreur", description: error.message, tone: "danger" }); return; }
    await notify({ title: "Commande mise en file", description: title, tone: "success" });
  };

  const sharePosition = async (durHours: number) => {
    if (!activeDeviceId) { await notify({ title: "Sélectionnez un engin", tone: "warning" }); return; }
    const ok = await confirm({
      title: `Générer un lien de partage ${durHours}h ?`,
      description: "Toute personne avec ce lien pourra suivre votre position en direct pendant la durée choisie.",
      tone: "warning", confirmLabel: "Générer",
    });
    if (!ok) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const token = crypto.randomUUID().replace(/-/g, "");
    const expiresAt = new Date(Date.now() + durHours * 3600_000).toISOString();
    const { error } = await supabase.from("share_links").insert({
      token, device_id: activeDeviceId, created_by: user.id, expires_at: expiresAt,
    });
    if (error) { await notify({ title: "Erreur", description: error.message, tone: "danger" }); return; }
    const url = `${window.location.origin}/share/${token}`;
    try { await navigator.clipboard.writeText(url); } catch {}
    await notify({ title: `Lien ${durHours}h copié`, description: url, tone: "success" });
  };

  return (
    <AppShell>
      <div className="p-4 md:p-6 pb-24 max-w-5xl mx-auto space-y-5">
        <div className="flex items-center gap-3">
          <div className="size-9 rounded-lg bg-[var(--accent-cyan)]/10 grid place-items-center">
            <Power className="size-4 text-[var(--accent-cyan)]" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Contrôle distant</h1>
            <p className="text-xs text-[var(--text-secondary)]">Commandes hardware ESP32-S3 + SIM7080G</p>
          </div>
        </div>
        <DeviceSelector value={selectedDeviceId} onChange={setSelectedDeviceId} />
        {/* Status */}
        <div className="card-elev p-4 flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex items-center gap-2">
            <span
              className="size-2 rounded-full pulse-dot"
              style={{ background: device?.isOnline ? "var(--accent-green)" : "var(--accent-red)" }}
            />
            <span
              className="text-sm font-medium"
              style={{ color: device?.isOnline ? "var(--accent-green)" : "var(--accent-red)" }}
            >
              {device?.isOnline ? "En ligne" : "Hors ligne"}
            </span>
          </div>
          <Item label="Tracker" value={device?.name ?? "—"} />
          <Item label="Dernier contact" value={device?.lastSeenAt ? relTime(new Date(device.lastSeenAt).getTime()) : "jamais"} />
          <Item label="Device ID" value={device?.id?.slice(0, 8) + "…" || "—"} mono />
        </div>

        {/* Commands */}
        <div>
          <h2 className="text-xs uppercase tracking-wider text-[var(--text-secondary)] font-semibold mb-3">
            Commandes hardware
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {COMMANDS.map((c) => (
              <div key={c.kind} className="card-elev p-4 flex flex-col gap-3">
                <c.icon className="size-5 text-[var(--accent-primary)]" />
                <div className="flex-1">
                  <div className="text-sm font-semibold">{c.title}</div>
                  <div className="text-xs text-[var(--text-secondary)] mt-0.5">{c.desc}</div>
                </div>
                <button
                  onClick={() => send(c.kind, c.title, c.kind === "reboot")}
                  className="h-8 text-xs rounded-md font-medium bg-[var(--bg-elevated)] hover:bg-[var(--border-active)] transition-colors"
                >
                  Envoyer
                </button>
              </div>
            ))}
            <div className="card-elev p-4 flex flex-col gap-3">
              <KeyRound className="size-5 text-[var(--accent-amber)]" />
              <div className="flex-1">
                <div className="text-sm font-semibold">Rotation clé HMAC</div>
                <div className="text-xs text-[var(--text-secondary)] mt-0.5">Régénère la clé d'authentification du tracker</div>
              </div>
              <a href="/settings"
                className="h-8 text-xs rounded-md font-medium bg-[var(--bg-elevated)] hover:bg-[var(--border-active)] transition-colors grid place-items-center">
                Ouvrir Paramètres
              </a>
            </div>
          </div>
        </div>

        {/* Live share */}
        <div className="card-elev p-5 flex items-start gap-4">
          <div className="size-10 rounded-lg bg-[var(--accent-cyan)]/15 grid place-items-center text-[var(--accent-cyan)] shrink-0">
            <LinkIcon className="size-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold mb-1">Partager ma position en direct</h3>
            <p className="text-xs text-[var(--text-secondary)] mb-3">
              Lien public temporaire (1 h / 4 h / 24 h)
            </p>
            <div className="flex gap-2">
              {[1, 4, 24].map((d) => (
                <button key={d} onClick={() => sharePosition(d)}
                  className="h-8 px-4 text-xs rounded-md bg-[var(--bg-elevated)] hover:bg-[var(--border-active)]">
                  {d} h
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* History */}
        <div>
          <h2 className="text-xs uppercase tracking-wider text-[var(--text-secondary)] font-semibold mb-3">
            Historique commandes ({history.length})
          </h2>
          {history.length === 0 ? (
            <div className="card-elev p-4 text-xs text-[var(--text-secondary)] text-center">
              Aucune commande envoyée pour le moment.
            </div>
          ) : (
            <div className="space-y-2">
              {history.map((h) => (
                <div key={h.id} className="card-elev p-3 flex items-center gap-3 text-xs">
                  <span className="mono font-medium uppercase">{h.kind}</span>
                  <span className="ml-auto mono text-[var(--text-secondary)]" suppressHydrationWarning>
                    {relTime(new Date(h.created_at).getTime())}
                  </span>
                  <span
                    className="px-2 py-0.5 rounded text-[10px] uppercase mono"
                    style={{
                      background:
                        h.status === "ack" ? "rgba(16,245,143,0.12)" :
                        h.status === "sent" ? "rgba(34,211,255,0.12)" :
                        h.status === "failed" ? "rgba(255,61,87,0.12)" :
                        "var(--bg-elevated)",
                      color:
                        h.status === "ack" ? "var(--accent-green)" :
                        h.status === "sent" ? "var(--accent-cyan)" :
                        h.status === "failed" ? "var(--accent-red)" :
                        "var(--text-secondary)",
                    }}
                  >
                    {h.status}
                  </span>
                </div>
              ))}
            </div>
          )}
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
