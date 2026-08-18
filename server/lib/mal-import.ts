import AniList from '@server/api/anilist';
import { getAnimeCrosswalk } from '@server/api/anilist/crosswalk';
import type { MalAnimeEntry } from '@server/api/mal';
import { MyAnimeList } from '@server/api/mal';
import TheMovieDb from '@server/api/themoviedb';
import { MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import type { User } from '@server/entity/User';
import type { WatchlistStatus } from '@server/entity/Watchlist';
import { Watchlist } from '@server/entity/Watchlist';
import { mapMalStatus } from '@server/lib/mal-mapping';
import logger from '@server/logger';

const FALLBACK_DELAY_MS = 300;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface ImportConflict {
  malEntry: MalAnimeEntry;
  existingWatchlist: Watchlist;
  malStatus: WatchlistStatus;
}

export interface MalImportResult {
  imported: number;
  skipped: number;
  conflicts: ImportConflict[];
  errors: string[];
}

// In-memory progress tracking per user
const importProgress = new Map<
  number,
  {
    running: boolean;
    progress: number;
    total: number;
    result?: MalImportResult;
  }
>();

export function getImportProgress(userId: number) {
  return (
    importProgress.get(userId) || { running: false, progress: 0, total: 0 }
  );
}

export async function runMalImport(
  user: User,
  resolveConflict?: (conflict: ImportConflict) => Promise<boolean>
): Promise<MalImportResult> {
  const mal = new MyAnimeList();
  const crosswalk = getAnimeCrosswalk();
  const anilist = new AniList();
  const tmdb = new TheMovieDb();
  const watchlistRepository = getRepository(Watchlist);
  const mediaRepository = getRepository(Media);

  // In-memory caches for fallback lookups during this import run
  const tmdbCache = new Map<
    number,
    { tmdbId: number; mediaType: MediaType } | null
  >();
  const anilistCache = new Map<number, number | null>(); // malId → idMal

  importProgress.set(user.id, { running: true, progress: 0, total: 0 });

  const result: MalImportResult = {
    imported: 0,
    skipped: 0,
    conflicts: [],
    errors: [],
  };

  try {
    const entries = await mal.getAnimeList(user);
    const total = entries.length;
    importProgress.set(user.id, { running: true, progress: 0, total });

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const malId = entry.node.id;
      const malStatus = mapMalStatus(entry.list_status.status);

      try {
        let resolved = crosswalk.resolveByMalId(malId);

        // Fallback: try AniList to get idMal, then re-check crosswalk
        if (!resolved) {
          if (anilistCache.has(malId)) {
            const cachedIdMal = anilistCache.get(malId);
            if (cachedIdMal) {
              resolved = crosswalk.resolveByMalId(cachedIdMal);
            }
          } else {
            try {
              const anilistResult = await anilist.search({
                query: entry.node.title,
                perPage: 3,
              });
              if (anilistResult.results.length > 0) {
                const firstResult = anilistResult.results[0];
                anilistCache.set(malId, firstResult.id);
                // Try crosswalk with AniList ID
                const crosswalkEntry = crosswalk.getByAniListId(firstResult.id);
                if (crosswalkEntry?.TheMovieDB_id) {
                  resolved = {
                    tmdbId: crosswalkEntry.TheMovieDB_id,
                    mediaType: MediaType.ANIME,
                  };
                }
              } else {
                anilistCache.set(malId, null);
              }
            } catch (e: unknown) {
              const msg = e instanceof Error ? e.message : 'Unknown error';
              logger.debug(`AniList fallback failed for MAL ${malId}: ${msg}`, {
                label: 'MALImport',
              });
            }
            await sleep(FALLBACK_DELAY_MS);
          }
        }

        // Fallback: TMDB title search
        if (!resolved) {
          if (tmdbCache.has(malId)) {
            resolved = tmdbCache.get(malId) ?? null;
          } else {
            try {
              const title = entry.node.title;
              const tvResult = await tmdb.searchTvShows({
                query: title,
              });
              const movieResult = await tmdb.searchMovies({
                query: title,
              });

              // Prefer TV (most anime are TV on TMDB), then movies
              const bestTv = tvResult.results[0];
              const bestMovie = movieResult.results[0];

              if (bestTv) {
                resolved = {
                  tmdbId: bestTv.id,
                  mediaType: MediaType.ANIME,
                };
              } else if (bestMovie) {
                resolved = {
                  tmdbId: bestMovie.id,
                  mediaType: MediaType.ANIME,
                };
              }

              if (resolved) {
                logger.info(
                  `TMDB fallback resolved MAL ${malId} (${title}) → TMDB ${resolved.tmdbId}`,
                  { label: 'MALImport' }
                );
              } else {
                logger.debug(
                  `TMDB fallback: no match for MAL ${malId} (${title})`,
                  { label: 'MALImport' }
                );
              }
            } catch (e: unknown) {
              const msg = e instanceof Error ? e.message : 'Unknown error';
              logger.debug(`TMDB fallback failed for MAL ${malId}: ${msg}`, {
                label: 'MALImport',
              });
            }
            await sleep(FALLBACK_DELAY_MS);
            tmdbCache.set(malId, resolved);
          }
        }

        if (!resolved) {
          result.skipped++;
          result.errors.push(
            `No crosswalk match for MAL ID ${malId} (${entry.node.title})`
          );
          continue;
        }

        // Check for existing watchlist entry
        const existing = await watchlistRepository.findOne({
          where: {
            tmdbId: resolved.tmdbId,
            mediaType: resolved.mediaType,
            requestedBy: { id: user.id },
          },
        });

        if (existing) {
          // Conflict: existing item with different status
          if (existing.status !== malStatus) {
            const conflict: ImportConflict = {
              malEntry: entry,
              existingWatchlist: existing,
              malStatus,
            };

            if (resolveConflict) {
              const overwrite = await resolveConflict(conflict);
              if (overwrite) {
                existing.status = malStatus;
                existing.malOriginalStatus = entry.list_status.status;
                existing.externalSource = 'mal';
                existing.externalId = String(malId);
                await watchlistRepository.save(existing);
                result.imported++;
              } else {
                result.skipped++;
              }
            } else {
              result.conflicts.push(conflict);
            }
          } else {
            // Same status, skip
            result.skipped++;
          }
          continue;
        }

        // Find or create Media entity
        let media = await mediaRepository.findOne({
          where: {
            tmdbId: resolved.tmdbId,
            mediaType: resolved.mediaType,
          },
        });

        if (!media) {
          media = new Media({
            tmdbId: resolved.tmdbId,
            mediaType: resolved.mediaType,
          });
          await mediaRepository.save(media);
        }

        // Create watchlist entry
        const watchlist = new Watchlist({
          tmdbId: resolved.tmdbId,
          mediaType: resolved.mediaType,
          title: entry.node.title,
          requestedBy: user,
          media,
          status: malStatus,
          externalSource: 'mal',
          externalId: String(malId),
          malOriginalStatus: entry.list_status.status,
        });

        await watchlistRepository.save(watchlist);
        result.imported++;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        result.errors.push(`Error importing ${entry.node.title}: ${msg}`);
      }

      importProgress.set(user.id, {
        running: true,
        progress: i + 1,
        total,
      });
    }

    logger.info(
      `MAL import complete for user ${user.id}: ${result.imported} imported, ${result.skipped} skipped, ${result.conflicts.length} conflicts`,
      { label: 'MALImport' }
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    result.errors.push(`Import failed: ${msg}`);
    logger.error(`MAL import failed for user ${user.id}`, {
      label: 'MALImport',
      error: msg,
    });
  }

  importProgress.set(user.id, {
    running: false,
    progress: importProgress.get(user.id)?.total ?? 0,
    total: importProgress.get(user.id)?.total ?? 0,
    result,
  });

  return result;
}
