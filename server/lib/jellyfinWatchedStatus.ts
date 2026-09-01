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
 * Result of attempting to record a watched state for a Jellyfin item and
 * reflect it in the user's watchlist.
 * - 'watchlist-created': recorded AND a new watchlist entry was added (watched)
 * - 'watchlist-updated': recorded AND the user's existing watchlist entry was moved to watched
 * - 'recorded-only': recorded in WatchedStatus, and a matching watchlist entry already exists as watched
 * - 'skipped': nothing was recorded (no TMDB id)
 */
export type MarkItemWatchedResult =
  | 'watchlist-created'
  | 'watchlist-updated'
  | 'recorded-only'
  | 'skipped';

interface MarkItemWatchedOptions {
  user: User;
  jellyfinItemId: string;
  tmdbId: number | null | undefined;
  mediaType?: MediaType;
  title?: string;
  watchedAt?: Date;
  progress?: number;
}

/**
 * Records that a user watched a Jellyfin item and makes sure their watchlist
 * reflects it: the matching entry is moved to watched, or a new watched entry
 * is created when none exists. Shared between the Jellyfin webhook receiver
 * and the scheduled fallback sync job.
 *
 * A missing local Media record is created on the fly so any item Jellyfin
 * reports as watched can appear in the watchlist.
 */
export async function markItemWatched({
  user,
  jellyfinItemId,
  tmdbId,
  mediaType = MediaType.MOVIE,
  title,
  watchedAt = new Date(),
  progress = 1,
}: MarkItemWatchedOptions): Promise<MarkItemWatchedResult> {
  if (!tmdbId) {
    logger.debug('Skipping watched sync: no TMDB identifier', {
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
    logger.debug('Created local media record from Jellyfin watched item', {
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

  if (
    !watchedStatus ||
    watchedStatus.progress < progress ||
    !watchedStatus.watchedAt
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
    next.watchedAt = watchedAt;
    next.progress = progress;
    await watchedStatusRepository.save(next);
  }

  const watchedOnWatchlist = await ensureWatchedWatchlistEntry({
    user,
    media,
    tmdbId,
    mediaType,
    title,
  });

  if (watchedOnWatchlist === 'created') {
    logger.info('Created watchlist item as watched via Jellyfin', {
      label: 'Jellyfin Watched Sync',
      userId: user.id,
      tmdbId,
      mediaType,
    });
    return 'watchlist-created';
  }

  if (watchedOnWatchlist === 'updated') {
    logger.info('Marked watchlist item as watched via Jellyfin', {
      label: 'Jellyfin Watched Sync',
      userId: user.id,
      tmdbId,
      mediaType,
    });
    return 'watchlist-updated';
  }

  return 'recorded-only';
}

/**
 * Ensures a watchlist entry for the given item exists with a watched status,
 * creating it when there is none. Returns 'created', 'updated' or 'noop'.
 */
async function ensureWatchedWatchlistEntry({
  user,
  media,
  tmdbId,
  mediaType,
  title,
}: {
  user: User;
  media: Media;
  tmdbId: number;
  mediaType: MediaType;
  title?: string;
}): Promise<'created' | 'updated' | 'noop'> {
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
    if (watchlist.status !== WatchlistStatus.WATCHED) {
      watchlist.status = transitionStatus(
        watchlist.status,
        WatchlistStatus.WATCHED
      );
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
    status: WatchlistStatus.WATCHED,
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
    if (watchlist && watchlist.status !== WatchlistStatus.WATCHED) {
      watchlist.status = transitionStatus(
        watchlist.status,
        WatchlistStatus.WATCHED
      );
      await watchlistRepository.save(watchlist);
      return 'updated';
    }
    return 'noop';
  }
}
