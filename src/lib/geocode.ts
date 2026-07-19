const CACHE_KEY_PREFIX = "geocode:";
const memCache = new Map<string, string>();

function getCache(key: string): string | undefined {
  const mem = memCache.get(key);
  if (mem) return mem;
  try {
    const stored = sessionStorage.getItem(CACHE_KEY_PREFIX + key);
    if (stored) { memCache.set(key, stored); return stored; }
  } catch {}
  return undefined;
}

function setCache(key: string, value: string) {
  memCache.set(key, value);
  try { sessionStorage.setItem(CACHE_KEY_PREFIX + key, value); } catch {}
}
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse";

function cacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const key = cacheKey(lat, lng);
  const cached = getCache(key);
  if (cached) return cached;

  try {
    const url = `${NOMINATIM_URL}?lat=${lat}&lon=${lng}&format=json&zoom=16&addressdetails=0&accept-language=fr`;
    const res = await fetch(url, {
      headers: { "User-Agent": "AutoTrack/1.0 (ibrayago06@gmail.com)" },
    });
    if (!res.ok) return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    const data = await res.json();
    const name = data.display_name?.split(",").slice(0, 3).join(",").trim()
      ?? `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    setCache(key, name);
    return name;
  } catch {
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }
}
