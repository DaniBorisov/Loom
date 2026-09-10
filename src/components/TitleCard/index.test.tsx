import TitleCard from '@app/components/TitleCard';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import axios from 'axios';
import { IntlProvider } from 'react-intl';
import type { Mock } from 'vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/image', () => ({
  default: ({ alt }: { alt?: string }) => <span>{alt ?? ''}</span>,
}));

vi.mock('next/link', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
}));

vi.mock('@app/hooks/useUser', () => ({
  useUser: () => ({ user: undefined, hasPermission: () => false }),
  Permission: { ADMIN: 1 },
  UserType: { PLEX: 'plex', JELLYFIN: 'jellyfin', EMBY: 'emby' },
}));

vi.mock('@app/hooks/useSettings', () => ({
  default: () => ({ currentSettings: { cacheImages: false } }),
}));

vi.mock('@app/hooks/useToasts', () => ({
  default: () => ({ addToast: vi.fn() }),
}));

vi.mock('@app/components/RequestModal', () => ({
  default: () => null,
}));

vi.mock('@app/components/BlocklistModal', () => ({
  default: () => null,
}));

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
    patch: vi.fn().mockResolvedValue({}),
  },
}));

const mockedPatch = axios.patch as unknown as Mock;

const renderCard = () =>
  render(
    <IntlProvider locale="en" defaultLocale="en">
      <TitleCard
        id={100}
        title="Test Movie"
        mediaType="movie"
        favoriteStatus={null}
      />
    </IntlProvider>
  );

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('TitleCard watchlist cards (DAN-57)', () => {
  it('shows no notify selector once details expand', async () => {
    renderCard();

    fireEvent.click(screen.getByRole('link'));

    // Overlay expanded, but per-item preference editing lives on the
    // detail page now — no selector, no row PATCH.
    await waitFor(() => {
      expect(screen.getByTestId('title-card-title')).toBeTruthy();
    });
    expect(screen.queryByTestId('notify-on-selector')).toBeNull();
    expect(mockedPatch).not.toHaveBeenCalled();
  });

  it('hides the selector for cards without a watchlist row', async () => {
    render(
      <IntlProvider locale="en" defaultLocale="en">
        <TitleCard
          id={100}
          title="Test Movie"
          mediaType="movie"
          favoriteStatus={null}
        />
      </IntlProvider>
    );

    fireEvent.click(screen.getByRole('link'));

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByTestId('notify-on-selector')).toBeNull();
  });
});
