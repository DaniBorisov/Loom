import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { join } from 'node:path';
import vm from 'node:vm';

const SW_PATH = join(__dirname, '../../public/sw.js');

interface ShowNotificationCall {
  title: string;
  options: {
    body?: string;
    tag?: string;
    actions: { action: string; title: string }[];
    data: { actionUrl?: string; requestId?: number };
  };
}

interface Harness {
  listeners: Record<string, (event: Record<string, unknown>) => unknown>;
  notifications: ShowNotificationCall[];
  openedWindows: string[];
  focusedClients: string[];
  fetched: { url: string; init?: { method?: string } }[];
  openClients: { url: string }[];
  existingCaches: string[];
  deletedCaches: string[];
}

async function loadWorker(openClients: { url: string }[] = []): Promise<Harness> {
  const harness: Harness = {
    listeners: {},
    notifications: [],
    openedWindows: [],
    focusedClients: [],
    fetched: [],
    openClients,
    existingCaches: ['app-shell', 'pages', 'app-shell-v2'],
    deletedCaches: [],
  };

  const sandbox = {
    importScripts: () => {},
    workbox: {
      routing: { registerRoute: () => {} },
      strategies: {
        CacheFirst: class {},
        NetworkFirst: class {},
        NetworkOnly: class {},
        StaleWhileRevalidate: class {},
      },
      precaching: { precacheAndRoute: () => {} },
      recipes: { offlineFallback: () => {} },
    },
    self: {
      addEventListener: (
        type: string,
        fn: (event: Record<string, unknown>) => unknown
      ) => {
        harness.listeners[type] = fn;
      },
      skipWaiting: () => {},
      clients: { claim: async () => {} },
      registration: {
        showNotification: (title: string, options: never) => {
          // Clone across the vm realm boundary so deepStrictEqual sees
          // plain host-realm objects instead of foreign prototypes.
          harness.notifications.push(
            JSON.parse(
              JSON.stringify({
                title,
                options: options as ShowNotificationCall['options'],
              })
            )
          );
        },
      },
      location: { origin: 'http://localhost:5055' },
    },
    clients: {
      matchAll: async () =>
        harness.openClients.map((client) => ({
          url: client.url,
          focus: async () => {
            harness.focusedClients.push(client.url);
          },
        })),
      openWindow: async (url: string) => {
        harness.openedWindows.push(url);
      },
    },
    navigator: {},
    fetch: async (url: string, init?: { method?: string }) => {
      harness.fetched.push({ url, init });
      return { ok: true };
    },
    caches: {
      keys: async () => [...harness.existingCaches],
      delete: async (key: string) => {
        harness.deletedCaches.push(key);
        return true;
      },
    },
    URL,
    Date,
  };

  vm.createContext(sandbox);
  vm.runInContext(await readFile(SW_PATH, 'utf8'), sandbox, {
    filename: 'sw.js',
  });
  return harness;
}

async function dispatch(
  harness: Harness,
  type: string,
  event: Record<string, unknown>
): Promise<void> {
  const waited: Promise<unknown>[] = [];
  await harness.listeners[type]({
    ...event,
    waitUntil: (promise: Promise<unknown>) => {
      waited.push(Promise.resolve(promise));
    },
  });
  await Promise.all(waited);
}

const availabilityPayload = {
  notificationType: 'MEDIA_AVAILABLE',
  subject: 'Bleach',
  message: 'Bleach is now available in your library.',
  actionUrl: '/tv/30984',
  actionUrlTitle: 'View',
};

describe('public/sw.js push handling (DAN-49)', () => {
  it('parses the payload and shows the notification with item details', async () => {
    const harness = await loadWorker();
    await dispatch(harness, 'push', {
      data: { json: () => availabilityPayload },
    });

    assert.strictEqual(harness.notifications.length, 1);
    const [call] = harness.notifications;
    assert.strictEqual(call.title, 'Bleach');
    assert.strictEqual(
      call.options.body,
      'Bleach is now available in your library.'
    );
    assert.strictEqual(call.options.tag, 'MEDIA_AVAILABLE:/tv/30984');
    assert.strictEqual(call.options.data.actionUrl, '/tv/30984');
    assert.deepStrictEqual(call.options.actions, [
      { action: 'view', title: 'View' },
    ]);
  });

  it('falls back to a generic title for empty payloads', async () => {
    const harness = await loadWorker();
    await dispatch(harness, 'push', { data: null });

    assert.strictEqual(harness.notifications.length, 1);
    assert.strictEqual(harness.notifications[0].title, 'Seerr');
  });

  it('focuses the open app window instead of opening a new one', async () => {
    const harness = await loadWorker([
      { url: 'http://localhost:5055/tv/30984' },
    ]);
    await dispatch(harness, 'notificationclick', {
      action: '',
      notification: {
        data: { actionUrl: '/tv/30984' },
        close: () => {},
      },
    });

    assert.deepStrictEqual(harness.focusedClients, [
      'http://localhost:5055/tv/30984',
    ]);
    assert.strictEqual(harness.openedWindows.length, 0);
  });

  it('opens a new window when the app is not already open there', async () => {
    const harness = await loadWorker([{ url: 'http://localhost:5055/' }]);
    await dispatch(harness, 'notificationclick', {
      action: '',
      notification: {
        data: { actionUrl: '/tv/30984' },
        close: () => {},
      },
    });

    assert.deepStrictEqual(harness.openedWindows, ['/tv/30984']);
    assert.strictEqual(harness.focusedClients.length, 0);
  });

  it('sends approve/decline actions to the request API', async () => {
    const harness = await loadWorker();
    await dispatch(harness, 'notificationclick', {
      action: 'approve',
      notification: {
        data: { actionUrl: '/tv/30984', requestId: 42 },
        close: () => {},
      },
    });

    assert.ok(
      harness.fetched.some(
        (call) =>
          call.url === '/api/v1/request/42/approve' &&
          call.init?.method === 'POST'
      )
    );
  });

  it('purges previous-version caches on activate, keeping current ones', async () => {
    const harness = await loadWorker();
    await dispatch(harness, 'activate', {});

    assert.deepStrictEqual(harness.deletedCaches, ['app-shell']);
  });
});
