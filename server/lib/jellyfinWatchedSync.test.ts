import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'node:test';

import JellyfinAPI from '@server/api/jellyfin';
import { MediaType } from '@server/constants/media';
import { MediaServerType } from '@server/constants/server';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import { User } from '@server/entity/User';
import { WatchedStatus } from '@server/entity/WatchedStatus';
import { Watchlist, WatchlistStatus } from '@server/entity/Watchlist';
import { syncPlayedItems } from '@server/lib/jellyfinWatchedSync';
import { getSettings } from '@server/lib/settings';
import { setupTestDb } from '@server/test/db';

setupTestDb();

beforeEach(async () => {
  mock.restoreAll();

  const settings = getSettings();
  settings.main.mediaServerType = MediaServerType.JELLYFIN;
  settings.jellyfin.ip = '192.168.87.101';
  settings.jellyfin.port = 8096;

  mock.method(JellyfinAPI.prototype, 'getInProgressItems', async () => []);

  const userRepo = getRepository(User);
  const admin = await userRepo.findOneOrFail({ where: { id: 1 } });
  admin.jellyfinAuthToken = 'test-token';
  admin.jellyfinUserId = 'admin-jf-id';
  admin.jellyfinDeviceId = 'test-device-id';
  await userRepo.save(admin);
});

function playedMovie(id: string, tmdbId: string) {
  return {
    Id: id,
    Name: `Item ${id}`,
    Type: 'Movie',
    ProviderIds: { Tmdb: tmdbId },
  };
}

function inProgressMovie(
  id: string,
  tmdbId: string,
  positionTicks: number,
  runtimeTicks: number
) {
  return {
    Id: id,
    Name: `Item ${id}`,
    Type: 'Movie',
    ProviderIds: { Tmdb: tmdbId },
    RunTimeTicks: runtimeTicks,
    UserData: { PlaybackPositionTicks: positionTicks, Played: false },
  };
}

function playedSeries(
  id: string,
  tmdbId: string,
  provider?: 'Tmdb' | 'TheMovieDb'
) {
  return {
    Id: id,
    Name: `Series ${id}`,
    Type: 'Series',
    ProviderIds: { [provider ?? 'Tmdb']: tmdbId },
  };
}

function inProgressSeries(
  id: string,
  tmdbId: string,
  positionTicks: number,
  runtimeTicks: number
) {
  return {
    Id: id,
    Name: `Series ${id}`,
    Type: 'Series',
    ProviderIds: { Tmdb: tmdbId },
    RunTimeTicks: runtimeTicks,
    UserData: { PlaybackPositionTicks: positionTicks, Played: false },
  };
}

async function ensureMedia(
  tmdbId: number,
  mediaType: MediaType = MediaType.MOVIE
) {
  const mediaRepo = getRepository(Media);
  let media = await mediaRepo.findOne({ where: { tmdbId, mediaType } });
  if (!media) {
    media = new Media({ tmdbId, mediaType });
    await mediaRepo.save(media);
  }
  return media;
}

describe('syncPlayedItems (fallback Jellyfin watched sync)', () => {
  it('records newly watched items and finds new ones via the diff', async () => {
    const user = await getRepository(User).findOneOrFail({ where: { id: 1 } });
    await ensureMedia(11111);
    await ensureMedia(22222, MediaType.TV);

    mock.method(JellyfinAPI.prototype, 'getPlayedItems', async () => [
      playedMovie('jf-movie-1', '11111'),
      playedSeries('jf-series-1', '22222'),
    ]);

    const result = await syncPlayedItems(user);

    assert.strictEqual(result.recorded, 2);
    assert.strictEqual(result.skipped, 0);

    const watched = await getRepository(WatchedStatus).find({
      where: { userId: 1 },
    });
    assert.strictEqual(watched.length, 2);
  });

  it('is a no-op for watched status when no items are new (already marked via webhook)', async () => {
    const user = await getRepository(User).findOneOrFail({ where: { id: 1 } });
    await ensureMedia(11111);

    await getRepository(WatchedStatus).save(
      new WatchedStatus({
        userId: 1,
        user,
        jellyfinItemId: 'jf-known',
        mediaId: 1,
        watchedAt: new Date(),
        progress: 1,
      })
    );

    mock.method(JellyfinAPI.prototype, 'getPlayedItems', async () => [
      playedMovie('jf-known', '11111'),
    ]);

    const result = await syncPlayedItems(user);

    assert.strictEqual(result.recorded, 0);
    assert.strictEqual(result.skipped, 0);
    const statusCount = await getRepository(WatchedStatus).count({
      where: { userId: 1 },
    });
    assert.strictEqual(statusCount, 1);
  });

  it('creates a watched watchlist entry for a played item not on any watchlist', async () => {
    const user = await getRepository(User).findOneOrFail({ where: { id: 1 } });

    mock.method(JellyfinAPI.prototype, 'getPlayedItems', async () => [
      playedMovie('jf-unlisted', '44444'),
    ]);

    const result = await syncPlayedItems(user);

    assert.strictEqual(result.recorded, 1);
    assert.strictEqual(result.skipped, 0);

    const media = await getRepository(Media).findOne({
      where: { tmdbId: 44444, mediaType: MediaType.MOVIE },
    });
    assert.ok(media);

    const watchlist = await getRepository(Watchlist).findOne({
      where: {
        tmdbId: 44444,
        mediaType: MediaType.MOVIE,
        requestedBy: { id: user.id },
      },
    });
    assert.ok(watchlist);
    assert.strictEqual(watchlist.status, WatchlistStatus.WATCHED);
  });

  it('backfills a watched watchlist entry for an item already in watched_status', async () => {
    const user = await getRepository(User).findOneOrFail({ where: { id: 1 } });
    await ensureMedia(11111);

    await getRepository(WatchedStatus).save(
      new WatchedStatus({
        userId: 1,
        user,
        jellyfinItemId: 'jf-backfill',
        mediaId: 1,
        watchedAt: new Date(),
        progress: 1,
      })
    );

    mock.method(JellyfinAPI.prototype, 'getPlayedItems', async () => [
      playedMovie('jf-backfill', '11111'),
    ]);

    const result = await syncPlayedItems(user);

    assert.strictEqual(result.recorded, 0);
    assert.strictEqual(result.skipped, 0);

    const watchlist = await getRepository(Watchlist).findOne({
      where: {
        tmdbId: 11111,
        mediaType: MediaType.MOVIE,
        requestedBy: { id: user.id },
      },
    });
    assert.ok(watchlist);
    assert.strictEqual(watchlist.status, WatchlistStatus.WATCHED);
  });

  it('skips items with no TMDB provider id or unsupported type', async () => {
    const user = await getRepository(User).findOneOrFail({ where: { id: 1 } });

    mock.method(JellyfinAPI.prototype, 'getPlayedItems', async () => [
      playedMovie('jf-bad-tmdb', 'not-a-number'),
      { Id: 'jf-episode', Name: 'Ep 1', Type: 'Episode', ProviderIds: {} },
    ]);

    const result = await syncPlayedItems(user);

    assert.strictEqual(result.recorded, 0);
    assert.strictEqual(result.skipped, 2);
  });

  it('transitions an existing watchlist entry for a newly found item', async () => {
    const user = await getRepository(User).findOneOrFail({ where: { id: 1 } });
    await ensureMedia(33333);

    const watchlistRepo = getRepository(Watchlist);
    const watchlist = await watchlistRepo.save(
      new Watchlist({
        tmdbId: 33333,
        mediaType: MediaType.MOVIE,
        title: 'New Found Movie',
        requestedBy: user,
        status: WatchlistStatus.WANT_TO_WATCH,
      })
    );

    mock.method(JellyfinAPI.prototype, 'getPlayedItems', async () => [
      playedMovie('jf-new-movie', '33333'),
    ]);

    const result = await syncPlayedItems(user);

    assert.strictEqual(result.recorded, 1);
    const updated = await getRepository(Watchlist).findOneBy({
      id: watchlist.id,
    });
    assert.strictEqual(updated?.status, WatchlistStatus.WATCHED);
  });

  it('creates a watching watchlist entry for an in-progress item', async () => {
    const user = await getRepository(User).findOneOrFail({ where: { id: 1 } });

    mock.method(JellyfinAPI.prototype, 'getPlayedItems', async () => []);
    mock.method(JellyfinAPI.prototype, 'getInProgressItems', async () => [
      inProgressMovie('jf-inprogress', '55555', 36000000000, 72000000000),
    ]);

    const result = await syncPlayedItems(user);

    assert.strictEqual(result.inProgress, 1);
    assert.strictEqual(result.recorded, 1);
    assert.strictEqual(result.skipped, 0);

    const watchlist = await getRepository(Watchlist).findOne({
      where: {
        tmdbId: 55555,
        mediaType: MediaType.MOVIE,
        requestedBy: { id: user.id },
      },
    });
    assert.ok(watchlist);
    assert.strictEqual(watchlist.status, WatchlistStatus.WATCHING);

    const watchedStatus = await getRepository(WatchedStatus).findOneBy({
      userId: 1,
      jellyfinItemId: 'jf-inprogress',
    });
    assert.ok(watchedStatus);
    assert.strictEqual(watchedStatus.progress, 0.5);
    assert.strictEqual(watchedStatus.watchedAt, null);
  });

  it('does not downgrade a played item that is also in progress', async () => {
    const user = await getRepository(User).findOneOrFail({ where: { id: 1 } });
    await ensureMedia(11111);

    mock.method(JellyfinAPI.prototype, 'getPlayedItems', async () => [
      playedMovie('jf-both', '11111'),
    ]);
    mock.method(JellyfinAPI.prototype, 'getInProgressItems', async () => [
      inProgressMovie('jf-both', '11111', 36000000000, 72000000000),
    ]);

    const result = await syncPlayedItems(user);

    assert.strictEqual(result.inProgress, 0);
    const watchlist = await getRepository(Watchlist).findOne({
      where: {
        tmdbId: 11111,
        mediaType: MediaType.MOVIE,
        requestedBy: { id: user.id },
      },
    });
    assert.ok(watchlist);
    assert.strictEqual(watchlist.status, WatchlistStatus.WATCHED);
  });

  it('ignores in-progress items below the minimum progress threshold', async () => {
    const user = await getRepository(User).findOneOrFail({ where: { id: 1 } });

    mock.method(JellyfinAPI.prototype, 'getPlayedItems', async () => []);
    mock.method(JellyfinAPI.prototype, 'getInProgressItems', async () => [
      inProgressMovie('jf-low', '66666', 1800000000, 72000000000),
    ]);

    const result = await syncPlayedItems(user);

    assert.strictEqual(result.inProgress, 0);
    assert.strictEqual(result.recorded, 0);
    const watchlist = await getRepository(Watchlist).findOne({
      where: { tmdbId: 66666 },
    });
    assert.strictEqual(watchlist, null);
  });

  it('creates a watching watchlist entry for an in-progress series', async () => {
    const user = await getRepository(User).findOneOrFail({ where: { id: 1 } });

    mock.method(JellyfinAPI.prototype, 'getPlayedItems', async () => []);
    mock.method(JellyfinAPI.prototype, 'getInProgressItems', async () => [
      inProgressSeries(
        'jf-series-inprogress',
        '77777',
        36000000000,
        72000000000
      ),
    ]);

    const result = await syncPlayedItems(user);

    assert.strictEqual(result.inProgress, 1);
    const watchlist = await getRepository(Watchlist).findOne({
      where: {
        tmdbId: 77777,
        mediaType: MediaType.TV,
        requestedBy: { id: user.id },
      },
    });
    assert.ok(watchlist);
    assert.strictEqual(watchlist.status, WatchlistStatus.WATCHING);

    const watchedStatus = await getRepository(WatchedStatus).findOneBy({
      userId: 1,
      jellyfinItemId: 'jf-series-inprogress',
    });
    assert.ok(watchedStatus);
    assert.strictEqual(watchedStatus.progress, 0.5);
    assert.strictEqual(watchedStatus.watchedAt, null);
  });

  it('does not downgrade a played series that is also in progress', async () => {
    const user = await getRepository(User).findOneOrFail({ where: { id: 1 } });
    await ensureMedia(22222, MediaType.TV);

    mock.method(JellyfinAPI.prototype, 'getPlayedItems', async () => [
      playedSeries('jf-series-both', '22222'),
    ]);
    mock.method(JellyfinAPI.prototype, 'getInProgressItems', async () => [
      inProgressSeries('jf-series-both', '22222', 36000000000, 72000000000),
    ]);

    const result = await syncPlayedItems(user);

    assert.strictEqual(result.inProgress, 0);
    const watchlist = await getRepository(Watchlist).findOne({
      where: {
        tmdbId: 22222,
        mediaType: MediaType.TV,
        requestedBy: { id: user.id },
      },
    });
    assert.ok(watchlist);
    assert.strictEqual(watchlist.status, WatchlistStatus.WATCHED);
  });

  it('handles a Jellyfin API failure gracefully without crashing', async () => {
    const user = await getRepository(User).findOneOrFail({ where: { id: 1 } });

    mock.method(JellyfinAPI.prototype, 'getPlayedItems', async () => {
      throw new Error('Connection refused');
    });

    const result = await syncPlayedItems(user);

    assert.strictEqual(result.recorded, 0);
    assert.strictEqual(result.skipped, 0);
  });
});
