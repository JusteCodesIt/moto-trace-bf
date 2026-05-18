import { create } from "zustand";
import type { Alert, TelemetryPoint, Trip } from "./mock";
import { getCurrentTelemetry, seedAlerts, seedTrips } from "./mock";

interface AppState {
  // vehicle
  vehicleName: string;
  telemetry: TelemetryPoint;
  trail: Array<{ lat: number; lng: number }>;
  setTelemetry: (p: TelemetryPoint) => void;

  // connection
  socketStatus: "connected" | "reconnecting" | "offline";
  setSocketStatus: (s: AppState["socketStatus"]) => void;

  // trips
  trips: Trip[];
  selectedTripId: string | null;
  selectTrip: (id: string | null) => void;

  // alerts
  alerts: Alert[];
  unreadAlerts: () => number;
  markAlertRead: (id: string) => void;
  markAllRead: () => void;
  pushAlert: (a: Alert) => void;

  // ui
  leftPanelOpen: boolean;
  rightPanelTab: "live" | "trips" | "alerts";
  setLeftPanelOpen: (v: boolean) => void;
  setRightPanelTab: (t: AppState["rightPanelTab"]) => void;
  mapStyle: "streets" | "satellite";
  setMapStyle: (s: AppState["mapStyle"]) => void;
}

export const useApp = create<AppState>((set, get) => ({
  vehicleName: "MotoTrack #BF-001",
  telemetry: getCurrentTelemetry(),
  trail: [],
  setTelemetry: (p) =>
    set((s) => ({
      telemetry: p,
      trail: [...s.trail.slice(-99), { lat: p.lat, lng: p.lng }],
    })),

  socketStatus: "connected",
  setSocketStatus: (socketStatus) => set({ socketStatus }),

  trips: seedTrips(),
  selectedTripId: null,
  selectTrip: (selectedTripId) => set({ selectedTripId }),

  alerts: seedAlerts(),
  unreadAlerts: () => get().alerts.filter((a) => !a.read).length,
  markAlertRead: (id) =>
    set((s) => ({ alerts: s.alerts.map((a) => (a.id === id ? { ...a, read: true } : a)) })),
  markAllRead: () =>
    set((s) => ({ alerts: s.alerts.map((a) => ({ ...a, read: true })) })),
  pushAlert: (a) => set((s) => ({ alerts: [a, ...s.alerts] })),

  leftPanelOpen: true,
  rightPanelTab: "live",
  setLeftPanelOpen: (leftPanelOpen) => set({ leftPanelOpen }),
  setRightPanelTab: (rightPanelTab) => set({ rightPanelTab }),
  mapStyle: "streets",
  setMapStyle: (mapStyle) => set({ mapStyle }),
}));
