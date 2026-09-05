import assert from 'node:assert/strict';
import { before, beforeEach, describe, it, mock } from 'node:test';

import JellyfinAPI from '@server/api/jellyfin';
import { MediaType } from '@server/constants/media';
import { MediaServerType } from '@server/constants/server';
import { getRepository } from '@server/datasource';
import { User } from '@server/entity/User';
import { Permission } from '@server/lib/permissions';
import { getSettings } from '@server/lib/settings';
import cacheManager from '@server/lib/cache';
import { checkUser } from '@server/middleware/auth';
import { setupTestDb } from '@server/test/db';
import type { Express } from 'express';
import express from 'express';
import session from 'express-session';
import request from 'supertest';
import authRoutes from './auth';
import mediaRoutes, { JELLYFIN_UNREACHABLE_KEY } from './media';

let app: Express;

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(
    session({
      secret: 'test-secret',
      resave: false,
      saveUninitialized: false,
    })
  );
  app.use(checkUser);
  app.use('/auth', authRoutes);
  app.use('/media', mediaRoutes);
  app.use(
    (
      err: { status?: number; message?: string },
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      res
        .status(err.status ?? 500)
        .json({ status: err.status ?? 500, message: err.message });
    }
  );
  return app;
}

before(async () => {
  app = createApp();
});

setupTestDb();

async function loginAs(email: string) {
  const settings = (await import('@server/lib/settings')).getSettings();
  const priorLocalLogin = settings.main.localLogin;
  settings.main.localLogin = true;

  try {
    const agent = request.agent(app);
    const res = await agent
      .post('/auth/local')
      .send({ email, password: 'test1234' });
    assert.strictEqual(res.status, 200);
    return agent;
  } finally {
    settings.main.localLogin = priorLocalLogin;
  }
}

describe('GET /media/jellyfin-check/:tmdbId', () => {
  beforeEach(() => {
    // The circuit-breaker flag lives in the shared Jellyfin cache — clear it
    // so one test's outage simulation can't leak into the next.
    cacheManager.getCache('jellyfin').data.del(JELLYFIN_UNREACHABLE_KEY);
  });

  it('returns 401 when not authenticated', async () => {
    const res = await request(app).get('/media/jellyfin-check/12345');
    assert.ok(res.status === 401 || res.status === 403);
  });

  it('returns available=false when server type is not Jellyfin', async () => {
    const settings = getSettings();
    const priorType = settings.main.mediaServerType;
    settings.main.mediaServerType = MediaServerType.PLEX;

    try {
      const agent = await loginAs('admin@seerr.dev');
      const res = await agent.get('/media/jellyfin-check/12345?type=movie');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.available, false);
    } finally {
      settings.main.mediaServerType = priorType;
    }
  });

  it('returns available=false when no admin has Jellyfin credentials', async () => {
    const settings = getSettings();
    const priorType = settings.main.mediaServerType;
    settings.main.mediaServerType = MediaServerType.JELLYFIN;

    try {
      const agent = await loginAs('admin@seerr.dev');
      const res = await agent.get('/media/jellyfin-check/12345');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.available, false);
    } finally {
      settings.main.mediaServerType = priorType;
    }
  });

  it('returns available=true when Jellyfin finds the item', async () => {
    const settings = getSettings();
    const priorType = settings.main.mediaServerType;
    settings.main.mediaServerType = MediaServerType.JELLYFIN;

    const userRepo = getRepository(User);
    const admin = await userRepo.findOneOrFail({ where: { id: 1 } });
    const priorToken = admin.jellyfinAuthToken;
    const priorUserId = admin.jellyfinUserId;
    const priorDeviceId = admin.jellyfinDeviceId;
    admin.jellyfinAuthToken = 'test-token';
    admin.jellyfinUserId = 'admin-jf-id';
    admin.jellyfinDeviceId = 'test-device-id';
    await userRepo.save(admin);

    const lookupMock = mock.method(
      JellyfinAPI.prototype as any,
      'lookupByProviderId',
      async () => ({ Id: 'abc-123', Name: 'Test Movie' })
    );

    try {
      const agent = await loginAs('admin@seerr.dev');
      const res = await agent.get('/media/jellyfin-check/54321?type=movie');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.available, true);
      assert.strictEqual(lookupMock.mock.callCount(), 1);
    } finally {
      admin.jellyfinAuthToken = priorToken;
      admin.jellyfinUserId = priorUserId;
      admin.jellyfinDeviceId = priorDeviceId;
      await userRepo.save(admin);
      lookupMock.mock.restore();
      settings.main.mediaServerType = priorType;
    }
  });

  it('returns available=false when Jellyfin does not find the item', async () => {
    const settings = getSettings();
    const priorType = settings.main.mediaServerType;
    settings.main.mediaServerType = MediaServerType.JELLYFIN;

    const userRepo = getRepository(User);
    const admin = await userRepo.findOneOrFail({ where: { id: 1 } });
    const priorToken = admin.jellyfinAuthToken;
    const priorUserId = admin.jellyfinUserId;
    const priorDeviceId = admin.jellyfinDeviceId;
    admin.jellyfinAuthToken = 'test-token';
    admin.jellyfinUserId = 'admin-jf-id';
    admin.jellyfinDeviceId = 'test-device-id';
    await userRepo.save(admin);

    const lookupMock = mock.method(
      JellyfinAPI.prototype as any,
      'lookupByProviderId',
      async () => null
    );

    try {
      const agent = await loginAs('admin@seerr.dev');
      const res = await agent.get('/media/jellyfin-check/54321');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.available, false);
      assert.strictEqual(lookupMock.mock.callCount(), 1);
    } finally {
      admin.jellyfinAuthToken = priorToken;
      admin.jellyfinUserId = priorUserId;
      admin.jellyfinDeviceId = priorDeviceId;
      await userRepo.save(admin);
      lookupMock.mock.restore();
      settings.main.mediaServerType = priorType;
    }
  });

  it('returns available=false on Jellyfin API error (graceful)', async () => {
    const settings = getSettings();
    const priorType = settings.main.mediaServerType;
    settings.main.mediaServerType = MediaServerType.JELLYFIN;

    const userRepo = getRepository(User);
    const admin = await userRepo.findOneOrFail({ where: { id: 1 } });
    const priorToken = admin.jellyfinAuthToken;
    const priorUserId = admin.jellyfinUserId;
    const priorDeviceId = admin.jellyfinDeviceId;
    admin.jellyfinAuthToken = 'test-token';
    admin.jellyfinUserId = 'admin-jf-id';
    admin.jellyfinDeviceId = 'test-device-id';
    await userRepo.save(admin);

    const lookupMock = mock.method(
      JellyfinAPI.prototype as any,
      'lookupByProviderId',
      async () => {
        throw new Error('Connection refused');
      }
    );

    try {
      const agent = await loginAs('admin@seerr.dev');
      const res = await agent.get('/media/jellyfin-check/54321');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.available, false);
    } finally {
      admin.jellyfinAuthToken = priorToken;
      admin.jellyfinUserId = priorUserId;
      admin.jellyfinDeviceId = priorDeviceId;
      await userRepo.save(admin);
      lookupMock.mock.restore();
      settings.main.mediaServerType = priorType;
    }
  });

  it('forwards type query parameter to lookupByProviderId', async () => {    const settings = getSettings();
    const priorType = settings.main.mediaServerType;
    settings.main.mediaServerType = MediaServerType.JELLYFIN;

    const userRepo = getRepository(User);
    const admin = await userRepo.findOneOrFail({ where: { id: 1 } });
    const priorToken = admin.jellyfinAuthToken;
    const priorUserId = admin.jellyfinUserId;
    const priorDeviceId = admin.jellyfinDeviceId;
    admin.jellyfinAuthToken = 'test-token';
    admin.jellyfinUserId = 'admin-jf-id';
    admin.jellyfinDeviceId = 'test-device-id';
    await userRepo.save(admin);

    const lookupMock = mock.method(
      JellyfinAPI.prototype as any,
      'lookupByProviderId',
      async () => null
    );

    try {
      const agent = await loginAs('admin@seerr.dev');
      const res = await agent.get('/media/jellyfin-check/99999?type=tv');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.available, false);
      assert.strictEqual(lookupMock.mock.callCount(), 1);
      const callArgs = lookupMock.mock.calls[0]!;
      assert.strictEqual((callArgs.arguments[2] as any), 'Series');
    } finally {
      admin.jellyfinAuthToken = priorToken;
      admin.jellyfinUserId = priorUserId;
      admin.jellyfinDeviceId = priorDeviceId;
      await userRepo.save(admin);
      lookupMock.mock.restore();
      settings.main.mediaServerType = priorType;
    }
  });

  it('short-circuits subsequent checks after a failure (circuit breaker)', async () => {
    const settings = getSettings();
    const priorType = settings.main.mediaServerType;
    settings.main.mediaServerType = MediaServerType.JELLYFIN;

    const userRepo = getRepository(User);
    const admin = await userRepo.findOneOrFail({ where: { id: 1 } });
    const priorToken = admin.jellyfinAuthToken;
    const priorUserId = admin.jellyfinUserId;
    const priorDeviceId = admin.jellyfinDeviceId;
    admin.jellyfinAuthToken = 'test-token';
    admin.jellyfinUserId = 'admin-jf-id';
    admin.jellyfinDeviceId = 'test-device-id';
    await userRepo.save(admin);

    const lookupMock = mock.method(
      JellyfinAPI.prototype as any,
      'lookupByProviderId',
      async () => {
        throw new Error('timeout of 10000ms exceeded');
      }
    );

    try {
      const agent = await loginAs('admin@seerr.dev');

      const first = await agent.get('/media/jellyfin-check/11111?type=movie');
      assert.strictEqual(first.status, 200);
      assert.strictEqual(first.body.available, false);
      assert.strictEqual(lookupMock.mock.callCount(), 1);

      // A different tmdbId must not trigger another network attempt while
      // the breaker is open — this is the per-card pile-up from the issue.
      const started = Date.now();
      const second = await agent.get('/media/jellyfin-check/22222?type=movie');
      const elapsed = Date.now() - started;
      assert.strictEqual(second.status, 200);
      assert.strictEqual(second.body.available, false);
      assert.strictEqual(lookupMock.mock.callCount(), 1);
      assert.ok(
        elapsed < 5000,
        `expected immediate short-circuit, took ${elapsed}ms`
      );
    } finally {
      admin.jellyfinAuthToken = priorToken;
      admin.jellyfinUserId = priorUserId;
      admin.jellyfinDeviceId = priorDeviceId;
      await userRepo.save(admin);
      lookupMock.mock.restore();
      settings.main.mediaServerType = priorType;
      cacheManager.getCache('jellyfin').data.del(JELLYFIN_UNREACHABLE_KEY);
    }
  });

  it('clears the breaker after a successful check (recovery)', async () => {
    const settings = getSettings();
    const priorType = settings.main.mediaServerType;
    settings.main.mediaServerType = MediaServerType.JELLYFIN;

    const userRepo = getRepository(User);
    const admin = await userRepo.findOneOrFail({ where: { id: 1 } });
    const priorToken = admin.jellyfinAuthToken;
    const priorUserId = admin.jellyfinUserId;
    const priorDeviceId = admin.jellyfinDeviceId;
    admin.jellyfinAuthToken = 'test-token';
    admin.jellyfinUserId = 'admin-jf-id';
    admin.jellyfinDeviceId = 'test-device-id';
    await userRepo.save(admin);

    const failingLookup = mock.method(
      JellyfinAPI.prototype as any,
      'lookupByProviderId',
      async () => {
        throw new Error('timeout of 10000ms exceeded');
      }
    );

    try {
      const agent = await loginAs('admin@seerr.dev');

      const failed = await agent.get('/media/jellyfin-check/11111');
      assert.strictEqual(failed.status, 200);
      assert.strictEqual(failed.body.available, false);
      assert.strictEqual(failingLookup.mock.callCount(), 1);
      assert.ok(
        cacheManager.getCache('jellyfin').data.get(JELLYFIN_UNREACHABLE_KEY),
        'breaker flag should be set after a failure'
      );
      failingLookup.mock.restore();

      // Simulate the cooldown lapsing, then the server recovering: the next
      // check must go through again (not keep short-circuiting) and a
      // success must leave the flag cleared.
      cacheManager.getCache('jellyfin').data.del(JELLYFIN_UNREACHABLE_KEY);
      const succeedingLookup = mock.method(
        JellyfinAPI.prototype as any,
        'lookupByProviderId',
        async () => ({ Id: 'recovered', Name: 'Recovered Movie' })
      );
      try {
        const recovered = await agent.get('/media/jellyfin-check/11111');
        assert.strictEqual(recovered.status, 200);
        assert.strictEqual(recovered.body.available, true);
        assert.strictEqual(succeedingLookup.mock.callCount(), 1);
        assert.strictEqual(
          cacheManager
            .getCache('jellyfin')
            .data.get(JELLYFIN_UNREACHABLE_KEY),
          undefined
        );
      } finally {
        succeedingLookup.mock.restore();
      }
    } finally {
      admin.jellyfinAuthToken = priorToken;
      admin.jellyfinUserId = priorUserId;
      admin.jellyfinDeviceId = priorDeviceId;
      await userRepo.save(admin);
      settings.main.mediaServerType = priorType;
      cacheManager.getCache('jellyfin').data.del(JELLYFIN_UNREACHABLE_KEY);
    }
  });
});
