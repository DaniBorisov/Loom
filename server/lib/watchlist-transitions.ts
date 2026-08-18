import { WatchlistStatus } from '@server/entity/Watchlist';

/**
 * Allowed transitions for WatchlistStatus.
 *
 * Forward: want_to_watch → watching → watched
 * Skip-ahead: want_to_watch → watched (e.g. Jellyfin sync marks as watched)
 * Backward: watched → want_to_watch, watching → want_to_watch (user un-marks)
 */
const ALLOWED_TRANSITIONS: Record<WatchlistStatus, WatchlistStatus[]> = {
  [WatchlistStatus.WANT_TO_WATCH]: [
    WatchlistStatus.WATCHING,
    WatchlistStatus.WATCHED,
  ],
  [WatchlistStatus.WATCHING]: [
    WatchlistStatus.WATCHED,
    WatchlistStatus.WANT_TO_WATCH,
  ],
  [WatchlistStatus.WATCHED]: [WatchlistStatus.WANT_TO_WATCH],
};

export class InvalidTransitionError extends Error {
  constructor(
    public from: WatchlistStatus,
    public to: WatchlistStatus
  ) {
    super(`Invalid status transition: ${from} → ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

/**
 * Returns true if `to` is a valid transition from `from`.
 */
export function isValidTransition(
  from: WatchlistStatus,
  to: WatchlistStatus
): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Validates and returns the target status, or throws InvalidTransitionError.
 */
export function transitionStatus(
  current: WatchlistStatus,
  target: WatchlistStatus
): WatchlistStatus {
  if (!isValidTransition(current, target)) {
    throw new InvalidTransitionError(current, target);
  }
  return target;
}
