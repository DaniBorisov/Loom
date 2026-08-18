import AniList from '@server/api/anilist';
import type { AniListSearchResult } from '@server/api/anilist/interfaces';
import TheMovieDb from '@server/api/themoviedb';
import type { TmdbSearchMultiResponse } from '@server/api/themoviedb/interfaces';
import { MediaType } from '@server/constants/media';
import Media from '@server/entity/Media';
import { findSearchProvider } from '@server/lib/search';
import logger from '@server/logger';
import { mapAniListResult, mapSearchResults } from '@server/models/Search';
import { Router } from 'express';

const searchRoutes = Router();

searchRoutes.get('/', async (req, res, next) => {
  const queryString = req.query.query as string;
  const page = Number(req.query.page) || 1;
  const searchProvider = findSearchProvider(queryString.toLowerCase());

  try {
    let tmdbResults: TmdbSearchMultiResponse | null = null;
    let anilistResults: AniListSearchResult[] = [];

    if (searchProvider) {
      // Specific ID search — TMDB only
      const [id] = queryString
        .toLowerCase()
        .match(searchProvider.pattern) as RegExpMatchArray;
      tmdbResults = await searchProvider.search({
        id,
        language: (req.query.language as string) ?? req.locale,
        query: queryString,
      });
    } else {
      // Parallel search: TMDB + AniList
      const tmdb = new TheMovieDb();
      const anilist = new AniList();
      const language = (req.query.language as string) ?? req.locale;

      const [tmdbResponse, anilistResponse] = await Promise.allSettled([
        tmdb.searchMulti({ query: queryString, page, language }),
        anilist.search({ query: queryString, page, perPage: 10 }),
      ]);

      if (tmdbResponse.status === 'fulfilled') {
        tmdbResults = tmdbResponse.value;
      }

      if (anilistResponse.status === 'fulfilled' && anilistResponse.value) {
        anilistResults = anilistResponse.value.results;
      }
    }

    // Map TMDB results
    const mappedTmdb = tmdbResults ? mapSearchResults(tmdbResults.results) : [];

    // Map AniList results
    const mappedAnilist = anilistResults.map((r) => mapAniListResult(r));

    // Deduplicate: if an AniList result has a TMDB ID that appears in TMDB results, drop it
    const tmdbIds = new Set(
      mappedTmdb
        .filter((r) => 'mediaType' in r && r.mediaType !== 'person')
        .map((r) => r.id)
    );
    const dedupedAnilist = mappedAnilist.filter(
      (r) => !tmdbIds.has(r.sourceId)
    );

    // Merge
    const allResults = [...mappedTmdb, ...dedupedAnilist];

    // Fetch local media state for all results
    const mediaItems = await Media.getRelatedMedia(
      req.user,
      allResults
        .filter((r) => 'mediaType' in r && r.mediaType !== 'person')
        .map((r) => ({
          tmdbId: r.source === 'tmdb' ? r.id : (r.sourceId ?? r.id),
          mediaType:
            r.mediaType === 'anime'
              ? MediaType.ANIME
              : (r.mediaType as MediaType),
        }))
    );

    // Attach mediaInfo
    const resultsWithMedia = allResults.map((result) => {
      if (result.mediaType === 'person' || result.mediaType === 'collection') {
        return result;
      }
      const media = mediaItems.find(
        (m) =>
          m.tmdbId ===
            (result.source === 'tmdb' ? result.id : result.sourceId) ||
          m.tmdbId === result.id
      );
      return { ...result, mediaInfo: media };
    });

    // Calculate pagination
    const tmdbTotalPages = tmdbResults?.total_pages ?? 1;
    const tmdbTotalResults = tmdbResults?.total_results ?? 0;
    const anilistTotal = anilistResults.length;
    const totalResults = tmdbTotalResults + anilistTotal;

    return res.status(200).json({
      page,
      totalPages: tmdbTotalPages,
      totalResults,
      results: resultsWithMedia,
    });
  } catch (e) {
    logger.debug('Something went wrong retrieving search results', {
      label: 'API',
      errorMessage: e.message,
      query: req.query.query,
    });
    return next({
      status: 500,
      message: 'Unable to retrieve search results.',
    });
  }
});

searchRoutes.get('/keyword', async (req, res, next) => {
  const tmdb = new TheMovieDb();

  try {
    const results = await tmdb.searchKeyword({
      query: req.query.query as string,
      page: Number(req.query.page),
    });

    return res.status(200).json(results);
  } catch (e) {
    logger.debug('Something went wrong retrieving keyword search results', {
      label: 'API',
      errorMessage: e.message,
      query: req.query.query,
    });
    return next({
      status: 500,
      message: 'Unable to retrieve keyword search results.',
    });
  }
});

searchRoutes.get('/company', async (req, res, next) => {
  const tmdb = new TheMovieDb();

  try {
    const results = await tmdb.searchCompany({
      query: req.query.query as string,
      page: Number(req.query.page),
    });

    return res.status(200).json(results);
  } catch (e) {
    logger.debug('Something went wrong retrieving company search results', {
      label: 'API',
      errorMessage: e.message,
      query: req.query.query,
    });
    return next({
      status: 500,
      message: 'Unable to retrieve company search results.',
    });
  }
});

export default searchRoutes;
