import assert from 'node:assert/strict';
import { before, beforeEach, describe, it, mock } from 'node:test';

import ExternalAPI from '@server/api/externalapi';
import JellyfinAPI from '@server/api/jellyfin';
import { MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import { MediaRequest } from '@server/entity/MediaRequest';
import { User } from '@server/entity/User';
import { UserPushSubscription } from '@server/entity/UserPushSubscription';
import { WatchedStatus } from '@server/entity/WatchedStatus';
import { NotifyOn, Watchlist, WatchlistStatus } from '@server/entity/Watchlist';
import { syncPlayedItems } from '@server/lib/jellyfinWatchedSync';
import { notifyAvailableInLibrary } from '@server/lib/notifications/availabilityPush';
import { getSettings } from '@server/lib/settings';
import { checkUser } from '@server/middleware/auth';
import authRoutes from '@server/routes/auth';
import favoritesRoutes from '@server/routes/favorites';
import watchlistRoutes from '@server/routes/watchlist';
import { setupTestDb } from '@server/test/db';
import type { Express } from 'express';
import express from 'express';
import session from 'express-session';
import request from 'supertest';

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
  app.use('/api/v1/favorites', favoritesRoutes);
  app.use('/api/v1/watchlist', watchlistRoutes);
  app.use(
    (
      err: { status?: number; message?: string },
      _req: express.Request,
      res: express.Response,
      // Express requires a 4-arg handler; the param is intentionally unused.
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

async function ensureMedia(tmdbId: number) {
  const repo = getRepository(Media);
  let media = await repo.findOne({
    where: { tmdbId, mediaType: MediaType.MOVIE },
  });
  if (!media) {
    media = await repo.save(new Media({ tmdbId, mediaType: MediaType.MOVIE }));
  }
  return media;
}

/**
 * Cross-epic multi-user isolation pass (DAN-51): two accounts,
 * zero cross-user leakage across favorites, watchlist, watched-status,
 * and push fan-out. Complements (not duplicates) the per-area tests in
 * each feature's own suite by asserting the boundaries in one place.
 */
describe('Multi-user isolation (DAN-51)', () => {
  before(async () => {
    app = createApp();
  });

  beforeEach(async () => {
    mock.restoreAll();

    // Watchlist POSTs hit TMDB + Jellyfin behind the route; stub all
    // network seams so the pass stays hermetic.
    mock.method(ExternalAPI.prototype as never, 'get' as never, async () => ({
      id: 60000,
      external_ids: { tvdb_id: null },
    }));
    mock.method(
      JellyfinAPI.prototype as never,
      'lookupByProviderId' as never,
      async () => null
    );
    mock.method(MediaRequest, 'request', async () => ({ id: 1, status: 2 }));
    mock.method(JellyfinAPI.prototype, 'getPlayedItems', async () => []);
    mock.method(JellyfinAPI.prototype, 'getInProgressItems', async () => []);

    const userRepo = getRepository(User);
    const admin = await userRepo.findOneOrFail({ where: { id: 1 } });
    admin.jellyfinAuthToken = 'test-token';
    admin.jellyfinUserId = 'admin-jf-id';
    admin.jellyfinDeviceId = 'test-device-id';
    await userRepo.save(admin);
  });

  it('isolates favorites: check, batch, and delete', async () => {
    const adminAgent = await loginAs('admin@seerr.dev', 'test1234');
    const createRes = await adminAgent
      .post('/api/v1/favorites')
      .send({ mediaId: 60101, mediaType: 'movie', source: 'tmdb' });
    assert.strictEqual(createRes.status, 201);

    const friendAgent = await loginAs('friend@seerr.dev', 'test1234');

    const check = await friendAgent.get(
      '/api/v1/favorites/check?mediaId=60101&source=tmdb'
    );
    assert.strictEqual(check.body.isFavorited, false);

    const batch = await friendAgent
      .post('/api/v1/favorites/check-batch')
      .send({ items: [{ mediaId: 60101, source: 'tmdb' }] });
    assert.strictEqual(batch.body.results['tmdb:60101'].isFavorited, false);

    const del = await friendAgent.delete(
      `/api/v1/favorites/${createRes.body.id}`
    );
    assert.strictEqual(del.status, 403);

    const adminCheck = await adminAgent.get(
      '/api/v1/favorites/check?mediaId=60101&source=tmdb'
    );
    assert.strictEqual(adminCheck.body.isFavorited, true);
  });

  it('isolates watchlist rows: list, patch, and delete', async () => {
    const adminAgent = await loginAs('admin@seerr.dev', 'test1234');
    const created = await adminAgent
      .post('/api/v1/watchlist')
      .send({ tmdbId: 60201, mediaType: 'movie' });
    assert.strictEqual(created.status, 201);

    const friendAgent = await loginAs('friend@seerr.dev', 'test1234');

    const list = await friendAgent.get(
      '/api/v1/watchlist?status=want_to_watch'
    );
    assert.ok(
      (list.body.results as { tmdbId: number }[]).every(
        (item) => item.tmdbId !== 60201
      )
    );

    const patch = await friendAgent
      .patch(`/api/v1/watchlist/${created.body.id}`)
      .send({ status: WatchlistStatus.WATCHING });
    assert.strictEqual(patch.status, 403);

    const del = await friendAgent.delete(
      '/api/v1/watchlist/60201?mediaType=movie'
    );
    assert.strictEqual(del.status, 404);

    const row = await getRepository(Watchlist).findOneBy({
      id: created.body.id,
    });
    assert.strictEqual(row?.status, WatchlistStatus.WANT_TO_WATCH);
  });

  it('never marks another user watched from one users sync', async () => {
    await ensureMedia(60301);
    const wlRepo = getRepository(Watchlist);
    const userRepo = getRepository(User);
    const admin = await userRepo.findOneByOrFail({
      email: 'admin@seerr.dev',
    });
    const friend = await userRepo.findOneByOrFail({
      email: 'friend@seerr.dev',
    });

    for (const user of [admin, friend]) {
      await wlRepo.save(
        new Watchlist({
          tmdbId: 60301,
          mediaType: MediaType.MOVIE,
          title: 'Shared Title',
          status: WatchlistStatus.WANT_TO_WATCH,
          notifyOn: NotifyOn.BOTH,
          requestedBy: user,
        } as never)
      );
    }

    mock.restoreAll();
    mock.method(JellyfinAPI.prototype, 'getPlayedItems', async () => [
      {
        Id: 'jf-shared-1',
        Name: 'Shared Title',
        Type: 'Movie',
        ProviderIds: { Tmdb: '60301' },
      },
    ]);
    mock.method(JellyfinAPI.prototype, 'getInProgressItems', async () => []);

    await syncPlayedItems(admin);

    const adminRow = await wlRepo.findOneBy({
      tmdbId: 60301,
      requestedBy: { id: admin.id },
    });
    assert.strictEqual(adminRow?.status, WatchlistStatus.WATCHED);

    const friendStatuses = await getRepository(WatchedStatus).find({
      where: { userId: friend.id },
    });
    assert.strictEqual(friendStatuses.length, 0);
    const friendRow = await wlRepo.findOneBy({
      tmdbId: 60301,
      requestedBy: { id: friend.id },
    });
    assert.strictEqual(friendRow?.status, WatchlistStatus.WANT_TO_WATCH);
  });

  it('never pushes to the wrong users subscription', async () => {
    const wlRepo = getRepository(Watchlist);
    const userRepo = getRepository(User);
    const admin = await userRepo.findOneByOrFail({
      email: 'admin@seerr.dev',
    });
    const friend = await userRepo.findOneByOrFail({
      email: 'friend@seerr.dev',
    });

    for (const user of [admin, friend]) {
      await wlRepo.save(
        new Watchlist({
          tmdbId: 60401,
          mediaType: MediaType.MOVIE,
          title: 'Push Title',
          status: WatchlistStatus.WANT_TO_WATCH,
          notifyOn: NotifyOn.BOTH,
          requestedBy: user,
        } as never)
      );
      await getRepository(UserPushSubscription).save(
        new UserPushSubscription({
          endpoint: `https://push.example/${user.id === 1 ? 'admin' : 'friend'}-iso`,
          keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
          userAgent: 'test-agent',
          user,
        })
      );
    }

    // Friend opts out: only the admin subscription may fire.
    const friendRow = await wlRepo.findOneByOrFail({
      tmdbId: 60401,
      requestedBy: { id: friend.id },
    });
    friendRow.notifyOn = NotifyOn.NONE;
    await wlRepo.save(friendRow);

    const endpoints: string[] = [];
    const result = await notifyAvailableInLibrary(
      { source: 'radarr', tmdbId: 60401, title: 'Push Title' },
      {
        send: async (subscription) => {
          endpoints.push(subscription.endpoint);
        },
      }
    );

    assert.strictEqual(result.users, 1);
    assert.deepStrictEqual(endpoints, ['https://push.example/admin-iso']);
  });
});
