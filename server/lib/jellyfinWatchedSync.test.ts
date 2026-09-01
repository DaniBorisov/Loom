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

  it('is a no-op when no items are new (already marked via webhook)', async () => {
    const user = await getRepository(User).findOneOrFail({ where: { id: 1 } });

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
