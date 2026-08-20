import { AnimeCrosswalk } from '@server/api/anilist/crosswalk';
import { MediaType } from '@server/constants/media';
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

describe('AnimeCrosswalk', () => {
  let crosswalk: AnimeCrosswalk;

  before(() => {
    crosswalk = new AnimeCrosswalk();
  });

  it('loads the bundled crosswalk data', () => {
    assert.ok(crosswalk.isLoaded(), 'crosswalk should be loaded');
  });

  it('has a realistic entry count (>1000)', () => {
    assert.ok(crosswalk.size > 1000, `expected >1000, got ${crosswalk.size}`);
  });

  it('looks up by AniList ID (Steins;Gate)', () => {
    const entry = crosswalk.getByAniListId(9253);
    assert.ok(entry);
    assert.equal(entry.TheTVDB_id, 244061);
    assert.equal(entry.TheMovieDB_id, 42509);
    assert.equal(entry.MAL_id, 9253);
    assert.equal(entry.AniDB_id, 7729);
  });

  it('looks up by TVDB ID (Death Note)', () => {
    const entry = crosswalk.getByTvdbId(79481);
    assert.ok(entry);
    assert.equal(entry.AniList_id, 1535);
    assert.equal(entry.MAL_id, 1535);
  });

  it('looks up by TMDB ID (Death Note)', () => {
    const entry = crosswalk.getByTmdbId(13916);
    assert.ok(entry);
    assert.equal(entry.AniList_id, 1535);
    assert.equal(entry.MAL_id, 1535);
  });

  it('looks up by MAL ID (Sword Art Online)', () => {
    const entry = crosswalk.getByMalId(1575);
    assert.ok(entry);
    assert.equal(entry.AniList_id, 1575);
    assert.equal(entry.TheTVDB_id, 79525);
    assert.equal(entry.TheMovieDB_id, 31724);
  });

  it('returns undefined for missing AniList ID', () => {
    const entry = crosswalk.getByAniListId(9999999);
    assert.equal(entry, undefined);
  });

  it('returns undefined for missing TVDB ID', () => {
    const entry = crosswalk.getByTvdbId(9999999);
    assert.equal(entry, undefined);
  });

  it('returns undefined for missing TMDB ID', () => {
    const entry = crosswalk.getByTmdbId(9999999);
    assert.equal(entry, undefined);
  });

  it('returns undefined for missing MAL ID', () => {
    const entry = crosswalk.getByMalId(9999999);
    assert.equal(entry, undefined);
  });

  it('handles entry with no TMDB id', () => {
    const entry = crosswalk.getByAniListId(403);
    assert.ok(entry);
    assert.equal(entry.TheMovieDB_id, undefined);
    assert.equal(entry.TheTVDB_id, 80654);
  });

  it('reload() re-reads data from disk and preserves entries', () => {
    const sizeBefore = crosswalk.size;
    crosswalk.reload();
    assert.ok(crosswalk.isLoaded(), 'crosswalk should be loaded after reload');
    assert.equal(crosswalk.size, sizeBefore, 'size should be same after reload');
    const entry = crosswalk.getByAniListId(9253);
    assert.ok(entry, 'entry should still be findable after reload');
  });
});

describe('AnimeCrosswalk.resolveByMalId', () => {
  let crosswalk: AnimeCrosswalk;

  before(() => {
    crosswalk = new AnimeCrosswalk();
  });

  it('resolves MAL ID to TMDB ID with ANIME media type', () => {
    const result = crosswalk.resolveByMalId(9253);
    assert.ok(result);
    assert.equal(result.tmdbId, 42509);
    assert.equal(result.mediaType, MediaType.ANIME);
  });

  it('resolves MAL ID 40748 (Jujutsu Kaisen)', () => {
    const result = crosswalk.resolveByMalId(40748);
    assert.ok(result);
    assert.equal(result.tmdbId, 95479);
    assert.equal(result.mediaType, MediaType.ANIME);
  });

  it('returns null for missing MAL ID', () => {
    const result = crosswalk.resolveByMalId(9999999);
    assert.equal(result, null);
  });

  it('returns null when MAL ID exists but has no TMDB ID', () => {
    const result = crosswalk.resolveByMalId(403);
    assert.equal(result, null);
  });
});
