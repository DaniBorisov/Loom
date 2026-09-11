import CreditsBlock from '@app/components/Settings/SettingsAbout/CreditsBlock';
import { cleanup, render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@app/assets/tmdb_logo.svg', () => ({
  default: ({ className }: { className?: string }) => (
    <svg data-testid="tmdb-logo" className={className} />
  ),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('CreditsBlock', () => {
  it('renders fork, TMDB, AniList, MAL credits and the usage notice', () => {
    render(
      <IntlProvider locale="en" defaultLocale="en">
        <CreditsBlock />
      </IntlProvider>
    );

    expect(screen.getByText('Credits')).toBeTruthy();
    expect(
      screen.getByRole('link', {
        name: 'https://github.com/seerr-team/seerr',
      })
    ).toBeTruthy();
    expect(
      screen.getByText(
        'This product uses the TMDb API but is not endorsed or certified by TMDb'
      )
    ).toBeTruthy();
    expect(screen.getByTestId('tmdb-logo')).toBeTruthy();
    for (const href of ['https://anilist.co', 'https://myanimelist.net']) {
      expect(screen.getByRole('link', { name: href })).toBeTruthy();
    }
    expect(screen.getByText('Usage')).toBeTruthy();
    expect(
      screen.getByText(
        'Loom is a personal, non-commercial media companion for self-hosted setups.'
      )
    ).toBeTruthy();
  });
});
