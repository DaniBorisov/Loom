import DiscoverPage from '@app/pages/discover';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@app/components/Discover', () => ({
  default: () => <div data-testid="discover-overview" />,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('discover overview page', () => {
  it('renders the full discover overview', () => {
    render(<DiscoverPage />);

    expect(screen.getByTestId('discover-overview')).toBeTruthy();
  });
});
