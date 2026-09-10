import SettingsAbout from '@app/components/Settings/SettingsAbout';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import { IntlProvider } from 'react-intl';
import { SWRConfig } from 'swr';
import type { Mock } from 'vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('axios', () => ({
  default: { get: vi.fn() },
}));

vi.mock('@app/hooks/useSettings', () => ({
  default: () => ({
    currentSettings: { versionCheck: false },
  }),
}));

vi.mock('@app/hooks/useUser', () => ({
  useUser: () => ({ hasPermission: () => false }),
  Permission: { ADMIN: 1 },
}));

const mockedGet = axios.get as unknown as Mock;

const renderAbout = () => {
  mockedGet.mockImplementation((url: string) => {
    if (url === '/api/v1/settings/about') {
      return Promise.resolve({
        data: {
          version: '2.0.0',
          totalMediaItems: 10,
          totalRequests: 3,
          appDataPath: '/config',
        },
      });
    }
    return Promise.reject(new Error(`unexpected URL ${url}`));
  });

  return render(
    <IntlProvider locale="en" defaultLocale="en">
      <SWRConfig
        value={{
          fetcher: (url: string) =>
            (mockedGet as Mock)(url).then((res: { data: unknown }) => res.data),
          provider: () => new Map(),
          dedupingInterval: 0,
        }}
      >
        <SettingsAbout />
      </SWRConfig>
    </IntlProvider>
  );
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SettingsAbout credits (DAN-62)', () => {
  it('credits Jellyseerr as the upstream fork with a link', async () => {
    renderAbout();

    await waitFor(() => {
      expect(screen.getByText('Credits')).toBeTruthy();
    });

    const link = screen.getByRole('link', {
      name: 'https://github.com/Fallenbagel/jellyseerr',
    });
    expect(link.getAttribute('href')).toBe(
      'https://github.com/Fallenbagel/jellyseerr'
    );
    expect(link.getAttribute('target')).toBe('_blank');
  });
});
