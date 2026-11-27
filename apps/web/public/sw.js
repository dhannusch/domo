// Domo's service worker: notifications for decisions that block on the user.
// No offline cache; the chat needs the daemon anyway.
self.addEventListener("install", () => self.skipWaiting())
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()))

self.addEventListener("push", (event) => {
  const note = event.data ? event.data.json() : { title: "Domo needs you", body: "", tag: "domo" }
  event.waitUntil(
    self.registration.showNotification(note.title, {
      body: note.body,
      tag: note.tag,
      icon: "/icons/icon-192-cfd7c2f52a.png",
      badge: "/icons/badge-96-cfd7c2f52a.png",
    }),
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows[0]
      return open ? open.focus() : self.clients.openWindow("/")
    }),
  )
})
