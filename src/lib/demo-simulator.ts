/**
 * Demo fleet simulator — client-side only, activated exclusively for the
 * demonstration account (admintest@gmail.com / user_metadata.is_demo).
 *
 * Each vehicle is animated ALONG a real road-following loop (computed with OSRM,
 * see demo-routes-data.ts) so its route always respects the street network — it
 * never cuts through buildings. Movement is emitted at a steady cadence and the
 * markers glide smoothly (CSS transition applied in MapCanvas).
 *
 * No database writes — real accounts never run this and production ingestion is
 * untouched.
 */

import { useMultiDevice, type LiveDevice } from "./multi-device";
import { useApp, type TelemetryPoint, type GpsSource } from "./store";
import { DEMO_ROUTES } from "./demo-routes-data";

const TICK_MS = 500;
// Accelerate simulated travel so the fleet visibly circulates, but keep it slow
// enough (with the long OSRM loops) that a full circuit takes minutes — so the
// movement reads as coherent city driving, not a short repeating circle.
const SPEED_FACTOR = 4;
// Keep the trail shorter than one full loop so the vehicle never visually
// drives over its own previous path (prevents "revenir sur ses pas").
const TRAIL_KM = 7;

type DriveState = "driving" | "stopped";
type Profile = "cruising" | "urban";

interface Intent {
  route: number;        // index into DEMO_ROUTES
  seg: number;          // current segment start vertex index
  frac: number;         // [0,1) progress within the current segment
  speed: number;        // current displayed km/h (with inertia)
  targetSpeed: number;  // km/h the driver is currently aiming for
  cruiseSpeed: number;  // this vehicle's baseline cruise speed
  state: DriveState;    // driving vs temporarily stopped
  stateTicks: number;   // ticks left in the current stop
  profile: Profile;     // driving character (express vs city)
  engineOn: boolean;
}

const intents = new Map<string, Intent>();
const routeTaken = new Set<number>();
let timer: ReturnType<typeof setInterval> | null = null;

/** True when the signed-in user is the demonstration account. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isDemoUser(user: any): boolean {
  if (!user) return false;
  return (
    user.email === "admintest@gmail.com" ||
    user.user_metadata?.is_demo === true ||
    user.app_metadata?.is_demo === true
  );
}

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

function bearing(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const φ1 = (aLat * Math.PI) / 180;
  const φ2 = (bLat * Math.PI) / 180;
  const Δλ = ((bLng - aLng) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) * 180) / Math.PI;
}

/** Assign the nearest unused road loop to a vehicle so it starts on-route. */
function nearestRoute(lat: number, lng: number): number {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < DEMO_ROUTES.length; i++) {
    if (routeTaken.has(i)) continue;
    const s = DEMO_ROUTES[i][0];
    const d = haversineKm(lat, lng, s[0], s[1]);
    if (d < bestD) { bestD = d; best = i; }
  }
  if (best !== -1) return best;
  for (let i = 0; i < DEMO_ROUTES.length; i++) {
    const s = DEMO_ROUTES[i][0];
    const d = haversineKm(lat, lng, s[0], s[1]);
    if (d < bestD) { bestD = d; best = i; }
  }
  return Math.max(0, best);
}

function nearestSeg(route: Array<[number, number]>, lat: number, lng: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < route.length; i++) {
    const d = haversineKm(lat, lng, route[i][0], route[i][1]);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

/** Walk `km` forward along the loop, returning the new segment + fraction. */
function advance(route: Array<[number, number]>, seg: number, frac: number, km: number) {
  let remaining = km;
  let s = seg;
  let f = frac;
  let guard = 0;
  while (remaining > 0 && guard++ < route.length * 2) {
    const a = route[s];
    const b = route[(s + 1) % route.length];
    const segKm = haversineKm(a[0], a[1], b[0], b[1]) || 0.0001;
    const segRemainKm = segKm * (1 - f);
    if (remaining < segRemainKm) {
      f += remaining / segKm;
      remaining = 0;
    } else {
      remaining -= segRemainKm;
      s = (s + 1) % route.length;
      f = 0;
    }
  }
  return { seg: s, frac: f };
}

/**
 * The recent road path ending at the current position, spanning at least
 * `minKm` km behind the vehicle (capped at one full loop). This keeps a long
 * itinerary drawn on the map before it fades.
 */
function buildTrail(route: Array<[number, number]>, seg: number, frac: number, minKm: number) {
  const R = route.length;
  const back: Array<{ lat: number; lng: number }> = [{ lat: route[seg][0], lng: route[seg][1] }];
  let acc = 0;
  let k = seg;
  for (let steps = 0; acc < minKm && steps < R; steps++) {
    const prev = ((k - 1) % R + R) % R;
    acc += haversineKm(route[k][0], route[k][1], route[prev][0], route[prev][1]);
    back.push({ lat: route[prev][0], lng: route[prev][1] });
    k = prev;
  }
  back.reverse(); // oldest → current vertex
  const a = route[seg];
  const b = route[(seg + 1) % R];
  back.push({ lat: a[0] + (b[0] - a[0]) * frac, lng: a[1] + (b[1] - a[1]) * frac });
  return back;
}

/** Stable per-vehicle character from its id — express (fewer stops, faster) or
 *  city (slower, frequent short stops). Heavy trucks stay in a realistic band. */
function pickProfile(id: string): Profile {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 5 < 2 ? "cruising" : "urban"; // ~40% express, ~60% city
}

/** Cap speed into corners: the sharper the upcoming turn, the slower the truck. */
function turnSpeedCap(route: Array<[number, number]>, seg: number, target: number): number {
  const R = route.length;
  const a = route[seg];
  const b = route[(seg + 1) % R];
  const c = route[(seg + 2) % R];
  const h1 = bearing(a[0], a[1], b[0], b[1]);
  const h2 = bearing(b[0], b[1], c[0], c[1]);
  let delta = Math.abs(h2 - h1);
  if (delta > 180) delta = 360 - delta;
  const factor = Math.max(0.3, 1 - delta / 110); // 90°+ turn → ~30% of cruise
  return target * factor;
}

function stepDevice(d: LiveDevice): LiveDevice {
  let it = intents.get(d.id);
  if (!it) {
    const route = nearestRoute(d.lat, d.lng);
    routeTaken.add(route);
    const profile = pickProfile(d.id);
    // Heavy commercial vehicles: express ~34-48 km/h, city ~20-32 km/h.
    const cruise = profile === "cruising" ? 34 + Math.random() * 14 : 20 + Math.random() * 12;
    it = {
      route, seg: nearestSeg(DEMO_ROUTES[route], d.lat, d.lng), frac: 0,
      speed: cruise * 0.55, targetSpeed: cruise, cruiseSpeed: cruise,
      state: "driving", stateTicks: 0, profile, engineOn: true,
    };
    intents.set(d.id, it);
  }
  const route = DEMO_ROUTES[it.route];
  const R = route.length;

  // --- driving state machine ----------------------------------------------
  if (it.state === "stopped") {
    it.stateTicks -= 1;
    if (it.stateTicks <= 0) {
      it.state = "driving";
      it.engineOn = true;
      it.targetSpeed = it.cruiseSpeed * (0.7 + Math.random() * 0.3);
    }
  } else {
    // Occasional stop — traffic light or delivery; far more frequent in the city.
    const stopProb = it.profile === "urban" ? 0.018 : 0.005;
    if (Math.random() < stopProb) {
      it.state = "stopped";
      const long = Math.random() < (it.profile === "urban" ? 0.3 : 0.12);
      it.stateTicks = long ? 24 + Math.floor(Math.random() * 46) : 4 + Math.floor(Math.random() * 10);
      it.engineOn = !long; // a long delivery stop cuts the engine; a light idles
    } else if (Math.random() < 0.05) {
      it.targetSpeed = it.cruiseSpeed * (0.6 + Math.random() * 0.4); // natural drift
    }
  }

  // Corner-aware desired speed, then move toward it with inertia (brake harder
  // than we accelerate — reads like a real vehicle rather than teleporting).
  const desired = it.state === "stopped" ? 0 : Math.min(it.targetSpeed, turnSpeedCap(route, it.seg, it.targetSpeed));
  const dv = desired - it.speed;
  it.speed = Math.max(0, Math.min(72, it.speed + Math.max(-7, Math.min(3.2, dv))));

  const km = (it.speed / 3600) * (TICK_MS / 1000) * SPEED_FACTOR;
  if (km > 0) {
    const adv = advance(route, it.seg, it.frac, km);
    it.seg = adv.seg;
    it.frac = adv.frac;
  }

  const a = route[it.seg];
  const b = route[(it.seg + 1) % R];
  const lat = a[0] + (b[0] - a[0]) * it.frac;
  const lng = a[1] + (b[1] - a[1]) * it.frac;
  const hdg = (bearing(a[0], a[1], b[0], b[1]) + 360) % 360;
  const moving = it.speed > 0.5;

  return {
    ...d,
    lat,
    lng,
    heading: Math.round(hdg),
    speed: Math.round(it.speed),
    engineOn: it.engineOn,
    // Battery drains a touch while driving, barely while idle/parked.
    batteryMain: Math.max(35, d.batteryMain - (moving ? Math.random() * 0.03 : Math.random() * 0.006)),
    gsmBars: Math.max(2, Math.min(5, d.gsmBars + (Math.random() < 0.06 ? (Math.random() < 0.5 ? -1 : 1) : 0))),
    timestamp: Date.now(),
    trail: buildTrail(route, it.seg, it.frac, TRAIL_KM),
  };
}

function liveToTelemetry(d: LiveDevice): TelemetryPoint {
  const moving = d.speed > 0.5;
  return {
    lat: d.lat,
    lng: d.lng,
    speed: d.speed,
    heading: d.heading,
    altitude: 300,
    satellites: 9,
    hdop: 0.9,
    gpsSource: (d.gpsSource as GpsSource) ?? "SIM7080G_PRIMARY",
    batteryMain: d.batteryMain,
    batteryBackup: d.batteryBackup,
    gsmBars: d.gsmBars,
    gsmCarrier: d.gsmCarrier,
    engineOn: d.engineOn,
    accel: moving
      ? { x: (Math.random() - 0.5) * 0.4, y: (Math.random() - 0.5) * 0.4, z: 1 }
      : { x: (Math.random() - 0.5) * 0.05, y: (Math.random() - 0.5) * 0.05, z: 1 },
    timestamp: d.timestamp,
  };
}

function tick(): void {
  const store = useMultiDevice.getState();
  const ids = Object.keys(store.devices);
  if (ids.length === 0) return; // fleet not loaded yet — no-op

  const updates: Record<string, LiveDevice> = {};
  for (const id of ids) updates[id] = stepDevice(store.devices[id]);
  store.batchUpdate(updates);

  // Keep the selected (primary) vehicle's detailed telemetry in sync so the
  // vitals panel and speed overlay move too. (Its long trail is read from the
  // multi-device store, like the other vehicles.)
  const primaryId = useApp.getState().device?.id;
  if (primaryId && updates[primaryId]) {
    useApp.getState().pushTelemetry(liveToTelemetry(updates[primaryId]));
  }
}

export function startDemoSimulator(): void {
  if (timer) return;
  timer = setInterval(tick, TICK_MS);
}

export function stopDemoSimulator(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  intents.clear();
  routeTaken.clear();
}
