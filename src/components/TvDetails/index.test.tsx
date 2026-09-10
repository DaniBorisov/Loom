import TvDetails from '@app/components/TvDetails';
import type { TvDetails as TvDetailsType } from '@server/models/Tv';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import axios from 'axios';
import { IntlProvider } from 'react-intl';
import { SWRConfig } from 'swr';
import type { Mock } from 'vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('axios', () => ({
  default: { get: vi.fn(), post: vi.fn(), delete: vi.fn(), patch: vi.fn() },
}));

vi.mock('next/router', () => ({
  useRouter: () => ({ query: { tvId: '200' }, pathname: '/tv/[tvId]' }),
}));

vi.mock('@app/hooks/useUser', () => ({
  useUser: () => ({ user: undefined, hasPermission: () => false }),
  Permission: { ADMIN: 1 },
  UserType: { PLEX: 'plex' },
}));

vi.mock('@app/hooks/useSettings', () => ({
  default: () => ({ currentSettings: {} }),
}));

vi.mock('@app/hooks/useLocale', () => ({
  default: () => ({ locale: 'en' }),
}));

const addToastMock = vi.fn();
vi.mock('@app/hooks/useToasts', () => ({
  default: () => ({ addToast: addToastMock }),
}));

vi.mock('@app/components/Common/CachedImage', () => ({
  default: () => null,
}));

vi.mock('@app/components/Common/LibraryBadge', () => ({
  default: () => <div data-testid="library-badge" />,
}));

vi.mock('@app/components/Common/PageTitle', () => ({
  default: () => null,
}));

vi.mock('@app/components/RequestModal', () => ({
  default: () => null,
}));

vi.mock('@app/components/BlocklistModal', () => ({
  default: () => null,
}));

vi.mock('@app/components/RequestButton', () => ({
  default: () => null,
}));

vi.mock('@app/components/Common/PlayButton', () => ({
  default: () => null,
}));

vi.mock('@app/components/ExternalLinkBlock', () => ({
  default: () => null,
}));

vi.mock('@app/components/IssueModal', () => ({
  default: () => null,
}));

vi.mock('@app/components/ManageSlideOver', () => ({
  default: () => null,
}));

vi.mock('@app/components/MediaSlider', () => ({
  default: () => null,
}));

vi.mock('@app/components/PersonCard', () => ({
  default: () => null,
}));

vi.mock('@app/components/Slider', () => ({
  default: () => null,
}));

vi.mock('@app/components/TvDetails/Season', () => ({
  default: () => null,
}));

const mockedGet = axios.get as unknown as Mock;
const mockedPatch = axios.patch as unknown as Mock;

const baseShow = {
  id: 200,
  name: 'Test Show',
  overview: 'Overview',
  posterPath: '/poster.jpg',
  firstAirDate: '2024-01-01',
  voteAverage: 8,
  credits: { cast: [], crew: [] },
  keywords: [],
  genres: [],
  seasons: [],
  productionCompanies: [],
  contentRatings: { results: [] },
  episodeRunTime: [],
  productionCountries: [],
  spokenLanguages: [],
  originalLanguage: 'en',
  externalIds: {},
  networks: [],
  createdBy: [],
} as unknown as TvDetailsType;

const renderDetails = (show: TvDetailsType) =>
  render(
    <IntlProvider locale="en" defaultLocale="en">
      <SWRConfig
        value={{
          fetcher: (url: string) =>
            (mockedGet as Mock)(url).then((res: { data: unknown }) => res.data),
          dedupingInterval: 60000,
          provider: () => new Map(),
        }}
      >
        <TvDetails tv={show} />
      </SWRConfig>
    </IntlProvider>
  );

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

const setupNetwork = (
  show: TvDetailsType,
  available: boolean,
  favorited: boolean
) => {
  mockedGet.mockImplementation((url: string) => {
    if (url === '/api/v1/tv/200') {
      return Promise.resolve({ data: show });
    }
    if (url.includes('/ratings')) {
      return Promise.resolve({ data: null });
    }
    if (url.includes('/api/v1/media/jellyfin-check/')) {
      return Promise.resolve({ data: { available } });
    }
    if (url.startsWith('/api/v1/favorites/check')) {
      return Promise.resolve({
        data: favorited
          ? { isFavorited: true, favoriteId: 43 }
          : { isFavorited: false, favoriteId: null },
      });
    }
    return Promise.reject(new Error(`unexpected URL ${url}`));
  });
};

describe('TvDetails unified hero (DAN-57)', () => {
  it('badges crosswalk anime as Anime', async () => {
    const animeShow = {
      ...baseShow,
      keywords: [{ id: 210024, name: 'Anime' }],
    } as unknown as TvDetailsType;
    setupNetwork(animeShow, false, false);
    renderDetails(animeShow);

    await waitFor(() => {
      expect(screen.getByTestId('source-badge-anime')).toBeTruthy();
    });
    expect(screen.queryByTestId('source-badge-tmdb')).toBeNull();
  });

  it('renders source, availability, watchlist, favorite, and notify override together', async () => {
    const listedShow = {
      ...baseShow,
      onUserWatchlist: true,
      watchlistId: 9,
      watchlistStatus: 'watching',
      watchlistNotifyOn: 'available_in_library',
    } as unknown as TvDetailsType;
    setupNetwork(listedShow, true, true);
    renderDetails(listedShow);

    await waitFor(() => {
      expect(screen.getByTestId('source-badge-tmdb')).toBeTruthy();
    });

    // The favorite check + availability check resolve async, so wait.
    await waitFor(() => {
      expect(screen.getByTestId('library-badge')).toBeTruthy();
      expect(document.querySelector('.text-red-400')).toBeTruthy();
    });
    // On-watchlist delete variant shows the status dropdown.
    expect(document.querySelector('select')).toBeTruthy();

    // Notify dropdown button reflects the row value.
    expect(screen.getByTestId('notify-on-selector')).toHaveTextContent(
      'Availability only'
    );
  });

  it('PATCHes the notify override from the detail page', async () => {
    const listedShow = {
      ...baseShow,
      onUserWatchlist: true,
      watchlistId: 9,
      watchlistStatus: 'watching',
      watchlistNotifyOn: 'both',
    } as unknown as TvDetailsType;
    setupNetwork(listedShow, true, true);
    renderDetails(listedShow);

    await waitFor(() => {
      expect(screen.getByTestId('notify-on-selector')).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId('notify-on-selector'));

    await waitFor(() => {
      expect(screen.getByTestId('notify-on-option-none')).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId('notify-on-option-none'));

    await waitFor(() => {
      expect(mockedPatch).toHaveBeenCalledWith('/api/v1/watchlist/9', {
        notifyOn: 'none',
      });
    });
  });
});
