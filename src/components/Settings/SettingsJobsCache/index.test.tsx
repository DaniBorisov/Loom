import SettingsJobs from '@app/components/Settings/SettingsJobsCache';
import { cleanup, render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import useSWR from 'swr';
import type { Mock } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('swr', () => ({
  default: vi.fn(),
}));

vi.mock('@app/hooks/useSettings', () => ({
  default: () => ({
    currentSettings: { mediaServerType: 'jellyfin' },
  }),
}));

vi.mock('@app/hooks/useToasts', () => ({
  default: () => ({ addToast: vi.fn() }),
}));

vi.mock('@app/hooks/useLocale', () => ({
  default: () => ({ locale: 'en' }),
}));

vi.mock('axios', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

const mockedUseSWR = useSWR as unknown as Mock;

// Every JobId in the server union must resolve to a display name instead
// of falling back to "Unknown Job".
const EXPECTED_JOBS: [string, string][] = [
  ['plex-recently-added-scan', 'Plex Recently Added Scan'],
  ['plex-full-scan', 'Plex Full Library Scan'],
  ['plex-watchlist-sync', 'Plex Watchlist Sync'],
  ['plex-refresh-token', 'Plex Refresh Token'],
  ['radarr-scan', 'Radarr Scan'],
  ['sonarr-scan', 'Sonarr Scan'],
  ['download-sync', 'Download Sync'],
  ['download-sync-reset', 'Download Sync Reset'],
  ['jellyfin-recently-added-scan', 'Jellyfin Recently Added Scan'],
  ['jellyfin-full-scan', 'Jellyfin Full Library Scan'],
  ['jellyfin-watched-sync', 'Jellyfin Watched Sync'],
  ['image-cache-cleanup', 'Image Cache Cleanup'],
  ['availability-sync', 'Media Availability Sync'],
  ['process-blocklisted-tags', 'Process Blocklisted Tags'],
  ['mal-list-sync', 'MAL List Sync'],
  ['crosswalk-refresh', 'Anime Crosswalk Refresh'],
  ['airing-push-sync', 'Airing Push Sync'],
];

beforeEach(() => {
  mockedUseSWR.mockImplementation((url: string) => {
    if (url === '/api/v1/settings/jobs') {
      return {
        data: EXPECTED_JOBS.map(([id]) => ({
          id,
          name: id,
          type: 'process',
          interval: 'days',
          cronSchedule: '0 0 6 * * *',
          nextExecutionTime: new Date(Date.now() + 3600000).toISOString(),
          running: false,
        })),
        error: undefined,
        mutate: vi.fn(),
      };
    }
    return {
      data: {
        apiCaches: [],
        imageCache: {
          tmdb: { imageCount: 0, size: 0 },
          avatar: { imageCount: 0, size: 0 },
        },
      },
      error: undefined,
      mutate: vi.fn(),
    };
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SettingsJobsCache job names', () => {
  it('renders a display name for every known job id', () => {
    render(
      <IntlProvider locale="en" defaultLocale="en">
        <SettingsJobs />
      </IntlProvider>
    );

    for (const [, name] of EXPECTED_JOBS) {
      expect(screen.getByText(name)).toBeTruthy();
    }
    expect(screen.queryByText('Unknown Job')).toBeNull();
  });
});
