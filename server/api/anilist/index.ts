import ExternalAPI from '@server/api/externalapi';
import type NodeCache from 'node-cache';

import type {
  AniListMedia,
  AniListPage,
  AniListPageInfo,
  AniListPageResult,
  AniListSearchResult,
} from '@server/api/anilist/interfaces';

const ANILIST_GRAPHQL_URL = 'https://graphql.anilist.co';
const CACHE_TTL = 300; // 5 minutes in seconds
const RATE_LIMIT_MAX_RPS = 1.5; // 90 req/min
const RATE_LIMIT_MAX_REQUESTS = 90;

const AniListMediaFragment = `
  id
  idMal
  title { romaji english }
  description(asHtml: false)
  coverImage { large medium }
  bannerImage
  genres
  averageScore
  popularity
  status
  season
  seasonYear
  format
  episodes
  nextAiringEpisode { airingAt episode }
`;

function mapMediaToResult(media: AniListMedia): AniListSearchResult {
  return {
    id: media.id,
    title: media.title.english ?? media.title.romaji,
    overview: media.description ?? '',
    posterPath: media.coverImage.large,
    backdropPath: media.bannerImage ?? '',
    genres: media.genres ?? [],
    averageScore: media.averageScore ?? 0,
    status: media.status,
    season: media.season ?? undefined,
    seasonYear: media.seasonYear ?? undefined,
    format: media.format,
    episodeCount: media.episodes ?? undefined,
    nextAiringEpisode: media.nextAiringEpisode
      ? {
          airingAt: new Date(
            media.nextAiringEpisode.airingAt * 1000
          ).toISOString(),
          episode: media.nextAiringEpisode.episode,
        }
      : undefined,
  };
}

interface AniListSearchOptions {
  query: string;
  page?: number;
  perPage?: number;
}

interface AniListMediaByIdOptions {
  id: number;
}

interface AniListSeasonalOptions {
  season: string;
  year: number;
  page?: number;
}

interface AniListTrendingOptions {
  page?: number;
}

interface AniListAiringScheduleOptions {
  mediaId: number;
}

class AniList extends ExternalAPI {
  constructor(options?: { nodeCache?: NodeCache }) {
    super(
      ANILIST_GRAPHQL_URL,
      {},
      {
        nodeCache: options?.nodeCache,
        rateLimit: {
          maxRPS: RATE_LIMIT_MAX_RPS,
          maxRequests: RATE_LIMIT_MAX_REQUESTS,
        },
      }
    );
  }

  private async query<T>(
    gqlQuery: string,
    variables?: Record<string, unknown>
  ): Promise<T> {
    const response = await this.post<{ data: T }>(
      '',
      { query: gqlQuery, variables },
      undefined,
      CACHE_TTL
    );
    return response.data;
  }

  private mapPageResults(
    media: AniListMedia[],
    pageInfo: AniListPageInfo
  ): AniListPageResult {
    return {
      results: media.map(mapMediaToResult),
      pageInfo,
    };
  }

  public async search({
    query,
    page = 1,
    perPage = 20,
  }: AniListSearchOptions): Promise<AniListPageResult> {
    const gql = `
      query ($query: String, $page: Int, $perPage: Int) {
        Page(page: $page, perPage: $perPage) {
          media(search: $query, type: ANIME) {
            ${AniListMediaFragment}
          }
          pageInfo { total perPage currentPage lastPage hasNextPage }
        }
      }
    `;

    const data = await this.query<AniListPage<AniListMedia>>(gql, {
      query,
      page,
      perPage,
    });

    return this.mapPageResults(data.Page.media, data.Page.pageInfo);
  }

  public async getMediaById({
    id,
  }: AniListMediaByIdOptions): Promise<AniListSearchResult | null> {
    const gql = `
      query ($id: Int) {
        Media(id: $id, type: ANIME) {
          ${AniListMediaFragment}
        }
      }
    `;

    type MediaResponse = { Media: AniListMedia | null };
    const data = await this.query<MediaResponse>(gql, { id });
    return data.Media ? mapMediaToResult(data.Media) : null;
  }

  public async getSeasonal({
    season,
    year,
    page = 1,
  }: AniListSeasonalOptions): Promise<AniListPageResult> {
    const gql = `
      query ($season: MediaSeason, $year: Int, $page: Int) {
        Page(page: $page, perPage: 20) {
          media(
            season: $season,
            seasonYear: $year,
            type: ANIME,
            sort: POPULARITY_DESC
          ) {
            ${AniListMediaFragment}
          }
          pageInfo { total perPage currentPage lastPage hasNextPage }
        }
      }
    `;

    const data = await this.query<AniListPage<AniListMedia>>(gql, {
      season,
      year,
      page,
    });

    return this.mapPageResults(data.Page.media, data.Page.pageInfo);
  }

  public async getTrending({
    page = 1,
  }: AniListTrendingOptions): Promise<AniListPageResult> {
    const gql = `
      query ($page: Int) {
        Page(page: $page, perPage: 20) {
          media(type: ANIME, sort: TRENDING_DESC) {
            ${AniListMediaFragment}
          }
          pageInfo { total perPage currentPage lastPage hasNextPage }
        }
      }
    `;

    const data = await this.query<AniListPage<AniListMedia>>(gql, { page });

    return this.mapPageResults(data.Page.media, data.Page.pageInfo);
  }

  public async getAiringSchedule({
    mediaId,
  }: AniListAiringScheduleOptions): Promise<{
    airingAt: string;
    episode: number;
  } | null> {
    const result = await this.getMediaById({ id: mediaId });
    return result?.nextAiringEpisode ?? null;
  }

  public async resolveByTitle(title: string): Promise<{
    anilistId: number;
    tmdbId: number | null;
    malId: number | null;
  } | null> {
    const gql = `
      query ($query: String) {
        Page(page: 1, perPage: 5) {
          media(search: $query, type: ANIME) {
            id
            idMal
            externalLinks {
              site
              url
            }
          }
        }
      }
    `;

    type ExternalLink = { site: string; url: string | null };
    type MediaResult = {
      id: number;
      idMal: number | null;
      externalLinks: ExternalLink[] | null;
    };
    type Response = { Page: { media: MediaResult[] } };

    const data = await this.query<Response>(gql, { query: title });
    const media = data.Page.media;

    if (!media || media.length === 0) {
      return null;
    }

    // Try to find the best match: prefer exact idMal match, otherwise first result
    let best = media[0];
    for (const m of media) {
      if (m.idMal) {
        best = m;
        break;
      }
    }

    // Extract TMDB ID from externalLinks
    let tmdbId: number | null = null;
    if (best.externalLinks) {
      const tmdbLink = best.externalLinks.find(
        (link) => link.site === 'TheMovieDB'
      );
      if (tmdbLink?.url) {
        // URL format: https://www.themoviedb.org/tv/12345 or /movie/12345
        const match = tmdbLink.url.match(/\/(?:tv|movie)\/(\d+)/);
        if (match) {
          tmdbId = Number(match[1]);
        }
      }
    }

    return {
      anilistId: best.id,
      tmdbId,
      malId: best.idMal,
    };
  }
}

export { mapMediaToResult };
export default AniList;
