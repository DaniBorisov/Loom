import {
  MAX_RECENT_SEARCHES,
  addRecentSearch,
  clearRecentSearches,
  getRecentSearches,
} from '@app/utils/recentSearches';
import { beforeEach, describe, expect, it } from 'vitest';

beforeEach(() => {
  window.localStorage.clear();
});

describe('recentSearches (DAN-106)', () => {
  it('returns an empty list when nothing is stored', () => {
    expect(getRecentSearches()).toEqual([]);
  });

  it('stores terms most-recent-first', () => {
    addRecentSearch('movies');
    addRecentSearch('anime');
    expect(getRecentSearches()).toEqual(['anime', 'movies']);
  });

  it('moves repeats to the front instead of duplicating', () => {
    addRecentSearch('movies');
    addRecentSearch('anime');
    addRecentSearch('movies');
    expect(getRecentSearches()).toEqual(['movies', 'anime']);
  });

  it('trims terms and ignores blanks', () => {
    addRecentSearch('  movies  ');
    addRecentSearch('   ');
    expect(getRecentSearches()).toEqual(['movies']);
  });

  it(`caps the list at ${MAX_RECENT_SEARCHES}, dropping the oldest`, () => {
    for (let i = 1; i <= MAX_RECENT_SEARCHES + 2; i++) {
      addRecentSearch(`search ${i}`);
    }
    const recents = getRecentSearches();
    expect(recents).toHaveLength(MAX_RECENT_SEARCHES);
    expect(recents[0]).toBe(`search ${MAX_RECENT_SEARCHES + 2}`);
    expect(recents).not.toContain('search 1');
    expect(recents).not.toContain('search 2');
  });

  it('clears the list', () => {
    addRecentSearch('movies');
    clearRecentSearches();
    expect(getRecentSearches()).toEqual([]);
  });

  it('survives corrupt stored JSON', () => {
    window.localStorage.setItem('recentSearches', 'not-json{{{');
    expect(getRecentSearches()).toEqual([]);
    // And recovers on the next write.
    addRecentSearch('movies');
    expect(getRecentSearches()).toEqual(['movies']);
  });

  it('ignores non-string entries', () => {
    window.localStorage.setItem(
      'recentSearches',
      JSON.stringify(['movies', 42, null, 'anime'])
    );
    expect(getRecentSearches()).toEqual(['movies', 'anime']);
  });
});
