import cacheManager from '@server/lib/cache';

/**
 * Circuit-breaker flag for Jellyfin availability checks (DAN-97). Stored in
 * the shared Jellyfin NodeCache — URL-serialized response keys can never
 * collide with this fixed key. Cooldown is deliberately short: just long
 * enough to stop every card re-paying the 10s request timeout during an
 * outage, short enough that recovery is picked up quickly.
 */
export const JELLYFIN_UNREACHABLE_KEY = 'jellyfin:unreachable';
export const JELLYFIN_UNREACHABLE_TTL_SECONDS = 45;

const jellyfinCache = () => cacheManager.getCache('jellyfin').data;

export const isJellyfinUnreachable = (): boolean =>
  jellyfinCache().get<boolean>(JELLYFIN_UNREACHABLE_KEY) === true;

export const markJellyfinUnreachable = (): void => {
  jellyfinCache().set(
    JELLYFIN_UNREACHABLE_KEY,
    true,
    JELLYFIN_UNREACHABLE_TTL_SECONDS
  );
};

export const clearJellyfinUnreachable = (): void => {
  jellyfinCache().del(JELLYFIN_UNREACHABLE_KEY);
};
