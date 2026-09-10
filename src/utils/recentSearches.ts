/**
 * Recent search terms for the search-bar dropdown (DAN-106). Low-stakes
 * and ephemeral, so plain localStorage — no backend. Most-recent-first,
 * capped, de-duplicated by trimmed exact match.
 */

const STORAGE_KEY = 'recentSearches';

export const MAX_RECENT_SEARCHES = 5;

const readStored = (): string[] => {
  if (typeof window === 'undefined') {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
};

export const getRecentSearches = (): string[] =>
  readStored().slice(0, MAX_RECENT_SEARCHES);

export const addRecentSearch = (term: string): string[] => {
  const normalized = term.trim();
  if (!normalized || typeof window === 'undefined') {
    return readStored().slice(0, MAX_RECENT_SEARCHES);
  }
  const next = [
    normalized,
    ...readStored().filter((item) => item !== normalized),
  ].slice(0, MAX_RECENT_SEARCHES);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage full or unavailable — search still works, recents just
    // don't persist.
  }
  return next;
};

export const clearRecentSearches = (): void => {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore — nothing to clear.
  }
};
