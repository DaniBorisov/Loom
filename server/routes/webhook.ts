import { MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import { User } from '@server/entity/User';
import { markItemWatched } from '@server/lib/jellyfinWatchedStatus';
import logger from '@server/logger';
import express, { Router } from 'express';

const webhookRoutes = Router();

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
  ProviderIds?: JellyfinWebhookProviderIds;
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

  if (
    !parseBoolean(payload.PlayedToCompletion) &&
    !parseBoolean(payload.Played)
  ) {
    logger.info('Ignoring Jellyfin PlaybackStop: not played to completion', {
      label: 'Jellyfin Webhook',
      itemId: payload.ItemId,
      playedToCompletion: payload.PlayedToCompletion,
      played: payload.Played,
    });
    return res.status(200).json({ status: 200 });
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

  const providerTmdb =
    payload.ProviderIds?.Tmdb ?? payload.ProviderIds?.TheMovieDb;
  const tmdbId = providerTmdb ? Number(providerTmdb) : null;

  let mediaType = MediaType.MOVIE;
  if (payload.ItemType?.toLowerCase() === 'series') {
    mediaType = MediaType.TV;
  }

  try {
    await markItemWatched({
      user,
      jellyfinItemId: payload.ItemId,
      tmdbId,
      mediaType,
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
