import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// 1x1 transparent PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

const SIX_MONTHS = 15552000;
const ONE_YEAR = 31536000;

let upstream: ReturnType<typeof createServer>;
let upstreamUrl = '';
let configDir = '';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ImageProxy: any;
let MAX_TMDB_IMAGE_TTL_SECONDS = 0;

before(async () => {
  configDir = mkdtempSync(join(tmpdir(), 'dan70-image-cache-'));
  process.env.CONFIG_DIRECTORY = configDir;

  upstream = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const cc = url.searchParams.get('cc');
    const headers: Record<string, string> = {
      'content-type': 'image/png',
      etag: 'test-etag',
    };
    if (cc && cc !== 'none') {
      headers['cache-control'] = `public, max-age=${cc}`;
    }
    res.writeHead(200, headers);
    res.end(PNG);
  });
  await new Promise<void>((resolve) => upstream.listen(0, resolve));
  upstreamUrl = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;

  const mod = await import('@server/lib/imageproxy');
  ImageProxy = mod.default;
  MAX_TMDB_IMAGE_TTL_SECONDS = mod.MAX_TMDB_IMAGE_TTL_SECONDS;
});

after(async () => {
  upstream.close();
  rmSync(configDir, { recursive: true, force: true });
});

describe('ImageProxy TMDB TTL cap (DAN-70)', () => {
  it('exposes a 6-month ceiling', () => {
    assert.strictEqual(MAX_TMDB_IMAGE_TTL_SECONDS, SIX_MONTHS);
  });

  it('clamps upstream max-age beyond 6 months', async () => {
    const proxy = new ImageProxy('dan70-capped', upstreamUrl, {
      maxTtlSeconds: MAX_TMDB_IMAGE_TTL_SECONDS,
    });
    const before = Date.now();
    const result = await proxy.getImage(`/cap.png?cc=${ONE_YEAR}`);
    assert.ok(result);
    assert.ok(
      result.meta.revalidateAfter - before <= SIX_MONTHS * 1000 + 5000,
      `expected expiry within 6 months, got revalidateAfter=${result.meta.revalidateAfter}`
    );
  });

  it('leaves shorter upstream TTLs untouched', async () => {
    const proxy = new ImageProxy('dan70-short', upstreamUrl, {
      maxTtlSeconds: MAX_TMDB_IMAGE_TTL_SECONDS,
    });
    const before = Date.now();
    const result = await proxy.getImage('/short.png?cc=86400');
    assert.ok(result);
    const ttlSeconds = Math.round(
      (result.meta.revalidateAfter - before) / 1000
    );
    assert.ok(
      ttlSeconds >= 86000 && ttlSeconds <= 87000,
      `expected ~86400s TTL, got ${ttlSeconds}s`
    );
  });

  it('keeps the 1-day default when upstream sends no cache headers', async () => {
    const proxy = new ImageProxy('dan70-default', upstreamUrl, {
      maxTtlSeconds: MAX_TMDB_IMAGE_TTL_SECONDS,
    });
    const before = Date.now();
    const result = await proxy.getImage('/def.png?cc=none');
    assert.ok(result);
    const ttlSeconds = Math.round(
      (result.meta.revalidateAfter - before) / 1000
    );
    assert.ok(
      ttlSeconds >= 86000 && ttlSeconds <= 87000,
      `expected ~86400s TTL, got ${ttlSeconds}s`
    );
  });
});
