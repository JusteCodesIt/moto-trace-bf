// AutoTrack — Service Worker (Web Push)
// Reçoit les notifications push du serveur et les affiche au navigateur.
// Flasher avec VAPID keys : npx web-push generate-vapid-keys

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
    }),
  );
});
