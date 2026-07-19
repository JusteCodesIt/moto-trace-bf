import { supabase } from "@/integrations/supabase/client";
import { haversineKm } from "./geo";
import type { Trip } from "./store";

export interface TripPoint {
  lat: number;
  lng: number;
  speed: number;   // km/h
  heading: number; // 0–359
  t: number;       // seconds from trip start
}

type TripRow = {
  lat: number;
  lng: number;
  speed_kmh: number | null;
  heading: number | null;
  engine_on: boolean | null;
  recorded_at: string;
};

const MAX_HOP_KM = 3;
const MIN_TRIP_DURATION_MIN = 2;
const MIN_TRIP_DISTANCE_KM = 0.2;

function coordLabel(lat: number, lng: number) {
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

/** Découpe l'historique de télémétrie en trajets contigus (moteur en marche). */
export function deriveTrips(rows: TripRow[], deviceOnline: boolean): Trip[] {
  const trips: Trip[] = [];
  let run: TripRow[] = [];

  const flush = () => {
    if (run.length < 2) { run = []; return; }
    const first = run[0];
    const last = run[run.length - 1];
    const startTs = new Date(first.recorded_at).getTime();
    const endTs = new Date(last.recorded_at).getTime();
    const durationMin = Math.round((endTs - startTs) / 60000);

    let distanceKm = 0;
    let maxSpeed = 0;
    let speedSum = 0;
    for (let i = 0; i < run.length; i++) {
      const speed = run[i].speed_kmh ?? 0;
      maxSpeed = Math.max(maxSpeed, speed);
      speedSum += speed;
      if (i > 0) {
        const d = haversineKm(run[i - 1].lat, run[i - 1].lng, run[i].lat, run[i].lng);
        if (d <= MAX_HOP_KM) distanceKm += d;
      }
    }
    const avgSpeed = run.length > 0 ? speedSum / run.length : 0;

    if (durationMin >= MIN_TRIP_DURATION_MIN || distanceKm >= MIN_TRIP_DISTANCE_KM) {
      trips.push({
        id: String(startTs),
        date: startTs,
        durationMin,
        distanceKm: +distanceKm.toFixed(2),
        maxSpeed: Math.round(maxSpeed),
        avgSpeed: Math.round(avgSpeed),
        startAddress: coordLabel(first.lat, first.lng),
        endAddress: coordLabel(last.lat, last.lng),
        status: "completed",
      });
    }
    run = [];
  };

  for (const r of rows) {
    if (r.engine_on) run.push(r);
    else flush();
  }
  // Trajet en cours : moteur toujours en marche au dernier point et device en ligne
  const stillRunning = deviceOnline && run.length >= 2;
  if (stillRunning) {
    flush();
    if (trips.length > 0) trips[trips.length - 1].status = "active";
  } else {
    flush();
  }

  return trips.reverse();
}

/** Récupère le tracé réel d'un trajet depuis la télémétrie historique. */
export async function getTripPath(deviceId: string, trip: Trip): Promise<TripPoint[]> {
  const start = new Date(trip.date).toISOString();
  const end = new Date(trip.date + trip.durationMin * 60_000 + 60_000).toISOString();

  const { data } = await supabase
    .from("telemetry")
    .select("lat,lng,speed_kmh,heading,recorded_at")
    .eq("device_id", deviceId)
    .gte("recorded_at", start)
    .lte("recorded_at", end)
    .order("recorded_at", { ascending: true });

  if (!data) return [];
  return data.map((r: any) => ({
    lat: r.lat,
    lng: r.lng,
    speed: r.speed_kmh ?? 0,
    heading: r.heading ?? 0,
    t: Math.round((new Date(r.recorded_at).getTime() - trip.date) / 1000),
  }));
}

/**
 * Récupère TOUT le tracé d'un appareil entre deux instants (trajet complet du
 * véhicule, en fonction de la date/heure — pas segmenté par trajet).
 */
export async function getDeviceJourneyPath(
  deviceId: string,
  fromISO: string,
  toISO: string,
): Promise<TripPoint[]> {
  const { data } = await supabase
    .from("telemetry")
    .select("lat,lng,speed_kmh,heading,recorded_at")
    .eq("device_id", deviceId)
    .gte("recorded_at", fromISO)
    .lte("recorded_at", toISO)
    .order("recorded_at", { ascending: true })
    .limit(10000);
  if (!data) return [];
  const t0 = new Date(fromISO).getTime();
  return data.map((r: any) => ({
    lat: r.lat,
    lng: r.lng,
    speed: r.speed_kmh ?? 0,
    heading: r.heading ?? 0,
    t: Math.round((new Date(r.recorded_at).getTime() - t0) / 1000),
  }));
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
<gpx version="1.1" creator="AutoTrack" xmlns="http://www.topografix.com/GPX/1/1">
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

export async function downloadGPX(deviceId: string, trip: Trip) {
  const path = await getTripPath(deviceId, trip);
  const blob = new Blob([toGPX(trip, path)], { type: "application/gpx+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `autotrack-${trip.id}.gpx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
