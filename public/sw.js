/* global self */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

function safeAppUrl(value) {
  try {
    const url = new URL(typeof value === 'string' ? value : '/', self.location.origin);
    return url.origin === self.location.origin ? url.href : new URL('/', self.location.origin).href;
  } catch {
    return new URL('/', self.location.origin).href;
  }
}

self.addEventListener('push', (event) => {
  let message = {};
  try {
    message = event.data ? event.data.json() : {};
  } catch {
    message = {};
  }
  const title = typeof message.title === 'string' ? message.title : 'Hana Library';
  const body = typeof message.body === 'string' ? message.body : undefined;
  const tag = typeof message.tag === 'string' ? message.tag : undefined;
  event.waitUntil(self.registration.showNotification(title, {
    body,
    tag,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: safeAppUrl(message.url) },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = safeAppUrl(event.notification.data?.url);
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windows) => {
    const target = new URL(targetUrl);
    const matching = windows.find((client) => {
      const current = new URL(client.url);
      return current.origin === target.origin && current.pathname === target.pathname;
    });
    if (matching) {
      if ('navigate' in matching) await matching.navigate(targetUrl);
      return matching.focus();
    }
    return self.clients.openWindow(targetUrl);
  }));
});

function applicationServerKey(value) {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(fetch('/api/push/config', { credentials: 'same-origin' })
    .then((response) => response.ok ? response.json() : Promise.reject(new Error('config-unavailable')))
    .then((payload) => self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey(payload.data.publicKey),
    }))
    .then((subscription) => fetch('/api/push/subscriptions', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription),
    }))
    .catch(() => undefined));
});
