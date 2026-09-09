import Index from '@app/pages/index';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@app/components/Discover/DiscoverWatchlist', () => ({
  default: () => <div data-testid="discover-watchlist" />,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('landing page (DAN-56)', () => {
  it('renders the watchlist instead of discover', () => {
    render(<Index />);

    expect(screen.getByTestId('discover-watchlist')).toBeTruthy();
  });
});
