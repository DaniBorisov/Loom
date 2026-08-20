import { getAnimeCrosswalk } from '@server/api/anilist/crosswalk';
import type { AnimeCrosswalkEntry } from '@server/api/anilist/crosswalk';
import logger from '@server/logger';
import fs from 'fs';
import { rename, writeFile } from 'fs/promises';
import path from 'path';

const CROSSWALK_URL =
  'https://raw.githubusercontent.com/Fribb/anime-lists/master/anime-list-full.json';

const CROSSWALK_PATH = process.env.CONFIG_DIRECTORY
  ? `${process.env.CONFIG_DIRECTORY}/anime-crosswalk.json`
  : path.join(__dirname, '../data/anime-crosswalk.json');

let syncing = false;

interface SourceEntry {
  anilist_id?: number | null;
  tvdb_id?: number | null;
  anidb_id?: number | null;
  mal_id?: number | null;
  themoviedb_id?: { tv?: number | null; movie?: number | null } | null;
}

function convertEntry(entry: SourceEntry): AnimeCrosswalkEntry | null {
  if (!entry.anilist_id) return null;

  const tmdbId =
    entry.themoviedb_id?.tv ?? entry.themoviedb_id?.movie ?? undefined;

  return {
    AniList_id: entry.anilist_id,
    ...(entry.tvdb_id ? { TheTVDB_id: entry.tvdb_id } : {}),
    ...(tmdbId ? { TheMovieDB_id: tmdbId } : {}),
    ...(entry.mal_id ? { MAL_id: entry.mal_id } : {}),
    ...(entry.anidb_id ? { AniDB_id: entry.anidb_id } : {}),
  };
}

export function isRunning(): boolean {
  return syncing;
}

export async function run(): Promise<void> {
  if (syncing) {
    logger.warn('Crosswalk refresh already running, skipping', {
      label: 'CrosswalkSync',
    });
    return;
  }

  syncing = true;

  try {
    logger.info('Starting crosswalk refresh', { label: 'CrosswalkSync' });

    const response = await fetch(CROSSWALK_URL);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const sourceData: SourceEntry[] = await response.json();
    logger.info(`Fetched ${sourceData.length} entries from upstream`, {
      label: 'CrosswalkSync',
    });

    const converted: AnimeCrosswalkEntry[] = [];
    for (const entry of sourceData) {
      const result = convertEntry(entry);
      if (result) {
        converted.push(result);
      }
    }

    // Atomic write: write to temp file, then rename
    const tmpPath = `${CROSSWALK_PATH}.tmp`;
    await writeFile(tmpPath, JSON.stringify(converted, null, 2) + '\n');
    await rename(tmpPath, CROSSWALK_PATH);

    logger.info(`Wrote ${converted.length} crosswalk entries to disk`, {
      label: 'CrosswalkSync',
    });

    // Reload in-memory maps
    getAnimeCrosswalk().reload();

    logger.info('Crosswalk refresh completed successfully', {
      label: 'CrosswalkSync',
    });
  } catch (e) {
    logger.error('Failed to refresh crosswalk data', {
      label: 'CrosswalkSync',
      error: e,
    });
    // Clean up temp file if it exists
    const tmpPath = `${CROSSWALK_PATH}.tmp`;
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      // ignore
    }
  } finally {
    syncing = false;
  }
}
