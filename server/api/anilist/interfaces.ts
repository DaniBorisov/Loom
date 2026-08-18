export interface AniListGraphQLResponse<T> {
  data: T;
}

export interface AniListPageInfo {
  total: number;
  perPage: number;
  currentPage: number;
  lastPage: number;
  hasNextPage: boolean;
}

export interface AniListPage<T> {
  Page: {
    media: T[];
    pageInfo: AniListPageInfo;
  };
}

export interface AniListMedia {
  id: number;
  idMal?: number;
  title: { romaji: string; english: string | null };
  description: string | null;
  coverImage: { large: string; medium: string };
  bannerImage: string | null;
  genres: string[];
  averageScore: number | null;
  popularity: number;
  status: string;
  season: string | null;
  seasonYear: number | null;
  format: string;
  episodes: number | null;
  nextAiringEpisode: { airingAt: number; episode: number } | null;
}

export interface AniListSearchResult {
  id: number;
  title: string;
  overview: string;
  posterPath: string;
  backdropPath: string;
  genres: string[];
  averageScore: number;
  status: string;
  season?: string;
  seasonYear?: number;
  format: string;
  episodeCount?: number;
  nextAiringEpisode?: { airingAt: string; episode: number };
}

export interface AniListPageResult {
  results: AniListSearchResult[];
  pageInfo: AniListPageInfo;
}
