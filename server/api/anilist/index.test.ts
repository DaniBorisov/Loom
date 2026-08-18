import NodeCache from 'node-cache';
import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

import type { AxiosInstance } from 'axios';

import AniList, { mapMediaToResult } from '@server/api/anilist';
import type { AniListMedia } from '@server/api/anilist/interfaces';

const SAMPLE_MEDIA: AniListMedia = {
  id: 101,
  idMal: 1010,
  title: { romaji: 'Steins;Gate', english: 'Steins;Gate' },
  description: 'A story about time travel.',
  coverImage: {
    large:
      'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx101-7C776K.jpg',
    medium:
      'https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx101-7C776K.jpg',
  },
  bannerImage:
    'https://s4.anilist.co/file/anilistcdn/media/anime/banner/101.jpg',
  genres: ['Sci-Fi', 'Thriller'],
  averageScore: 90,
  popularity: 5000,
  status: 'FINISHED',
  season: 'SPRING',
  seasonYear: 2011,
  format: 'TV',
  episodes: 24,
  nextAiringEpisode: null,
};

const SAMPLE_MEDIA_AIRING: AniListMedia = {
  ...SAMPLE_MEDIA,
  id: 202,
  title: { romaji: 'Shingeki no Kyojin', english: 'Attack on Titan' },
  episodes: null,
  nextAiringEpisode: { airingAt: 1700000000, episode: 15 },
};

function buildAniList(): AniList {
  return new AniList({ nodeCache: new NodeCache({ stdTTL: 0 }) });
}

function getAxios(anilist: AniList): AxiosInstance {
  return (anilist as unknown as { axios: AxiosInstance }).axios;
}

describe('AniList mapMediaToResult', () => {
  it('maps AniListMedia to AniListSearchResult', () => {
    const result = mapMediaToResult(SAMPLE_MEDIA);

    assert.equal(result.id, 101);
    assert.equal(result.title, 'Steins;Gate');
    assert.equal(result.overview, 'A story about time travel.');
    assert.equal(result.posterPath, SAMPLE_MEDIA.coverImage.large);
    assert.equal(result.backdropPath, SAMPLE_MEDIA.bannerImage);
    assert.deepEqual(result.genres, ['Sci-Fi', 'Thriller']);
    assert.equal(result.averageScore, 90);
    assert.equal(result.status, 'FINISHED');
    assert.equal(result.season, 'SPRING');
    assert.equal(result.seasonYear, 2011);
    assert.equal(result.format, 'TV');
    assert.equal(result.episodeCount, 24);
    assert.equal(result.nextAiringEpisode, undefined);
  });

  it('uses romaji title when english is null', () => {
    const media: AniListMedia = {
      ...SAMPLE_MEDIA,
      title: { romaji: 'Steins;Gate', english: null },
    };
    const result = mapMediaToResult(media);
    assert.equal(result.title, 'Steins;Gate');
  });

  it('maps nextAiringEpisode with ISO date string', () => {
    const result = mapMediaToResult(SAMPLE_MEDIA_AIRING);

    assert.deepEqual(result.nextAiringEpisode, {
      airingAt: new Date(1700000000 * 1000).toISOString(),
      episode: 15,
    });
  });

  it('handles null optional fields gracefully', () => {
    const minimalMedia: AniListMedia = {
      ...SAMPLE_MEDIA,
      description: null,
      bannerImage: null,
      averageScore: null,
      season: null,
      seasonYear: null,
      episodes: null,
      nextAiringEpisode: null,
    };
    const result = mapMediaToResult(minimalMedia);

    assert.equal(result.overview, '');
    assert.equal(result.backdropPath, '');
    assert.equal(result.averageScore, 0);
    assert.equal(result.season, undefined);
    assert.equal(result.seasonYear, undefined);
    assert.equal(result.episodeCount, undefined);
    assert.equal(result.nextAiringEpisode, undefined);
  });
});

describe('AniList search', () => {
  afterEach(() => mock.restoreAll());

  it('returns mapped search results', async () => {
    const anilist = buildAniList();
    const post = mock.method(getAxios(anilist), 'post', async () => ({
      data: {
        data: {
          Page: {
            media: [SAMPLE_MEDIA],
            pageInfo: {
              total: 1,
              perPage: 20,
              currentPage: 1,
              lastPage: 1,
              hasNextPage: false,
            },
          },
        },
      },
    }));

    const result = await anilist.search({ query: 'Steins;Gate' });

    assert.equal(post.mock.callCount(), 1);
    assert.equal(result.results.length, 1);
    assert.equal(result.results[0].id, 101);
    assert.equal(result.pageInfo.total, 1);
  });

  it('passes page and perPage variables', async () => {
    const anilist = buildAniList();
    const post = mock.method(getAxios(anilist), 'post', async () => ({
      data: {
        data: {
          Page: {
            media: [],
            pageInfo: {
              total: 0,
              perPage: 10,
              currentPage: 2,
              lastPage: 5,
              hasNextPage: true,
            },
          },
        },
      },
    }));

    const result = await anilist.search({
      query: 'test',
      page: 2,
      perPage: 10,
    });

    assert.equal(post.mock.callCount(), 1);
    const callArgs = post.mock.calls[0].arguments as [
      string,
      { query: string; variables: Record<string, unknown> },
    ];
    assert.deepEqual(callArgs[1].variables, {
      query: 'test',
      page: 2,
      perPage: 10,
    });
    assert.equal(result.pageInfo.currentPage, 2);
  });
});

describe('AniList getMediaById', () => {
  afterEach(() => mock.restoreAll());

  it('returns a mapped result for a valid id', async () => {
    const anilist = buildAniList();
    mock.method(getAxios(anilist), 'post', async () => ({
      data: {
        data: {
          Media: SAMPLE_MEDIA,
        },
      },
    }));

    const result = await anilist.getMediaById({ id: 101 });

    assert.equal(result?.id, 101);
    assert.equal(result?.title, 'Steins;Gate');
  });

  it('returns null when media is not found', async () => {
    const anilist = buildAniList();
    mock.method(getAxios(anilist), 'post', async () => ({
      data: {
        data: {
          Media: null,
        },
      },
    }));

    const result = await anilist.getMediaById({ id: 99999 });

    assert.equal(result, null);
  });
});

describe('AniList getSeasonal', () => {
  afterEach(() => mock.restoreAll());

  it('passes correct season and year variables', async () => {
    const anilist = buildAniList();
    const post = mock.method(getAxios(anilist), 'post', async () => ({
      data: {
        data: {
          Page: {
            media: [SAMPLE_MEDIA],
            pageInfo: {
              total: 1,
              perPage: 20,
              currentPage: 1,
              lastPage: 1,
              hasNextPage: false,
            },
          },
        },
      },
    }));

    const result = await anilist.getSeasonal({
      season: 'SPRING',
      year: 2024,
    });

    assert.equal(post.mock.callCount(), 1);
    const callArgs = post.mock.calls[0].arguments as [
      string,
      { query: string; variables: Record<string, unknown> },
    ];
    assert.deepEqual(callArgs[1].variables, {
      season: 'SPRING',
      year: 2024,
      page: 1,
    });
    assert.equal(result.results.length, 1);
  });
});

describe('AniList getTrending', () => {
  afterEach(() => mock.restoreAll());

  it('uses TRENDING_DESC sort', async () => {
    const anilist = buildAniList();
    const post = mock.method(getAxios(anilist), 'post', async () => ({
      data: {
        data: {
          Page: {
            media: [SAMPLE_MEDIA],
            pageInfo: {
              total: 1,
              perPage: 20,
              currentPage: 1,
              lastPage: 1,
              hasNextPage: false,
            },
          },
        },
      },
    }));

    const result = await anilist.getTrending({ page: 1 });

    assert.equal(post.mock.callCount(), 1);
    const callArgs = post.mock.calls[0].arguments as [
      string,
      { query: string; variables: Record<string, unknown> },
    ];
    const query: string = callArgs[1].query;
    assert.ok(
      query.includes('TRENDING_DESC'),
      'Query should include TRENDING_DESC sort'
    );
    assert.equal(result.results.length, 1);
  });
});

describe('AniList getAiringSchedule', () => {
  afterEach(() => mock.restoreAll());

  it('returns nextAiringEpisode from media', async () => {
    const anilist = buildAniList();
    mock.method(getAxios(anilist), 'post', async () => ({
      data: {
        data: {
          Media: SAMPLE_MEDIA_AIRING,
        },
      },
    }));

    const result = await anilist.getAiringSchedule({ mediaId: 202 });

    assert.deepEqual(result, {
      airingAt: new Date(1700000000 * 1000).toISOString(),
      episode: 15,
    });
  });

  it('returns null when no nextAiringEpisode', async () => {
    const anilist = buildAniList();
    mock.method(getAxios(anilist), 'post', async () => ({
      data: {
        data: {
          Media: SAMPLE_MEDIA,
        },
      },
    }));

    const result = await anilist.getAiringSchedule({ mediaId: 101 });

    assert.equal(result, null);
  });

  it('returns null when media is not found', async () => {
    const anilist = buildAniList();
    mock.method(getAxios(anilist), 'post', async () => ({
      data: {
        data: {
          Media: null,
        },
      },
    }));

    const result = await anilist.getAiringSchedule({ mediaId: 99999 });

    assert.equal(result, null);
  });
});
