import { WatchlistStatus } from '@server/entity/Watchlist';

/**
 * All transitions are allowed between any valid statuses.
 * Users can freely move items between want_to_watch, watching, and watched.
 */
const ALL_STATUSES = Object.values(WatchlistStatus);

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
 * All status-to-status transitions are allowed.
 */
export function isValidTransition(
  from: WatchlistStatus,
  to: WatchlistStatus
): boolean {
  return ALL_STATUSES.includes(from) && ALL_STATUSES.includes(to);
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
