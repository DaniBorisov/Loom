import { MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import { User } from '@server/entity/User';
import { WatchlistStatus } from '@server/entity/Watchlist';
import { syncWatchlistPlaybackState } from '@server/lib/jellyfinWatchedStatus';
import { buildJellyfinClient } from '@server/lib/jellyfinWatchedSync';
import logger from '@server/logger';
import express, { Router } from 'express';

const webhookRoutes = Router();

/**
 * Minimum progress for a partial movie playback to count as "watching".
 * Events below this (e.g. accidental click-and-immediately-stop) are ignored.
 */
const MINIMUM_WATCH_PROGRESS = 0.05;

/**
 * The Jellyfin Webhook plugin does not always send an application/json
 * Content-Type header, so parse the JSON body regardless of content type.
 */
const jsonBodyParser = express.json({ type: '*/*' });

interface JellyfinWebhookProviderIds {
  Tmdb?: string;
  TheMovieDb?: string;
}

interface JellyfinWebhookPayload {
  NotificationType?: string;
  UserId?: string;
  ItemId?: string;
  ItemType?: string;
  Name?: string;
  PlayedToCompletion?: boolean | string;
  Played?: boolean | string;
  PlaybackPositionTicks?: number | string;
  RunTimeTicks?: number | string;
  ProviderIds?: JellyfinWebhookProviderIds;
  SeriesId?: string;
}

function parseBoolean(value: boolean | string | undefined | null): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return value.toLowerCase() === 'true';
  }
  return false;
}

/**
 * Receives PlaybackStop notifications from the Jellyfin Webhook plugin.
 * Authenticated via the X-Webhook-Secret header, which must match the
 * JELLYFIN_WEBHOOK_SECRET environment variable.
 *
 * The endpoint always responds 200 when the notification is accepted so that
 * Jellyfin does not treat it as a failed delivery and retry it.
 */
webhookRoutes.post('/jellyfin', jsonBodyParser, async (req, res) => {
  const configuredSecret = process.env.JELLYFIN_WEBHOOK_SECRET ?? '';
  const receivedSecret = req.header('X-Webhook-Secret');

  if (!configuredSecret || receivedSecret !== configuredSecret) {
    logger.warn('Ignoring Jellyfin webhook: invalid or missing secret');
    return res.status(401).json({ status: 401, message: 'Invalid secret' });
  }

  const payload = (req.body ?? {}) as JellyfinWebhookPayload;

  logger.info('Received Jellyfin webhook notification', {
    label: 'Jellyfin Webhook',
    contentType: req.headers['content-type'],
    notificationType: payload.NotificationType,
    itemType: payload.ItemType,
    itemId: payload.ItemId,
    name: payload.Name,
  });

  if (payload.NotificationType !== 'PlaybackStop') {
    return res.status(200).json({ status: 200 });
  }

  const playedToCompletion = parseBoolean(payload.PlayedToCompletion);
  const played = parseBoolean(payload.Played);
  const isCompletion = playedToCompletion || played;

  let progress = 1;
  if (
    payload.PlaybackPositionTicks !== undefined &&
    payload.RunTimeTicks !== undefined
  ) {
    const position = Number(payload.PlaybackPositionTicks);
    const runtime = Number(payload.RunTimeTicks);
    if (
      Number.isFinite(position) &&
      Number.isFinite(runtime) &&
      runtime > 0 &&
      position >= 0
    ) {
      progress = Math.min(position / runtime, 1);
    }
  }

  const isMovie = (payload.ItemType ?? '').toLowerCase() === 'movie';
  const isEpisode = (payload.ItemType ?? '').toLowerCase() === 'episode';

  if (!isCompletion) {
    // Movies: partial playback counts as "watching" once past the minimum
    // progress threshold. Episodes: any playback event is a valid "watching
    // the show" signal — no per-episode threshold needed.
    if (isMovie && progress >= MINIMUM_WATCH_PROGRESS) {
      logger.info('Recording partial movie playback via Jellyfin webhook', {
        label: 'Jellyfin Webhook',
        itemId: payload.ItemId,
        progress,
      });
    } else if (isEpisode) {
      logger.info('Recording episode playback via Jellyfin webhook', {
        label: 'Jellyfin Webhook',
        itemId: payload.ItemId,
        seriesId: payload.SeriesId,
      });
    } else {
      logger.info(
        'Ignoring Jellyfin PlaybackStop: not played to completion or not enough progress',
        {
          label: 'Jellyfin Webhook',
          itemId: payload.ItemId,
          playedToCompletion: payload.PlayedToCompletion,
          played: payload.Played,
          progress,
        }
      );
      return res.status(200).json({ status: 200 });
    }
  }

  if (!payload.UserId || !payload.ItemId) {
    logger.warn('Ignoring Jellyfin webhook: missing UserId or ItemId', {
      label: 'Jellyfin Webhook',
    });
    return res.status(200).json({ status: 200 });
  }

  const userRepository = getRepository(User);
  let user = await userRepository.findOne({
    where: { jellyfinUserId: payload.UserId },
  });

  if (!user) {
    const variants = [
      payload.UserId.replaceAll('-', ''),
      payload.UserId.replace(
        /^(.{8})(.{4})(.{4})(.{4})(.{12})$/,
        '$1-$2-$3-$4-$5'
      ),
    ];
    for (const variant of variants) {
      user = await userRepository.findOne({
        where: { jellyfinUserId: variant },
      });
      if (user) {
        break;
      }
    }
  }

  if (!user) {
    logger.warn(
      `Ignoring Jellyfin webhook: no local user linked to Jellyfin user ${payload.UserId}`,
      { label: 'Jellyfin Webhook' }
    );
    return res.status(200).json({ status: 200 });
  }

  let tmdbId: number | null = null;
  let mediaType = MediaType.MOVIE;
  let targetStatus = isCompletion
    ? WatchlistStatus.WATCHED
    : WatchlistStatus.WATCHING;
  let watchedAt: Date | undefined = isCompletion ? new Date() : undefined;

  if (isEpisode) {
    // Episodes: fetch the parent series to get its TMDB id (for watchlist
    // matching) and aggregate UserData.Played (to know when the whole show
    // is done).
    if (!payload.SeriesId) {
      logger.warn('Ignoring episode webhook: missing SeriesId', {
        label: 'Jellyfin Webhook',
        itemId: payload.ItemId,
      });
      return res.status(200).json({ status: 200 });
    }

    const jellyfin = await buildJellyfinClient();
    if (!jellyfin) {
      logger.warn(
        'Ignoring episode webhook: Jellyfin not configured or admin credentials missing',
        { label: 'Jellyfin Webhook', seriesId: payload.SeriesId }
      );
      return res.status(200).json({ status: 200 });
    }

    let seriesData;
    try {
      seriesData = await jellyfin.getItemData(payload.SeriesId);
    } catch (e) {
      logger.warn('Ignoring episode webhook: failed to fetch series data', {
        label: 'Jellyfin Webhook',
        seriesId: payload.SeriesId,
        errorMessage: e.message,
      });
      return res.status(200).json({ status: 200 });
    }

    if (!seriesData) {
      logger.warn('Ignoring episode webhook: series not found in Jellyfin', {
        label: 'Jellyfin Webhook',
        seriesId: payload.SeriesId,
      });
      return res.status(200).json({ status: 200 });
    }

    const seriesTmdb =
      seriesData.ProviderIds?.Tmdb ?? seriesData.ProviderIds?.TheMovieDb;
    tmdbId = seriesTmdb ? Number(seriesTmdb) : null;
    mediaType = MediaType.TV;

    // Use the series-level aggregate: if all available episodes are played,
    // the show is done. Otherwise any episode playback = watching.
    const seriesPlayed = seriesData.UserData?.Played === true;
    targetStatus = seriesPlayed
      ? WatchlistStatus.WATCHED
      : WatchlistStatus.WATCHING;
    watchedAt = seriesPlayed ? new Date() : undefined;

    logger.info('Processed episode webhook against series aggregate', {
      label: 'Jellyfin Webhook',
      itemId: payload.ItemId,
      seriesId: payload.SeriesId,
      seriesTmdbId: tmdbId,
      seriesPlayed,
      targetStatus,
    });
  } else {
    // Movies: use the TMDB id from the webhook payload directly.
    const providerTmdb =
      payload.ProviderIds?.Tmdb ?? payload.ProviderIds?.TheMovieDb;
    tmdbId = providerTmdb ? Number(providerTmdb) : null;
  }

  try {
    await syncWatchlistPlaybackState({
      user,
      jellyfinItemId: payload.ItemId,
      tmdbId,
      mediaType,
      title: payload.Name,
      targetStatus,
      progress,
      watchedAt,
    });
  } catch (e) {
    logger.error('Failed to process Jellyfin webhook notification', {
      label: 'Jellyfin Webhook',
      errorMessage: e.message,
    });
  }

  return res.status(200).json({ status: 200 });
});

export default webhookRoutes;
