import EmptyWatchlistArt from '@app/assets/loom-empty-watchlist.svg';

interface EmptyStateProps {
  message: React.ReactNode;
  action?: React.ReactNode;
}

/**
 * Branded empty state (DAN-60). Currently backed by the watchlist
 * illustration for all list pages per design decision; search keeps its
 * text-only treatment.
 */
const EmptyState = ({ message, action }: EmptyStateProps) => {
  return (
    <div className="mt-32 flex flex-col items-center justify-center text-center">
      <EmptyWatchlistArt
        className="mb-4 max-w-full text-gray-600"
        data-testid="empty-state-art"
        aria-hidden="true"
      />
      <p className="text-lg text-gray-400">{message}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
};

export default EmptyState;
