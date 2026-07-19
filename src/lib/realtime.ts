import { supabase } from "@/integrations/supabase/client";
import { useApp } from "./store";
import { deriveTrips } from "./trip-path";

// Fenêtre d'historique utilisée pour reconstituer les trajets récents
const TRIP_HISTORY_HOURS = 48;

let started = false;
let channel: ReturnType<typeof supabase.channel> | null = null;

export async function startRealtime(deviceId: string) {
  if (started) return;
  started = true;

  // Initial loads — fired together so the dashboard isn't blocked behind
  // several sequential round-trips.
  const since = new Date(Date.now() - TRIP_HISTORY_HOURS * 3600_000).toISOString();
  const [{ data: lastT }, { data: zones }, { data: alerts }, { data: dev }, { data: trail }, { data: history }] = await Promise.all([
    supabase.from("telemetry").select("*").eq("device_id", deviceId).order("recorded_at", { ascending: false }).limit(1).maybeSingle(),
    // All of the account's geofences (RLS filters by owner) so every zone —
    // e.g. the city-wide perimeter — is visible on the dashboard, not just the
    // selected device's.
    supabase.from("geofences").select("*"),
    supabase.from("alerts").select("*").eq("device_id", deviceId).order("created_at", { ascending: false }).limit(100),
    supabase.from("devices").select("*").eq("id", deviceId).maybeSingle(),
    supabase.from("telemetry").select("lat,lng").eq("device_id", deviceId)
      .order("recorded_at", { ascending: false }).limit(100),
    supabase.from("telemetry").select("lat,lng,speed_kmh,heading,engine_on,recorded_at").eq("device_id", deviceId)
      .gte("recorded_at", since).order("recorded_at", { ascending: true }).limit(5000),
  ]);

  const s = useApp.getState();
  if (lastT) s.setTelemetry(rowToTelemetry(lastT));
  if (dev) s.setDevice({ id: dev.id, name: dev.name, isOnline: dev.is_online, lastSeenAt: dev.last_seen_at });
  if (trail) s.setTrail(trail.reverse().map((r: any) => ({ lat: r.lat, lng: r.lng })));
  if (zones) s.setZones(zones.map(rowToZone));
  if (alerts) s.setAlerts(alerts.map(rowToAlert));
  if (history) s.setTrips(deriveTrips(history, dev?.is_online ?? false));

  // Realtime
  channel = supabase
    .channel(`device:${deviceId}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "telemetry", filter: `device_id=eq.${deviceId}` },
      (p) => { useApp.getState().pushTelemetry(rowToTelemetry(p.new)); })
    .on("postgres_changes", { event: "*", schema: "public", table: "alerts", filter: `device_id=eq.${deviceId}` },
      (p) => {
        if (p.eventType === "INSERT") useApp.getState().pushAlert(rowToAlert(p.new));
        if (p.eventType === "UPDATE") useApp.getState().updateAlert(rowToAlert(p.new));
        if (p.eventType === "DELETE") useApp.getState().removeAlert((p.old as any).id);
      })
    // No device filter: geofences are account-wide (RLS scopes them to the
    // owner), so every zone change — device-bound or fleet-wide — is picked up.
    .on("postgres_changes", { event: "*", schema: "public", table: "geofences" },
      (p) => {
        if (p.eventType === "DELETE") useApp.getState().removeZone((p.old as any).id);
        else useApp.getState().upsertZone(rowToZone(p.new));
      })
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "devices", filter: `id=eq.${deviceId}` },
      (p) => { const d: any = p.new; useApp.getState().setDevice({ id: d.id, name: d.name, isOnline: d.is_online, lastSeenAt: d.last_seen_at }); })
    .subscribe((status) => {
      useApp.getState().setSocketStatus(
        status === "SUBSCRIBED" ? "connected" : status === "CHANNEL_ERROR" ? "offline" : "reconnecting",
      );
    });
}

export async function stopRealtime() {
  started = false;
  if (channel) { await supabase.removeChannel(channel); channel = null; }
  if (fleetAlertChannel) { await supabase.removeChannel(fleetAlertChannel); fleetAlertChannel = null; }
  fleetAlertsStarted = false;
}

let fleetAlertsStarted = false;
let fleetAlertChannel: ReturnType<typeof supabase.channel> | null = null;

export async function startFleetAlerts() {
  if (fleetAlertsStarted) return;
  fleetAlertsStarted = true;

  // Load ALL alerts across all devices (RLS filters by owner)
  const { data: allAlerts } = await supabase
    .from("alerts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (allAlerts) useApp.getState().setAlerts(allAlerts.map(rowToAlert));

  // Subscribe to ALL alert changes (RLS ensures only own devices)
  fleetAlertChannel = supabase
    .channel("fleet-alerts")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "alerts" },
      (p) => { useApp.getState().pushAlert(rowToAlert(p.new)); })
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "alerts" },
      (p) => { useApp.getState().updateAlert(rowToAlert(p.new)); })
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "alerts" },
      (p) => { useApp.getState().removeAlert((p.old as any).id); })
    .subscribe();
}

function rowToTelemetry(r: any) {
  return {
    lat: r.lat, lng: r.lng,
    speed: r.speed_kmh ?? 0, heading: r.heading ?? 0,
    altitude: r.altitude ?? 0, satellites: r.satellites ?? 0, hdop: r.hdop ?? 0,
    gpsSource: r.gps_source ?? null,
    batteryMain: r.battery_main ?? 0, batteryBackup: r.battery_backup ?? 0,
    gsmBars: r.gsm_bars ?? 0, gsmCarrier: r.gsm_carrier ?? "—",
    engineOn: !!r.engine_on,
    accel: { x: r.accel_x ?? 0, y: r.accel_y ?? 0, z: r.accel_z ?? 0 },
    timestamp: new Date(r.recorded_at).getTime(),
  };
}
function rowToAlert(r: any) {
  return {
    id: r.id, type: r.kind, severity: r.severity,
    title: r.title, message: r.message ?? "",
    timestamp: new Date(r.created_at).getTime(),
    lat: r.lat ?? undefined, lng: r.lng ?? undefined, read: !!r.read,
  };
}
function rowToZone(r: any) {
  return {
    id: r.id, name: r.name, shape: r.shape as "circle" | "rect",
    lat: r.lat, lng: r.lng, radius: r.radius_m,
    alertExit: r.alert_on_exit, alertEnter: r.alert_on_enter, active: r.active,
  };
}
