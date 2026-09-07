import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { getAnimeCrosswalk } from '@server/api/anilist/crosswalk';
import { MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import { AiringState } from '@server/entity/AiringState';
import { User } from '@server/entity/User';
import { UserPushSubscription } from '@server/entity/UserPushSubscription';
import { NotifyOn, Watchlist, WatchlistStatus } from '@server/entity/Watchlist';
import { runAiringCheck } from '@server/lib/notifications/airingPush';
import { setupTestDb } from '@server/test/db';

setupTestDb();

async function seedRow(
  email: string,
  tmdbId: number,
  mediaType: MediaType,
  notifyOn: NotifyOn,
  title?: string
) {
  const user = await getRepository(User).findOneByOrFail({ email });
  return getRepository(Watchlist).save(
    new Watchlist({
      tmdbId,
      mediaType,
      title: title ?? `Title ${tmdbId}`,
      status: WatchlistStatus.WANT_TO_WATCH,
      notifyOn,
      requestedBy: user,
    } as never)
  );
}

async function seedSub(email: string, endpoint: string) {
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

async function seedState(
  tmdbId: number,
  mediaType: string,
  season: number,
  episode: number
) {
  return getRepository(AiringState).save(
    new AiringState({
      tmdbId,
      mediaType,
      lastSeason: season,
      lastEpisode: episode,
    })
  );
}

interface SentPush {
  endpoint: string;
  payload: {
    notificationType: string;
    subject: string;
    message: string;
    actionUrl: string;
  };
}

function collector(sent: SentPush[]) {
  return {
    send: async (
      subscription: { endpoint: string },
      payload: Buffer
    ) => {
      sent.push({
        endpoint: subscription.endpoint,
        payload: JSON.parse(payload.toString()),
      });
    },
  };
}

describe('airing push job (DAN-47)', () => {
  beforeEach(async () => {
    // resetTestDb runs via setupTestDb's beforeEach; nothing extra needed.
  });

  it('notifies each tracking user independently on a new TV episode', async () => {
    await seedRow(
      'admin@seerr.dev',
      50101,
      MediaType.TV,
      NotifyOn.BOTH,
      'Show 50101'
    );
    await seedRow(
      'friend@seerr.dev',
      50101,
      MediaType.TV,
      NotifyOn.EPISODE_AIRING,
      'Show 50101'
    );
    await seedSub('admin@seerr.dev', 'https://push.example/admin-1');
    await seedSub('friend@seerr.dev', 'https://push.example/friend-1');
    await seedState(50101, MediaType.TV, 1, 5);

    const sent: SentPush[] = [];
    const result = await runAiringCheck({
      ...collector(sent),
      getTvSchedule: async () => ({
        season: 1,
        episode: 6,
        airDate: '2024-01-01',
      }),
    });

    assert.strictEqual(result.items, 1);
    assert.strictEqual(result.notified, 2);
    assert.strictEqual(result.deliveries, 2);
    assert.deepStrictEqual(
      sent.map((s) => s.endpoint).sort(),
      ['https://push.example/admin-1', 'https://push.example/friend-1']
    );
    for (const push of sent) {
      assert.strictEqual(push.payload.notificationType, 'EPISODE_AIRING');
      assert.strictEqual(push.payload.actionUrl, '/tv/50101');
      assert.ok(push.payload.message.includes('S1 E6'));
    }

    const state = await getRepository(AiringState).findOneByOrFail({
      tmdbId: 50101,
    });
    assert.strictEqual(state.lastSeason, 1);
    assert.strictEqual(state.lastEpisode, 6);
  });

  it('sends nothing when no new episode aired', async () => {
    await seedRow('admin@seerr.dev', 50201, MediaType.TV, NotifyOn.BOTH);
    await seedSub('admin@seerr.dev', 'https://push.example/admin-1');
    await seedState(50201, MediaType.TV, 2, 3);

    const sent: SentPush[] = [];
    const result = await runAiringCheck({
      ...collector(sent),
      getTvSchedule: async () => ({
        season: 2,
        episode: 3,
        airDate: '2024-01-01',
      }),
    });

    assert.strictEqual(result.notified, 0);
    assert.strictEqual(sent.length, 0);
    const state = await getRepository(AiringState).findOneByOrFail({
      tmdbId: 50201,
    });
    assert.strictEqual(state.lastEpisode, 3);
  });

  it('seeds the baseline silently on first sight', async () => {
    await seedRow('admin@seerr.dev', 50301, MediaType.TV, NotifyOn.BOTH);
    await seedSub('admin@seerr.dev', 'https://push.example/admin-1');

    const sent: SentPush[] = [];
    const result = await runAiringCheck({
      ...collector(sent),
      getTvSchedule: async () => ({
        season: 3,
        episode: 9,
        airDate: '2024-06-01',
      }),
    });

    assert.strictEqual(result.notified, 0);
    assert.strictEqual(sent.length, 0);
    const state = await getRepository(AiringState).findOneByOrFail({
      tmdbId: 50301,
    });
    assert.strictEqual(state.lastSeason, 3);
    assert.strictEqual(state.lastEpisode, 9);
  });

  it('excludes notify_on none and users with no row', async () => {
    await seedRow('admin@seerr.dev', 50401, MediaType.TV, NotifyOn.BOTH);
    await seedRow('friend@seerr.dev', 50401, MediaType.TV, NotifyOn.NONE);
    await seedSub('admin@seerr.dev', 'https://push.example/admin-1');
    await seedSub('friend@seerr.dev', 'https://push.example/friend-1');
    await seedState(50401, MediaType.TV, 1, 1);

    const sent: SentPush[] = [];
    const result = await runAiringCheck({
      ...collector(sent),
      getTvSchedule: async () => ({
        season: 1,
        episode: 2,
        airDate: '2024-01-01',
      }),
    });

    assert.strictEqual(result.notified, 1);
    assert.deepStrictEqual(
      sent.map((s) => s.endpoint),
      ['https://push.example/admin-1']
    );
  });

  it('notifies on a bumped AniList next-episode for anime', async () => {
    // Steins;Gate (TMDB 42509) maps to an AniList ID in the crosswalk.
    await seedRow(
      'admin@seerr.dev',
      42509,
      MediaType.ANIME,
      NotifyOn.EPISODE_AIRING,
      'Steins;Gate'
    );
    await seedSub('admin@seerr.dev', 'https://push.example/admin-1');
    await seedState(42509, MediaType.ANIME, 1, 12);

    const seenAnilistIds: number[] = [];
    const sent: SentPush[] = [];
    const result = await runAiringCheck({
      ...collector(sent),
      getAnimeSchedule: async (anilistId) => {
        seenAnilistIds.push(anilistId);
        return { episode: 13, airingAt: new Date().toISOString() };
      },
    });

    // Looked up once via the real crosswalk (whatever it maps to today).
    assert.strictEqual(seenAnilistIds.length, 1);
    assert.strictEqual(
      seenAnilistIds[0],
      getAnimeCrosswalk().getByTmdbId(42509)?.AniList_id
    );
    assert.strictEqual(result.notified, 1);
    assert.strictEqual(sent.length, 1);
    assert.ok(sent[0].payload.message.includes('Episode 12'));
    assert.strictEqual(sent[0].payload.actionUrl, '/tv/42509');

    const state = await getRepository(AiringState).findOneByOrFail({
      tmdbId: 42509,
    });
    assert.strictEqual(state.lastEpisode, 13);
  });

  it('holds a future-dated TV episode until it airs', async () => {
    await seedRow('admin@seerr.dev', 50601, MediaType.TV, NotifyOn.BOTH);
    await seedSub('admin@seerr.dev', 'https://push.example/admin-1');
    await seedState(50601, MediaType.TV, 1, 5);

    const tomorrow = new Date(Date.now() + 86400000).toISOString();
    const sent: SentPush[] = [];
    await runAiringCheck({
      ...collector(sent),
      getTvSchedule: async () => ({
        season: 1,
        episode: 7,
        airDate: tomorrow,
      }),
    });

    assert.strictEqual(sent.length, 0);
    const state = await getRepository(AiringState).findOneByOrFail({
      tmdbId: 50601,
    });
    assert.strictEqual(state.lastEpisode, 5);
  });
});
