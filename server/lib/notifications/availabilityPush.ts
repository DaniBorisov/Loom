import TheMovieDb from '@server/api/themoviedb';
import { MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import { User } from '@server/entity/User';
import { UserPushSubscription } from '@server/entity/UserPushSubscription';
import { NotifyOn, Watchlist } from '@server/entity/Watchlist';
import {
  deliverPush,
  type PushSubscriptionLike,
} from '@server/lib/notifications/pushSender';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import { In } from 'typeorm';
import webpush from 'web-push';

export type AvailabilitySource = 'sonarr' | 'radarr';

export interface AvailabilityEvent {
  source: AvailabilitySource;
  tmdbId: number;
  title: string;
}

type SendFn = (
  subscription: PushSubscriptionLike,
  payload: Buffer
) => Promise<unknown>;

export interface NotifyAvailabilityResult {
  users: number;
  deliveries: number;
  removed: number;
}

/**
 * Configure web-push VAPID details from the admin user + settings (DAN-47
 * shares this). Returns false when setup is impossible — callers skip
 * sending. Never needed when tests inject their own `send`.
 */
export const ensureVapid = async (): Promise<boolean> => {
  const admin = await getRepository(User).findOne({ where: { id: 1 } });
  const settings = getSettings();
  if (!admin || !settings.vapidPublic || !settings.vapidPrivate) {
    logger.warn(
      'Skipping availability push: VAPID keys or admin user missing',
      { label: 'Notifications' }
    );
    return false;
  }
  webpush.setVapidDetails(
    `mailto:${admin.email}`,
    settings.vapidPublic,
    settings.vapidPrivate
  );
  return true;
};

/**
 * Which watchlist media types a Servarr event can satisfy (DAN-46).
 * Radarr only ever yields movies; Sonarr series can back tv or anime rows.
 */
export const mediaTypesForSource = (source: AvailabilitySource): MediaType[] =>
  source === 'radarr' ? [MediaType.MOVIE] : [MediaType.TV, MediaType.ANIME];

/**
 * Resolve a Sonarr tvdbId to a TMDB ID for watchlist matching. Returns
 * null when unresolvable — the webhook still answers 200, it just cannot
 * attribute the download to a watchlist row.
 */
export const resolveSonarrTmdbId = async (
  tvdbId: number
): Promise<number | null> => {
  if (!Number.isFinite(tvdbId)) {
    return null;
  }
  try {
    const tmdb = new TheMovieDb();
    const show = await tmdb.getShowByTvdbId({ tvdbId });
    return show?.id ?? null;
  } catch (e) {
    logger.debug('Failed to resolve Sonarr TVDB ID to TMDB ID', {
      label: 'Notifications',
      tvdbId,
      errorMessage: (e as Error)?.message,
    });
    return null;
  }
};

/**
 * Notify every user whose watchlist references this media and whose
 * notifyOn preference covers library availability (DAN-46). Strictly
 * per-user: only their own subscriptions are ever targeted, one push per
 * user even with several matching rows; users with notifyOn 'none' (or no
 * row at all) are never contacted and never queried beyond the row lookup.
 *
 * `send` is injectable so tests never touch the network/VAPID path.
 */
export const notifyAvailableInLibrary = async (
  event: AvailabilityEvent,
  deps: { send?: SendFn } = {}
): Promise<NotifyAvailabilityResult> => {
  const result: NotifyAvailabilityResult = {
    users: 0,
    deliveries: 0,
    removed: 0,
  };

  if (!Number.isFinite(event.tmdbId)) {
    return result;
  }

  const rows = await getRepository(Watchlist).find({
    where: {
      tmdbId: event.tmdbId,
      mediaType: In(mediaTypesForSource(event.source)),
    },
    relations: { requestedBy: true },
  });

  const eligible = rows.filter(
    (row) =>
      row.notifyOn === NotifyOn.AVAILABLE_IN_LIBRARY ||
      row.notifyOn === NotifyOn.BOTH
  );

  // One push per user even with several matching rows.
  const byUser = new Map<number, { title: string; movie: boolean }>();
  for (const row of eligible) {
    const userId = row.requestedBy?.id;
    if (userId && !byUser.has(userId)) {
      byUser.set(userId, {
        title: row.title || event.title,
        movie: event.source === 'radarr',
      });
    }
  }

  if (byUser.size === 0) {
    return result;
  }

  const subRepository = getRepository(UserPushSubscription);

  // VAPID is only needed for real delivery, never for injected test sends.
  if (!deps.send && !(await ensureVapid())) {
    return result;
  }

  for (const [userId, { title, movie }] of byUser) {
    const subs = await subRepository.find({
      where: { user: { id: userId } },
    });
    if (subs.length === 0) {
      continue;
    }

    result.users += 1;

    const payload = Buffer.from(
      JSON.stringify({
        notificationType: 'MEDIA_AVAILABLE',
        subject: title,
        message: `${title} is now available in your library.`,
        actionUrl: `/${movie ? 'movie' : 'tv'}/${event.tmdbId}`,
        actionUrlTitle: 'View',
      }),
      'utf-8'
    );

    for (const sub of subs) {
      try {
        const outcome = await deliverPush({
          subscription: { endpoint: sub.endpoint, keys: sub.keys },
          payload,
          ...(deps.send ? { send: deps.send } : {}),
        });

        if (outcome === 'delivered') {
          result.deliveries += 1;
        } else if (outcome === 'permanent-failure') {
          await subRepository.remove(sub);
          result.removed += 1;
        }
      } catch (e) {
        // Never mass-delete on unexpected errors — keep the row.
        logger.error('Unexpected error delivering availability push', {
          label: 'Notifications',
          userId,
          errorMessage: (e as Error)?.message,
        });
      }
    }
  }

  logger.info('Availability push fan-out complete', {
    label: 'Notifications',
    source: event.source,
    tmdbId: event.tmdbId,
    ...result,
  });

  return result;
};
