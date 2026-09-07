import { getAnimeCrosswalk } from '@server/api/anilist/crosswalk';

/**
 * Resolve an AniList ID to its TMDB ID via the in-memory crosswalk (DAN-103).
 *
 * Crosswalk-only by design: discover/search endpoints run on every page
 * load, so live fallback searches (AniList/TMDB lookups per unmapped item)
 * are deliberately NOT attempted here — they would turn every Discover
 * render into N extra upstream requests. See `server/lib/mal-import.ts`
 * for the full chain with live fallbacks used by one-time MAL imports.
 *
 * Returns `undefined` when unmapped — callers must omit such items (or
 * otherwise avoid routing on the raw AniList ID) rather than treating an
 * AniList ID as a TMDB ID, since the two ID spaces are unrelated.
 */
export const resolveAnilistIdToTmdbId = (
  anilistId: number
): number | undefined => {
  if (!Number.isFinite(anilistId)) {
    return undefined;
  }
  return getAnimeCrosswalk().getByAniListId(anilistId)?.TheMovieDB_id;
};
