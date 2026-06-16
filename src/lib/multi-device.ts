/**
 * Multi-device realtime layer — fleet-scale (17 flottes × 750 engins).
 *
 * Scalabilité vs v1 :
 *
 *  ① Démarrage O(1) — un seul RPC get_fleet_positions() au lieu de 750 requêtes
 *     parallèles sur telemetry.
 *
 *  ② Realtime sans filtre IN — souscription sur device_positions (1 row/engin)
 *     sans filtre device_id=in.(N UUIDs). Le RLS appliqué côté serveur par
 *     Supabase Realtime garantit que chaque admin ne reçoit que les événements
 *     de sa propre flotte. Pas de Edge Function nécessaire.
 *
 *  ③ Batch Zustand 200 ms — les mises à jour rapides d'un même lot sont
 *     accumulées avant un seul set() React, réduisant les re-renders de
 *     ~375/s à ~5/s pour une flotte de 750 engins.
 *
 *  ④ Record<string, LiveDevice> — spread O(N_updates) vs copie Map O(N_total).
 */

import { create } from "zustand";
import { supabase } from "@/integrations/supabase/client";

// ── Type public (inchangé — Dashboard/MapCanvas non impactés) ──────────────

export interface LiveDevice {
  id:            string;
  name:          string;
  isOnline:      boolean;
  vehicleType:   string | null;
  lat:           number;
  lng:           number;
  heading:       number;
  speed:         number;
  engineOn:      boolean;
  batteryMain:   number;
  batteryBackup: number;
  gsmBars:       number;
  gsmCarrier:    string;
  gpsSource:     string | null;
  timestamp:     number; // ms epoch
}

// ── Store Zustand ──────────────────────────────────────────────────────────

interface MultiDeviceState {
  devices:     Record<string, LiveDevice>;
  batchUpdate: (updates: Record<string, LiveDevice>) => void;
  removeAll:   () => void;
}

export const useMultiDevice = create<MultiDeviceState>((set) => ({
  devices:     {},
  batchUpdate: (updates) => set((s) => ({ devices: { ...s.devices, ...updates } })),
  removeAll:   () => set({ devices: {} }),
}));

// ── Type de ligne retourné par get_fleet_positions() et device_positions ───

interface FleetRow {
  device_id:       string;
  name?:           string | null;
  is_online?:      boolean | null;
  vehicle_type?:   string | null;
  lat:             number;
  lng:             number;
  speed_kmh?:      number | null;
  heading?:        number | null;
  altitude?:       number | null;
  engine_on?:      boolean | null;
  battery_main?:   number | null;
  battery_backup?: number | null;
  gsm_bars?:       number | null;
  gsm_carrier?:    string | null;
  gps_source?:     string | null;
  recorded_at:     string;
}

function rowToDevice(
  row: FleetRow,
  prevName?: string,
  prevOnline?: boolean,
  prevVehicleType?: string | null,
): LiveDevice {
  return {
    id:            row.device_id,
    name:          row.name ?? prevName ?? row.device_id.slice(0, 8),
    isOnline:      row.is_online ?? prevOnline ?? false,
    vehicleType:   row.vehicle_type ?? prevVehicleType ?? null,
    lat:           row.lat,
    lng:           row.lng,
    heading:       row.heading ?? 0,
    speed:         row.speed_kmh ?? 0,
    engineOn:      row.engine_on ?? false,
    batteryMain:   row.battery_main ?? 0,
    batteryBackup: row.battery_backup ?? 0,
    gsmBars:       row.gsm_bars ?? 0,
    gsmCarrier:    row.gsm_carrier ?? "—",
    gpsSource:     row.gps_source ?? null,
    timestamp:     new Date(row.recorded_at).getTime(),
  };
}

// ── État interne ───────────────────────────────────────────────────────────

let mdStarted = false;
let mdChannel: ReturnType<typeof supabase.channel> | null = null;

// Accumulateur 200 ms : les trames rapides d'un même engin fusionnent
let pendingBatch: Record<string, LiveDevice> = {};
let batchTimer: ReturnType<typeof setTimeout> | null = null;

function flushBatch(): void {
  const updates = pendingBatch;
  pendingBatch = {};
  batchTimer = null;
  if (Object.keys(updates).length > 0) {
    useMultiDevice.getState().batchUpdate(updates);
  }
}

function scheduleFlush(): void {
  if (!batchTimer) batchTimer = setTimeout(flushBatch, 200);
}

// ── API publique ───────────────────────────────────────────────────────────

export async function startMultiDeviceMap(): Promise<void> {
  if (mdStarted) return;
  mdStarted = true;

  // ① Snapshot initial — 1 round-trip RPC pour toute la flotte
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("get_fleet_positions");
  if (!error && Array.isArray(data) && data.length > 0) {
    const initial: Record<string, LiveDevice> = {};
    for (const row of data as FleetRow[]) {
      initial[row.device_id] = rowToDevice(row);
    }
    useMultiDevice.getState().batchUpdate(initial);
  }

  // ② Mises à jour temps réel via Supabase Realtime sur device_positions
  //    Pas de filtre IN(N UUIDs) : le RLS Supabase filtre automatiquement
  //    les événements au propriétaire connecté (auth.uid() via devices.owner_id).
  mdChannel = supabase
    .channel("fleet-positions")
    .on(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      "postgres_changes" as any,
      { event: "*", schema: "public", table: "device_positions" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (payload: any) => {
        const row = payload.new as FleetRow | undefined;
        if (!row?.device_id) return;
        const current = useMultiDevice.getState().devices;
        const prev = current[row.device_id];
        pendingBatch[row.device_id] = rowToDevice(row, prev?.name, prev?.isOnline, prev?.vehicleType);
        scheduleFlush();
      },
    )
    .subscribe();
}

export async function stopMultiDeviceMap(): Promise<void> {
  mdStarted = false;
  if (batchTimer) { clearTimeout(batchTimer); batchTimer = null; }
  pendingBatch = {};
  if (mdChannel) {
    await supabase.removeChannel(mdChannel);
    mdChannel = null;
  }
  useMultiDevice.getState().removeAll();
}
