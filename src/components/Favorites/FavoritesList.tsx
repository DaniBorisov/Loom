import Header from '@app/components/Common/Header';
import PageTitle from '@app/components/Common/PageTitle';
import TmdbTitleCard from '@app/components/TitleCard/TmdbTitleCard';
import ErrorPage from '@app/pages/_error';
import defineMessages from '@app/utils/defineMessages';
import type {
  FavoriteMediaType,
  FavoriteSource,
} from '@server/entity/Favorite';
import axios from 'axios';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

interface FavoriteEntry {
  id: number;
  userId: number;
  mediaId: number;
  mediaType: FavoriteMediaType;
  source: FavoriteSource;
  createdAt: string;
  updatedAt: string;
}

interface FavoritesPageData {
  page: number;
  totalPages: number;
  totalResults: number;
  results: FavoriteEntry[];
}

const messages = defineMessages('components.Favorites.FavoritesList', {
  title: 'Your Favorites',
  profileTitle: 'Favorites',
  empty: 'No favorites yet. Search or browse to find something you love.',
  removed: 'Removed from favorites.',
  removeError: 'Failed to remove favorite.',
});

const FavoritesList = () => {
  const intl = useIntl();
  const router = useRouter();

  const {
    data: favoritesData,
    error,
    mutate,
  } = useSWR<FavoritesPageData>('/api/v1/favorites');

  const handleRemove = async (favoriteId: number) => {
    try {
      await axios.delete(`/api/v1/favorites/${favoriteId}`);
      mutate();
    } catch {
      // Remove failed silently
    }
  };

  if (error) {
    return <ErrorPage statusCode={500} />;
  }

  const title = router.query.userId
    ? intl.formatMessage(messages.profileTitle)
    : intl.formatMessage(messages.title);

  const items = favoritesData?.results ?? [];

  return (
    <>
      <PageTitle title={title} />
      <div className="mb-5 mt-1">
        <Header
          subtext={
            router.query.userId ? (
              <Link
                href={`/users/${router.query.userId}`}
                className="hover:underline"
              >
                {router.query.userId}
              </Link>
            ) : (
              ''
            )
          }
        >
          {title}
        </Header>
      </div>

      {items.length === 0 && !favoritesData ? (
        <div className="mt-32 flex flex-col items-center justify-center text-gray-400">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-500 border-t-transparent" />
        </div>
      ) : items.length === 0 ? (
        <div className="mt-32 flex flex-col items-center justify-center text-center">
          <p className="text-lg text-gray-400">
            {intl.formatMessage(messages.empty)}
          </p>
          <Link
            href="/"
            className="mt-4 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          >
            Browse Media
          </Link>
        </div>
      ) : (
        <ul className="cards-vertical">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3">
              <div className="flex-1">
                <TmdbTitleCard
                  id={item.mediaId}
                  tmdbId={item.mediaId}
                  type={item.mediaType as 'movie' | 'tv' | 'anime'}
                  isAddedToWatchlist={false}
                  canExpand
                  mutateParent={() => mutate()}
                />
              </div>
              <button
                onClick={() => handleRemove(item.id)}
                className="shrink-0 rounded-md bg-red-600/20 px-3 py-1.5 text-sm text-red-400 transition-colors hover:bg-red-600/40 hover:text-red-300"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
};

export default FavoritesList;
