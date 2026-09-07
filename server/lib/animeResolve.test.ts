import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveAnilistIdToTmdbId } from '@server/lib/animeResolve';

describe('resolveAnilistIdToTmdbId (DAN-103)', () => {
  it('resolves mapped AniList IDs via the crosswalk', () => {
    // Steins;Gate and Bleach — Bleach's AniList ID (269) collides with an
    // unrelated TMDB ID (One Tree Hill), so resolving is load-bearing.
    assert.strictEqual(resolveAnilistIdToTmdbId(9253), 42509);
    assert.strictEqual(resolveAnilistIdToTmdbId(269), 30984);
  });

  it('returns undefined for unmapped IDs', () => {
    assert.strictEqual(resolveAnilistIdToTmdbId(999999999), undefined);
  });

  it('returns undefined for non-finite input', () => {
    assert.strictEqual(resolveAnilistIdToTmdbId(NaN), undefined);
  });
});
