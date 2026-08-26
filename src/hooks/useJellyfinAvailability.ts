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
