import AniList from '@server/api/anilist';
import { getAnimeCrosswalk } from '@server/api/anilist/crosswalk';
import TheMovieDb from '@server/api/themoviedb';
import { MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import { AiringState } from '@server/entity/AiringState';
import { UserPushSubscription } from '@server/entity/UserPushSubscription';
import { NotifyOn, Watchlist } from '@server/entity/Watchlist';
import { ensureVapid } from '@server/lib/notifications/availabilityPush';
import {
  deliverPush,
  type PushSubscriptionLike,
} from '@server/lib/notifications/pushSender';
import logger from '@server/logger';
import { In } from 'typeorm';

type SendFn = (
  subscription: PushSubscriptionLike,
  payload: Buffer
) => Promise<unknown>;

/** Last aired episode for a TV show from TMDB. */
export interface TvSchedule {
  season: number;
  episode: number;
  airDate: string | null;
}

/** Next episode to air for an anime from AniList. */
export interface AnimeSchedule {
  episode: number;
  airingAt: string;
}

export interface AiringDeps {
  /** Injected in tests so no network/VAPID is touched. */
  send?: SendFn;
  getTvSchedule?: (tmdbId: number) => Promise<TvSchedule | null>;
  getAnimeSchedule?: (anilistId: number) => Promise<AnimeSchedule | null>;
}

export interface AiringCheckResult {
  items: number;
  notified: number;
  deliveries: number;
  removed: number;
}

let running = false;
let cancelled = false;

export const isAiringCheckRunning = (): boolean => running;
export const cancelAiringCheck = (): void => {
  cancelled = true;
};

const defaultTvSchedule = async (
  tmdbId: number
): Promise<TvSchedule | null> => {
  const show = await new TheMovieDb().getTvShow({ tvId: tmdbId });
  const last = show.last_episode_to_air;
  if (!last) {
    return null;
  }
  return {
    season: last.season_number,
    episode: last.episode_number,
    airDate: last.air_date ?? null,
  };
};

const defaultAnimeSchedule = async (
  anilistId: number
): Promise<AnimeSchedule | null> => {
  const next = await new AniList().getAiringSchedule({ mediaId: anilistId });
  if (!next) {
    return null;
  }
  return { episode: next.episode, airingAt: next.airingAt };
};

const isNewer = (
  season: number,
  episode: number,
  state: AiringState
): boolean => {
  if (state.lastSeason === null || state.lastEpisode === null) {
    return true;
  }
  return (
    season > state.lastSeason ||
    (season === state.lastSeason && episode > state.lastEpisode)
  );
};

const airedOnOrBeforeToday = (airDate: string | null): boolean => {
  // TMDB's last_episode_to_air means aired; a missing date keeps that
  // meaning rather than suppressing the notification forever.
  if (!airDate) {
    return true;
  }
  return new Date(airDate).getTime() <= Date.now();
};

/**
 * Daily new-episode check (DAN-47). Groups watchlist rows per item so each
 * show costs exactly one metadata lookup no matter how many users track it,
 * then fans out pushes only to users whose notifyOn covers episode airing.
 * First sight of an item seeds the baseline silently — never a mass notify.
 */
export const runAiringCheck = async (
  deps: AiringDeps = {}
): Promise<AiringCheckResult> => {
  const result: AiringCheckResult = {
    items: 0,
    notified: 0,
    deliveries: 0,
    removed: 0,
  };

  if (running) {
    logger.warn('Airing check already running, skipping this tick.', {
      label: 'AiringPush',
    });
    return result;
  }
  running = true;
  cancelled = false;

  try {
    const rows = await getRepository(Watchlist).find({
      where: {
        mediaType: In([MediaType.TV, MediaType.ANIME]),
        notifyOn: In([NotifyOn.EPISODE_AIRING, NotifyOn.BOTH]),
      },
      relations: { requestedBy: true },
    });

    const groups = new Map<
      string,
      {
        tmdbId: number;
        mediaType: MediaType;
        title: string;
        userIds: number[];
      }
    >();
    for (const row of rows) {
      const userId = row.requestedBy?.id;
      if (!userId) {
        continue;
      }
      const key = `${row.mediaType}:${row.tmdbId}`;
      const group = groups.get(key);
      if (group) {
        if (!group.userIds.includes(userId)) {
          group.userIds.push(userId);
        }
      } else {
        groups.set(key, {
          tmdbId: row.tmdbId,
          mediaType: row.mediaType as MediaType,
          title: row.title,
          userIds: [userId],
        });
      }
    }

    const stateRepository = getRepository(AiringState);
    const subRepository = getRepository(UserPushSubscription);
    const getTvSchedule = deps.getTvSchedule ?? defaultTvSchedule;
    const getAnimeSchedule = deps.getAnimeSchedule ?? defaultAnimeSchedule;

    for (const group of groups.values()) {
      if (cancelled) {
        break;
      }
      result.items += 1;

      try {
        if (group.mediaType === MediaType.ANIME) {
          await checkAnimeGroup(group, {
            getAnimeSchedule,
            stateRepository,
            subRepository,
            result,
            send: deps.send,
          });
        } else {
          await checkTvGroup(group, {
            getTvSchedule,
            stateRepository,
            subRepository,
            result,
            send: deps.send,
          });
        }
      } catch (e) {
        logger.warn('Airing check failed for item, continuing', {
          label: 'AiringPush',
          tmdbId: group.tmdbId,
          errorMessage: (e as Error)?.message,
        });
      }
    }
  } finally {
    running = false;
  }

  logger.info('Airing check complete', {
    label: 'AiringPush',
    ...result,
  });
  return result;
};

interface GroupContext {
  stateRepository: ReturnType<typeof getRepository<AiringState>>;
  subRepository: ReturnType<typeof getRepository<UserPushSubscription>>;
  result: AiringCheckResult;
  send?: SendFn;
}

const storeState = async (
  stateRepository: GroupContext['stateRepository'],
  tmdbId: number,
  mediaType: MediaType,
  state: Partial<AiringState> & { tmdbId: number; mediaType: MediaType }
): Promise<void> => {
  const existing = await stateRepository.findOne({
    where: { tmdbId, mediaType },
  });
  if (existing) {
    Object.assign(existing, state);
    await stateRepository.save(existing);
  } else {
    await stateRepository.save(new AiringState(state));
  }
};

const checkTvGroup = async (
  group: { tmdbId: number; title: string; userIds: number[] },
  ctx: GroupContext & {
    getTvSchedule: (tmdbId: number) => Promise<TvSchedule | null>;
  }
): Promise<void> => {
  const sched = await ctx.getTvSchedule(group.tmdbId);
  if (!sched) {
    return;
  }

  const existing = await ctx.stateRepository.findOne({
    where: { tmdbId: group.tmdbId, mediaType: MediaType.TV },
  });

  // First sight seeds the baseline silently — never a mass notify (DAN-47).
  if (!existing || existing.lastEpisode === null) {
    await storeState(ctx.stateRepository, group.tmdbId, MediaType.TV, {
      tmdbId: group.tmdbId,
      mediaType: MediaType.TV,
      lastSeason: sched.season,
      lastEpisode: sched.episode,
      lastAiredAt: sched.airDate ? new Date(sched.airDate) : null,
    });
    return;
  }

  // Only advance to episodes that have actually aired; a newer but
  // future-dated episode stays pending until its air date passes.
  if (
    isNewer(sched.season, sched.episode, existing) &&
    airedOnOrBeforeToday(sched.airDate)
  ) {
    await notifyUsers(ctx, group.userIds, {
      title: group.title,
      message: `S${sched.season} E${sched.episode} of ${group.title} has aired.`,
      tmdbId: group.tmdbId,
    });
    await storeState(ctx.stateRepository, group.tmdbId, MediaType.TV, {
      tmdbId: group.tmdbId,
      mediaType: MediaType.TV,
      lastSeason: sched.season,
      lastEpisode: sched.episode,
      lastAiredAt: sched.airDate ? new Date(sched.airDate) : null,
    });
  }
};

const checkAnimeGroup = async (
  group: { tmdbId: number; title: string; userIds: number[] },
  ctx: GroupContext & {
    getAnimeSchedule: (anilistId: number) => Promise<AnimeSchedule | null>;
  }
): Promise<void> => {
  const anilistId = getAnimeCrosswalk().getByTmdbId(group.tmdbId)?.AniList_id;
  if (!anilistId) {
    return;
  }

  const sched = await ctx.getAnimeSchedule(anilistId);
  if (!sched) {
    return;
  }

  const existing = await ctx.stateRepository.findOne({
    where: { tmdbId: group.tmdbId, mediaType: MediaType.ANIME },
  });

  if (!existing || existing.lastEpisode === null) {
    await storeState(ctx.stateRepository, group.tmdbId, MediaType.ANIME, {
      tmdbId: group.tmdbId,
      mediaType: MediaType.ANIME,
      lastSeason: 1,
      lastEpisode: sched.episode,
      lastAiredAt: new Date(sched.airingAt),
    });
    return;
  }

  // AniList reports the NEXT episode to air: a bump means the stored one
  // has aired.
  if (sched.episode > existing.lastEpisode) {
    await notifyUsers(ctx, group.userIds, {
      title: group.title,
      message: `Episode ${existing.lastEpisode} of ${group.title} has aired.`,
      tmdbId: group.tmdbId,
    });
    await storeState(ctx.stateRepository, group.tmdbId, MediaType.ANIME, {
      tmdbId: group.tmdbId,
      mediaType: MediaType.ANIME,
      lastSeason: 1,
      lastEpisode: sched.episode,
      lastAiredAt: new Date(sched.airingAt),
    });
  } else if (
    sched.episode !== existing.lastEpisode ||
    new Date(sched.airingAt).getTime() !== existing.lastAiredAt?.getTime()
  ) {
    await storeState(ctx.stateRepository, group.tmdbId, MediaType.ANIME, {
      tmdbId: group.tmdbId,
      mediaType: MediaType.ANIME,
      lastSeason: 1,
      lastEpisode: sched.episode,
      lastAiredAt: new Date(sched.airingAt),
    });
  }
};

const notifyUsers = async (
  ctx: GroupContext,
  userIds: number[],
  event: { title: string; message: string; tmdbId: number }
): Promise<void> => {
  if (!ctx.send && !(await ensureVapid())) {
    return;
  }

  const payload = Buffer.from(
    JSON.stringify({
      notificationType: 'EPISODE_AIRING',
      subject: event.title,
      message: event.message,
      actionUrl: `/tv/${event.tmdbId}`,
      actionUrlTitle: 'View',
    }),
    'utf-8'
  );

  for (const userId of userIds) {
    const subs = await ctx.subRepository.find({
      where: { user: { id: userId } },
    });
    if (subs.length === 0) {
      continue;
    }
    ctx.result.notified += 1;

    for (const sub of subs) {
      try {
        const outcome = await deliverPush({
          subscription: { endpoint: sub.endpoint, keys: sub.keys },
          payload,
          ...(ctx.send ? { send: ctx.send } : {}),
        });
        if (outcome === 'delivered') {
          ctx.result.deliveries += 1;
        } else if (outcome === 'permanent-failure') {
          await ctx.subRepository.remove(sub);
          ctx.result.removed += 1;
        }
      } catch (e) {
        logger.error('Unexpected error delivering airing push', {
          label: 'AiringPush',
          userId,
          errorMessage: (e as Error)?.message,
        });
      }
    }
  }
};
