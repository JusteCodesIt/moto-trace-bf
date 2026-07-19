/**
 * In-process sliding-window rate limiter — Cloudflare Workers compatible.
 *
 * Each CF Worker isolate has its own in-memory buckets; Cloudflare's
 * network-edge DDoS protection handles cross-isolate floods.
 *
 * Enforced limits:
 *   /api/public/ingest
 *     IP burst    10 req / 5 s   — absorbs firmware retries without amplifying floods
 *     IP minute   60 req / 60 s  — hard cap per source IP
 *     Device      30 req / 60 s  — max 1 frame every 2 s per authenticated tracker
 *
 *   /api/public/share/*
 *     IP minute   120 req / 60 s — more permissive (read-only public endpoint)
 */

class SlidingWindow {
  private buckets = new Map<string, number[]>();
  private lastCleanup = Date.now();

  allow(key: string, limit: number, windowMs: number): boolean {
    this.maybeCleanup(windowMs);
    const now = Date.now();
    const prev = this.buckets.get(key) ?? [];
    const alive = prev.filter((t) => now - t < windowMs);
    if (alive.length >= limit) return false;
    alive.push(now);
    this.buckets.set(key, alive);
    return true;
  }

  remaining(key: string, limit: number, windowMs: number): number {
    const now = Date.now();
    const prev = this.buckets.get(key) ?? [];
    const alive = prev.filter((t) => now - t < windowMs);
    return Math.max(0, limit - alive.length);
  }

  // Prunes stale buckets every 5 minutes to prevent unbounded Map growth
  // inside a long-lived CF Worker isolate.
  private maybeCleanup(windowMs: number) {
    const now = Date.now();
    if (now - this.lastCleanup < 5 * 60_000) return;
    for (const [key, ts] of this.buckets) {
      const alive = ts.filter((t) => now - t < windowMs);
      alive.length ? this.buckets.set(key, alive) : this.buckets.delete(key);
    }
    this.lastCleanup = now;
  }
}

// Module-level singletons — shared across requests within the same isolate.
const ipBurst   = new SlidingWindow(); // 10 req / 5 s  per IP
const ipMinute  = new SlidingWindow(); // 60 req / 60 s per IP
const devMinute = new SlidingWindow(); // 30 req / 60 s per device
const shareIp   = new SlidingWindow(); // 120 req / 60 s per IP (share endpoint)
const alertDev  = new SlidingWindow(); // 10 alerts / 60 s per device

export type RateLimitDenial = {
  allowed: false;
  reason: "ip_burst" | "ip_minute" | "device_minute";
  retryAfter: number; // seconds
};

/**
 * Check IP-level rate limits.
 * Call this BEFORE any DB work to avoid DB amplification attacks.
 */
export function checkIpIngestRate(ip: string): { allowed: true } | RateLimitDenial {
  if (!ipBurst.allow(ip, 10, 5_000))
    return { allowed: false, reason: "ip_burst", retryAfter: 5 };
  if (!ipMinute.allow(ip, 60, 60_000))
    return { allowed: false, reason: "ip_minute", retryAfter: 60 };
  return { allowed: true };
}

/**
 * Check device-level rate limit.
 * Call this AFTER HMAC verification so deviceId is authenticated.
 */
export function checkDeviceIngestRate(deviceId: string): { allowed: true } | RateLimitDenial {
  if (!devMinute.allow(deviceId, 30, 60_000))
    return { allowed: false, reason: "device_minute", retryAfter: 60 };
  return { allowed: true };
}

/**
 * Check IP rate limit for the share endpoint.
 * Returns true if the request is allowed.
 */
export function checkShareRate(ip: string): boolean {
  return shareIp.allow(ip, 120, 60_000);
}

/**
 * Check alert generation rate per device.
 * Returns true if the device is allowed to generate more alerts.
 */
export function checkAlertRate(deviceId: string, count: number): boolean {
  if (alertDev.remaining(deviceId, 10, 60_000) < count) return false;
  for (let i = 0; i < count; i++) {
    alertDev.allow(deviceId, 10, 60_000);
  }
  return true;
}

/**
 * Extract the client IP from Cloudflare headers.
 * cf-connecting-ip is injected by Cloudflare's proxy — it cannot be spoofed
 * by the client on requests that go through Cloudflare's network.
 */
export function extractIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    "unknown"
  );
}
