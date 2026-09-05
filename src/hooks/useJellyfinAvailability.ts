import axios from 'axios';
import useSWR from 'swr';

interface JellyfinAvailabilityResponse {
  available: boolean;
}

export const useJellyfinAvailability = (
  tmdbId?: number,
  type?: 'movie' | 'tv' | 'anime'
) => {
  const mappedType = type === 'anime' ? 'tv' : type;
  const url = tmdbId
    ? `/api/v1/media/jellyfin-check/${tmdbId}?type=${mappedType ?? 'movie'}`
    : null;

  return useSWR<JellyfinAvailabilityResponse>(url, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 60000,
  });
};

export interface AvailabilityBatchItem {
  tmdbId: number;
  type: 'movie' | 'tv' | 'anime';
}

interface JellyfinAvailabilityBatchResponse {
  results: Record<string, boolean>;
}

export const availabilityResultKey = (
  tmdbId: number,
  type: 'movie' | 'tv' | 'anime'
): string => `${type}:${tmdbId}`;

/**
 * Batched variant (DAN-98): one POST for N cards instead of N per-card
 * requests. List parents call this once with all visible items and pass the
 * individual results down to TmdbTitleCard via `libraryAvailable`.
 */
export const useJellyfinAvailabilityBatch = (
  items?: AvailabilityBatchItem[]
) => {
  const sorted = (items ?? [])
    .filter((item) => Number.isFinite(item.tmdbId))
    .sort(
      (a, b) => a.tmdbId - b.tmdbId || (a.type < b.type ? -1 : 1)
    );
  const key = sorted.length
    ? `/api/v1/media/jellyfin-check-batch:${JSON.stringify(sorted)}`
    : null;

  return useSWR<JellyfinAvailabilityBatchResponse>(
    key,
    async () => {
      const { data } = await axios.post<JellyfinAvailabilityBatchResponse>(
        '/api/v1/media/jellyfin-check-batch',
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
