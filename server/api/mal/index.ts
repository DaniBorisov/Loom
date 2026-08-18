import type { User } from '@server/entity/User';
import { ensureValidMalToken } from '@server/lib/mal-auth';
import logger from '@server/logger';
import axios from 'axios';

const MAL_API_BASE = 'https://api.myanimelist.net/v2';

export interface MalAnimeEntry {
  node: {
    id: number;
    title: string;
    main_picture?: {
      medium: string;
      large: string;
    };
  };
  list_status: {
    status: 'watching' | 'completed' | 'on_hold' | 'dropped' | 'plan_to_watch';
    score: number;
    num_episodes_watched: number;
    is_rewatching: boolean;
  };
}

export interface MalAnimeListResponse {
  data: MalAnimeEntry[];
  paging?: {
    next?: string;
  };
}

export class MalApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MalApiError';
  }
}

export class MyAnimeList {
  private clientId: string;

  constructor() {
    this.clientId = process.env.MAL_CLIENT_ID || '';
    if (!this.clientId) {
      logger.warn('MAL_CLIENT_ID not configured', { label: 'MALApi' });
    }
  }

  /**
   * Fetch the user's complete anime list from MAL.
   * Handles pagination automatically, collecting all entries.
   */
  async getAnimeList(user: User): Promise<MalAnimeEntry[]> {
    if (!this.clientId) {
      throw new MalApiError('MAL client ID not configured.');
    }

    const accessToken = await ensureValidMalToken(user, this.clientId);
    const allEntries: MalAnimeEntry[] = [];
    let offset = 0;
    const limit = 100;

    while (true) {
      try {
        const response = await axios.get<MalAnimeListResponse>(
          `${MAL_API_BASE}/users/@me/animelist`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
            params: {
              fields: 'list_status,num_episodes,title,main_picture',
              limit,
              offset,
            },
          }
        );

        const { data } = response.data;
        if (!data || data.length === 0) break;

        allEntries.push(...data);

        // Check if there are more pages
        if (response.data.paging?.next) {
          offset += limit;
        } else {
          break;
        }
      } catch (e: unknown) {
        if (axios.isAxiosError(e) && e.response?.status === 401) {
          throw new MalApiError(
            'MAL access token expired or revoked. Please reconnect your MAL account.'
          );
        }
        const msg =
          e instanceof Error ? e.message : 'Unknown error fetching MAL list';
        throw new MalApiError(`Failed to fetch MAL anime list: ${msg}`);
      }
    }

    logger.info(`Fetched ${allEntries.length} entries from MAL list`, {
      label: 'MALApi',
      userId: user.id,
    });

    return allEntries;
  }
}
