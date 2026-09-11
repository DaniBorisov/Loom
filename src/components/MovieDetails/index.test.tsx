import MovieDetails from '@app/components/MovieDetails';
import type { MovieDetails as MovieDetailsType } from '@server/models/Movie';
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
  useRouter: () => ({
    query: { movieId: '100' },
    pathname: '/movie/[movieId]',
  }),
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

const mockedGet = axios.get as unknown as Mock;
const mockedPatch = axios.patch as unknown as Mock;

const baseMovie = {
  id: 100,
  title: 'Test Movie',
  overview: 'Overview',
  posterPath: '/poster.jpg',
  releaseDate: '2024-01-01',
  voteAverage: 7.5,
  credits: { cast: [], crew: [] },
  keywords: [],
  genres: [],
  productionCompanies: [],
  contentRatings: { results: [] },
  releases: { results: [] },
  productionCountries: [],
  spokenLanguages: [],
  originalLanguage: 'en',
  externalIds: {},
} as unknown as MovieDetailsType;

const renderDetails = (movie: MovieDetailsType) =>
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
        <MovieDetails movie={movie} />
      </SWRConfig>
    </IntlProvider>
  );

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const setupNetwork = (
  movie: MovieDetailsType,
  available: boolean,
  favorited: boolean
) => {
  mockedGet.mockImplementation((url: string) => {
    if (url === '/api/v1/movie/100') {
      return Promise.resolve({ data: movie });
    }
    if (url.includes('/ratingscombined')) {
      return Promise.resolve({ data: null });
    }
    if (url.includes('/api/v1/media/jellyfin-check/')) {
      return Promise.resolve({ data: { available } });
    }
    if (url.startsWith('/api/v1/favorites/check')) {
      return Promise.resolve({
        data: favorited
          ? { isFavorited: true, favoriteId: 42 }
          : { isFavorited: false, favoriteId: null },
      });
    }
    return Promise.reject(new Error(`unexpected URL ${url}`));
  });
};

describe('MovieDetails unified hero (DAN-57)', () => {
  it('renders source, availability, watchlist, favorite, and notify override together', async () => {
    const listedMovie = {
      ...baseMovie,
      onUserWatchlist: true,
      watchlistId: 7,
      watchlistStatus: 'watching',
      watchlistNotifyOn: 'episode_airing',
    } as unknown as MovieDetailsType;
    setupNetwork(listedMovie, true, true);
    renderDetails(listedMovie);

    await waitFor(() => {
      expect(screen.getByTestId('media-title')).toBeTruthy();
    });

    // No TMDB pill on movie pages — only crosswalk anime gets a badge.
    expect(screen.queryByTestId('source-badge-tmdb')).toBeNull();

    // Available in library, on the watchlist (delete variant), favorited.
    // The favorite check + availability check resolve async, so wait.
    await waitFor(() => {
      expect(screen.getByTestId('library-badge')).toBeTruthy();
      expect(document.querySelector('.text-red-400')).toBeTruthy();
    });
    // On-watchlist delete variant shows the status dropdown.
    expect(document.querySelector('select')).toBeTruthy();

    // Notify dropdown button always reads "Notification".
    expect(screen.getByTestId('notify-on-selector')).toHaveTextContent(
      'Notification'
    );
  });

  it('renders the unlisted state without badge or override', async () => {
    setupNetwork(baseMovie, false, false);
    renderDetails(baseMovie);

    await waitFor(() => {
      expect(screen.getByTestId('media-title')).toBeTruthy();
    });

    expect(screen.queryByTestId('source-badge-tmdb')).toBeNull();

    expect(screen.queryByTestId('library-badge')).toBeNull();
    // Add-variant watchlist star renders; heart stays unfilled (no red).
    expect(document.querySelector('.text-amber-300')).toBeTruthy();
    expect(document.querySelector('.text-red-400')).toBeNull();
    expect(screen.queryByTestId('notify-on-selector')).toBeNull();
  });

  it('PATCHes the notify override from the detail page', async () => {
    const listedMovie = {
      ...baseMovie,
      onUserWatchlist: true,
      watchlistId: 7,
      watchlistStatus: 'watching',
      watchlistNotifyOn: 'both',
    } as unknown as MovieDetailsType;
    setupNetwork(listedMovie, true, true);
    renderDetails(listedMovie);

    await waitFor(() => {
      expect(screen.getByTestId('notify-on-selector')).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId('notify-on-selector'));

    await waitFor(() => {
      expect(screen.getByTestId('notify-on-option-none')).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId('notify-on-option-none'));

    await waitFor(() => {
      expect(mockedPatch).toHaveBeenCalledWith('/api/v1/watchlist/7', {
        notifyOn: 'none',
      });
    });
    expect(addToastMock).toHaveBeenCalledWith(
      expect.stringContaining('Notification preference updated.'),
      expect.anything()
    );
  });

  it('renders without credits instead of crashing', async () => {
    const { credits: _omitted, ...withoutCredits } = baseMovie;
    const movie = withoutCredits as unknown as MovieDetailsType;
    setupNetwork(movie, false, false);
    renderDetails(movie);

    await waitFor(() => {
      expect(screen.getByTestId('media-title')).toBeTruthy();
    });
    expect(screen.queryByTestId('notify-on-selector')).toBeNull();
  });
});
