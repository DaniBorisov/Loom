import DiscoverWatchlist from '@app/components/Discover/DiscoverWatchlist';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

vi.mock('swr/infinite', () => ({
  default: vi.fn(),
}));

vi.mock('axios', () => ({
  default: { post: vi.fn().mockResolvedValue({ data: { results: {} } }) },
}));

vi.mock('@app/hooks/useUser', () => ({
  useUser: () => ({ user: undefined }),
}));

vi.mock('next/router', () => ({
  useRouter: () => ({ query: {} }),
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

vi.mock('@app/components/TitleCard/TmdbTitleCard', () => ({
  default: ({ tmdbId }: { tmdbId: number }) => (
    <div data-testid={`card-${tmdbId}`} />
  ),
}));

import useSWRInfinite from 'swr/infinite';

const mockedInfinite = useSWRInfinite as unknown as Mock;

const pageOne = {
  page: 1,
  totalPages: 3,
  totalResults: 60,
  results: [
    {
      id: 1,
      ratingKey: 'rk-1',
      tmdbId: 100,
      mediaType: 'movie',
      title: 'Test Movie',
      status: 'want_to_watch',
    },
  ],
};

const activeKey = () => {
  const calls = mockedInfinite.mock.calls;
  const getKey = calls[calls.length - 1][0] as (
    pageIndex: number,
    prev: unknown
  ) => string;
  return getKey(0, null);
};

const renderList = (size = 1) => {
  const setSize = vi.fn();
  mockedInfinite.mockImplementation((getKey: (index: number, prev: unknown) => string) => ({
    data: [pageOne],
    error: undefined,
    size,
    setSize,
    // Expose the resolved key so tests can assert the active tab is used
    key: getKey(0, null),
  }));
  render(
    <IntlProvider locale="en" defaultLocale="en">
      <DiscoverWatchlist />
    </IntlProvider>
  );
  return { setSize };
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('DiscoverWatchlist tab pagination (DAN-100)', () => {
  it('renders the default tab at page 1', () => {
    renderList();
    expect(screen.getByTestId('card-100')).toBeTruthy();
    expect(activeKey()).toContain('status=want_to_watch');
  });

  it('resets pagination to page 1 when switching tabs', () => {
    // Simulate having loaded 3 pages on the previous tab
    const { setSize } = renderList(3);

    fireEvent.click(screen.getByText('Watching'));

    expect(setSize).toHaveBeenCalledWith(1);
    expect(activeKey()).toContain('status=watching');
  });

  it('resets pagination even when already on page 1', () => {
    const { setSize } = renderList(1);

    fireEvent.click(screen.getByText('Watched'));

    expect(setSize).toHaveBeenCalledWith(1);
  });
});
