import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import TheMovieDb from '@server/api/themoviedb';
import { MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import { User } from '@server/entity/User';
import { UserPushSubscription } from '@server/entity/UserPushSubscription';
import { NotifyOn, Watchlist, WatchlistStatus } from '@server/entity/Watchlist';
import {
  mediaTypesForSource,
  notifyAvailableInLibrary,
  resolveSonarrTmdbId,
} from '@server/lib/notifications/availabilityPush';
import { setupTestDb } from '@server/test/db';

setupTestDb();

// TheMovieDb methods are instance arrow-function properties — patch via
// defineProperty, not mock.method (same seam as availabilitySync.test.ts).
let getShowByTvdbIdImpl: (args: { tvdbId: number }) => Promise<{ id: number }> =
  async () => ({ id: 0 });

Object.defineProperty(TheMovieDb.prototype, 'getShowByTvdbId', {
  get() {
    return async (args: { tvdbId: number }) => getShowByTvdbIdImpl(args);
  },
  set() {},
  configurable: true,
});

async function seedWatchlist(
  email: string,
  tmdbId: number,
  mediaType: MediaType,
  notifyOn: NotifyOn
) {
  const user = await getRepository(User).findOneByOrFail({ email });
  return getRepository(Watchlist).save(
    new Watchlist({
      tmdbId,
      mediaType,
      title: `Title ${tmdbId}`,
      status: WatchlistStatus.WANT_TO_WATCH,
      notifyOn,
      requestedBy: user,
    } as never)
  );
}

async function seedSubscription(email: string, endpoint: string) {
  const user = await getRepository(User).findOneByOrFail({ email });
  return getRepository(UserPushSubscription).save(
    new UserPushSubscription({
      endpoint,
      keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
      userAgent: 'test-agent',
      user,
    })
  );
}

describe('availability push trigger (DAN-46)', () => {
  beforeEach(async () => {
    getShowByTvdbIdImpl = async () => ({ id: 0 });
  });

  it('notifies a user with a matching row and available_in_library preference', async () => {
    await seedWatchlist(
      'admin@seerr.dev',
      30101,
      MediaType.MOVIE,
      NotifyOn.AVAILABLE_IN_LIBRARY
    );
    await seedSubscription('admin@seerr.dev', 'https://push.example/admin-1');

    const calls: { endpoint: string; payload: unknown }[] = [];
    const result = await notifyAvailableInLibrary(
      { source: 'radarr', tmdbId: 30101, title: 'Title 30101' },
      {
        send: async (subscription, payload) => {
          calls.push({
            endpoint: subscription.endpoint,
            payload: JSON.parse(payload.toString()),
          });
        },
      }
    );

    assert.strictEqual(result.users, 1);
    assert.strictEqual(result.deliveries, 1);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].endpoint, 'https://push.example/admin-1');
    assert.deepStrictEqual(calls[0].payload, {
      notificationType: 'MEDIA_AVAILABLE',
      subject: 'Title 30101',
      message: 'Title 30101 is now available in your library.',
      actionUrl: '/movie/30101',
      actionUrlTitle: 'View',
    });
  });

  it('skips users with notify_on none and users with no row', async () => {
    await seedWatchlist(
      'admin@seerr.dev',
      30201,
      MediaType.MOVIE,
      NotifyOn.BOTH
    );
    await seedWatchlist(
      'friend@seerr.dev',
      30201,
      MediaType.MOVIE,
      NotifyOn.NONE
    );
    await seedSubscription('admin@seerr.dev', 'https://push.example/admin-1');
    await seedSubscription('friend@seerr.dev', 'https://push.example/friend-1');

    const endpoints: string[] = [];
    const result = await notifyAvailableInLibrary(
      { source: 'radarr', tmdbId: 30201, title: 'Title 30201' },
      {
        send: async (subscription) => {
          endpoints.push(subscription.endpoint);
        },
      }
    );

    assert.strictEqual(result.users, 1);
    assert.deepStrictEqual(endpoints, ['https://push.example/admin-1']);
  });

  it('sends nothing when nobody watches the item', async () => {
    await seedSubscription('admin@seerr.dev', 'https://push.example/admin-1');

    let calls = 0;
    const result = await notifyAvailableInLibrary(
      { source: 'sonarr', tmdbId: 30301, title: 'Title 30301' },
      {
        send: async () => {
          calls += 1;
        },
      }
    );

    assert.strictEqual(result.users, 0);
    assert.strictEqual(calls, 0);
  });

  it('deletes dead subscriptions on permanent failure and keeps transient ones', async () => {
    await seedWatchlist(
      'admin@seerr.dev',
      30401,
      MediaType.TV,
      NotifyOn.BOTH
    );
    const dead = await seedSubscription(
      'admin@seerr.dev',
      'https://push.example/dead-1'
    );
    const flaky = await seedSubscription(
      'admin@seerr.dev',
      'https://push.example/flaky-1'
    );

    const result = await notifyAvailableInLibrary(
      { source: 'sonarr', tmdbId: 30401, title: 'Title 30401' },
      {
        send: async (subscription) => {
          if (subscription.endpoint.endsWith('dead-1')) {
            throw Object.assign(new Error('gone'), { statusCode: 410 });
          }
          throw Object.assign(new Error('boom'), { statusCode: 500 });
        },
      }
    );

    assert.strictEqual(result.removed, 1);
    assert.strictEqual(
      await getRepository(UserPushSubscription).findOneBy({ id: dead.id }),
      null
    );
    assert.ok(
      await getRepository(UserPushSubscription).findOneBy({ id: flaky.id })
    );
  });

  it('resolves Sonarr tvdbIds via TMDB and returns null when unresolvable', async () => {
    getShowByTvdbIdImpl = async ({ tvdbId }) => ({ id: tvdbId + 1000 });
    assert.strictEqual(await resolveSonarrTmdbId(500), 1500);

    getShowByTvdbIdImpl = async () => {
      throw new Error('timeout of 10000ms exceeded');
    };
    assert.strictEqual(await resolveSonarrTmdbId(500), null);
    assert.strictEqual(await resolveSonarrTmdbId(NaN), null);
  });

  it('matches movies for radarr and tv/anime for sonarr', () => {
    assert.deepStrictEqual(mediaTypesForSource('radarr'), [MediaType.MOVIE]);
    assert.deepStrictEqual(mediaTypesForSource('sonarr'), [
      MediaType.TV,
      MediaType.ANIME,
    ]);
  });
});
