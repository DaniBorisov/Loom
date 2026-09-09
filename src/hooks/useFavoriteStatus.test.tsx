import type { FavoriteStatusBatchItem } from '@app/hooks/useFavoriteStatus';
import {
  favoriteStatusKey,
  useFavoriteStatus,
  useFavoriteStatusBatch,
} from '@app/hooks/useFavoriteStatus';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import { IntlProvider } from 'react-intl';
import { SWRConfig } from 'swr';
import type { Mock } from 'vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('axios', () => ({
  default: { post: vi.fn(), get: vi.fn() },
}));

const mockedPost = axios.post as unknown as Mock;
const mockedGet = axios.get as unknown as Mock;

const BatchProbe = ({ items }: { items?: FavoriteStatusBatchItem[] }) => {
  const { data } = useFavoriteStatusBatch(items);
  return (
    <div data-testid="result">{JSON.stringify(data?.results ?? null)}</div>
  );
};

const SingleProbe = ({
  mediaId,
  source,
}: {
  mediaId?: number;
  source?: 'tmdb' | 'anilist';
}) => {
  const { data } = useFavoriteStatus(mediaId, source);
  return <div data-testid="single">{JSON.stringify(data ?? null)}</div>;
};

const renderProbe = (ui: React.ReactElement) =>
  render(
    <IntlProvider locale="en" defaultLocale="en">
      {/* Mirror _app.tsx: single-item hook relies on the global fetcher */}
      <SWRConfig
        value={{
          fetcher: (url: string) =>
            (axios.get as unknown as Mock)(url).then(
              (res: { data: unknown }) => res.data
            ),
          dedupingInterval: 60000,
        }}
      >
        {ui}
      </SWRConfig>
    </IntlProvider>
  );

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('useFavoriteStatusBatch (DAN-99)', () => {
  it('makes exactly one request for N items and maps results by key', async () => {
    mockedPost.mockResolvedValue({
      data: {
        results: {
          'tmdb:1': { isFavorited: true, favoriteId: 10 },
          'tmdb:2': { isFavorited: false, favoriteId: null },
          'anilist:3': { isFavorited: false, favoriteId: null },
        },
      },
    });

    renderProbe(
      <BatchProbe
        items={[
          { mediaId: 2, source: 'tmdb' },
          { mediaId: 1, source: 'tmdb' },
          { mediaId: 3, source: 'anilist' },
        ]}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('result').textContent).toContain(
        '"tmdb:1":{"isFavorited":true'
      );
    });

    expect(mockedPost).toHaveBeenCalledTimes(1);
    expect(mockedPost).toHaveBeenCalledWith('/api/v1/favorites/check-batch', {
      items: [
        { mediaId: 1, source: 'tmdb' },
        { mediaId: 2, source: 'tmdb' },
        { mediaId: 3, source: 'anilist' },
      ],
    });

    expect(favoriteStatusKey(1, 'tmdb')).toBe('tmdb:1');
    expect(favoriteStatusKey(3, 'anilist')).toBe('anilist:3');
  });

  it('makes no request for an empty list', async () => {
    renderProbe(<BatchProbe items={[]} />);

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockedPost).not.toHaveBeenCalled();
    expect(screen.getByTestId('result').textContent).toBe('null');
  });

  it('makes no request when items are undefined', () => {
    renderProbe(<BatchProbe items={undefined} />);
    expect(mockedPost).not.toHaveBeenCalled();
  });
});

describe('useFavoriteStatus (DAN-99)', () => {
  it('checks a single item via GET with mediaId and source', async () => {
    mockedGet.mockResolvedValue({
      data: { isFavorited: true, favoriteId: 42 },
    });

    renderProbe(<SingleProbe mediaId={7} source="tmdb" />);

    await waitFor(() => {
      expect(screen.getByTestId('single').textContent).toContain(
        '"isFavorited":true'
      );
    });

    expect(mockedGet).toHaveBeenCalledTimes(1);
    expect(mockedGet).toHaveBeenCalledWith(
      '/api/v1/favorites/check?mediaId=7&source=tmdb'
    );
  });

  it('makes no request when mediaId is undefined', () => {
    renderProbe(<SingleProbe mediaId={undefined} />);
    expect(mockedGet).not.toHaveBeenCalled();
  });
});
