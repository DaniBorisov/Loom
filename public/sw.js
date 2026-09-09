/* eslint-disable no-undef */
// Hand-rolled Workbox setup (no next-pwa build step). Loads Workbox's runtime
// modules from the official Google-hosted CDN. The browser caches the imported
// script after the first (online) visit, so the service worker keeps working
// while offline afterward.
importScripts(
  'https://storage.googleapis.com/workbox-cdn/releases/7.4.1/workbox-sw.js'
);

const { registerRoute } = workbox.routing;
const { CacheFirst, NetworkFirst, NetworkOnly, StaleWhileRevalidate } =
  workbox.strategies;

// Versioned shell cache. Bump this whenever an UNHASHED public/ asset
// changes content at the same URL (logos, splash screens, icons): the
// activate handler below purges every other cache, so stale entries can
// never survive a service-worker update. (Hashed Next.js build assets are
// immutable and safe under any name; the version exists for the unhashed
// files sharing this cache.)
const APP_SHELL_CACHE = 'app-shell-v2';
const PAGES_CACHE = 'pages';

// App shell: hashed Next.js build assets (JS/CSS) are immutable, so serve them
// stale-while-revalidate after the first visit (fast reads, background refresh).
// Fonts are cached the same way.
registerRoute(
  ({ request }) =>
    request.destination === 'script' ||
    request.destination === 'style' ||
    request.destination === 'font' ||
    request.destination === 'worker',
  new StaleWhileRevalidate({
    cacheName: APP_SHELL_CACHE,
  })
);

// API responses must NOT be cached offline-first: stale watchlist/request data
// would be actively misleading. Registered BEFORE the same-origin static route
// below so API fetches are never captured by the cache-first handler.
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/'),
  new NetworkOnly()
);

// Other same-origin static assets (e.g. images) cached cache-first so the shell
// doesn't blank out offline. Images are non-essential, so this is best-effort.
// Explicitly excludes navigations (handled network-first below) so pages are
// never served stale from cache.
registerRoute(
  ({ request, url }) =>
    request.destination !== 'document' && url.origin === self.location.origin,
  new CacheFirst({
    cacheName: APP_SHELL_CACHE,
  })
);

// Navigations: network-first so users get the latest shell, with the offline
// page as a graceful fallback when the network is unavailable.
registerRoute(
  ({ request }) => request.mode === 'navigate',
  new NetworkFirst({
    cacheName: PAGES_CACHE,
    networkTimeoutSeconds: 3,
  })
);

// Offline fallback page, served instead of a navigation only when both the
// network and the navigation cache miss. offlineFallback() only serves pages
// from Workbox's PRECACHE — merely referencing the URL does not store it
// (DAN-95), so precache it here, otherwise the fallback handler finds
// nothing and the browser shows its native retry UI instead of our page.
// `revision` is the sha256 of offline.html at the time of writing;
// recompute and bump it whenever offline.html changes, or the updated page
// will never be picked up. Keep offline.html fully self-contained (inline
// CSS, no external assets) so nothing else needs precaching.
workbox.precaching.precacheAndRoute([
  {
    url: '/offline.html',
    revision:
      '2fca32dcb4451982ceccf4a72cdc2be1274892dd384a665d561f952384c8de62',
  },
]);

workbox.recipes.offlineFallback({
  pageFallback: '/offline.html',
});

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      if ('navigationPreload' in self.registration) {
        await self.registration.navigationPreload.enable();
      }
      await self.clients.claim();
      // Drop caches from previous versions (see APP_SHELL_CACHE above) so
      // stale unhashed assets are purged on every worker update.
      const keep = new Set([APP_SHELL_CACHE, PAGES_CACHE]);
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => !keep.has(key)).map((key) => caches.delete(key))
      );
    })()
  );
});

// ---------------------------------------------------------------------------
// Notifications (push / notificationclick). Epic 7 extends the messages handled
// here, so keep this section isolated and easy to extend.
// ---------------------------------------------------------------------------
self.addEventListener('push', (event) => {
  const payload = event.data ? event.data.json() : {};

  const options = {
    body: payload.message,
    // Stable tag per item so repeat pushes (e.g. daily polls) replace the
    // previous card instead of stacking (DAN-49).
    tag:
      payload.notificationType && payload.actionUrl
        ? `${payload.notificationType}:${payload.actionUrl}`
        : undefined,
    badge: 'badge-128x128.png',
    icon: payload.image ? payload.image : 'android-chrome-192x192.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: '2',
      actionUrl: payload.actionUrl,
      requestId: payload.requestId,
    },
    actions: [],
  };

  if (payload.actionUrl) {
    options.actions.push({
      action: 'view',
      title: payload.actionUrlTitle ?? 'View',
    });
  }

  if (payload.notificationType === 'MEDIA_PENDING') {
    options.actions.push(
      {
        action: 'approve',
        title: 'Approve',
      },
      {
        action: 'decline',
        title: 'Decline',
      }
    );
  }

  if (
    (payload.notificationType === 'MEDIA_APPROVED' ||
      payload.notificationType === 'MEDIA_DECLINED') &&
    payload.isAdmin
  ) {
    if ('setAppBadge' in navigator) {
      navigator.setAppBadge(payload.pendingRequestsCount);
    }
    return;
  }

  if (payload.notificationType === 'MEDIA_PENDING') {
    if ('setAppBadge' in navigator) {
      navigator.setAppBadge(payload.pendingRequestsCount);
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.subject ?? 'Loom', options)
  );
});

self.addEventListener(
  'notificationclick',
  (event) => {
    const notificationData = event.notification.data || {};

    event.notification.close();

    // Await everything: an unterminated worker kills the navigation/fetch.
    event.waitUntil(
      (async () => {
        if (event.action === 'approve') {
          await fetch(`/api/v1/request/${notificationData.requestId}/approve`, {
            method: 'POST',
          });
        } else if (event.action === 'decline') {
          await fetch(`/api/v1/request/${notificationData.requestId}/decline`, {
            method: 'POST',
          });
        }

        if (notificationData.actionUrl) {
          // Focus the already-open app window on this item when there is
          // one; only open a fresh window otherwise (DAN-49).
          const allClients = await clients.matchAll({
            type: 'window',
            includeUncontrolled: true,
          });
          const matching = allClients.find((client) => {
            try {
              return new URL(client.url).pathname === notificationData.actionUrl;
            } catch {
              return false;
            }
          });
          if (matching && typeof matching.focus === 'function') {
            await matching.focus();
          } else {
            await clients.openWindow(notificationData.actionUrl);
          }
        }
      })()
    );
  },
  false
);
