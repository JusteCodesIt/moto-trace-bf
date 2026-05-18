import { formatDistanceToNowStrict } from "date-fns";
import { fr } from "date-fns/locale";

export const relTime = (ts: number) =>
  formatDistanceToNowStrict(new Date(ts), { addSuffix: true, locale: fr });

export const fmtCoord = (n: number, decimals = 6) =>
  n.toFixed(decimals);

export const fmtDuration = (min: number) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
};

export const bearingToCompass = (deg: number) => {
  const dirs = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
  return dirs[Math.round(deg / 45) % 8];
};

export const speedColor = (s: number) =>
  s < 60 ? "var(--accent-green)" : s < 90 ? "var(--accent-amber)" : "var(--accent-red)";
