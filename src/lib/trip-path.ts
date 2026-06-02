/**
 * Deterministic trip path generator.
 * Each trip ID always produces the same realistic GPS trace around Ouagadougou.
 */

import type { Trip } from "./store";

export interface TripPoint {
  lat: number;
  lng: number;
  speed: number;   // km/h
  heading: number; // 0–359
  t: number;       // seconds from trip start
}

const OUAGA = { lat: 12.364, lng: -1.5328 };

/** Tiny seeded PRNG (mulberry32). */
function rng(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const _cache = new Map<string, TripPoint[]>();

export function buildTripPath(trip: Trip): TripPoint[] {
  const cached = _cache.get(trip.id);
  if (cached) return cached;

  const r = rng(hashId(trip.id));
  // 1 point ≈ every 5 simulated seconds.
  const totalSec = trip.durationMin * 60;
  const stepSec = 5;
  const steps = Math.max(20, Math.floor(totalSec / stepSec));

  // Start somewhere offset from centre, deterministic per trip.
  const startOffsetLat = (r() - 0.5) * 0.06;
  const startOffsetLng = (r() - 0.5) * 0.06;
  let lat = OUAGA.lat + startOffsetLat;
  let lng = OUAGA.lng + startOffsetLng;
  let heading = r() * 360;

  // Average per-step displacement so total ≈ distanceKm.
  // 1 deg lat ≈ 111 km; cos(lat) factor for lng. We treat avg directly.
  const avgKmPerStep = trip.distanceKm / steps;
  const avgDegPerStep = avgKmPerStep / 111;

  const pts: TripPoint[] = [];
  for (let i = 0; i < steps; i++) {
    // smooth heading wander
    heading = (heading + (r() - 0.5) * 25 + 360) % 360;
    const headRad = (heading * Math.PI) / 180;
    const stepDeg = avgDegPerStep * (0.7 + r() * 0.6);
    lat += Math.cos(headRad) * stepDeg;
    lng += Math.sin(headRad) * stepDeg / Math.cos((lat * Math.PI) / 180);

    // realistic speed profile: ramps up, plateau, ramps down
    const phase = i / steps;
    const envelope =
      phase < 0.15 ? phase / 0.15 :
      phase > 0.85 ? (1 - phase) / 0.15 : 1;
    const base = trip.avgSpeed * envelope;
    const noise = (r() - 0.5) * 15;
    const speed = Math.max(0, Math.min(trip.maxSpeed, base + noise));

    pts.push({
      lat: +lat.toFixed(6),
      lng: +lng.toFixed(6),
      speed: +speed.toFixed(1),
      heading: +heading.toFixed(1),
      t: i * stepSec,
    });
  }
  _cache.set(trip.id, pts);
  return pts;
}

/** Convert a trip path to a GPX 1.1 XML string. */
export function toGPX(trip: Trip, path: TripPoint[]): string {
  const startDate = new Date(trip.date).toISOString();
  const pts = path
    .map((p) => {
      const time = new Date(trip.date + p.t * 1000).toISOString();
      return `<trkpt lat="${p.lat}" lon="${p.lng}"><time>${time}</time><speed>${(p.speed / 3.6).toFixed(2)}</speed></trkpt>`;
    })
    .join("\n      ");
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="MotoTrack BF" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>Trajet ${trip.id}</name>
    <time>${startDate}</time>
  </metadata>
  <trk>
    <name>${trip.startAddress} → ${trip.endAddress}</name>
    <trkseg>
      ${pts}
    </trkseg>
  </trk>
</gpx>`;
}

export function downloadGPX(trip: Trip) {
  const path = buildTripPath(trip);
  const blob = new Blob([toGPX(trip, path)], { type: "application/gpx+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `mototrack-${trip.id}.gpx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
