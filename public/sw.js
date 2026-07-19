// AutoTrack — Service Worker
// Push notifications + caching strategy for PWA

const SW_VERSION = "1.1.0";
const CACHE_NAME = `autotrack-v${SW_VERSION}`;
const STATIC_ASSETS = ["/", "/favicon.ico"];

// ── Install: pre-cache shell ──
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// ── Activate: clean old caches ──
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch: strategy per request type ──
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET and cross-origin
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;

  // API requests: network-first
  if (url.pathname.startsWith("/api/") || url.pathname.includes("/functions/")) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Static assets (JS, CSS, images): cache-first
  if (/\.(js|css|png|jpg|svg|woff2?|ico)(\?|$)/.test(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then((cached) =>
        cached || fetch(event.request).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return res;
        })
      )
    );
    return;
  }

  // HTML navigation: NETWORK-FIRST.
  // La coquille doit toujours etre a jour : elle reference des chunks JS
  // hashes. Servir un HTML perime (stale-while-revalidate) fait pointer vers
  // d'anciens chunks supprimes apres un redeploiement -> "Failed to fetch
  // dynamically imported module". Le cache ne sert que de secours hors-ligne.
  if (
    event.request.mode === "navigate" ||
    event.request.headers.get("accept")?.includes("text/html")
  ) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return res;
        })
        .catch(() =>
          caches.match(event.request).then((c) => c || caches.match("/"))
        )
    );
    return;
  }
});

// ── Push notifications ──
self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {};
  const title = data.title ?? "AutoTrack";
  const options = {
    body: data.body ?? "",
    icon: "/favicon.ico",
    badge: "/favicon.ico",
    tag: data.tag ?? "autotrack-alert",
    data: { url: data.url ?? "/" },
    vibrate: [200, 100, 200],
    requireInteraction: data.requireInteraction ?? false,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((wcs) => {
      for (const wc of wcs) {
        if (wc.url.endsWith(url) && "focus" in wc) return wc.focus();
      }
      return clients.openWindow(url);
    })
  );
});
