export type SourceBadgeSource = 'tmdb' | 'anime';

interface SourceBadgeProps {
  source: SourceBadgeSource;
}

/**
 * Data-source pill for detail heroes (DAN-57), mirroring the TitleCard
 * badges: TMDB for TMDB-sourced titles, Anime for crosswalk-resolved
 * anime (served from TMDB data, identified by keyword).
 */
const SourceBadge = ({ source }: SourceBadgeProps) => {
  return (
    <div
      className={`pointer-events-none z-40 self-start rounded-full border shadow-md ${
        source === 'anime'
          ? 'border-pink-600 bg-pink-600/80'
          : 'border-blue-500 bg-blue-600/80'
      }`}
      data-testid={`source-badge-${source}`}
    >
      <div className="flex h-4 items-center px-2 py-2 text-center text-xs font-medium uppercase tracking-wider text-white sm:h-5">
        {source === 'anime' ? 'Anime' : 'TMDB'}
      </div>
    </div>
  );
};

export default SourceBadge;
