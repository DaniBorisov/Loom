import { MediaType } from '@server/constants/media';
import logger from '@server/logger';
import fs from 'fs';
import path from 'path';

export interface AnimeCrosswalkEntry {
  AniList_id: number;
  TheTVDB_id?: number;
  TheMovieDB_id?: number;
  MAL_id?: number;
  AniDB_id?: number;
  slug?: string;
  name?: string;
}

const CROSSWALK_PATH = process.env.CONFIG_DIRECTORY
  ? `${process.env.CONFIG_DIRECTORY}/anime-crosswalk.json`
  : path.join(__dirname, '../../data/anime-crosswalk.json');

export class AnimeCrosswalk {
  private byAniList: Map<number, AnimeCrosswalkEntry> = new Map();
  private byTvdb: Map<number, AnimeCrosswalkEntry> = new Map();
  private byTmdb: Map<number, AnimeCrosswalkEntry> = new Map();
  private byMal: Map<number, AnimeCrosswalkEntry> = new Map();
  private loaded = false;

  constructor() {
    this.load();
  }

  private load(): void {
    try {
      if (!fs.existsSync(CROSSWALK_PATH)) {
        logger.warn('Anime crosswalk data not found, using empty dataset', {
          label: 'AnimeCrosswalk',
        });
        return;
      }
      const raw = fs.readFileSync(CROSSWALK_PATH, 'utf-8');
      const data: AnimeCrosswalkEntry[] = JSON.parse(raw);

      for (const entry of data) {
        if (entry.AniList_id) this.byAniList.set(entry.AniList_id, entry);
        if (entry.TheTVDB_id) this.byTvdb.set(entry.TheTVDB_id, entry);
        if (entry.TheMovieDB_id) this.byTmdb.set(entry.TheMovieDB_id, entry);
        if (entry.MAL_id) this.byMal.set(entry.MAL_id, entry);
      }

      this.loaded = true;
      logger.info(`Loaded ${data.length} anime crosswalk entries`, {
        label: 'AnimeCrosswalk',
      });
    } catch (e) {
      logger.error('Failed to load anime crosswalk data', {
        label: 'AnimeCrosswalk',
        error: e,
      });
    }
  }

  public getByAniListId(id: number): AnimeCrosswalkEntry | undefined {
    return this.byAniList.get(id);
  }

  public getByTvdbId(tvdbId: number): AnimeCrosswalkEntry | undefined {
    return this.byTvdb.get(tvdbId);
  }

  public getByTmdbId(tmdbId: number): AnimeCrosswalkEntry | undefined {
    return this.byTmdb.get(tmdbId);
  }

  public getByMalId(malId: number): AnimeCrosswalkEntry | undefined {
    return this.byMal.get(malId);
  }

  public resolveByMalId(
    malId: number
  ): { tmdbId: number; mediaType: MediaType } | null {
    const entry = this.byMal.get(malId);
    if (!entry || !entry.TheMovieDB_id) {
      return null;
    }
    return { tmdbId: entry.TheMovieDB_id, mediaType: MediaType.ANIME };
  }

  public isLoaded(): boolean {
    return this.loaded;
  }

  public get size(): number {
    return this.byAniList.size;
  }
}

let instance: AnimeCrosswalk | null = null;

export function getAnimeCrosswalk(): AnimeCrosswalk {
  if (!instance) {
    instance = new AnimeCrosswalk();
  }
  return instance;
}
