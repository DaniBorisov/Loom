import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type {
  TmdbMovieDetails,
  TmdbTvDetails,
} from '@server/api/themoviedb/interfaces';
import { mapMovieDetails } from '@server/models/Movie';
import { mapTvDetails } from '@server/models/Tv';

// Mirrors tv/100565: upstream omits credits/keywords/external_ids, which
// used to throw inside the mappers and 500 the detail route.
function sparseTvShow() {
  return {
    id: 100565,
    name: 'Sparse Show',
    overview: 'Overview',
  } as unknown as TmdbTvDetails;
}

function sparseMovie() {
  return {
    id: 200,
    title: 'Sparse Movie',
    overview: 'Overview',
  } as unknown as TmdbMovieDetails;
}

describe('detail mappers with sparse upstream data', () => {
  it('maps a show without credits/keywords/external_ids', () => {
    const details = mapTvDetails(sparseTvShow());
    assert.deepStrictEqual(details.credits.cast, []);
    assert.deepStrictEqual(details.credits.crew, []);
    assert.deepStrictEqual(details.keywords, []);
  });

  it('maps a movie without credits/keywords/external_ids', () => {
    const details = mapMovieDetails(sparseMovie());
    assert.deepStrictEqual(details.credits.cast, []);
    assert.deepStrictEqual(details.credits.crew, []);
    assert.deepStrictEqual(details.keywords, []);
  });
});
