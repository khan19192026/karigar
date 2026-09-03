/* eslint-env serviceworker */

/**
 * Push handlers, imported into the generated Workbox service worker via
 * `workbox.importScripts` in vite.config.js.
 *
 * Kept in /public and hand-written rather than bundled, because the generated
 * service worker is produced by Workbox and this needs to live inside it —
 * not alongside it.
 */

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = { title: 'Karigar D.I. Khan', body: event.data ? event.data.text() : '' }
  }

  const title = payload.title || 'Karigar D.I. Khan'
  const options = {
    body: payload.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    // Same tag + renotify: a second message replaces the first rather than
    // stacking six notifications for one conversation.
    tag: payload.tag || 'karigar-chat',
    renotify: true,
    data: { url: payload.url || '/chats' },
    actions: [{ action: 'open', title: 'Kholein' }],
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = event.notification.data?.url || '/chats'

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })

      // Reuse an open tab if there is one — opening a second copy of the app
      // is disorienting, and it loses whatever the user was typing.
      for (const client of clientList) {
        if ('focus' in client) {
          await client.focus()
          if ('navigate' in client) {
            try {
              await client.navigate(target)
            } catch {
              /* cross-origin or blocked — focus alone is fine */
            }
          }
          return
        }
      }

      await self.clients.openWindow(target)
    })(),
  )
})
