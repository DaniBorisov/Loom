import type { NotifyOnValue } from '@app/components/Common/NotifyOnSelector';
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

const addToastMock = vi.fn();
vi.mock('@app/hooks/useToasts', () => ({
  default: () => ({ addToast: addToastMock }),
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

const renderCard = (notifyOn: NotifyOnValue = 'both') =>
  render(
    <IntlProvider locale="en" defaultLocale="en">
      <TitleCard
        id={100}
        title="Test Movie"
        mediaType="movie"
        watchlistId={7}
        notifyOn={notifyOn}
        favoriteStatus={null}
      />
    </IntlProvider>
  );

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('TitleCard per-item notify override (DAN-48)', () => {
  it('shows the row preference once details expand', async () => {
    renderCard('episode_airing');

    expect(screen.queryByTestId('notify-on-selector')).toBeNull();

    fireEvent.click(screen.getByRole('link'));

    await waitFor(() => {
      expect(screen.getByTestId('notify-on-selector')).toBeTruthy();
    });
    expect(
      (screen.getByTestId('notify-on-selector') as HTMLSelectElement).value
    ).toBe('episode_airing');
  });

  it('PATCHes the row and reflects the override on change', async () => {
    renderCard('both');
    fireEvent.click(screen.getByRole('link'));

    await waitFor(() => {
      expect(screen.getByTestId('notify-on-selector')).toBeTruthy();
    });

    fireEvent.change(screen.getByTestId('notify-on-selector'), {
      target: { value: 'none' },
    });

    await waitFor(() => {
      expect(mockedPatch).toHaveBeenCalledWith('/api/v1/watchlist/7', {
        notifyOn: 'none',
      });
    });
    expect(
      (screen.getByTestId('notify-on-selector') as HTMLSelectElement).value
    ).toBe('none');
    expect(addToastMock).toHaveBeenCalledWith(
      expect.stringContaining('Notification preference updated.'),
      expect.anything()
    );
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
