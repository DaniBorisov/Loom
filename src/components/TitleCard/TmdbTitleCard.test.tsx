import TmdbTitleCard from '@app/components/TitleCard/TmdbTitleCard';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import { IntlProvider } from 'react-intl';
import { SWRConfig } from 'swr';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

vi.mock('axios', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

vi.mock('react-intersection-observer', () => ({
  useInView: () => ({ ref: vi.fn(), inView: true }),
}));

vi.mock('@app/hooks/useUser', () => ({
  useUser: () => ({ user: undefined, hasPermission: () => false }),
  Permission: { ADMIN: 1 },
}));

vi.mock('@app/components/TitleCard', () => {
  const Stub = ({
    libraryAvailable,
  }: {
    libraryAvailable?: boolean;
  }) => (
    <div
      data-testid="title-card"
      data-library={
        libraryAvailable === undefined ? 'unset' : String(libraryAvailable)
      }
    />
  );
  return {
    default: Object.assign(Stub, {
      Placeholder: () => <div data-testid="title-card-placeholder" />,
      ErrorCard: () => <div data-testid="title-card-error" />,
    }),
  };
});

const mockedGet = axios.get as unknown as Mock;

const titleFixture = {
  id: 100,
  title: 'Test Movie',
  posterPath: '/poster.jpg',
  overview: 'Overview',
  voteAverage: 7.5,
  releaseDate: '2024-01-01',
};

const renderCard = (libraryAvailable?: boolean | null) => {
  mockedGet.mockImplementation((url: string) => {
    if (url === '/api/v1/movie/100') {
      return Promise.resolve({ data: titleFixture });
    }
    if (url.startsWith('/api/v1/media/jellyfin-check/')) {
      return Promise.resolve({ data: { available: true } });
    }
    return Promise.reject(new Error(`unexpected URL ${url}`));
  });

  render(
    <IntlProvider locale="en" defaultLocale="en">
      <SWRConfig
        value={{
          fetcher: (url: string) =>
            mockedGet(url).then((res: { data: unknown }) => res.data),
          dedupingInterval: 60000,
        }}
      >
        <TmdbTitleCard
          id={100}
          tmdbId={100}
          type="movie"
          libraryAvailable={libraryAvailable}
        />
      </SWRConfig>
    </IntlProvider>
  );
};

const jellyfinCheckCalls = () =>
  mockedGet.mock.calls.filter((call: unknown[]) =>
    String(call[0]).includes('/api/v1/media/jellyfin-check/')
  );

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('TmdbTitleCard libraryAvailable tri-state (DAN-98 follow-up)', () => {
  it('fires no per-card request while a batch is pending (null)', async () => {
    renderCard(null);

    await waitFor(() => {
      expect(screen.getByTestId('title-card')).toBeTruthy();
    });

    // Title fetch happened, availability check did not
    expect(mockedGet).toHaveBeenCalledWith('/api/v1/movie/100');
    expect(jellyfinCheckCalls()).toHaveLength(0);
    expect(screen.getByTestId('title-card').dataset.library).toBe('unset');
  });

  it('applies the batched value with no request (boolean)', async () => {
    renderCard(true);

    await waitFor(() => {
      expect(screen.getByTestId('title-card')).toBeTruthy();
    });

    expect(jellyfinCheckCalls()).toHaveLength(0);
    expect(screen.getByTestId('title-card').dataset.library).toBe('true');
  });

  it('falls back to the single request when no batch is in play (undefined)', async () => {
    renderCard(undefined);

    await waitFor(() => {
      expect(screen.getByTestId('title-card').dataset.library).toBe('true');
    });

    expect(jellyfinCheckCalls()).toHaveLength(1);
  });
});
