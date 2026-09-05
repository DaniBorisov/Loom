import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { join } from 'node:path';

const SW_PATH = join(__dirname, '../../public/sw.js');
const OFFLINE_PATH = join(__dirname, '../../public/offline.html');

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

  it('precaches the offline fallback page so offlineFallback() can serve it', async () => {
    // Regression guard for DAN-95: offlineFallback() only serves pages from
    // Workbox's precache — without precacheAndRoute the handler finds nothing
    // and the browser shows its native retry UI.
    assert.match(sw, /workbox\.precaching\.precacheAndRoute/);
    const entry = sw.match(
      /\{\s*url:\s*'\/offline\.html',\s*revision:\s*'([0-9a-f]+)'/
    );
    assert.ok(entry, 'sw.js should precache /offline.html with a revision');

    const offlineHtml = await readFile(OFFLINE_PATH);
    const digest = createHash('sha256').update(offlineHtml).digest('hex');
    assert.strictEqual(
      entry[1],
      digest,
      'precache revision must match the current offline.html content hash — recompute it when the file changes'
    );
  });

  it('preserves the push/notification handler for Epic 7 extension', () => {
    assert.match(sw, /self\.addEventListener\('push'/);
    assert.match(sw, /self\.addEventListener\(\s*'notificationclick'/);
    assert.match(sw, /showNotification/);
  });
});
