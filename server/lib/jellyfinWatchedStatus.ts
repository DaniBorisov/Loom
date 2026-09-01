import { MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import type { User } from '@server/entity/User';
import { WatchedStatus } from '@server/entity/WatchedStatus';
import { Watchlist, WatchlistStatus } from '@server/entity/Watchlist';
import { transitionStatus } from '@server/lib/watchlist-transitions';
import logger from '@server/logger';

/**
 * Result of attempting to record a watched state for a Jellyfin item.
 * - 'watchlist-updated': recorded AND the user's watchlist entry was moved to watched
 * - 'recorded-only': recorded in WatchedStatus, but no watchlist entry existed
 * - 'skipped': nothing was recorded (no TMDB id or no local Media record)
 */
export type MarkItemWatchedResult =
  | 'watchlist-updated'
  | 'recorded-only'
  | 'skipped';

interface MarkItemWatchedOptions {
  user: User;
  jellyfinItemId: string;
  tmdbId: number | null | undefined;
  mediaType?: MediaType;
  watchedAt?: Date;
  progress?: number;
}

/**
 * Records that a user watched a Jellyfin item and updates their watchlist
 * status when a matching watchlist entry exists. Shared between the Jellyfin
 * webhook receiver and the scheduled fallback sync job.
 */
export async function markItemWatched({
  user,
  jellyfinItemId,
  tmdbId,
  mediaType = MediaType.MOVIE,
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
  const media = await mediaRepository.findOne({
    where: { tmdbId, mediaType },
  });

  if (!media) {
    logger.debug('Skipping watched sync: local media record not found', {
      label: 'Jellyfin Watched Sync',
      userId: user.id,
      jellyfinItemId,
      tmdbId,
      mediaType,
    });
    return 'skipped';
  }

  const watchedStatusRepository = getRepository(WatchedStatus);
  let watchedStatus = await watchedStatusRepository.findOne({
    where: { userId: user.id, jellyfinItemId },
  });

  if (!watchedStatus) {
    watchedStatus = new WatchedStatus({
      userId: user.id,
      user,
      jellyfinItemId,
      mediaId: media.id,
      progress: 0,
    });
  }

  watchedStatus.watchedAt = watchedAt;
  watchedStatus.progress = progress;
  await watchedStatusRepository.save(watchedStatus);

  const watchlistRepository = getRepository(Watchlist);
  const watchlist = await watchlistRepository.findOne({
    where:
      mediaType === MediaType.MOVIE
        ? { tmdbId, mediaType, requestedBy: { id: user.id } }
        : [
            { tmdbId, mediaType: MediaType.TV, requestedBy: { id: user.id } },
            {
              tmdbId,
              mediaType: MediaType.ANIME,
              requestedBy: { id: user.id },
            },
          ],
  });

  if (watchlist && watchlist.status !== WatchlistStatus.WATCHED) {
    watchlist.status = transitionStatus(
      watchlist.status,
      WatchlistStatus.WATCHED
    );
    await watchlistRepository.save(watchlist);
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
