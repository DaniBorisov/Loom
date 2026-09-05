import {
  availabilityResultKey,
  useJellyfinAvailabilityBatch,
} from '@app/hooks/useJellyfinAvailability';
import type { AvailabilityBatchItem } from '@app/hooks/useJellyfinAvailability';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import { IntlProvider } from 'react-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

vi.mock('axios', () => ({
  default: { post: vi.fn() },
}));

const mockedPost = axios.post as unknown as Mock;

const Probe = ({ items }: { items?: AvailabilityBatchItem[] }) => {
  const { data } = useJellyfinAvailabilityBatch(items);
  return (
    <div data-testid="result">{JSON.stringify(data?.results ?? null)}</div>
  );
};

const renderProbe = (items?: AvailabilityBatchItem[]) =>
  render(
    <IntlProvider locale="en" defaultLocale="en">
      <Probe items={items} />
    </IntlProvider>
  );

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('useJellyfinAvailabilityBatch (DAN-98)', () => {
  it('makes exactly one request for N items and maps results by key', async () => {
    mockedPost.mockResolvedValue({
      data: {
        results: { 'movie:1': true, 'tv:2': false, 'anime:3': false },
      },
    });

    renderProbe([
      { tmdbId: 2, type: 'tv' },
      { tmdbId: 1, type: 'movie' },
      { tmdbId: 3, type: 'anime' },
    ]);

    await waitFor(() => {
      expect(screen.getByTestId('result').textContent).toContain(
        '"movie:1":true'
      );
    });

    expect(mockedPost).toHaveBeenCalledTimes(1);
    expect(mockedPost).toHaveBeenCalledWith(
      '/api/v1/media/jellyfin-check-batch',
      {
        items: [
          { tmdbId: 1, type: 'movie' },
          { tmdbId: 2, type: 'tv' },
          { tmdbId: 3, type: 'anime' },
        ],
      }
    );

    expect(availabilityResultKey(1, 'movie')).toBe('movie:1');
  });

  it('makes no request for an empty list', async () => {
    renderProbe([]);

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockedPost).not.toHaveBeenCalled();
    expect(screen.getByTestId('result').textContent).toBe('null');
  });

  it('makes no request when items are undefined', () => {
    renderProbe(undefined);
    expect(mockedPost).not.toHaveBeenCalled();
  });
});
