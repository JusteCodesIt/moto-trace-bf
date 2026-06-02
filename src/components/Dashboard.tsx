import { useEffect, useState } from "react";
import {
  Satellite,
  SignalHigh,
  Battery,
  Thermometer,
  Power,
  Activity,
  Copy,
  Check,
  Navigation,
  ChevronLeft,
  ChevronRight,
  Bell,
  Layers,
  Crosshair,
  Search,
  Maximize2,
  Ruler,
  X,
} from "lucide-react";
import { useApp } from "@/lib/store";
import { MapCanvas } from "./MapCanvas";
import { bearingToCompass, fmtCoord, relTime, speedColor } from "@/lib/format";
import { cn } from "@/lib/utils";
import { confirm, notify } from "./ConfirmDialog";

export function Dashboard() {
  const {
    vehicleName,
    telemetry,
    hasTelemetry,
    trail,
    socketStatus,
    leftPanelOpen,
    setLeftPanelOpen,
    rightPanelTab,
    setRightPanelTab,
    mapStyle,
    setMapStyle,
    alerts,
    unreadAlerts,
    zones,
  } = useApp();

  const [recenterTick, setRecenterTick] = useState(0);
  const [measuring, setMeasuring] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);

  // fullscreen sync
  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const unread = unreadAlerts();

  return (
    <div className="absolute inset-0 overflow-hidden">
      <MapCanvas
        center={[telemetry.lat, telemetry.lng]}
        heading={telemetry.heading}
        trail={trail}
        style={mapStyle}
        recenterTick={recenterTick}
        searchQuery={searchQuery}
        onSearchResult={(ok, addr) => {
          if (ok) notify({ title: "Adresse trouvée", description: addr, tone: "success" });
          else notify({ title: "Adresse introuvable", description: "Aucun résultat pour cette recherche.", tone: "warning" });
        }}
        measuring={measuring}
        onMeasure={(d) =>
          notify({
            title: "Distance mesurée",
            description: d > 1000 ? `${(d / 1000).toFixed(2)} km` : `${Math.round(d)} m`,
            tone: "info",
          })
        }
      />

      {/* ─── TOP BAR ─── */}
      <div className="absolute top-3 left-3 right-3 md:left-4 md:right-4 z-20 flex items-center justify-between gap-3 pointer-events-none">
        <div className="glass px-3 h-11 flex items-center gap-3 pointer-events-auto">
          <SocketDot status={socketStatus} />
          <span className="text-sm font-semibold tracking-tight hidden sm:inline">MotoTrack BF</span>
        </div>

        <div className="glass px-4 h-11 flex items-center gap-3 pointer-events-auto">
          <StatusDot online={telemetry.engineOn} />
          <span className="text-sm font-medium">{vehicleName}</span>
          <span className="hidden sm:inline text-[10px] mono px-1.5 py-0.5 rounded bg-[var(--bg-elevated)] text-[var(--accent-green)] uppercase tracking-wider">
            {telemetry.engineOn ? "EN LIGNE" : "HORS LIGNE"}
          </span>
        </div>

        <a href="/alerts" title="Voir les alertes" className="glass relative h-11 w-11 grid place-items-center pointer-events-auto hover:bg-[var(--bg-elevated)] transition-colors">
          <Bell className="size-[18px]" />
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 text-[10px] mono px-1.5 py-0.5 rounded-full bg-[var(--accent-red)] text-white min-w-[18px] text-center">
              {unread}
            </span>
          )}
        </a>
      </div>

      {/* ─── MAP TOOL CLUSTER ─── */}
      <div className="absolute top-20 md:top-20 left-3 z-20 glass p-1 flex flex-col gap-0.5">
        {[
          {
            icon: Crosshair,
            label: "Centrer sur la moto",
            active: false,
            action: () => {
              setRecenterTick((n) => n + 1);
            },
          },
          {
            icon: Navigation,
            label: "Itinéraire (Google Maps)",
            active: false,
            action: () =>
              window.open(
                `https://www.google.com/maps/dir/?api=1&destination=${telemetry.lat},${telemetry.lng}`,
                "_blank",
              ),
          },
          {
            icon: Search,
            label: "Rechercher une adresse",
            active: searchOpen,
            action: () => setSearchOpen((v) => !v),
          },
          {
            icon: Ruler,
            label: measuring ? "Arrêter la mesure" : "Mesurer une distance",
            active: measuring,
            action: async () => {
              if (!measuring) {
                await notify({
                  title: "Outil mesure activé",
                  description: "Cliquez deux points sur la carte pour mesurer la distance.",
                  tone: "info",
                });
              }
              setMeasuring((v) => !v);
            },
          },
          {
            icon: Maximize2,
            label: isFullscreen ? "Quitter le plein écran" : "Plein écran",
            active: isFullscreen,
            action: () => {
              if (document.fullscreenElement) document.exitFullscreen();
              else document.documentElement.requestFullscreen?.();
            },
          },
        ].map(({ icon: Icon, label, action, active }) => (
          <button
            key={label}
            title={label}
            onClick={action}
            className={cn(
              "size-9 grid place-items-center rounded-md transition-colors",
              active
                ? "bg-[var(--accent-primary)] text-[var(--accent-milk)]"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]",
            )}
          >
            <Icon className="size-[16px]" />
          </button>
        ))}
      </div>

      {/* ─── BASE LAYER SWITCHER ─── */}
      <div className="absolute top-20 right-3 z-20 glass p-1 flex">
        {(["streets", "satellite"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setMapStyle(s)}
            className={cn(
              "h-8 px-3 text-xs rounded-md flex items-center gap-1.5 transition-colors capitalize",
              mapStyle === s
                ? "bg-[var(--bg-elevated)] text-[var(--text-primary)]"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
            )}
          >
            <Layers className="size-3.5" />
            {s === "streets" ? "Rue" : "Satellite"}
          </button>
        ))}
      </div>

      {/* ─── SEARCH BAR (toggleable) ─── */}
      {searchOpen && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const q = searchInput.trim();
            if (!q) return;
            // Append a zero-width tick so consecutive identical searches still trigger the effect
            setSearchQuery(q + "\u200b".repeat((searchQuery.match(/\u200b/g)?.length ?? 0) + 1));
          }}
          className="absolute top-20 left-16 z-20 glass-strong h-10 pl-3 pr-1 flex items-center gap-2 rounded-md w-[280px]"
        >
          <Search className="size-4 text-[var(--text-secondary)] shrink-0" />
          <input
            autoFocus
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Adresse, lieu…"
            className="flex-1 bg-transparent text-xs outline-none placeholder:text-[var(--text-dim)]"
          />
          <button
            type="submit"
            className="h-7 px-2.5 text-[10px] font-semibold uppercase rounded bg-[var(--accent-primary)] text-[var(--accent-milk)]"
          >
            OK
          </button>
          <button
            type="button"
            onClick={() => {
              setSearchOpen(false);
              setSearchInput("");
            }}
            className="size-7 grid place-items-center rounded text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"
            aria-label="Fermer"
          >
            <X className="size-3.5" />
          </button>
        </form>
      )}

      {/* ─── LEFT VITALS PANEL ─── */}
      <button
        onClick={() => setLeftPanelOpen(!leftPanelOpen)}
        className="absolute top-1/2 -translate-y-1/2 z-30 glass h-12 w-7 grid place-items-center transition-all rounded-r-md rounded-l-none"
        style={{ left: leftPanelOpen ? "calc(280px + 12px)" : "12px" }}
      >
        {leftPanelOpen ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />}
      </button>

      <aside
        className={cn(
          "absolute top-16 bottom-3 left-3 z-20 w-[280px] glass-strong overflow-y-auto transition-transform duration-200",
          !leftPanelOpen && "-translate-x-[calc(100%+16px)]",
        )}
      >
        <VitalsPanel />
      </aside>

      {/* ─── RIGHT PANEL ─── */}
      <aside className="hidden lg:flex absolute top-16 bottom-3 right-3 z-20 w-[340px] glass-strong flex-col overflow-hidden">
        <div className="flex border-b border-[var(--border)] shrink-0">
          {([
            { id: "live", label: "Temps réel" },
            { id: "trips", label: "Trajets" },
            { id: "alerts", label: "Alertes" },
          ] as const).map((t) => (
            <button
              key={t.id}
              onClick={() => setRightPanelTab(t.id)}
              className={cn(
                "flex-1 h-11 text-xs font-medium transition-colors relative",
                rightPanelTab === t.id
                  ? "text-[var(--text-primary)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
              )}
            >
              {t.label}
              {rightPanelTab === t.id && (
                <span className="absolute bottom-0 inset-x-3 h-[2px] rounded bg-[var(--accent-primary)]" />
              )}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {rightPanelTab === "live" && <LiveTab />}
          {rightPanelTab === "trips" && <TripsTab />}
          {rightPanelTab === "alerts" && <AlertsTab alerts={alerts.slice(0, 10)} />}
        </div>
      </aside>

      {/* ─── SPEED OVERLAY ─── */}
      <div className="absolute bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-20 glass-strong px-6 py-3 flex flex-col items-center min-w-[180px]">
        <div className="flex items-baseline gap-2">
          <span
            className="text-5xl font-bold leading-none tabular-nums"
            style={{ color: speedColor(telemetry.speed) }}
          >
            {Math.round(telemetry.speed)}
          </span>
          <span className="text-xs text-[var(--text-secondary)] mono uppercase">km/h</span>
        </div>
        <div className="text-[11px] mono text-[var(--text-secondary)] mt-1">
          {Math.round(telemetry.heading)}° {bearingToCompass(telemetry.heading)}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────── sub-components ─────────────────────── */

function SocketDot({ status }: { status: "connected" | "reconnecting" | "offline" }) {
  const map = {
    connected: { color: "var(--accent-cyan)", pulse: true },
    reconnecting: { color: "var(--text-secondary)", pulse: false },
    offline: { color: "var(--accent-red)", pulse: false },
  } as const;
  const { color, pulse } = map[status];
  return (
    <span
      className={cn("size-2 rounded-full", pulse && "pulse-dot")}
      style={{ backgroundColor: color, color }}
    />
  );
}

function StatusDot({ online }: { online: boolean }) {
  return (
    <span
      className={cn("size-2 rounded-full pulse-dot")}
      style={{
        backgroundColor: online ? "var(--accent-green)" : "var(--accent-red)",
        color: online ? "var(--accent-green)" : "var(--accent-red)",
      }}
    />
  );
}

function VitalsPanel() {
  const t = useApp((s) => s.telemetry);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <div className="p-4 space-y-5">
      {/* Vehicle */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-semibold">
            Véhicule
          </span>
          <span className="text-[10px] mono text-[var(--text-secondary)]">
            {mounted ? `MAJ ${relTime(t.timestamp)}` : "MAJ —"}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Chip icon={Satellite} value={`${t.satellites} SAT`} tone="cyan" />
          <Chip icon={SignalHigh} value={`${t.gsmBars}/5`} tone="green" />
          <Chip icon={Battery} value={`${Math.round(t.batteryMain)}%`} tone="green" />
          <Chip icon={Thermometer} value={`42°C`} tone="amber" />
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px] mono text-[var(--text-secondary)]">
          <span>{t.gsmCarrier} · GPRS</span>
          <SignalBars bars={t.gsmBars} />
        </div>
      </div>

      <Divider />

      {/* Batteries */}
      <div>
        <span className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-semibold">
          Système d'alimentation
        </span>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <CircularGauge label="Principale" value={Math.round(t.batteryMain)} sub="~8h 12min" />
          <CircularGauge label="Anti-vol" value={Math.round(t.batteryBackup)} sub="~6h 45min" charging />
        </div>
      </div>

      <Divider />

      {/* Engine */}
      <div>
        <span className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-semibold">
          Moteur
        </span>
        <div className="mt-3 card-elev p-3 flex items-center gap-3">
          <div
            className="size-10 rounded-full grid place-items-center shrink-0"
            style={{
              background: t.engineOn ? "rgba(0,230,118,0.12)" : "rgba(255,61,87,0.12)",
              color: t.engineOn ? "var(--accent-green)" : "var(--accent-red)",
            }}
          >
            <Power className="size-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div
              className="text-xs font-semibold uppercase tracking-wide truncate"
              style={{ color: t.engineOn ? "var(--accent-green)" : "var(--accent-red)" }}
            >
              {t.engineOn ? "Moteur en marche" : "Moteur coupé"}
            </div>
            <div className="text-[11px] text-[var(--text-secondary)]">PIN requis</div>
          </div>
          <button
            onClick={async () => {
              const ok = await confirm({
                title: t.engineOn ? "Couper le moteur ?" : "Remettre en marche ?",
                description: t.engineOn
                  ? "Le moteur sera immédiatement coupé. Assurez-vous que la moto est à l'arrêt."
                  : "Le démarrage moteur sera autorisé à distance.",
                tone: t.engineOn ? "danger" : "warning",
                confirmLabel: t.engineOn ? "Couper" : "Démarrer",
              });
              if (ok) await notify({ title: "Commande envoyée", description: "L'appareil applique la commande.", tone: "success" });
            }}
            className="h-8 px-3 text-xs rounded-md bg-[var(--accent-red)]/10 text-[var(--accent-red)] hover:bg-[var(--accent-red)]/20 transition-colors font-medium"
          >
            {t.engineOn ? "Couper" : "Démarrer"}
          </button>
        </div>
      </div>

      <Divider />

      {/* Accel */}
      <div>
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-semibold">
            Accéléromètre
          </span>
          <span className="text-[10px] mono px-1.5 py-0.5 rounded bg-[var(--bg-elevated)] text-[var(--accent-green)]">
            STABLE
          </span>
        </div>
        <div className="mt-3 space-y-2">
          {(["x", "y", "z"] as const).map((axis) => {
            const v = t.accel[axis];
            return (
              <div key={axis} className="flex items-center gap-3">
                <span className="text-[11px] mono uppercase w-3 text-[var(--text-secondary)]">{axis}</span>
                <div className="flex-1 h-1.5 rounded-full bg-[var(--bg-elevated)] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[var(--accent-cyan)] transition-all"
                    style={{ width: `${Math.min(100, Math.abs(v) * 100)}%` }}
                  />
                </div>
                <span className="text-[11px] mono w-12 text-right">{v.toFixed(2)}g</span>
              </div>
            );
          })}
          <div className="text-[10px] mono text-[var(--text-secondary)]">Seuil choc: 2.5g</div>
        </div>
      </div>
    </div>
  );
}

function Chip({ icon: Icon, value, tone }: { icon: typeof Satellite; value: string; tone: "cyan" | "green" | "amber" }) {
  const colorMap = { cyan: "var(--accent-cyan)", green: "var(--accent-green)", amber: "var(--accent-amber)" };
  return (
    <div className="card-elev px-2.5 h-9 flex items-center gap-2">
      <Icon className="size-3.5 shrink-0" style={{ color: colorMap[tone] }} />
      <span className="text-xs mono font-medium">{value}</span>
    </div>
  );
}

function Divider() {
  return <div className="h-px bg-[var(--border)]" />;
}

function SignalBars({ bars }: { bars: number }) {
  return (
    <span className="flex items-end gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className="w-0.5 rounded-sm"
          style={{
            height: `${4 + i * 2}px`,
            background: i <= bars ? "var(--accent-green)" : "var(--border-active)",
          }}
        />
      ))}
    </span>
  );
}

function CircularGauge({ label, value, sub, charging }: { label: string; value: number; sub: string; charging?: boolean }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const color = value > 30 ? "var(--accent-green)" : value > 15 ? "var(--accent-amber)" : "var(--accent-red)";
  return (
    <div className="card-elev p-3 flex flex-col items-center">
      <div className="relative w-[68px] h-[68px]">
        <svg viewBox="0 0 60 60" className="w-full h-full -rotate-90">
          <circle cx="30" cy="30" r={r} stroke="var(--bg-elevated)" strokeWidth="5" fill="none" />
          <circle
            cx="30"
            cy="30"
            r={r}
            stroke={color}
            strokeWidth="5"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c - (value / 100) * c}
            style={{ transition: "stroke-dashoffset 400ms ease-out" }}
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center text-sm font-bold mono">
          {value}%
        </div>
      </div>
      <div className="mt-1.5 text-[11px] text-[var(--text-primary)] font-medium flex items-center gap-1">
        {label}
        {charging && <span className="text-[var(--accent-amber)]">⚡</span>}
      </div>
      <div className="text-[10px] mono text-[var(--text-secondary)]">{sub}</div>
    </div>
  );
}

function LiveTab() {
  const t = useApp((s) => s.telemetry);
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(`${t.lat}, ${t.lng}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <>
      <div className="card-elev p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-semibold">
            Coordonnées
          </span>
          <button onClick={copy} className="text-[var(--text-secondary)] hover:text-[var(--accent-cyan)]">
            {copied ? <Check className="size-3.5 text-[var(--accent-green)]" /> : <Copy className="size-3.5" />}
          </button>
        </div>
        <div className="space-y-1 mono text-xs">
          <div className="flex justify-between">
            <span className="text-[var(--text-secondary)]">LAT</span>
            <span>{fmtCoord(t.lat)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--text-secondary)]">LNG</span>
            <span>{fmtCoord(t.lng)}</span>
          </div>
        </div>
        <div className="flex gap-1.5 mt-3">
          <a
            href={`https://www.google.com/maps?q=${t.lat},${t.lng}`}
            target="_blank"
            rel="noreferrer"
            className="flex-1 h-7 text-[10px] text-center grid place-items-center rounded-md bg-[var(--bg-elevated)] hover:bg-[var(--border-active)] transition-colors"
          >
            Voir sur Google Maps
          </a>
        </div>
      </div>

      <div className="card-elev p-3">
        <span className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-semibold">
          Vitesse · Altitude
        </span>
        <div className="mt-2 flex items-end gap-3">
          <div className="text-3xl font-bold mono" style={{ color: speedColor(t.speed) }}>
            {Math.round(t.speed)}
          </div>
          <div className="text-xs text-[var(--text-secondary)] pb-1">km/h</div>
          <div className="ml-auto text-right">
            <div className="text-xs mono">{Math.round(t.altitude)}m</div>
            <div className="text-[10px] text-[var(--text-secondary)]">Altitude</div>
          </div>
        </div>
        <div className="text-[10px] mono text-[var(--text-secondary)] mt-2">Max trajet: 74 km/h</div>
      </div>

      <div className="card-elev p-3">
        <span className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-semibold">
          Qualité GPS
        </span>
        <div className="grid grid-cols-12 gap-1 mt-2">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="aspect-square rounded grid place-items-center"
              style={{
                background: i < t.satellites ? "rgba(0,212,255,0.15)" : "var(--bg-elevated)",
                color: i < t.satellites ? "var(--accent-cyan)" : "var(--text-dim)",
              }}
            >
              <Satellite className="size-3" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2 mt-3 text-[10px] mono">
          <div>
            <div className="text-[var(--text-secondary)]">HDOP</div>
            <div className="text-[var(--text-primary)]">±{t.hdop.toFixed(1)}m</div>
          </div>
          <div>
            <div className="text-[var(--text-secondary)]">Fix</div>
            <div className="text-[var(--accent-green)]">3D Fix</div>
          </div>
          <div>
            <div className="text-[var(--text-secondary)]">Dernier</div>
            <div className="text-[var(--text-primary)]" suppressHydrationWarning>
              {new Date(t.timestamp).toLocaleTimeString("fr-FR")}
            </div>
          </div>
        </div>
      </div>

      <div className="card-elev p-3">
        <span className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-semibold">
          Activité capteurs
        </span>
        <div className="mt-2 flex items-center gap-2">
          <Activity className="size-4 text-[var(--accent-green)]" />
          <span className="text-xs">Stable — pas de choc détecté</span>
        </div>
      </div>
    </>
  );
}

function TripsTab() {
  const trips = useApp((s) => s.trips).slice(0, 5);
  const total = trips.slice(0, 3).reduce((s, t) => s + t.distanceKm, 0).toFixed(1);
  return (
    <>
      <div className="card-elev p-3 grid grid-cols-3 gap-2 text-center">
        <KPI label="Trajets" value="3" />
        <KPI label="Distance" value={`${total}km`} />
        <KPI label="Durée" value="1h23" />
      </div>
      {trips.map((t) => (
        <a
          key={t.id}
          href={`/trips/${t.id}`}
          className="card-elev p-3 block hover:bg-[var(--bg-elevated)] transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-[11px] mono text-[var(--text-secondary)] mb-1">
            <span suppressHydrationWarning>{new Date(t.date).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>
            <span>{t.distanceKm} km</span>
          </div>
          <div className="text-xs truncate">{t.endAddress}</div>
          <div className="flex items-center justify-between mt-1">
            <span className="text-[10px] mono text-[var(--text-secondary)]">max {t.maxSpeed}km/h</span>
            <span className="text-[10px] text-[var(--accent-primary)]">▶ Replay</span>
          </div>
        </a>
      ))}
    </>
  );
}

function KPI({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-base font-bold mono">{value}</div>
      <div className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider">{label}</div>
    </div>
  );
}

function AlertsTab({ alerts }: { alerts: Array<{ id: string; type: string; title: string; severity: string; timestamp: number }> }) {
  const sevColor: Record<string, string> = {
    critical: "var(--accent-red)",
    warning: "var(--accent-amber)",
    info: "var(--accent-cyan)",
  };
  return (
    <>
      {alerts.map((a) => (
        <div
          key={a.id}
          className="card-elev p-3 flex items-start gap-3 border-l-4"
          style={{ borderLeftColor: sevColor[a.severity] }}
        >
          <Bell className="size-4 shrink-0 mt-0.5" style={{ color: sevColor[a.severity] }} />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium truncate">{a.title}</div>
            <div className="text-[10px] mono text-[var(--text-secondary)]" suppressHydrationWarning>{relTime(a.timestamp)}</div>
          </div>
        </div>
      ))}
    </>
  );
}
