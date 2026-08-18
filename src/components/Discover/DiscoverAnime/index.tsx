import Header from '@app/components/Common/Header';
import ListView from '@app/components/Common/ListView';
import PageTitle from '@app/components/Common/PageTitle';
import useDiscover from '@app/hooks/useDiscover';
import ErrorPage from '@app/pages/_error';
import defineMessages from '@app/utils/defineMessages';
import { BarsArrowDownIcon } from '@heroicons/react/24/solid';
import type { AnimeResult } from '@server/models/Search';
import { useState } from 'react';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.Discover.DiscoverAnime', {
  discoveranime: 'Anime',
  seasonal: 'Seasonal',
  trending: 'Trending',
  winter: 'Winter',
  spring: 'Spring',
  summer: 'Summer',
  fall: 'Fall',
});

type AnimeMode = 'seasonal' | 'trending';
type AnimeSeason = 'WINTER' | 'SPRING' | 'SUMMER' | 'FALL';

function getCurrentSeason(): AnimeSeason {
  const month = new Date().getMonth();
  if (month <= 2) return 'WINTER';
  if (month <= 5) return 'SPRING';
  if (month <= 8) return 'SUMMER';
  return 'FALL';
}

const SEASON_ORDER: AnimeSeason[] = ['WINTER', 'SPRING', 'SUMMER', 'FALL'];

const DiscoverAnime = () => {
  const intl = useIntl();
  const [mode, setMode] = useState<AnimeMode>('seasonal');
  const [season, setSeason] = useState<AnimeSeason>(getCurrentSeason);
  const [year, setYear] = useState(() => new Date().getFullYear());

  const endpoint =
    mode === 'seasonal'
      ? '/api/v1/discover/anime/seasonal'
      : '/api/v1/discover/anime/trending';

  const options = mode === 'seasonal' ? { season, year } : {};

  const {
    isLoadingInitialData,
    isEmpty,
    isLoadingMore,
    isReachingEnd,
    titles,
    fetchMore,
    error,
  } = useDiscover<AnimeResult>(endpoint, options);

  if (error) {
    return <ErrorPage statusCode={500} />;
  }

  const title = intl.formatMessage(messages.discoveranime);

  return (
    <>
      <PageTitle title={title} />
      <div className="mb-4 flex flex-col justify-between lg:flex-row lg:items-end">
        <Header>{title}</Header>
        <div className="mt-2 flex flex-grow flex-col gap-2 sm:flex-row lg:flex-grow-0">
          <div className="flex flex-grow gap-2 sm:flex-grow-0">
            <div className="flex flex-grow sm:flex-grow-0">
              <span className="inline-flex cursor-default items-center rounded-l-md border border-r-0 border-gray-500 bg-gray-800 px-3 text-gray-100 sm:text-sm">
                <BarsArrowDownIcon className="h-6 w-6" />
              </span>
              <select
                id="animeMode"
                name="animeMode"
                className="rounded-r-only"
                value={mode}
                onChange={(e) => setMode(e.target.value as AnimeMode)}
              >
                <option value="seasonal">
                  {intl.formatMessage(messages.seasonal)}
                </option>
                <option value="trending">
                  {intl.formatMessage(messages.trending)}
                </option>
              </select>
            </div>

            {mode === 'seasonal' && (
              <>
                <div className="flex flex-grow sm:flex-grow-0">
                  <select
                    id="animeSeason"
                    name="animeSeason"
                    className="rounded-l-md"
                    value={season}
                    onChange={(e) => setSeason(e.target.value as AnimeSeason)}
                  >
                    {SEASON_ORDER.map((s) => (
                      <option key={s} value={s}>
                        {intl.formatMessage(
                          messages[s.toLowerCase() as keyof typeof messages]
                        )}
                      </option>
                    ))}
                  </select>
                  <select
                    id="animeYear"
                    name="animeYear"
                    className="rounded-r-md"
                    value={year}
                    onChange={(e) => setYear(Number(e.target.value))}
                  >
                    {Array.from({ length: 6 }, (_, i) => {
                      const y = new Date().getFullYear() - 2 + i;
                      return (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      <ListView
        items={titles}
        isEmpty={isEmpty}
        isLoading={
          isLoadingInitialData || (isLoadingMore && (titles?.length ?? 0) > 0)
        }
        isReachingEnd={isReachingEnd}
        onScrollBottom={fetchMore}
      />
    </>
  );
};

export default DiscoverAnime;
