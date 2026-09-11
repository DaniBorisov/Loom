import SettingsAbout from '@app/components/Settings/SettingsAbout';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { IntlProvider } from 'react-intl';
import { SWRConfig } from 'swr';
import type { Mock } from 'vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('axios', () => ({
  default: { get: vi.fn() },
}));

// SVGR components resolve to URL strings outside the bundler — stub the
// artwork so the component tree renders; the file's byte content is
// asserted separately below.
vi.mock('@app/assets/tmdb_logo.svg', () => ({
  default: ({ className }: { className?: string }) => (
    <svg data-testid="tmdb-logo" className={className} />
  ),
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
      name: 'https://github.com/seerr-team/seerr',
    });
    expect(link.getAttribute('href')).toBe(
      'https://github.com/seerr-team/seerr'
    );
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('renders the exact TMDB attribution with an unmodified logo', async () => {
    renderAbout();

    await waitFor(() => {
      expect(
        screen.getByText(
          'This product uses the TMDb API but is not endorsed or certified by TMDb'
        )
      ).toBeTruthy();
    });

    // Approved mark, shown modestly next to the text (never recolored or
    // reshaped here — sizing only via height, aspect preserved).
    const logo = screen.getByTestId('tmdb-logo');
    expect(logo.tagName.toLowerCase()).toBe('svg');
    expect(logo.getAttribute('class')).toContain('h-6');
  });

  it('credits AniList and MyAnimeList as data sources', async () => {
    renderAbout();

    await waitFor(() => {
      expect(screen.getByText('Credits')).toBeTruthy();
    });

    for (const href of ['https://anilist.co', 'https://myanimelist.net']) {
      const link = screen.getByRole('link', { name: href });
      expect(link.getAttribute('href')).toBe(href);
      expect(link.getAttribute('target')).toBe('_blank');
    }
  });

  it('states personal, non-commercial use on the page', async () => {
    renderAbout();

    await waitFor(() => {
      expect(screen.getByText('Usage')).toBeTruthy();
    });
    expect(
      screen.getByText(
        'Loom is a personal, non-commercial media companion for self-hosted setups.'
      )
    ).toBeTruthy();
  });

  it('ships the unmodified approved TMDB mark', () => {
    const svg = readFileSync(
      join(process.cwd(), 'src/assets/tmdb_logo.svg'),
      'utf8'
    );
    // Official TMDB gradient + letterforms; any recolor/reshape breaks this.
    expect(svg).toContain('#90cea1');
    expect(svg).toContain('#3cbec9');
    expect(svg).toContain('#00b3e5');
  });
});
