/* Parent Web Push service worker */
self.addEventListener('push', (event) => {
  let data = { title: 'SchoolKids', body: 'New update', data: {} };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    data.body = event.data?.text() || data.body;
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'SchoolKids', {
      body: data.body || '',
      data: data.data || {},
      icon: '/favicon.svg',
      badge: '/favicon.svg',
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('/parent');
      return undefined;
    })
  );
});
