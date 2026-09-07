import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { AniListSearchResult } from '@server/api/anilist/interfaces';
import { mapAniListResult } from '@server/models/Search';

function fixture(id: number): AniListSearchResult {
  return {
    id,
    title: `Title ${id}`,
    overview: 'Overview',
    posterPath: '/poster.jpg',
    backdropPath: '/backdrop.jpg',
    genres: ['Action'],
    averageScore: 80,
    status: 'FINISHED',
    format: 'TV',
  };
}

describe('mapAniListResult (DAN-103)', () => {
  it('sets id to the resolved TMDB ID and keeps sourceId as AniList ID', () => {
    const mapped = mapAniListResult(fixture(269));

    assert.ok(mapped);
    assert.strictEqual(mapped.id, 30984);
    assert.strictEqual(mapped.sourceId, 269);
    assert.strictEqual(mapped.source, 'anilist');
    assert.strictEqual(mapped.mediaType, 'anime');
  });

  it('returns null for unmapped AniList IDs', () => {
    assert.strictEqual(mapAniListResult(fixture(999999999)), null);
  });
});
