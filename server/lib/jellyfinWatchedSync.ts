import JellyfinAPI from '@server/api/jellyfin';
import { MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import { User } from '@server/entity/User';
import { WatchedStatus } from '@server/entity/WatchedStatus';
import { WatchlistStatus } from '@server/entity/Watchlist';
import { syncWatchlistPlaybackState } from '@server/lib/jellyfinWatchedStatus';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import { getHostname } from '@server/utils/getHostname';

export interface JellyfinWatchedSyncResult {
  user: number;
  recorded: number;
  skipped: number;
  inProgress: number;
}

/**
 * Minimum progress for a partially-played item to count as "watching",
 * matching the webhook's threshold.
 */
const MINIMUM_WATCH_PROGRESS = 0.05;

/**
 * Computes progress for a Jellyfin item from its user data (position/runtime).
 * Returns null when the runtime is unknown or zero, or the item is fully played.
 */
function computeProgress(item: {
  UserData?: { PlaybackPositionTicks?: number; Played?: boolean };
  RunTimeTicks?: number;
  Played?: boolean;
}): number | null {
  if (item.UserData?.Played || item.Played) {
    return 1;
  }
  const position = item.UserData?.PlaybackPositionTicks;
  const runtime = item.RunTimeTicks;
  if (
    position === undefined ||
    runtime === undefined ||
    runtime <= 0 ||
    position < 0
  ) {
    return null;
  }
  return Math.min(position / runtime, 1);
}

/**
 * Maps a Jellyfin item type to the app's media type. Only Movie and Series
 * items are reconciled here; standalone episodes are ignored because the
 * watchlist tracks whole movies and series.
 */
const ITEM_TYPE_TO_MEDIA_TYPE: Record<string, MediaType | undefined> = {
  Movie: MediaType.MOVIE,
  Series: MediaType.TV,
};

/**
 * Queries Jellyfin for every item the given local user has played and makes
 * sure each one is recorded locally and appears on the user's watchlist as
 * watched. This is the fallback for anything the webhook missed (restart,
 * network blip, misconfiguration); processing already-recorded items each run
 * keeps watchlist entries in sync and backfills items the webhook recorded
 * before the auto-add behavior existed. The writes are idempotent, so repeated
 * runs stay cheap.
 */
export async function syncPlayedItems(
  user: User
): Promise<JellyfinWatchedSyncResult> {
  const watchedStatusRepository = getRepository(WatchedStatus);

  const alreadyRecorded = new Set(
    (
      await watchedStatusRepository.find({
        where: { userId: user.id },
        select: ['jellyfinItemId'],
      })
    ).map((w) => w.jellyfinItemId)
  );

  const jellyfin = await buildJellyfinClient();
  if (!jellyfin) {
    return { user: user.id, recorded: 0, skipped: 0, inProgress: 0 };
  }

  // Normalize UUID format so it matches the id stored against the user.
  const normalizedUserId =
    user.jellyfinUserId && /^[0-9a-f]{32}$/i.test(user.jellyfinUserId)
      ? user.jellyfinUserId.replace(
          /^(.{8})(.{4})(.{4})(.{4})(.{12})$/,
          '$1-$2-$3-$4-$5'
        )
      : user.jellyfinUserId;

  jellyfin.setUserId(normalizedUserId ?? '');

  let playedItems;
  try {
    playedItems = await jellyfin.getPlayedItems();
  } catch (e) {
    logger.warn(
      `Failed to fetch played items for Jellyfin user ${user.jellyfinUserId}`,
      {
        label: 'Jellyfin Watched Sync',
        userId: user.id,
        errorMessage: e.message,
      }
    );
    return { user: user.id, recorded: 0, skipped: 0, inProgress: 0 };
  }

  let inProgressItems;
  try {
    inProgressItems = await jellyfin.getInProgressItems();
  } catch (e) {
    logger.warn(
      `Failed to fetch in-progress items for Jellyfin user ${user.jellyfinUserId}`,
      {
        label: 'Jellyfin Watched Sync',
        userId: user.id,
        errorMessage: e.message,
      }
    );
    return { user: user.id, recorded: 0, skipped: 0, inProgress: 0 };
  }

  // Items reported as fully played are authoritative; drop them from the
  // in-progress list so a played item is never also processed as watching.
  const playedIds = new Set(playedItems.map((item) => item.Id));
  const partiallyPlayed = inProgressItems.filter(
    (item) => !playedIds.has(item.Id)
  );

  let recorded = 0;
  let skipped = 0;
  let inProgress = 0;

  for (const item of playedItems) {
    const mediaType = ITEM_TYPE_TO_MEDIA_TYPE[item.Type];
    const tmdbId = item.ProviderIds?.Tmdb ?? item.ProviderIds?.TheMovieDb;

    if (!mediaType || !tmdbId) {
      skipped += 1;
      continue;
    }

    // Everything is processed every run (not just new ids) so watchlist
    // entries are ensured for items recorded by earlier runs too. Only items
    // that were not previously recorded count toward `recorded`.
    const result = await syncWatchlistPlaybackState({
      user,
      jellyfinItemId: item.Id,
      tmdbId: Number(tmdbId),
      mediaType,
      title: item.Name,
      targetStatus: WatchlistStatus.WATCHED,
      watchedAt: new Date(),
    });

    if (result === 'skipped') {
      skipped += 1;
    } else if (!alreadyRecorded.has(item.Id)) {
      recorded += 1;
    }
  }

  for (const item of partiallyPlayed) {
    const mediaType = ITEM_TYPE_TO_MEDIA_TYPE[item.Type];
    const tmdbId = item.ProviderIds?.Tmdb ?? item.ProviderIds?.TheMovieDb;

    if (!mediaType || !tmdbId) {
      skipped += 1;
      continue;
    }

    const progress = computeProgress(item);
    if (progress === null || progress < MINIMUM_WATCH_PROGRESS) {
      skipped += 1;
      continue;
    }

    inProgress += 1;

    const result = await syncWatchlistPlaybackState({
      user,
      jellyfinItemId: item.Id,
      tmdbId: Number(tmdbId),
      mediaType,
      title: item.Name,
      targetStatus: WatchlistStatus.WATCHING,
      progress,
    });

    if (result === 'skipped') {
      skipped += 1;
    } else if (!alreadyRecorded.has(item.Id)) {
      recorded += 1;
    }
  }

  logger.info('Jellyfin watched sync completed', {
    label: 'Jellyfin Watched Sync',
    userId: user.id,
    jellyfinUserId: user.jellyfinUserId,
    playedItems: playedItems.length,
    inProgressItems: partiallyPlayed.length,
    inProgress,
    recorded,
    skipped,
  });

  return { user: user.id, recorded, skipped, inProgress };
}

/**
 * Builds a Jellyfin API client using the admin's credentials so the job can
 * read the library of any linked user.
 */
async function buildJellyfinClient(): Promise<JellyfinAPI | null> {
  const settings = getSettings();
  const hostname = getHostname(settings.jellyfin);

  if (!hostname) {
    logger.debug('Skipping Jellyfin watched sync: server not configured', {
      label: 'Jellyfin Watched Sync',
    });
    return null;
  }

  const userRepository = getRepository(User);
  const admin = await userRepository.findOne({
    where: { id: 1 },
    select: ['id', 'jellyfinAuthToken', 'jellyfinDeviceId', 'jellyfinUserId'],
  });

  if (!admin?.jellyfinAuthToken) {
    logger.debug(
      'Skipping Jellyfin watched sync: no admin Jellyfin credentials',
      { label: 'Jellyfin Watched Sync' }
    );
    return null;
  }

  return new JellyfinAPI(
    hostname,
    admin.jellyfinAuthToken,
    admin.jellyfinDeviceId
  );
}
