import { MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import type { User } from '@server/entity/User';
import { WatchedStatus } from '@server/entity/WatchedStatus';
import { Watchlist, WatchlistStatus } from '@server/entity/Watchlist';
import { transitionStatus } from '@server/lib/watchlist-transitions';
import logger from '@server/logger';
import { QueryFailedError, type FindOptionsWhere } from 'typeorm';

/**
 * Result of attempting to record a playback state for a Jellyfin item and
 * reflect it in the user's watchlist.
 * - 'watchlist-created': recorded AND a new watchlist entry was added with the target status
 * - 'watchlist-updated': recorded AND the user's existing watchlist entry was moved to the target status
 * - 'recorded-only': recorded in WatchedStatus, and a matching watchlist entry already matches the target status
 * - 'skipped': nothing was recorded (no TMDB id)
 */
export type MarkItemWatchedResult =
  | 'watchlist-created'
  | 'watchlist-updated'
  | 'recorded-only'
  | 'skipped';

interface SyncPlaybackStateOptions {
  user: User;
  jellyfinItemId: string;
  tmdbId: number | null | undefined;
  targetStatus: WatchlistStatus;
  mediaType?: MediaType;
  title?: string;
  watchedAt?: Date;
  progress?: number;
}

/**
 * Records a user's playback state for a Jellyfin item and makes sure their
 * watchlist reflects it: the matching entry is moved to the target status, or
 * a new entry is created with that status when none exists. Shared between the
 * Jellyfin webhook receiver and the scheduled fallback sync job.
 *
 * A missing local Media record is created on the fly so any item Jellyfin
 * reports a playback state for can appear in the watchlist.
 *
 * Downgrading is never allowed: an item already WATCHED is never moved back to
 * WATCHING (or anything else) by a later partial-progress event.
 */
export async function syncWatchlistPlaybackState({
  user,
  jellyfinItemId,
  tmdbId,
  targetStatus,
  mediaType = MediaType.MOVIE,
  title,
  watchedAt,
  progress = 1,
}: SyncPlaybackStateOptions): Promise<MarkItemWatchedResult> {
  if (!tmdbId) {
    logger.debug('Skipping watchlist playback sync: no TMDB identifier', {
      label: 'Jellyfin Watched Sync',
      userId: user.id,
      jellyfinItemId,
    });
    return 'skipped';
  }

  const mediaRepository = getRepository(Media);
  let media = await mediaRepository.findOne({
    where: { tmdbId, mediaType },
  });

  if (!media) {
    media = new Media({ tmdbId, mediaType });
    await mediaRepository.save(media);
    logger.debug('Created local media record from Jellyfin playback item', {
      label: 'Jellyfin Watched Sync',
      userId: user.id,
      jellyfinItemId,
      tmdbId,
      mediaType,
    });
  }

  const watchedStatusRepository = getRepository(WatchedStatus);
  const watchedStatus = await watchedStatusRepository.findOne({
    where: { userId: user.id, jellyfinItemId },
  });

  // Partial playback leaves watchedAt null so a later completion still
  // records the real finish time. Once a completion is recorded (progress 1
  // and watchedAt set), nothing is re-written on subsequent runs.
  const isCompletion = targetStatus === WatchlistStatus.WATCHED;
  if (
    !watchedStatus ||
    watchedStatus.progress < progress ||
    (isCompletion && !watchedStatus.watchedAt)
  ) {
    const next =
      watchedStatus ??
      new WatchedStatus({
        userId: user.id,
        user,
        jellyfinItemId,
        mediaId: media.id,
        progress: 0,
      });
    next.watchedAt = watchedAt ?? null;
    next.progress = progress;
    await watchedStatusRepository.save(next);
  }

  const watchlistResult = await ensureWatchlistEntry({
    user,
    media,
    tmdbId,
    mediaType,
    title,
    targetStatus,
  });

  if (watchlistResult === 'created') {
    logger.info('Created watchlist item via Jellyfin playback', {
      label: 'Jellyfin Watched Sync',
      userId: user.id,
      tmdbId,
      mediaType,
      targetStatus,
    });
    return 'watchlist-created';
  }

  if (watchlistResult === 'updated') {
    logger.info('Moved watchlist item via Jellyfin playback', {
      label: 'Jellyfin Watched Sync',
      userId: user.id,
      tmdbId,
      mediaType,
      targetStatus,
    });
    return 'watchlist-updated';
  }

  return 'recorded-only';
}

/**
 * Ensures a watchlist entry for the given item exists with the target status,
 * creating it when there is none. An entry already WATCHED is never downgraded
 * to a lesser status. Returns 'created', 'updated' or 'noop'.
 */
async function ensureWatchlistEntry({
  user,
  media,
  tmdbId,
  mediaType,
  title,
  targetStatus,
}: {
  user: User;
  media: Media;
  tmdbId: number;
  mediaType: MediaType;
  title?: string;
  targetStatus: WatchlistStatus;
}): Promise<'created' | 'updated' | 'noop'> {
  const applyTarget = (entry: Watchlist): boolean => {
    // Downgrade guard: once watched, partial progress never moves it back.
    if (
      entry.status === WatchlistStatus.WATCHED &&
      targetStatus !== WatchlistStatus.WATCHED
    ) {
      return false;
    }
    if (entry.status === targetStatus) {
      return false;
    }
    entry.status = transitionStatus(entry.status, targetStatus);
    return true;
  };

  const watchlistRepository = getRepository(Watchlist);
  const where: FindOptionsWhere<Watchlist> | FindOptionsWhere<Watchlist>[] =
    mediaType === MediaType.MOVIE
      ? { tmdbId, mediaType, requestedBy: { id: user.id } }
      : [
          { tmdbId, mediaType: MediaType.TV, requestedBy: { id: user.id } },
          {
            tmdbId,
            mediaType: MediaType.ANIME,
            requestedBy: { id: user.id },
          },
        ];

  const findExisting = () =>
    watchlistRepository.findOne({
      where,
    });

  let watchlist = await findExisting();

  if (watchlist) {
    if (applyTarget(watchlist)) {
      await watchlistRepository.save(watchlist);
      return 'updated';
    }
    return 'noop';
  }

  const created = new Watchlist({
    tmdbId,
    mediaType,
    title: title ?? '',
    requestedBy: user,
    media,
    status: targetStatus,
  });

  try {
    await watchlistRepository.save(created);
    return 'created';
  } catch (e) {
    if (!(e instanceof QueryFailedError)) {
      throw e;
    }
    // Webhook receiver and the scheduled sync can race; the unique index
    // (tmdbId, mediaType, requestedBy) means one of them loses. Re-find and
    // fall back to the existing entry instead of failing the whole job.
    watchlist = await findExisting();
    if (watchlist && applyTarget(watchlist)) {
      await watchlistRepository.save(watchlist);
      return 'updated';
    }
    return 'noop';
  }
}
