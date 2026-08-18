import { AnimeCrosswalk } from '@server/api/anilist/crosswalk';
import { MediaType } from '@server/constants/media';
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

describe('AnimeCrosswalk', () => {
  let crosswalk: AnimeCrosswalk;

  before(() => {
    crosswalk = new AnimeCrosswalk();
  });

  it('loads the bundled seed data', () => {
    assert.ok(crosswalk.isLoaded(), 'crosswalk should be loaded');
  });

  it('returns correct size', () => {
    assert.equal(crosswalk.size, 10);
  });

  it('looks up by AniList ID', () => {
    const entry = crosswalk.getByAniListId(21);
    assert.ok(entry);
    assert.equal(entry.name, 'Steins;Gate');
    assert.equal(entry.TheTVDB_id, 303113);
    assert.equal(entry.TheMovieDB_id, 1429);
    assert.equal(entry.MAL_id, 5114);
  });

  it('looks up by TVDB ID', () => {
    const entry = crosswalk.getByTvdbId(249834);
    assert.ok(entry);
    assert.equal(entry.AniList_id, 1535);
    assert.equal(entry.name, 'Death Note');
  });

  it('looks up by TMDB ID', () => {
    const entry = crosswalk.getByTmdbId(635610);
    assert.ok(entry);
    assert.equal(entry.AniList_id, 101922);
    assert.equal(entry.name, 'Jujutsu Kaisen');
  });

  it('looks up by MAL ID', () => {
    const entry = crosswalk.getByMalId(1575);
    assert.ok(entry);
    assert.equal(entry.AniList_id, 11757);
    assert.equal(entry.name, 'Sword Art Online');
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

  it('handles entry with no TMDB id (Haikyuu!!)', () => {
    const entry = crosswalk.getByAniListId(11061);
    assert.ok(entry);
    assert.equal(entry.TheMovieDB_id, undefined);
    assert.equal(entry.TheTVDB_id, 279133);
  });
});

describe('AnimeCrosswalk.resolveByMalId', () => {
  let crosswalk: AnimeCrosswalk;

  before(() => {
    crosswalk = new AnimeCrosswalk();
  });

  it('resolves MAL ID to TMDB ID with ANIME media type', () => {
    const result = crosswalk.resolveByMalId(5114);
    assert.ok(result);
    assert.equal(result.tmdbId, 1429);
    assert.equal(result.mediaType, MediaType.ANIME);
  });

  it('resolves MAL ID 40748 (Jujutsu Kaisen)', () => {
    const result = crosswalk.resolveByMalId(40748);
    assert.ok(result);
    assert.equal(result.tmdbId, 635610);
    assert.equal(result.mediaType, MediaType.ANIME);
  });

  it('returns null for missing MAL ID', () => {
    const result = crosswalk.resolveByMalId(9999999);
    assert.equal(result, null);
  });

  it('returns null when MAL ID exists but has no TMDB ID (Haikyuu!!)', () => {
    const result = crosswalk.resolveByMalId(11737);
    assert.equal(result, null);
  });
});
