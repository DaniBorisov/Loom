import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { join } from 'node:path';

const SW_PATH = join(__dirname, '../../public/sw.js');

const readSw = async (): Promise<string> => readFile(SW_PATH, 'utf8');

describe('public/sw.js PWA offline caching contract (Epic 6 / DAN-40)', () => {
  let sw: string;

  it.before(async () => {
    sw = await readSw();
  });

  it('loads Workbox runtime via importScripts', () => {
    assert.match(
      sw,
      /importScripts\(\s*['"]https:\/\/storage\.googleapis\.com\/workbox-cdn/
    );
  });

  it('defines the app-shell and pages cache names', () => {
    assert.match(sw, /'app-shell'/);
    assert.match(sw, /'pages'/);
  });

  it('registers an API network-only route for /api/ paths', () => {
    assert.match(sw, /url\.pathname\.startsWith\('\/api\/'\)/);
    assert.match(sw, /new NetworkOnly\(\)/);
  });

  it('keeps API requests from being captured by the cache-first static route', () => {
    // Regression guard for the route-ordering rule: the API route must be
    // registered BEFORE the broad same-origin cache-first handler, otherwise
    // API fetches would be served stale from the app-shell cache.
    const apiIndex = sw.indexOf('startsWith(\'/api/\')');
    const cacheFirstIndex = sw.indexOf('new CacheFirst({');
    assert.ok(apiIndex !== -1, 'API route should exist');
    assert.ok(cacheFirstIndex !== -1, 'CacheFirst route should exist');
    assert.ok(
      apiIndex < cacheFirstIndex,
      'API network-only route should be registered before the cache-first static route'
    );
  });

  it('serves navigations network-first (never stale by default)', () => {
    assert.match(sw, /request\.mode === 'navigate'/);
    assert.match(sw, /new NetworkFirst\(/);
  });

  it('provides an offline fallback page', () => {
    assert.match(sw, /workbox\.recipes\.offlineFallback/);
    assert.match(sw, /pageFallback: '\/offline\.html'/);
  });

  it('preserves the push/notification handler for Epic 7 extension', () => {
    assert.match(sw, /self\.addEventListener\('push'/);
    assert.match(sw, /self\.addEventListener\(\s*'notificationclick'/);
    assert.match(sw, /showNotification/);
  });
});
