/* Padma push service worker */
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
    data: { url: data.url || '/' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = event.notification.data?.url || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(
      (clientList) => {
        for (const client of clientList) {
          if ('focus' in client) {
            client.navigate(target)
            return client.focus()
          }
        }
        if (self.clients.openWindow) return self.clients.openWindow(target)
      },
    ),
  )
})
