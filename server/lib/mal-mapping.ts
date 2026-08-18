import { WatchlistStatus } from '@server/entity/Watchlist';

export type MalStatus =
  | 'watching'
  | 'completed'
  | 'on_hold'
  | 'dropped'
  | 'plan_to_watch';

/**
 * Maps a MAL list_status.status value to the app's internal WatchlistStatus.
 *
 * - watching     → WATCHING
 * - plan_to_watch → WANT_TO_WATCH
 * - completed    → WATCHED
 * - on_hold      → WATCHING (displayed as "On Hold" via malOriginalStatus)
 * - dropped      → WATCHED (displayed as "Dropped" via malOriginalStatus)
 */
export function mapMalStatus(malStatus: string): WatchlistStatus {
  switch (malStatus) {
    case 'watching':
      return WatchlistStatus.WATCHING;
    case 'plan_to_watch':
      return WatchlistStatus.WANT_TO_WATCH;
    case 'completed':
      return WatchlistStatus.WATCHED;
    case 'on_hold':
      return WatchlistStatus.WATCHING;
    case 'dropped':
      return WatchlistStatus.WATCHED;
    default:
      return WatchlistStatus.WANT_TO_WATCH;
  }
}

/**
 * Returns a display-friendly status label when the MAL original status
 * differs from what was mapped to the internal WatchlistStatus.
 *
 * Used in detail views to show "On Hold" or "Dropped" even though
 * the internal status is WATCHING or WATCHED respectively.
 *
 * Returns null when no override display is needed (i.e. the original
 * MAL status maps 1:1 to the internal status).
 */
export function getMalDisplayStatus(
  malOriginalStatus: string | null
): string | null {
  switch (malOriginalStatus) {
    case 'on_hold':
      return 'On Hold';
    case 'dropped':
      return 'Dropped';
    default:
      return null;
  }
}
