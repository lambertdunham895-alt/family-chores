/* Family app service worker — push notifications only.
   Deliberately does NOT cache anything. Caching a single-page app from a
   service worker is how you end up serving a stale build after a deploy. */

self.addEventListener("install", (e) => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let d = { title: "Family Calendar", body: "Something changed", url: "/", tag: "calendar" };
  try {
    if (event.data) d = Object.assign(d, event.data.json());
  } catch (err) {
    try { d.body = event.data.text(); } catch (e2) { /* keep defaults */ }
  }

  event.waitUntil(
    self.registration.showNotification(d.title, {
      body: d.body,
      tag: d.tag,                 // same tag replaces, so 5 edits don't stack 5 notifications
      renotify: true,
      // badge = the small status-bar stencil. Android throws away all colour and
      // uses only the alpha channel, so this MUST be white-on-transparent or it
      // renders as a solid white square.
      badge: "/notif-icon.png",
      // icon = the larger image beside the text; this one keeps its colour.
      icon: "/icon-192.png",
      data: { url: d.url || "/" },
      vibrate: [80, 40, 80],
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        // reuse an already-open tab rather than piling up new ones
        if ("focus" in c) { c.navigate(target); return c.focus(); }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});
