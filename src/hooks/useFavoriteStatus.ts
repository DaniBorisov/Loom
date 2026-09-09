import axios from 'axios';
import useSWR from 'swr';

export type FavoriteStatusSource = 'tmdb' | 'anilist' | 'tvdb';

export interface FavoriteStatusResult {
  isFavorited: boolean;
  favoriteId: number | null;
}

export const favoriteStatusKey = (
  mediaId: number,
  source: FavoriteStatusSource
): string => `${source}:${mediaId}`;

/**
 * Single-item favorite check as SWR (DAN-99 step 3). The 60s deduping
 * interval means the same item rendered twice on a page only fetches once.
 * List parents should prefer `useFavoriteStatusBatch` below instead.
 */
export const useFavoriteStatus = (
  mediaId?: number,
  source: FavoriteStatusSource = 'tmdb'
) => {
  const url = mediaId
    ? `/api/v1/favorites/check?mediaId=${mediaId}&source=${source}`
    : null;

  return useSWR<FavoriteStatusResult>(url, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 60000,
  });
};

export interface FavoriteStatusBatchItem {
  mediaId: number;
  source: FavoriteStatusSource;
}

interface FavoriteStatusBatchResponse {
  results: Record<string, FavoriteStatusResult>;
}

export const MAX_FAVORITE_BATCH_ITEMS = 100;

/**
 * Batched variant (DAN-99): one POST for N cards instead of N per-card
 * requests. List parents call this once with all visible items and pass the
 * individual results down to TitleCard via `favoriteStatus`.
 */
export const useFavoriteStatusBatch = (items?: FavoriteStatusBatchItem[]) => {
  const sorted = (items ?? [])
    .filter((item) => Number.isFinite(item.mediaId))
    .sort((a, b) => a.mediaId - b.mediaId || (a.source < b.source ? -1 : 1))
    .slice(0, MAX_FAVORITE_BATCH_ITEMS);
  const key = sorted.length
    ? `/api/v1/favorites/check-batch:${JSON.stringify(sorted)}`
    : null;

  return useSWR<FavoriteStatusBatchResponse>(
    key,
    async () => {
      const { data } = await axios.post<FavoriteStatusBatchResponse>(
        '/api/v1/favorites/check-batch',
        { items: sorted }
      );
      return data;
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 60000,
    }
  );
};
