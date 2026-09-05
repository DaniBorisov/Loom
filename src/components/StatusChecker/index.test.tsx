import StatusChecker from '@app/components/StatusChecker';
import {
  cleanup,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import useSWR from 'swr';

vi.mock('swr', () => ({
  default: vi.fn(),
}));

vi.mock('@app/hooks/useSettings', () => ({
  default: () => ({
    currentSettings: { applicationTitle: 'Seerr' },
  }),
}));

vi.mock('@app/hooks/useUser', () => ({
  useUser: () => ({ hasPermission: () => false }),
  Permission: { ADMIN: 1 },
}));

const mockedUseSWR = useSWR as unknown as Mock;

const renderChecker = () =>
  render(
    <IntlProvider locale="en" defaultLocale="en">
      <StatusChecker />
    </IntlProvider>
  );

const healthy = { commitTag: process.env.commitTag, restartRequired: false };

beforeEach(() => {
  mockedUseSWR.mockReturnValue({ data: healthy, error: undefined });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('StatusChecker connection-lost banner', () => {
  it('shows nothing while the heartbeat is healthy', () => {
    renderChecker();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('does not show the banner after a single transient failure', async () => {
    const { rerender } = renderChecker();

    mockedUseSWR.mockReturnValue({ data: healthy, error: new Error('blip') });
    rerender(
      <IntlProvider locale="en" defaultLocale="en">
        <StatusChecker />
      </IntlProvider>
    );

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  it('shows the banner after consecutive failures, even with stale data', async () => {
    const { rerender } = renderChecker();
    const rerenderChecker = () =>
      rerender(
        <IntlProvider locale="en" defaultLocale="en">
          <StatusChecker />
        </IntlProvider>
      );

    // SWR keeps the last data while erroring; each poll yields a new error.
    mockedUseSWR.mockReturnValue({ data: healthy, error: new Error('down 1') });
    rerenderChecker();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    mockedUseSWR.mockReturnValue({ data: healthy, error: new Error('down 2') });
    rerenderChecker();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(screen.getByText(/Connection to Seerr lost/)).toBeInTheDocument();
  });

  it('shows the banner on cold-start failure with no data at all', async () => {
    mockedUseSWR.mockReturnValue({ data: undefined, error: new Error('down') });
    const { rerender } = renderChecker();
    mockedUseSWR.mockReturnValue({
      data: undefined,
      error: new Error('still down'),
    });
    rerender(
      <IntlProvider locale="en" defaultLocale="en">
        <StatusChecker />
      </IntlProvider>
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('auto-dismisses the banner once a poll succeeds again', async () => {
    const { rerender } = renderChecker();
    const rerenderChecker = () =>
      rerender(
        <IntlProvider locale="en" defaultLocale="en">
          <StatusChecker />
        </IntlProvider>
      );

    mockedUseSWR.mockReturnValue({ data: healthy, error: new Error('down 1') });
    rerenderChecker();
    mockedUseSWR.mockReturnValue({ data: healthy, error: new Error('down 2') });
    rerenderChecker();
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    mockedUseSWR.mockReturnValue({ data: healthy, error: undefined });
    rerenderChecker();
    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  it('still shows the version-update modal when healthy (existing behavior)', async () => {
    mockedUseSWR.mockReturnValue({
      data: { commitTag: 'newer-tag', restartRequired: false },
      error: undefined,
    });
    renderChecker();

    await waitFor(() => {
      expect(screen.getByText(/Seerr Updated/)).toBeInTheDocument();
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('polls every 10s normally and every 5s while the connection is down', async () => {
    const { rerender } = renderChecker();
    const rerenderChecker = () =>
      rerender(
        <IntlProvider locale="en" defaultLocale="en">
          <StatusChecker />
        </IntlProvider>
      );

    expect(mockedUseSWR.mock.calls[0][1].refreshInterval).toBe(10 * 1000);

    mockedUseSWR.mockReturnValue({ data: healthy, error: new Error('down 1') });
    rerenderChecker();
    mockedUseSWR.mockReturnValue({ data: healthy, error: new Error('down 2') });
    rerenderChecker();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    const lastCall =
      mockedUseSWR.mock.calls[mockedUseSWR.mock.calls.length - 1];
    expect(lastCall[1].refreshInterval).toBe(5 * 1000);
  });
});
