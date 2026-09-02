import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import { User } from '@server/entity/User';
import { WatchedStatus } from '@server/entity/WatchedStatus';
import { Watchlist, WatchlistStatus } from '@server/entity/Watchlist';
import { setupTestDb } from '@server/test/db';
import type { Express } from 'express';
import express from 'express';
import session from 'express-session';
import request from 'supertest';
import webhookRoutes from './webhook';

const WEBHOOK_SECRET = 'test-webhook-secret';

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
  app.use('/webhook', webhookRoutes);
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

before(() => {
  process.env.JELLYFIN_WEBHOOK_SECRET = WEBHOOK_SECRET;
  app = createApp();
});

after(() => {
  delete process.env.JELLYFIN_WEBHOOK_SECRET;
});

setupTestDb();

async function attachJellyfinUser(email: string, jellyfinUserId: string) {
  const userRepo = getRepository(User);
  const user = await userRepo.findOneOrFail({ where: { email } });
  user.jellyfinUserId = jellyfinUserId;
  await userRepo.save(user);
  return user;
}

async function createMovieEntry(tmdbId: number) {
  const mediaRepository = getRepository(Media);
  let media = await mediaRepository.findOne({
    where: { tmdbId, mediaType: MediaType.MOVIE },
  });
  if (!media) {
    media = new Media({ tmdbId, mediaType: MediaType.MOVIE });
    await mediaRepository.save(media);
  }
  return media;
}

async function createTvEntry(tmdbId: number) {
  const mediaRepository = getRepository(Media);
  let media = await mediaRepository.findOne({
    where: { tmdbId, mediaType: MediaType.TV },
  });
  if (!media) {
    media = new Media({ tmdbId, mediaType: MediaType.TV });
    await mediaRepository.save(media);
  }
  return media;
}

function moviePayload(overrides: Record<string, unknown> = {}) {
  return {
    NotificationType: 'PlaybackStop',
    UserId: 'jf-user-admin',
    ItemId: 'jf-item-1',
    ItemType: 'Movie',
    Name: 'Test Movie',
    PlayedToCompletion: true,
    Played: true,
    ProviderIds: { Tmdb: '12345', Tvdb: '999', Imdb: 'tt123' },
    ...overrides,
  };
}

describe('POST /webhook/jellyfin', () => {
  it('returns 401 when the webhook secret header is missing or invalid', async () => {
    const payload = moviePayload();

    const missingSecret = await request(app)
      .post('/webhook/jellyfin')
      .send(payload);
    assert.strictEqual(missingSecret.status, 401);

    const wrongSecret = await request(app)
      .post('/webhook/jellyfin')
      .set('X-Webhook-Secret', 'wrong-secret')
      .send(payload);
    assert.strictEqual(wrongSecret.status, 401);
  });

  it('ignores notification types other than PlaybackStop', async () => {
    await attachJellyfinUser('admin@seerr.dev', 'jf-user-admin');
    await createMovieEntry(12345);

    const res = await request(app)
      .post('/webhook/jellyfin')
      .set('X-Webhook-Secret', WEBHOOK_SECRET)
      .send(moviePayload({ NotificationType: 'SessionEnded' }));

    assert.strictEqual(res.status, 200);
    const watchedCount = await getRepository(WatchedStatus).count();
    assert.strictEqual(watchedCount, 0);
  });

  it('creates a watching watchlist entry for partial movie playback', async () => {
    await attachJellyfinUser('admin@seerr.dev', 'jf-user-admin');
    const media = await createMovieEntry(12345);

    const res = await request(app)
      .post('/webhook/jellyfin')
      .set('X-Webhook-Secret', WEBHOOK_SECRET)
      .send(
        moviePayload({
          PlayedToCompletion: false,
          Played: false,
          PlaybackPositionTicks: 36000000000, // ~60 min of a 120 min movie
          RunTimeTicks: 72000000000,
        })
      );

    assert.strictEqual(res.status, 200);

    const watchedStatus = await getRepository(WatchedStatus).findOneBy({
      userId: 1,
      jellyfinItemId: 'jf-item-1',
    });
    assert.ok(watchedStatus);
    assert.strictEqual(watchedStatus.progress, 0.5);
    assert.strictEqual(watchedStatus.watchedAt, null);

    const watchlist = await getRepository(Watchlist).findOne({
      where: {
        tmdbId: 12345,
        mediaType: MediaType.MOVIE,
        requestedBy: { id: 1 },
      },
    });
    assert.ok(watchlist);
    assert.strictEqual(watchlist.status, WatchlistStatus.WATCHING);
    assert.strictEqual(watchlist.media.id, media.id);
  });

  it('ignores movie playback below the minimum progress threshold', async () => {
    await attachJellyfinUser('admin@seerr.dev', 'jf-user-admin');
    await createMovieEntry(12345);

    const res = await request(app)
      .post('/webhook/jellyfin')
      .set('X-Webhook-Secret', WEBHOOK_SECRET)
      .send(
        moviePayload({
          PlayedToCompletion: false,
          Played: false,
          PlaybackPositionTicks: 1800000000, // 3 min of a 120 min movie
          RunTimeTicks: 72000000000,
        })
      );

    assert.strictEqual(res.status, 200);
    const watchedCount = await getRepository(WatchedStatus).count();
    assert.strictEqual(watchedCount, 0);
    const watchlistCount = await getRepository(Watchlist).count();
    assert.strictEqual(watchlistCount, 0);
  });

  it('does not downgrade an already-watched movie via partial playback', async () => {
    const admin = await attachJellyfinUser('admin@seerr.dev', 'jf-user-admin');
    const media = await createMovieEntry(12345);

    await getRepository(Watchlist).save(
      new Watchlist({
        tmdbId: 12345,
        mediaType: MediaType.MOVIE,
        title: 'Test Movie',
        requestedBy: admin,
        media,
        status: WatchlistStatus.WATCHED,
      })
    );

    const res = await request(app)
      .post('/webhook/jellyfin')
      .set('X-Webhook-Secret', WEBHOOK_SECRET)
      .send(
        moviePayload({
          PlayedToCompletion: false,
          Played: false,
          PlaybackPositionTicks: 36000000000,
          RunTimeTicks: 72000000000,
        })
      );

    assert.strictEqual(res.status, 200);

    const watchlist = await getRepository(Watchlist).findOneBy({
      tmdbId: 12345,
    });
    assert.strictEqual(watchlist?.status, WatchlistStatus.WATCHED);
  });

  it('moves an in-progress movie to watched once played to completion', async () => {
    const admin = await attachJellyfinUser('admin@seerr.dev', 'jf-user-admin');
    const media = await createMovieEntry(12345);

    await getRepository(Watchlist).save(
      new Watchlist({
        tmdbId: 12345,
        mediaType: MediaType.MOVIE,
        title: 'Test Movie',
        requestedBy: admin,
        media,
        status: WatchlistStatus.WATCHING,
      })
    );

    const res = await request(app)
      .post('/webhook/jellyfin')
      .set('X-Webhook-Secret', WEBHOOK_SECRET)
      .send(moviePayload());

    assert.strictEqual(res.status, 200);

    const watchlist = await getRepository(Watchlist).findOneBy({
      tmdbId: 12345,
    });
    assert.strictEqual(watchlist?.status, WatchlistStatus.WATCHED);

    const watchedStatus = await getRepository(WatchedStatus).findOneBy({
      userId: 1,
      jellyfinItemId: 'jf-item-1',
    });
    assert.ok(watchedStatus);
    assert.ok(watchedStatus.watchedAt, 'completed item should set watchedAt');
    assert.strictEqual(watchedStatus.progress, 1);
  });

  it('does not track partial playback for series', async () => {
    await attachJellyfinUser('admin@seerr.dev', 'jf-user-admin');
    await createTvEntry(12345);

    const res = await request(app)
      .post('/webhook/jellyfin')
      .set('X-Webhook-Secret', WEBHOOK_SECRET)
      .send(
        moviePayload({
          ItemType: 'Series',
          PlayedToCompletion: false,
          Played: false,
          PlaybackPositionTicks: 36000000000,
          RunTimeTicks: 72000000000,
        })
      );

    assert.strictEqual(res.status, 200);
    const watchedCount = await getRepository(WatchedStatus).count();
    assert.strictEqual(watchedCount, 0);
  });

  it('records watched status for a Jellyfin user linked to a local user', async () => {
    await attachJellyfinUser('admin@seerr.dev', 'jf-user-admin');
    const media = await createMovieEntry(12345);

    const res = await request(app)
      .post('/webhook/jellyfin')
      .set('X-Webhook-Secret', WEBHOOK_SECRET)
      .send(moviePayload());

    assert.strictEqual(res.status, 200);
    const watchedStatus = await getRepository(WatchedStatus).findOneBy({
      userId: 1,
      jellyfinItemId: 'jf-item-1',
    });
    assert.ok(watchedStatus);
    assert.strictEqual(watchedStatus.mediaId, media.id);
    assert.ok(watchedStatus.watchedAt);
    assert.strictEqual(watchedStatus.progress, 1);
  });

  it('is idempotent for repeated notifications of the same item', async () => {
    await attachJellyfinUser('admin@seerr.dev', 'jf-user-admin');
    const media = await createMovieEntry(12345);

    const first = await request(app)
      .post('/webhook/jellyfin')
      .set('X-Webhook-Secret', WEBHOOK_SECRET)
      .send(moviePayload());
    const second = await request(app)
      .post('/webhook/jellyfin')
      .set('X-Webhook-Secret', WEBHOOK_SECRET)
      .send(moviePayload());

    assert.strictEqual(first.status, 200);
    assert.strictEqual(second.status, 200);
    const watchedEntries = await getRepository(WatchedStatus).find({
      where: { userId: 1, jellyfinItemId: 'jf-item-1' },
    });
    assert.strictEqual(watchedEntries.length, 1);
    assert.strictEqual(watchedEntries[0]!.mediaId, media.id);
  });

  it('does not record when no local user is linked to the Jellyfin user', async () => {
    await createMovieEntry(12345);

    const res = await request(app)
      .post('/webhook/jellyfin')
      .set('X-Webhook-Secret', WEBHOOK_SECRET)
      .send(moviePayload());

    assert.strictEqual(res.status, 200);
    const watchedCount = await getRepository(WatchedStatus).count();
    assert.strictEqual(watchedCount, 0);
  });

  it('creates a watched watchlist entry when no local media record matches the TMDB id', async () => {
    await attachJellyfinUser('admin@seerr.dev', 'jf-user-admin');

    const res = await request(app)
      .post('/webhook/jellyfin')
      .set('X-Webhook-Secret', WEBHOOK_SECRET)
      .send(moviePayload({ ProviderIds: { Tmdb: '99999' } }));

    assert.strictEqual(res.status, 200);
    const watchedCount = await getRepository(WatchedStatus).count();
    assert.strictEqual(watchedCount, 1);

    const media = await getRepository(Media).findOne({
      where: { tmdbId: 99999, mediaType: MediaType.MOVIE },
    });
    assert.ok(media);

    const watchlist = await getRepository(Watchlist).findOne({
      where: {
        tmdbId: 99999,
        mediaType: MediaType.MOVIE,
        requestedBy: { id: 1 },
      },
    });
    assert.ok(watchlist);
    assert.strictEqual(watchlist.status, WatchlistStatus.WATCHED);
    assert.strictEqual(watchlist.title, 'Test Movie');
  });

  it('updates the matching watchlist entry to watched', async () => {
    const admin = await attachJellyfinUser('admin@seerr.dev', 'jf-user-admin');
    const media = await createMovieEntry(12345);

    const watchlistRepository = getRepository(Watchlist);
    const watchlist = await watchlistRepository.save(
      new Watchlist({
        tmdbId: 12345,
        mediaType: MediaType.MOVIE,
        title: 'Test Movie',
        requestedBy: admin,
        media,
        status: WatchlistStatus.WANT_TO_WATCH,
      })
    );
    assert.strictEqual(watchlist.status, WatchlistStatus.WANT_TO_WATCH);

    const res = await request(app)
      .post('/webhook/jellyfin')
      .set('X-Webhook-Secret', WEBHOOK_SECRET)
      .send(moviePayload());

    assert.strictEqual(res.status, 200);
    const updated = await watchlistRepository.findOneBy({ id: watchlist.id });
    assert.strictEqual(updated?.status, WatchlistStatus.WATCHED);
  });

  it('creates a watched watchlist entry when none exists', async () => {
    const admin = await attachJellyfinUser('admin@seerr.dev', 'jf-user-admin');
    const media = await createMovieEntry(12345);

    const res = await request(app)
      .post('/webhook/jellyfin')
      .set('X-Webhook-Secret', WEBHOOK_SECRET)
      .send(moviePayload());

    assert.strictEqual(res.status, 200);

    const watchlist = await getRepository(Watchlist).findOne({
      where: {
        tmdbId: 12345,
        mediaType: MediaType.MOVIE,
        requestedBy: { id: admin.id },
      },
    });
    assert.ok(watchlist);
    assert.strictEqual(watchlist.status, WatchlistStatus.WATCHED);
    assert.strictEqual(watchlist.media.id, media.id);
  });

  it('matches a Jellyfin user when the notification uses a different UUID format than stored', async () => {
    const userRepo = getRepository(User);
    const user = await userRepo.findOneOrFail({
      where: { email: 'admin@seerr.dev' },
    });
    user.jellyfinUserId = 'c0c95c3b3db6449392887f62911c7222';
    await userRepo.save(user);

    const media = await createMovieEntry(12345);

    const res = await request(app)
      .post('/webhook/jellyfin')
      .set('X-Webhook-Secret', WEBHOOK_SECRET)
      .send(
        moviePayload({
          UserId: 'c0c95c3b-3db6-4493-9288-7f62911c7222',
        })
      );

    assert.strictEqual(res.status, 200);
    const watchedStatus = await getRepository(WatchedStatus).findOneBy({
      userId: user.id,
      jellyfinItemId: 'jf-item-1',
    });
    assert.ok(watchedStatus);
    assert.strictEqual(watchedStatus?.mediaId, media.id);
  });

  it('parses the JSON body even when Content-Type is not application/json', async () => {
    await attachJellyfinUser('admin@seerr.dev', 'jf-user-admin');
    const media = await createMovieEntry(12345);

    const res = await request(app)
      .post('/webhook/jellyfin')
      .set('X-Webhook-Secret', WEBHOOK_SECRET)
      .set('Content-Type', 'text/plain')
      .send(JSON.stringify(moviePayload()));

    assert.strictEqual(res.status, 200);
    const watchedStatus = await getRepository(WatchedStatus).findOneBy({
      userId: 1,
      jellyfinItemId: 'jf-item-1',
    });
    assert.ok(watchedStatus);
    assert.strictEqual(watchedStatus.mediaId, media.id);
  });
});
