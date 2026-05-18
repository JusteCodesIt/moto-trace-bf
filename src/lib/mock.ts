/**
 * Mock telemetry generator — simulates a tracker around Ouagadougou.
 * Centre: 12.3640, -1.5328. Updates every 3s.
 */

export interface TelemetryPoint {
  lat: number;
  lng: number;
  speed: number;        // km/h
  heading: number;      // 0–359 deg
  altitude: number;     // m
  satellites: number;
  hdop: number;
  batteryMain: number;  // %
  batteryBackup: number;
  gsmBars: number;      // 0–5
  gsmCarrier: string;
  engineOn: boolean;
  accel: { x: number; y: number; z: number };
  timestamp: number;
}

export interface Trip {
  id: string;
  date: number;
  durationMin: number;
  distanceKm: number;
  maxSpeed: number;
  avgSpeed: number;
  startAddress: string;
  endAddress: string;
  status: "completed" | "active" | "interrupted";
}

export interface Alert {
  id: string;
  type: "shock" | "movement" | "geofence" | "battery" | "signal" | "speed";
  severity: "critical" | "warning" | "info";
  title: string;
  message: string;
  timestamp: number;
  lat?: number;
  lng?: number;
  read: boolean;
}

const OUAGA_CENTRE = { lat: 12.3640, lng: -1.5328 };

const ADDRESSES = [
  "Secteur 15, Ouagadougou",
  "Gounghin, Ouagadougou",
  "Ouaga 2000, Ouagadougou",
  "Dapoya, Ouagadougou",
  "Zone du Bois, Ouagadougou",
  "Cissin, Ouagadougou",
  "Pissy, Ouagadougou",
  "Tampouy, Ouagadougou",
  "Avenue Kwame Nkrumah, Ouagadougou",
  "Marché Sankaryaaré, Ouagadougou",
];

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

let _state: TelemetryPoint = {
  lat: OUAGA_CENTRE.lat,
  lng: OUAGA_CENTRE.lng,
  speed: 0,
  heading: 90,
  altitude: 305,
  satellites: 8,
  hdop: 1.2,
  batteryMain: 87,
  batteryBackup: 73,
  gsmBars: 4,
  gsmCarrier: "ORANGE BF",
  engineOn: true,
  accel: { x: 0.05, y: 0.02, z: 0.98 },
  timestamp: Date.now(),
};

export function getCurrentTelemetry(): TelemetryPoint {
  return { ..._state };
}

/** Mutate state with a small realistic step. */
function step(): TelemetryPoint {
  // gentle wander
  const headingRad = (_state.heading * Math.PI) / 180;
  const stepDeg = 0.0008 + Math.random() * 0.0006;
  _state.lat += Math.cos(headingRad) * stepDeg;
  _state.lng += Math.sin(headingRad) * stepDeg;
  _state.heading = (_state.heading + rand(-12, 12) + 360) % 360;

  // speed oscillates 0..80 with realistic acceleration
  const target = Math.max(0, Math.min(80, _state.speed + rand(-15, 15)));
  _state.speed = _state.speed * 0.6 + target * 0.4;

  _state.altitude = 300 + rand(-8, 12);
  _state.satellites = 7 + Math.floor(Math.random() * 4);
  _state.hdop = 1 + Math.random() * 3;
  _state.accel = {
    x: rand(-0.3, 0.3),
    y: rand(-0.3, 0.3),
    z: 0.95 + rand(-0.05, 0.05),
  };
  _state.gsmBars = 3 + Math.floor(Math.random() * 3);
  _state.batteryMain = Math.max(60, _state.batteryMain - 0.01);
  _state.batteryBackup = Math.max(50, _state.batteryBackup - 0.005);
  _state.timestamp = Date.now();
  return { ..._state };
}

type Listener = (p: TelemetryPoint) => void;
const listeners = new Set<Listener>();
let intervalId: ReturnType<typeof setInterval> | null = null;

export function startTelemetryStream() {
  if (intervalId) return;
  intervalId = setInterval(() => {
    const p = step();
    listeners.forEach((l) => l(p));
  }, 3000);
}

export function stopTelemetryStream() {
  if (intervalId) clearInterval(intervalId);
  intervalId = null;
}

export function subscribeTelemetry(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/* ─────────── seeded trips ─────────── */

export function seedTrips(): Trip[] {
  const trips: Trip[] = [];
  const now = Date.now();
  for (let i = 0; i < 14; i++) {
    const dayOffset = Math.floor(i / 2);
    const date = now - dayOffset * 24 * 60 * 60 * 1000 - rand(0, 12) * 60 * 60 * 1000;
    const distanceKm = +(rand(3, 28).toFixed(1));
    const avgSpeed = +(rand(25, 55).toFixed(0));
    const durationMin = Math.round((distanceKm / avgSpeed) * 60);
    trips.push({
      id: `T${(2000 + i).toString()}`,
      date,
      distanceKm,
      durationMin,
      avgSpeed,
      maxSpeed: avgSpeed + Math.floor(rand(15, 45)),
      startAddress: pick(ADDRESSES),
      endAddress: pick(ADDRESSES),
      status: i === 0 ? "active" : i === 5 ? "interrupted" : "completed",
    });
  }
  return trips.sort((a, b) => b.date - a.date);
}

/* ─────────── seeded alerts ─────────── */

const ALERT_TEMPLATES = [
  { type: "shock", severity: "critical", title: "Choc détecté", message: "Impact > 2.5g détecté sur l'axe vertical" },
  { type: "movement", severity: "warning", title: "Mouvement suspect", message: "Déplacement sans démarrage moteur" },
  { type: "geofence", severity: "warning", title: "Sortie de géozone", message: "Le véhicule a quitté la zone « Maison »" },
  { type: "battery", severity: "warning", title: "Batterie faible", message: "Batterie principale à 18%" },
  { type: "signal", severity: "info", title: "Signal GSM faible", message: "Qualité réseau dégradée — 1 barre" },
  { type: "speed", severity: "warning", title: "Excès de vitesse", message: "Vitesse 95 km/h détectée" },
] as const;

export function seedAlerts(): Alert[] {
  const alerts: Alert[] = [];
  const now = Date.now();
  for (let i = 0; i < 18; i++) {
    const tpl = pick(ALERT_TEMPLATES as unknown as typeof ALERT_TEMPLATES[number][]);
    alerts.push({
      id: `A${1000 + i}`,
      type: tpl.type,
      severity: tpl.severity,
      title: tpl.title,
      message: tpl.message,
      timestamp: now - i * rand(20, 180) * 60 * 1000,
      lat: OUAGA_CENTRE.lat + rand(-0.02, 0.02),
      lng: OUAGA_CENTRE.lng + rand(-0.02, 0.02),
      read: i > 4,
    });
  }
  return alerts;
}
