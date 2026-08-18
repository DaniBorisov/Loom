import { getAnimeCrosswalk } from '@server/api/anilist/crosswalk';
import { MyAnimeList } from '@server/api/mal';
import { getRepository } from '@server/datasource';
import { User } from '@server/entity/User';
import { Watchlist } from '@server/entity/Watchlist';
import { ensureValidMalToken } from '@server/lib/mal-auth';
import { mapMalStatus } from '@server/lib/mal-mapping';
import logger from '@server/logger';

interface SyncStatus {
  running: boolean;
  processed: number;
  skipped: number;
  updated: number;
}

let status: SyncStatus = {
  running: false,
  processed: 0,
  skipped: 0,
  updated: 0,
};

export function getStatus(): SyncStatus {
  return status;
}

export function cancel(): void {
  status = { running: false, processed: 0, skipped: 0, updated: 0 };
}

export async function run(): Promise<void> {
  if (status.running) {
    logger.warn('MAL list sync already running, skipping', {
      label: 'MALListSync',
    });
    return;
  }

  const userRepository = getRepository(User);
  const watchlistRepository = getRepository(Watchlist);
  const crosswalk = getAnimeCrosswalk();
  const mal = new MyAnimeList();

  status = { running: true, processed: 0, skipped: 0, updated: 0 };

  try {
    // Find all users with MAL sync enabled
    const users = await userRepository
      .createQueryBuilder('user')
      .innerJoinAndSelect('user.settings', 'settings')
      .addSelect('user.malAccessToken')
      .addSelect('user.malRefreshToken')
      .addSelect('user.malTokenExpiresAt')
      .where('settings.malSyncEnabled = :enabled', { enabled: true })
      .getMany();

    logger.info(`MAL list sync: processing ${users.length} users`, {
      label: 'MALListSync',
    });

    for (const user of users) {
      try {
        // Try to get a valid token (will refresh if needed)
        await ensureValidMalToken(user, process.env.MAL_CLIENT_ID || '');

        const entries = await mal.getAnimeList(user);
        status.processed++;

        // For each MAL entry, find matching MAL-imported watchlist and check status
        for (const entry of entries) {
          const malId = entry.node.id;
          const resolved = crosswalk.resolveByMalId(malId);

          if (!resolved) continue;

          const watchlist = await watchlistRepository.findOne({
            where: {
              tmdbId: resolved.tmdbId,
              mediaType: resolved.mediaType,
              requestedBy: { id: user.id },
              externalSource: 'mal',
            },
          });

          if (!watchlist) continue;

          const newInternalStatus = mapMalStatus(entry.list_status.status);

          // Only update if status differs and the item was imported from MAL
          if (
            watchlist.status !== newInternalStatus &&
            watchlist.externalSource === 'mal'
          ) {
            watchlist.status = newInternalStatus;
            watchlist.malOriginalStatus = entry.list_status.status;
            await watchlistRepository.save(watchlist);
            status.updated++;
          }
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        // Token expired/revoked — skip this user, don't fail the batch
        if (
          msg.includes('expired') ||
          msg.includes('revoke') ||
          msg.includes('Reconnect')
        ) {
          logger.warn(`MAL list sync: skipping user ${user.id} — ${msg}`, {
            label: 'MALListSync',
          });
          status.skipped++;
          continue;
        }
        logger.error(`MAL list sync: error for user ${user.id}`, {
          label: 'MALListSync',
          error: msg,
        });
        status.skipped++;
      }
    }

    logger.info(
      `MAL list sync complete: ${status.processed} processed, ${status.updated} updated, ${status.skipped} skipped`,
      { label: 'MALListSync' }
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    logger.error('MAL list sync failed', { label: 'MALListSync', error: msg });
  }

  status.running = false;
}
