/* Padma push service worker */
const setBadge = (count) => {
  const nav = self.navigator
  if (typeof count !== 'number' || !nav || !('setAppBadge' in nav))
    return Promise.resolve()
  return (count > 0 ? nav.setAppBadge(count) : nav.clearAppBadge()).catch(
    () => {},
  )
}
// Safari revokes the subscription after pushes without a notification.
const appleWebKit =
  /AppleWebKit/.test(self.navigator?.userAgent || '') &&
  !/Chrome|Chromium|Edg/.test(self.navigator?.userAgent || '')

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) =>
  event.waitUntil(self.clients.claim()),
)

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }
  const title = data.title || 'Padma'
  const options = {
    body: data.body || 'Новое уведомление',
    icon: '/icons/icon-192.png',
    badge: '/favicon-32.png',
    tag: data.tag || undefined,
    renotify: Boolean(data.tag),
    data: { url: data.url || '/' },
  }
  event.waitUntil(
    Promise.all([
      setBadge(data.unread),
      self.clients
        .matchAll({ type: 'window', includeUncontrolled: true })
        .then((clients) => {
          // Open tabs refresh unread counters right away.
          for (const client of clients)
            client.postMessage({ type: 'padma-push' })
          // The open, focused site shows its own in-app notification.
          const focused = clients.some(
            (c) => c.focused && c.visibilityState === 'visible',
          )
          if (focused && !appleWebKit) return
          return self.registration.showNotification(title, options)
        }),
    ]),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = event.notification.data?.url || '/'
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ('focus' in client) {
            client.navigate(target)
            return client.focus()
          }
        }
        if (self.clients.openWindow) return self.clients.openWindow(target)
      }),
  )
})
