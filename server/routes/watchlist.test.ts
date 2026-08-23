import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

import { getRepository } from '@server/datasource';
import { User } from '@server/entity/User';
import {
  Watchlist,
  WatchlistStatus,
} from '@server/entity/Watchlist';
import { MediaType } from '@server/constants/media';
import { getSettings } from '@server/lib/settings';
import { checkUser } from '@server/middleware/auth';
import { setupTestDb } from '@server/test/db';
import type { Express } from 'express';
import express from 'express';
import session from 'express-session';
import request from 'supertest';
import authRoutes from './auth';
import watchlistRoutes from './watchlist';

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
  app.use('/api/v1/watchlist', watchlistRoutes);
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

setupTestDb();

async function loginAs(email: string, password: string) {
  const settings = getSettings();
  const priorLocalLogin = settings.main.localLogin;
  settings.main.localLogin = true;

  try {
    const agent = request.agent(app);
    const res = await agent.post('/auth/local').send({ email, password });
    assert.strictEqual(res.status, 200);
    return agent;
  } finally {
    settings.main.localLogin = priorLocalLogin;
  }
}

describe('Watchlist routes (entity-level)', () => {
  it('should create and retrieve a watchlist item', async () => {
    const userRepo = getRepository(User);
    const wlRepo = getRepository(Watchlist);

    const user = await userRepo.findOneByOrFail({ email: 'admin@seerr.dev' });

    const wl = await wlRepo.save(
      new Watchlist({
        tmdbId: 50001,
        mediaType: MediaType.MOVIE,
        title: 'Route Test Movie',
        requestedBy: user,
      } as never)
    );

    assert.ok(wl.id);
    assert.equal(wl.status, WatchlistStatus.WANT_TO_WATCH);

    const found = await wlRepo.findOneBy({ id: wl.id });
    assert.ok(found);
    assert.equal(found.tmdbId, 50001);
  });

  it('should update status via PATCH logic', async () => {
    const userRepo = getRepository(User);
    const wlRepo = getRepository(Watchlist);

    const user = await userRepo.findOneByOrFail({ email: 'admin@seerr.dev' });

    const wl = await wlRepo.save(
      new Watchlist({
        tmdbId: 50002,
        mediaType: MediaType.TV,
        title: 'Route Test TV',
        requestedBy: user,
      } as never)
    );

    // Simulate PATCH: change status
    wl.status = WatchlistStatus.WATCHING;
    const saved = await wlRepo.save(wl);

    const found = await wlRepo.findOneBy({ id: saved.id });
    assert.equal(found?.status, WatchlistStatus.WATCHING);
  });

  it('should list watchlist items for a user', async () => {
    const userRepo = getRepository(User);
    const wlRepo = getRepository(Watchlist);

    const user = await userRepo.findOneByOrFail({ email: 'admin@seerr.dev' });

    await wlRepo.save(
      new Watchlist({
        tmdbId: 50003,
        mediaType: MediaType.MOVIE,
        title: 'List Test Movie',
        requestedBy: user,
      } as never)
    );

    const items = await wlRepo.find({
      where: { requestedBy: { id: user.id } },
    });

    assert.ok(items.length >= 1);
    assert.ok(items.some((i) => i.tmdbId === 50003));
  });

  it('should filter watchlist by status', async () => {
    const userRepo = getRepository(User);
    const wlRepo = getRepository(Watchlist);

    const user = await userRepo.findOneByOrFail({ email: 'admin@seerr.dev' });

    await wlRepo.save(
      new Watchlist({
        tmdbId: 50004,
        mediaType: MediaType.MOVIE,
        title: 'Status Filter Movie',
        requestedBy: user,
        status: WatchlistStatus.WATCHED,
      } as never)
    );

    const watched = await wlRepo.find({
      where: {
        requestedBy: { id: user.id },
        status: WatchlistStatus.WATCHED,
      },
    });

    assert.ok(watched.some((i) => i.tmdbId === 50004));
  });

  it('should not return other users watchlist items', async () => {
    const userRepo = getRepository(User);
    const wlRepo = getRepository(Watchlist);

    const admin = await userRepo.findOneByOrFail({
      email: 'admin@seerr.dev',
    });
    const friend = await userRepo.findOneByOrFail({
      email: 'friend@seerr.dev',
    });

    await wlRepo.save(
      new Watchlist({
        tmdbId: 50005,
        mediaType: MediaType.MOVIE,
        title: 'Admin Only Movie',
        requestedBy: admin,
      } as never)
    );

    const friendItems = await wlRepo.find({
      where: { requestedBy: { id: friend.id } },
    });

    assert.ok(!friendItems.some((i) => i.tmdbId === 50005));
  });
});

describe('Watchlist routes (HTTP-level)', () => {
  const wlRepo = getRepository(Watchlist);

  before(async () => {
    app = createApp();
  });

  async function seedWatchlistItem(
    admin: User,
    tmdbId: number,
    status = WatchlistStatus.WANT_TO_WATCH
  ) {
    return wlRepo.save(
      new Watchlist({
        tmdbId,
        mediaType: MediaType.MOVIE,
        title: `Seed Movie ${tmdbId}`,
        requestedBy: admin,
        status,
      } as never)
    );
  }

  it('should prevent user B from patching user A\'s watchlist item', async () => {
    const userRepo = getRepository(User);
    const admin = await userRepo.findOneByOrFail({ email: 'admin@seerr.dev' });
    const friend = await userRepo.findOneByOrFail({ email: 'friend@seerr.dev' });

    // Seed a watchlist item owned by admin
    const wl = await seedWatchlistItem(admin, 99001);
    const itemId = wl.id;

    // Login as friend and try to patch admin's item
    const friendAgent = await loginAs('friend@seerr.dev', 'test1234');
    const patchRes = await friendAgent
      .patch(`/api/v1/watchlist/${itemId}`)
      .send({ status: 'watching' });
    assert.strictEqual(patchRes.status, 403);

    // Item status should be unchanged
    const item = await wlRepo.findOneBy({ id: itemId });
    assert.ok(item);
    assert.equal(item.status, WatchlistStatus.WANT_TO_WATCH);
  });

  it('should allow a user to patch their own watchlist item', async () => {
    const userRepo = getRepository(User);
    const admin = await userRepo.findOneByOrFail({ email: 'admin@seerr.dev' });

    // Seed a watchlist item owned by admin
    const wl = await seedWatchlistItem(admin, 99002);
    const itemId = wl.id;

    // Login as admin and patch own item
    const adminAgent = await loginAs('admin@seerr.dev', 'test1234');
    const patchRes = await adminAgent
      .patch(`/api/v1/watchlist/${itemId}`)
      .send({ status: 'watching' });
    assert.strictEqual(patchRes.status, 200);

    const item = await wlRepo.findOneBy({ id: itemId });
    assert.equal(item?.status, WatchlistStatus.WATCHING);
  });

  it('should delete only MAL-imported watchlist items for the authenticated user', async () => {
    const userRepo = getRepository(User);
    const admin = await userRepo.findOneByOrFail({ email: 'admin@seerr.dev' });

    // Seed: MAL-imported items
    await wlRepo.save(
      new Watchlist({
        tmdbId: 98001,
        mediaType: MediaType.ANIME,
        title: 'MAL Anime 1',
        requestedBy: admin,
        externalSource: 'mal',
        externalId: '12345',
      } as never)
    );
    await wlRepo.save(
      new Watchlist({
        tmdbId: 98002,
        mediaType: MediaType.ANIME,
        title: 'MAL Anime 2',
        requestedBy: admin,
        externalSource: 'mal',
        externalId: '12346',
      } as never)
    );

    // Seed: manually-added item (no externalSource)
    await seedWatchlistItem(admin, 98003);

    const adminAgent = await loginAs('admin@seerr.dev', 'test1234');
    const res = await adminAgent.delete('/api/v1/watchlist/mal-import');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.deleted, 2);

    // MAL items gone
    const malItems = await wlRepo.find({
      where: { requestedBy: { id: admin.id }, externalSource: 'mal' },
    });
    assert.strictEqual(malItems.length, 0);

    // Manual item still exists
    const manualItem = await wlRepo.findOneBy({
      tmdbId: 98003,
      requestedBy: { id: admin.id },
    });
    assert.ok(manualItem);
  });

  it('should not affect another user\'s MAL-imported items (cross-user isolation)', async () => {
    const userRepo = getRepository(User);
    const admin = await userRepo.findOneByOrFail({ email: 'admin@seerr.dev' });
    const friend = await userRepo.findOneByOrFail({
      email: 'friend@seerr.dev',
    });

    // Seed: friend's MAL-imported item
    await wlRepo.save(
      new Watchlist({
        tmdbId: 98010,
        mediaType: MediaType.ANIME,
        title: 'Friend MAL Anime',
        requestedBy: friend,
        externalSource: 'mal',
        externalId: '99999',
      } as never)
    );

    // Seed: admin's MAL-imported item
    await wlRepo.save(
      new Watchlist({
        tmdbId: 98011,
        mediaType: MediaType.ANIME,
        title: 'Admin MAL Anime',
        requestedBy: admin,
        externalSource: 'mal',
        externalId: '88888',
      } as never)
    );

    // Admin deletes their MAL items
    const adminAgent = await loginAs('admin@seerr.dev', 'test1234');
    const res = await adminAgent.delete('/api/v1/watchlist/mal-import');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.deleted, 1);

    // Friend's item untouched
    const friendItem = await wlRepo.findOneBy({
      tmdbId: 98010,
      requestedBy: { id: friend.id },
    });
    assert.ok(friendItem);
  });

  it('should return 200 with deleted: 0 when user has no MAL-imported items', async () => {
    const adminAgent = await loginAs('admin@seerr.dev', 'test1234');
    const res = await adminAgent.delete('/api/v1/watchlist/mal-import');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.deleted, 0);
  });

  it('should return 401 when not authenticated', async () => {
    const res = await request(app).delete('/api/v1/watchlist/mal-import');
    assert.strictEqual(res.status, 401);
  });
});
