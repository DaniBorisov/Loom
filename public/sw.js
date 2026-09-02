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
    cacheName: 'app-shell',
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
    cacheName: 'app-shell',
  })
);

// Navigations: network-first so users get the latest shell, with the offline
// page as a graceful fallback when the network is unavailable.
registerRoute(
  ({ request }) => request.mode === 'navigate',
  new NetworkFirst({
    cacheName: 'pages',
    networkTimeoutSeconds: 3,
  })
);

// Offline fallback page. This precaches /offline.html and serves it instead of a
// navigation only when both the network and the navigation cache miss, so users
// never get a blank screen while offline.
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

  event.waitUntil(self.registration.showNotification(payload.subject, options));
});

self.addEventListener(
  'notificationclick',
  (event) => {
    const notificationData = event.notification.data;

    event.notification.close();

    if (event.action === 'approve') {
      fetch(`/api/v1/request/${notificationData.requestId}/approve`, {
        method: 'POST',
      });
    } else if (event.action === 'decline') {
      fetch(`/api/v1/request/${notificationData.requestId}/decline`, {
        method: 'POST',
      });
    }

    if (notificationData.actionUrl) {
      clients.openWindow(notificationData.actionUrl);
    }
  },
  false
);
