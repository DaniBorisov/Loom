import TitleCard from '@app/components/TitleCard';
import { useJellyfinAvailability } from '@app/hooks/useJellyfinAvailability';
import { Permission, useUser } from '@app/hooks/useUser';
import type { MovieDetails } from '@server/models/Movie';
import type { TvDetails } from '@server/models/Tv';
import { useInView } from 'react-intersection-observer';
import useSWR from 'swr';

export interface TmdbTitleCardProps {
  id: number;
  tmdbId: number;
  tvdbId?: number;
  type: 'movie' | 'tv' | 'anime';
  canExpand?: boolean;
  isAddedToWatchlist?: boolean;
  mutateParent?: () => void;
  source?: 'tmdb' | 'anilist';
  /**
   * Batch-provided availability (DAN-98). When set by a list parent that
   * already fetched availability for all its items at once, the per-card
   * request is skipped.
   */
  libraryAvailable?: boolean;
}

const isMovie = (movie: MovieDetails | TvDetails): movie is MovieDetails => {
  return (movie as MovieDetails).title !== undefined;
};

const TmdbTitleCard = ({
  id,
  tmdbId,
  tvdbId,
  type,
  canExpand,
  isAddedToWatchlist = false,
  mutateParent,
  source = 'tmdb',
  libraryAvailable: libraryAvailableOverride,
}: TmdbTitleCardProps) => {
  const { hasPermission } = useUser();

  const { ref, inView } = useInView({
    triggerOnce: true,
  });
  const url =
    type === 'movie' ? `/api/v1/movie/${tmdbId}` : `/api/v1/tv/${tmdbId}`;
  const { data: title, error } = useSWR<MovieDetails | TvDetails>(
    inView ? `${url}` : null
  );

  const { data: libraryData } = useJellyfinAvailability(
    libraryAvailableOverride === undefined && title ? tmdbId : undefined,
    type
  );

  const libraryAvailable =
    libraryAvailableOverride ?? libraryData?.available;

  if (!title && !error) {
    return (
      <div ref={ref}>
        <TitleCard.Placeholder canExpand={canExpand} />
      </div>
    );
  }

  if (!title) {
    return hasPermission(Permission.ADMIN) ? (
      <TitleCard.ErrorCard
        id={id}
        tmdbId={tmdbId}
        tvdbId={tvdbId}
        type={type}
      />
    ) : null;
  }

  if (type === 'anime') {
    return (
      <TitleCard
        key={title.id}
        id={title.id}
        isAddedToWatchlist={
          title.mediaInfo?.watchlists?.length || isAddedToWatchlist
        }
        image={title.posterPath}
        status={title.mediaInfo?.status}
        summary={title.overview}
        title={!isMovie(title) ? title.name : title.title}
        userScore={title.voteAverage}
        year={!isMovie(title) ? title.firstAirDate : undefined}
        mediaType={'anime'}
        canExpand={canExpand}
        mutateParent={mutateParent}
        source={source}
        libraryAvailable={libraryAvailable}
      />
    );
  }

  return isMovie(title) ? (
    <TitleCard
      key={title.id}
      id={title.id}
      isAddedToWatchlist={
        title.mediaInfo?.watchlists?.length || isAddedToWatchlist
      }
      image={title.posterPath}
      status={title.mediaInfo?.status}
      summary={title.overview}
      title={title.title}
      userScore={title.voteAverage}
      year={title.releaseDate}
      mediaType={'movie'}
      canExpand={canExpand}
      mutateParent={mutateParent}
      source={source}
      libraryAvailable={libraryData?.available}
    />
  ) : (
    <TitleCard
      key={title.id}
      id={title.id}
      isAddedToWatchlist={
        title.mediaInfo?.watchlists?.length || isAddedToWatchlist
      }
      image={title.posterPath}
      status={title.mediaInfo?.status}
      summary={title.overview}
      title={title.name}
      userScore={title.voteAverage}
      year={title.firstAirDate}
      mediaType={'tv'}
      canExpand={canExpand}
      mutateParent={mutateParent}
      source={source}
      libraryAvailable={libraryData?.available}
    />
  );
};

export default TmdbTitleCard;
