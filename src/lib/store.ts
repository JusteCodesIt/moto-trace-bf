import { create } from "zustand";

export type GpsSource = "SIM7080G_PRIMARY" | "NEO6M_FALLBACK" | "NO_FIX";

export interface TelemetryPoint {
  lat: number; lng: number;
  speed: number; heading: number; altitude: number;
  satellites: number; hdop: number;
  gpsSource: GpsSource | null;
  batteryMain: number; batteryBackup: number;
  gsmBars: number; gsmCarrier: string;
  engineOn: boolean;
  accel: { x: number; y: number; z: number };
  timestamp: number;
}
export interface Alert {
  id: string; type: string; severity: "critical" | "warning" | "info";
  title: string; message: string; timestamp: number;
  lat?: number; lng?: number; read: boolean;
}
export interface Zone {
  id: string; name: string; shape: "circle" | "rect";
  lat: number; lng: number; radius: number;
  alertExit: boolean; alertEnter: boolean; active: boolean;
}
export interface Trip {
  id: string; date: number; durationMin: number; distanceKm: number;
  maxSpeed: number; avgSpeed: number;
  startAddress: string; endAddress: string;
  status: "completed" | "active" | "interrupted";
}
export interface DeviceInfo {
  id: string; name: string; isOnline: boolean; lastSeenAt: string | null;
}

const OUAGA: TelemetryPoint = {
  lat: 12.364, lng: -1.5328, speed: 0, heading: 0, altitude: 0,
  satellites: 0, hdop: 0, gpsSource: null, batteryMain: 0, batteryBackup: 0,
  gsmBars: 0, gsmCarrier: "—", engineOn: false,
  accel: { x: 0, y: 0, z: 0 },
  timestamp: 0,
};

interface State {
  device: DeviceInfo | null;
  vehicleName: string;
  telemetry: TelemetryPoint;
  hasTelemetry: boolean;
  trail: Array<{ lat: number; lng: number }>;
  socketStatus: "connected" | "reconnecting" | "offline";
  zones: Zone[];
  alerts: Alert[];
  trips: Trip[];
  // ui
  leftPanelOpen: boolean;
  rightPanelTab: "live" | "trips" | "alerts";
  mapStyle: "streets" | "satellite";

  setDevice: (d: DeviceInfo) => void;
  setTelemetry: (p: TelemetryPoint) => void;
  pushTelemetry: (p: TelemetryPoint) => void;
  setTrail: (t: Array<{ lat: number; lng: number }>) => void;
  setSocketStatus: (s: State["socketStatus"]) => void;
  setZones: (z: Zone[]) => void;
  upsertZone: (z: Zone) => void;
  removeZone: (id: string) => void;
  setAlerts: (a: Alert[]) => void;
  pushAlert: (a: Alert) => void;
  updateAlert: (a: Alert) => void;
  removeAlert: (id: string) => void;
  markAlertRead: (id: string) => void;
  markAllRead: () => void;
  unreadAlerts: () => number;
  setTrips: (t: Trip[]) => void;
  setLeftPanelOpen: (v: boolean) => void;
  setRightPanelTab: (t: State["rightPanelTab"]) => void;
  setMapStyle: (s: State["mapStyle"]) => void;
}

export const useApp = create<State>((set, get) => ({
  device: null,
  vehicleName: "AutoTrack",
  telemetry: OUAGA,
  hasTelemetry: false,
  trail: [],
  socketStatus: "reconnecting",
  zones: [],
  alerts: [],
  trips: [],
  leftPanelOpen: false,
  rightPanelTab: "live",
  mapStyle: "streets",

  setDevice: (device) => set({ device, vehicleName: device.name }),
  setTelemetry: (telemetry) => set({ telemetry, hasTelemetry: true }),
  pushTelemetry: (p) => set((s) => ({
    telemetry: p, hasTelemetry: true,
    trail: [...s.trail.slice(-99), { lat: p.lat, lng: p.lng }],
  })),
  setTrail: (trail) => set({ trail }),
  setSocketStatus: (socketStatus) => set({ socketStatus }),
  setZones: (zones) => set({ zones }),
  upsertZone: (z) => set((s) => {
    const i = s.zones.findIndex((x) => x.id === z.id);
    if (i === -1) return { zones: [...s.zones, z] };
    const copy = [...s.zones]; copy[i] = z; return { zones: copy };
  }),
  removeZone: (id) => set((s) => ({ zones: s.zones.filter((z) => z.id !== id) })),
  setAlerts: (alerts) => set({ alerts }),
  pushAlert: (a) => set((s) => ({ alerts: [a, ...s.alerts] })),
  updateAlert: (a) => set((s) => ({ alerts: s.alerts.map((x) => x.id === a.id ? a : x) })),
  removeAlert: (id) => set((s) => ({ alerts: s.alerts.filter((a) => a.id !== id) })),
  markAlertRead: (id) => set((s) => ({ alerts: s.alerts.map((a) => a.id === id ? { ...a, read: true } : a) })),
  markAllRead: () => set((s) => ({ alerts: s.alerts.map((a) => ({ ...a, read: true })) })),
  unreadAlerts: () => get().alerts.filter((a) => !a.read).length,
  setTrips: (trips) => set({ trips }),
  setLeftPanelOpen: (leftPanelOpen) => set({ leftPanelOpen }),
  setRightPanelTab: (rightPanelTab) => set({ rightPanelTab }),
  setMapStyle: (mapStyle) => set({ mapStyle }),
}));
