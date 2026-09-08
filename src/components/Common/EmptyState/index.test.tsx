import EmptyState from '@app/components/Common/EmptyState';
import { cleanup, render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@app/assets/loom-empty-watchlist.svg', () => ({
  default: () => <div data-testid="empty-state-art" />,
}));

const renderState = (action?: React.ReactNode) =>
  render(
    <IntlProvider locale="en" defaultLocale="en">
      <EmptyState message="Nothing here yet" action={action} />
    </IntlProvider>
  );

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('EmptyState (DAN-60)', () => {
  it('renders the illustration with the message', () => {
    renderState();

    expect(screen.getByTestId('empty-state-art')).toBeTruthy();
    expect(screen.getByText('Nothing here yet')).toBeTruthy();
  });

  it('renders an action when provided', () => {
    renderState(<button>Browse Media</button>);

    expect(screen.getByText('Browse Media')).toBeTruthy();
  });
});
