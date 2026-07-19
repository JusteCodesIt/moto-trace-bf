import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Satellite,
  SignalHigh,
  Battery,
  Radio,
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
  Frame,
  X,
} from "lucide-react";
import { useApp, type GpsSource } from "@/lib/store";
import { useMultiDevice, startMultiDeviceMap, stopMultiDeviceMap, type LiveDevice } from "@/lib/multi-device";
import { MapCanvas } from "./MapCanvas";
import { fmtCoord, relTime, speedColor } from "@/lib/format";
import { cn } from "@/lib/utils";
import { haversineM } from "@/lib/geo";
import { notify } from "./ConfirmDialog";

function gpsSourceInfo(source: GpsSource | null) {
  switch (source) {
    case "SIM7080G_PRIMARY":
      return { short: "GNSS", long: "GNSS (SIM7080G)", color: "var(--accent-cyan)" };
    case "NEO6M_FALLBACK":
      return { short: "NEO-6M", long: "GPS secours (NEO-6M)", color: "var(--accent-amber)" };
    case "NO_FIX":
      return { short: "NO FIX", long: "Aucun fix GPS", color: "var(--accent-red)" };
    default:
      return { short: "—", long: "—", color: "var(--text-secondary)" };
  }
}

const SHOCK_THRESHOLD_G = 2.5;
function shockStatus(accel: { x: number; y: number; z: number }) {
  const mag = Math.max(Math.abs(accel.x), Math.abs(accel.y), Math.abs(accel.z));
  if (mag >= SHOCK_THRESHOLD_G) {
    return { label: "Choc détecté", short: "CHOC", color: "var(--accent-red)" };
  }
  return { label: "Stable — pas de choc détecté", short: "STABLE", color: "var(--accent-green)" };
}

export function Dashboard() {
  const {
    device,
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

  // ── Multi-device map layer ──
  const { devices } = useMultiDevice();
  useEffect(() => {
    startMultiDeviceMap();
    return () => { stopMultiDeviceMap(); };
  }, []);

  const primaryId = device?.id;

  // All devices except the primary (which already has its own dedicated marker)
  const extraVehicles = useMemo(
    () => Object.values(devices).filter((d) => d.id !== primaryId),
    [devices, primaryId],
  );

  // Selected vehicle — its route is highlighted orange (with waypoints) and a
  // click popup shows its details. Clicking empty map deselects.
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const primaryVehicle = primaryId ? (devices[primaryId] ?? null) : null;
  // Prefer the vehicle's long on-road store trail (demo fleet); fall back to the
  // telemetry-history trail for real accounts.
  const primaryTrail = (primaryVehicle?.trail && primaryVehicle.trail.length > trail.length)
    ? primaryVehicle.trail
    : trail;

  const selectedTrail = selectedVehicleId
    ? (selectedVehicleId === primaryId ? primaryTrail : devices[selectedVehicleId]?.trail ?? null)
    : null;

  // Waypoints along the active route, spaced by DISTANCE (~350 m) rather than a
  // fixed count, so that once the user zooms in enough several dots stay in view
  // (MapCanvas hides them below WAYPOINT_MIN_ZOOM). Defaults to the primary
  // vehicle's route so zooming always reveals them, even without a selection.
  const waypoints = useMemo<Array<{ lat: number; lng: number }>>(() => {
    const src = selectedTrail ?? primaryTrail;
    if (!src || src.length < 4) return [];
    const STEP_M = 350;
    const MAX = 90;
    const wp: Array<{ lat: number; lng: number }> = [];
    let acc = 0;
    for (let i = 1; i < src.length && wp.length < MAX; i++) {
      acc += haversineM(src[i - 1].lat, src[i - 1].lng, src[i].lat, src[i].lng);
      if (acc >= STEP_M) { wp.push(src[i]); acc = 0; }
    }
    return wp;
  }, [selectedTrail, primaryTrail]);

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

  // Vehicle appears on the map only once a device exists AND has been paired
  // (i.e. real telemetry has been received). No device / no frame → no marker.
  const deviceCount = Object.keys(devices).length;
  const showVehicle = !!device && hasTelemetry;

  const [fleetFitTick, setFleetFitTick] = useState(0);
  const didAutoFitRef = useRef(false);

  // Auto-fit the viewport around the whole fleet the first time it loads.
  useEffect(() => {
    if (deviceCount > 1 && !didAutoFitRef.current) {
      didAutoFitRef.current = true;
      const t = setTimeout(() => setFleetFitTick((n) => n + 1), 600);
      return () => clearTimeout(t);
    }
  }, [deviceCount]);

  const unread = unreadAlerts();

  return (
    <div className="absolute inset-0 overflow-hidden">
      <MapCanvas
        center={[telemetry.lat, telemetry.lng]}
        heading={telemetry.heading}
        trail={primaryTrail}
        zones={zones.filter((z) => z.active).map((z) => ({
          id: z.id, shape: z.shape, lat: z.lat, lng: z.lng, radius: z.radius, name: z.name,
          status: haversineM(telemetry.lat, telemetry.lng, z.lat, z.lng) <= z.radius ? "in" : "out",
        }))}
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
        extraVehicles={extraVehicles}
        primaryVehicleId={primaryId}
        primaryVehicle={primaryVehicle}
        selectedVehicleId={selectedVehicleId}
        onVehicleClick={setSelectedVehicleId}
        onMapClick={() => setSelectedVehicleId(null)}
        waypoints={waypoints}
        showPrimary={showVehicle}
        followVehicle={extraVehicles.length === 0}
        fitFleetTick={fleetFitTick}
      />

      {/* ─── TOP BAR ─── */}
      <div className="absolute top-3 left-3 right-3 md:left-4 md:right-4 z-20 flex items-center justify-between gap-3 pointer-events-none">
        <div className="glass px-3 h-11 flex items-center gap-3 pointer-events-auto">
          <SocketDot status={socketStatus} />
          <span className="text-sm font-semibold tracking-tight hidden sm:inline">AutoTrack</span>
          <FleetStatusBadge devices={devices} />
        </div>

        {device && (
          <div className="glass px-4 h-11 flex items-center gap-3 pointer-events-auto">
            <StatusDot online={telemetry.engineOn} />
            <span className="text-sm font-medium truncate max-w-[120px]">{vehicleName}</span>
            <span className="hidden sm:inline text-[10px] mono px-1.5 py-0.5 rounded bg-[var(--bg-elevated)] uppercase tracking-wider"
              style={{ color: telemetry.engineOn ? "var(--accent-green)" : "var(--accent-red)" }}>
              {telemetry.engineOn ? "MOTEUR ON" : "MOTEUR OFF"}
            </span>
          </div>
        )}

        <Link to="/alerts" title="Voir les alertes" className="glass relative h-11 w-11 grid place-items-center pointer-events-auto hover:bg-[var(--bg-elevated)] transition-colors">
          <Bell className="size-[18px]" />
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 text-[10px] mono px-1.5 py-0.5 rounded-full bg-[var(--accent-red)] text-white min-w-[18px] text-center">
              {unread}
            </span>
          )}
        </Link>
      </div>

      {/* ─── FLEET STATUS STRIP (bottom-left, all trackers) ─── */}
      <FleetStatusStrip devices={devices} primaryId={primaryId} />

      {/* ─── MAP TOOL CLUSTER ─── */}
      <div className="absolute top-20 md:top-20 left-3 z-20 glass p-1 flex flex-col gap-0.5">
        {[
          ...(deviceCount > 1
            ? [{
                icon: Frame,
                label: "Voir toute la flotte",
                active: false,
                action: () => setFleetFitTick((n) => n + 1),
              }]
            : []),
          {
            icon: Crosshair,
            label: "Centrer sur le véhicule",
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
                "noopener,noreferrer",
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
            aria-label={label}
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

      {/* ─── BASE LAYER SWITCHER (shifted left of the desktop right panel) ─── */}
      <div className="absolute top-20 right-3 lg:right-[352px] z-30 glass p-1 flex">
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


      {/* ─── EMPTY STATE: no device / not paired yet ─── */}
      {!showVehicle && (
        <div className="absolute inset-x-3 top-[88px] z-20 md:left-1/2 md:-translate-x-1/2 md:inset-x-auto md:max-w-md">
          <div className="glass-strong p-4 rounded-lg border border-[var(--accent-amber)]/40">
            <div className="text-xs uppercase tracking-wider text-[var(--accent-amber)] font-semibold mb-1">
              {device ? "En attente du tracker" : "Aucun véhicule sur la carte"}
            </div>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              {device ? (
                <>
                  Aucune trame reçue du tracker pour le moment. La carte affichera la position dès que le dispositif enverra sa première trame HTTPS signée.
                  Récupérez le code de jumelage et la clé HMAC depuis la <a className="text-[var(--accent-cyan)] hover:underline" href="/fleet">fiche du véhicule</a>.
                </>
              ) : (
                <>
                  Aucun véhicule n'apparaîtra tant qu'un dispositif n'a pas été enregistré puis apparié.
                  Ajoutez votre premier engin depuis la page <a className="text-[var(--accent-cyan)] hover:underline" href="/fleet">Flotte</a>, puis flashez le tracker : le véhicule s'affichera dès la première trame reçue.
                </>
              )}
            </p>
          </div>
        </div>
      )}
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

function FleetStatusBadge({ devices }: { devices: Record<string, LiveDevice> }) {
  const all = Object.values(devices);
  const total = all.length;
  if (total === 0) return null;
  const online = all.filter((d) => d.engineOn || d.speed > 0).length;
  return (
    <span className="hidden md:inline-flex items-center gap-1.5 text-[10px] mono px-2 py-0.5 rounded bg-[var(--bg-elevated)]">
      <span className="size-1.5 rounded-full bg-[var(--accent-green)]" />
      <span className="text-[var(--accent-green)]">{online}</span>
      <span className="text-[var(--text-dim)]">/</span>
      <span className="text-[var(--text-secondary)]">{total}</span>
    </span>
  );
}

function FleetStatusStrip({ devices, primaryId }: { devices: Record<string, LiveDevice>; primaryId?: string }) {
  const all = Object.values(devices);
  if (all.length <= 1) return null;

  return (
    <div className="absolute bottom-20 md:bottom-4 left-3 z-20 glass-strong p-2.5 max-w-[260px] max-h-[220px] overflow-y-auto rounded-xl">
      <div className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-semibold mb-1.5 px-1">
        Flotte ({all.length})
      </div>
      <div className="space-y-0.5">
        {all.map((d) => {
          const isOnline = d.engineOn || d.speed > 0;
          const isPrimary = d.id === primaryId;
          return (
            <div
              key={d.id}
              className={cn(
                "flex items-center gap-2 px-2 py-1.5 rounded-md text-[11px] transition-colors",
                isPrimary ? "bg-[var(--accent-primary)]/10" : "hover:bg-[var(--bg-elevated)]/50",
              )}
            >
              <span
                className="size-2 rounded-full shrink-0"
                style={{ backgroundColor: isOnline ? "var(--accent-green)" : "var(--accent-red)" }}
              />
              <span className={cn("truncate flex-1", isPrimary && "font-medium")}>
                {d.name}
              </span>
              <span className="mono text-[var(--text-dim)] shrink-0">
                {d.speed > 0 ? `${Math.round(d.speed)} km/h` : isOnline ? "arrêté" : "off"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
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
          <Chip icon={Radio} value={gpsSourceInfo(t.gpsSource).short} color={gpsSourceInfo(t.gpsSource).color} />
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
          <CircularGauge label="Principale" value={Math.round(t.batteryMain)} />
          <CircularGauge label="Anti-vol" value={Math.round(t.batteryBackup)} />
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
            <div className="text-[11px] text-[var(--text-secondary)]">Détection automatique (capteur de tension)</div>
          </div>
        </div>

      </div>

      <Divider />

      {/* Accel */}
      <div>
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-semibold">
            Accéléromètre
          </span>
          <span
            className="text-[10px] mono px-1.5 py-0.5 rounded bg-[var(--bg-elevated)]"
            style={{ color: shockStatus(t.accel).color }}
          >
            {shockStatus(t.accel).short}
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

function Chip({ icon: Icon, value, tone, color }: { icon: typeof Satellite; value: string; tone?: "cyan" | "green" | "amber"; color?: string }) {
  const colorMap = { cyan: "var(--accent-cyan)", green: "var(--accent-green)", amber: "var(--accent-amber)" };
  const c = color ?? (tone ? colorMap[tone] : "var(--text-secondary)");
  return (
    <div className="card-elev px-2.5 h-9 flex items-center gap-2">
      <Icon className="size-3.5 shrink-0" style={{ color: c }} />
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

function CircularGauge({ label, value }: { label: string; value: number }) {
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
      <div className="mt-1.5 text-[11px] text-[var(--text-primary)] font-medium">
        {label}
      </div>
    </div>
  );
}

function LiveTab() {
  const t = useApp((s) => s.telemetry);
  const trips = useApp((s) => s.trips);
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
        <div className="text-[10px] mono text-[var(--text-secondary)] mt-2">
          {trips[0] ? `Max trajet: ${trips[0].maxSpeed} km/h` : "Max trajet: —"}
        </div>
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
            <div className="text-[var(--text-secondary)]">Source GPS</div>
            <div style={{ color: gpsSourceInfo(t.gpsSource).color }}>{gpsSourceInfo(t.gpsSource).long}</div>
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
          <Activity className="size-4" style={{ color: shockStatus(t.accel).color }} />
          <span className="text-xs">{shockStatus(t.accel).label}</span>
        </div>
      </div>
    </>
  );
}

function TripsTab() {
  const allTrips = useApp((s) => s.trips);
  const primaryId = useApp((s) => s.device?.id);
  const trips = allTrips.slice(0, 5);
  const last3 = allTrips.slice(0, 3);
  const totalDistance = last3.reduce((s, t) => s + t.distanceKm, 0);
  const totalDurationMin = last3.reduce((s, t) => s + t.durationMin, 0);
  const durationLabel = last3.length
    ? `${Math.floor(totalDurationMin / 60)}h${String(Math.round(totalDurationMin % 60)).padStart(2, "0")}`
    : "—";
  return (
    <>
      <div className="card-elev p-3 grid grid-cols-3 gap-2 text-center">
        <KPI label="Trajets" value={`${last3.length}`} />
        <KPI label="Distance" value={`${totalDistance.toFixed(1)}km`} />
        <KPI label="Durée" value={durationLabel} />
      </div>
      {trips.length === 0 ? (
        <div className="card-elev p-4 text-xs text-[var(--text-secondary)] text-center">
          Aucun trajet enregistré pour le moment.
        </div>
      ) : (
        trips.map((t) => (
          <Link
            key={t.id}
            to="/trips/$id"
            params={{ id: t.id }}
            search={primaryId ? { device: primaryId } : {}}
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
          </Link>
        ))
      )}
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
