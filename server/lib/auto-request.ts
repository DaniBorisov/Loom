import JellyfinAPI from '@server/api/jellyfin';
import { getAnimeCrosswalk } from '@server/api/anilist/crosswalk';
import { MediaType } from '@server/constants/media';
import { MediaServerType } from '@server/constants/server';
import { getRepository } from '@server/datasource';
import {
  BlocklistedMediaError,
  DuplicateMediaRequestError,
  MediaRequest,
  NoSeasonsAvailableError,
  QuotaRestrictedError,
  RequestPermissionError,
} from '@server/entity/MediaRequest';
import { User } from '@server/entity/User';
import { WatchlistStatus } from '@server/entity/Watchlist';
import logger from '@server/logger';
import { Permission } from '@server/lib/permissions';
import { getSettings } from '@server/lib/settings';
import { getHostname } from '@server/utils/getHostname';

export interface AutoRequestOptions {
  user: User;
  tmdbId: number;
  mediaType: MediaType;
  watchlistStatus: WatchlistStatus;
}

/**
 * Fire-and-forget auto-request orchestrator.
 *
 * When a watchlist item is created with want_to_watch status:
 * 1. Check Jellyfin availability
 * 2. If already available → skip (no request needed)
 * 3. If not available → call MediaRequest.request with isAutoRequest: true
 * 4. Errors are logged but do NOT propagate (fire-and-forget)
 */
export async function processAutoRequest(
  options: AutoRequestOptions
): Promise<void> {
  const { user, tmdbId, mediaType, watchlistStatus } = options;

  if (watchlistStatus !== WatchlistStatus.WANT_TO_WATCH) {
    return;
  }

  if (
    mediaType === MediaType.MOVIE &&
    !user.hasPermission(
      [Permission.AUTO_REQUEST, Permission.AUTO_REQUEST_MOVIE],
      { type: 'or' }
    )
  ) {
    return;
  }

  if (
    (mediaType === MediaType.TV || mediaType === MediaType.ANIME) &&
    !user.hasPermission(
      [Permission.AUTO_REQUEST, Permission.AUTO_REQUEST_TV],
      { type: 'or' }
    )
  ) {
    return;
  }

  try {
    const settings = getSettings();
    const mediaServerType = settings.main.mediaServerType;

    if (
      mediaServerType === MediaServerType.JELLYFIN ||
      mediaServerType === MediaServerType.EMBY
    ) {
      const isAvailable = await checkJellyfinAvailability(tmdbId, mediaType);

      if (isAvailable) {
        logger.info(
          `Media TMDB ${tmdbId} already available in Jellyfin — skipping auto-request`,
          { label: 'AutoRequest', userId: user.id }
        );
        return;
      }
    }

    let requestMediaType = mediaType;
    let tvdbId: number | undefined;

    if (mediaType === MediaType.ANIME) {
      const crosswalk = getAnimeCrosswalk();
      const entry = crosswalk.getByTmdbId(tmdbId);
      if (entry?.TheTVDB_id) {
        tvdbId = entry.TheTVDB_id;
        requestMediaType = MediaType.TV;
      } else {
        logger.warn(
          `Could not resolve TVDB ID for anime TMDB ${tmdbId} — falling back to TV`,
          { label: 'AutoRequest', userId: user.id }
        );
        requestMediaType = MediaType.TV;
      }
    }

    await MediaRequest.request(
      {
        mediaId: tmdbId,
        mediaType: requestMediaType,
        seasons: requestMediaType === MediaType.TV ? 'all' : undefined,
        tvdbId,
        is4k: false,
      },
      user,
      { isAutoRequest: true }
    );

    logger.info(
      `Auto-request created for TMDB ${tmdbId} (${requestMediaType})`,
      { label: 'AutoRequest', userId: user.id }
    );
  } catch (e) {
    if (!(e instanceof Error)) {
      return;
    }

    switch (e.constructor) {
      case RequestPermissionError:
      case DuplicateMediaRequestError:
      case QuotaRestrictedError:
      case NoSeasonsAvailableError:
        logger.debug('Auto-request skipped', {
          label: 'AutoRequest',
          userId: user.id,
          tmdbId,
          errorMessage: e.message,
        });
        break;
      case BlocklistedMediaError:
        break;
      default:
        logger.error('Auto-request failed', {
          label: 'AutoRequest',
          userId: user.id,
          tmdbId,
          errorMessage: e.message,
        });
    }
  }
}

async function checkJellyfinAvailability(
  tmdbId: number,
  mediaType: MediaType
): Promise<boolean> {
  const settings = getSettings();
  const hostname = getHostname(settings.jellyfin);

  const userRepository = getRepository(User);
  const admin = await userRepository.findOne({
    where: { id: 1 },
    select: [
      'id',
      'jellyfinAuthToken',
      'jellyfinDeviceId',
      'jellyfinUserId',
    ],
  });

  if (!admin || !admin.jellyfinAuthToken) {
    logger.debug(
      'No admin Jellyfin credentials available for availability check',
      { label: 'AutoRequest' }
    );
    return false;
  }

  const jellyfin = new JellyfinAPI(
    hostname,
    admin.jellyfinAuthToken,
    admin.jellyfinDeviceId
  );

  jellyfin.setUserId(admin.jellyfinUserId ?? '');

  const includeItemTypes =
    mediaType === MediaType.MOVIE ? 'Movie' : 'Series';

  const result = await jellyfin.lookupByProviderId(
    String(tmdbId),
    'Tmdb',
    includeItemTypes
  );

  return result !== null;
}
