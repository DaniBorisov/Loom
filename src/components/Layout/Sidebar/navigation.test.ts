import {
  dashboardActiveRegExp,
  dashboardHref,
  watchlistActiveRegExp,
} from '@app/components/Layout/Sidebar';
import { describe, expect, it } from 'vitest';

describe('navigation config (DAN-56)', () => {
  it('points the dashboard entry at trending', () => {
    expect(dashboardHref).toBe('/discover/trending');
    expect(dashboardActiveRegExp.test('/discover/trending')).toBe(true);
    expect(dashboardActiveRegExp.test('/')).toBe(false);
    expect(dashboardActiveRegExp.test('/discover/watchlist')).toBe(false);
  });

  it('highlights the watchlist entry on both watchlist URLs', () => {
    expect(watchlistActiveRegExp.test('/')).toBe(true);
    expect(watchlistActiveRegExp.test('/discover/watchlist')).toBe(true);
    expect(watchlistActiveRegExp.test('/discover/trending')).toBe(false);
    expect(watchlistActiveRegExp.test('/discover/movies')).toBe(false);
  });
});
