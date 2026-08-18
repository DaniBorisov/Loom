import Header from '@app/components/Common/Header';
import PageTitle from '@app/components/Common/PageTitle';
import TmdbTitleCard from '@app/components/TitleCard/TmdbTitleCard';
import { useUser } from '@app/hooks/useUser';
import ErrorPage from '@app/pages/_error';
import defineMessages from '@app/utils/defineMessages';
import type { WatchlistItem } from '@server/interfaces/api/discoverInterfaces';
import type { WatchlistStatus } from '@server/entity/Watchlist';
import axios from 'axios';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

interface WatchlistEntry extends WatchlistItem {
  status: WatchlistStatus;
}

interface WatchlistPageData {
  page: number;
  totalPages: number;
  totalResults: number;
  results: WatchlistEntry[];
}

type TabKey = 'want_to_watch' | 'watching' | 'watched';

const tabs: { key: TabKey; label: string }[] = [
  { key: 'want_to_watch', label: 'Want to Watch' },
  { key: 'watching', label: 'Watching' },
  { key: 'watched', label: 'Watched' },
];

const messages = defineMessages('components.Discover.DiscoverWatchlist', {
  discoverwatchlist: 'Your Watchlist',
  watchlist: 'Plex Watchlist',
  emptyTab: 'Nothing here yet. Browse media to add items to your watchlist.',
  statusChanged: 'Status updated.',
  statusError: 'Failed to update status.',
});

const DiscoverWatchlist = () => {
  const intl = useIntl();
  const router = useRouter();
  const { user } = useUser({
    id: Number(router.query.userId),
  });

  const [activeTab, setActiveTab] = useState<TabKey>('want_to_watch');

  const buildUrl = () => {
    if (router.pathname.startsWith('/profile')) {
      return `/api/v1/watchlist?status=${activeTab}`;
    }
    if (router.query.userId) {
      return `/api/v1/watchlist?status=${activeTab}`;
    }
    return `/api/v1/watchlist?status=${activeTab}`;
  };

  const {
    data: watchlistData,
    error,
    mutate,
  } = useSWR<WatchlistPageData>(buildUrl());

  const handleStatusChange = async (
    itemId: number,
    newStatus: WatchlistStatus
  ) => {
    try {
      await axios.patch(`/api/v1/watchlist/${itemId}`, {
        status: newStatus,
      });
      mutate();
    } catch {
      // Status change failed silently
    }
  };

  if (error) {
    return <ErrorPage statusCode={500} />;
  }

  const title = intl.formatMessage(
    router.query.userId ? messages.watchlist : messages.discoverwatchlist
  );

  const items = watchlistData?.results ?? [];

  return (
    <>
      <PageTitle
        title={[title, router.query.userId ? user?.displayName : '']}
      />
      <div className="mb-5 mt-1">
        <Header
          subtext={
            router.query.userId ? (
              <Link href={`/users/${user?.id}`} className="hover:underline">
                {user?.displayName}
              </Link>
            ) : (
              ''
            )
          }
        >
          {title}
        </Header>
      </div>

      {/* Status Tabs */}
      <div className="mb-6 flex gap-1 rounded-lg bg-gray-800 p-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-indigo-600 text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Items Grid */}
      {items.length === 0 && !watchlistData ? (
        <div className="mt-32 flex flex-col items-center justify-center text-gray-400">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-500 border-t-transparent" />
        </div>
      ) : items.length === 0 ? (
        <div className="mt-32 flex flex-col items-center justify-center text-center">
          <p className="text-lg text-gray-400">
            {intl.formatMessage(messages.emptyTab)}
          </p>
        </div>
      ) : (
        <ul className="cards-vertical">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3">
              <div className="flex-1">
                <TmdbTitleCard
                  id={item.tmdbId}
                  tmdbId={item.tmdbId}
                  type={item.mediaType}
                  isAddedToWatchlist
                  canExpand
                  mutateParent={() => mutate()}
                />
              </div>
              {/* Status change dropdown */}
              <select
                value={item.status}
                onChange={(e) =>
                  handleStatusChange(
                    item.id,
                    e.target.value as WatchlistStatus
                  )
                }
                className="rounded border border-gray-600 bg-gray-800 px-2 py-1 text-sm text-white"
              >
                {tabs.map((tab) => (
                  <option key={tab.key} value={tab.key}>
                    {tab.label}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      )}
    </>
  );
};

export default DiscoverWatchlist;
