import useDiscover from '@app/hooks/useDiscover';
import { renderHook, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import useSWRInfinite from 'swr/infinite';
import type { Mock } from 'vitest';
import { describe, expect, it, vi } from 'vitest';

vi.mock('swr/infinite', () => ({
  default: vi.fn(),
}));

vi.mock('@app/hooks/useSettings', () => ({
  default: () => ({
    currentSettings: { hideAvailable: false, hideBlocklisted: false },
  }),
}));

vi.mock('@app/hooks/useUser', () => ({
  useUser: () => ({ hasPermission: () => false }),
  Permission: {},
}));

const addToastMock = vi.fn();
vi.mock('@app/hooks/useToasts', () => ({
  default: () => ({ addToast: addToastMock }),
}));

const mockedInfinite = useSWRInfinite as unknown as Mock;

const pageWithTitles = {
  page: 1,
  totalPages: 5,
  totalResults: 100,
  results: [{ id: 1, mediaType: 'movie' }],
};

const renderDiscover = (error: unknown) => {
  mockedInfinite.mockReturnValue({
    data: [pageWithTitles],
    error,
    size: 1,
    setSize: vi.fn(),
    isValidating: false,
    mutate: vi.fn(),
  });

  return renderHook(() => useDiscover('/api/v1/discover/movies'), {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <IntlProvider locale="en" defaultLocale="en">
        {children}
      </IntlProvider>
    ),
  });
};

const networkError = Object.assign(new Error('Network Error'), {
  isAxiosError: true,
  response: undefined,
  config: {},
});

const serverError = Object.assign(new Error('Request failed with status 500'), {
  isAxiosError: true,
  response: { status: 500, data: {} },
  config: {},
});

describe('useDiscover error toasts', () => {
  it('stays silent on network errors (connection banner covers those)', async () => {
    addToastMock.mockClear();
    renderDiscover(networkError);

    // Let the error effect run, then confirm nothing was toasted.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(addToastMock).not.toHaveBeenCalled();
  });

  it('still toasts real API errors', async () => {
    addToastMock.mockClear();
    renderDiscover(serverError);

    await waitFor(() => {
      expect(addToastMock).toHaveBeenCalledTimes(1);
    });
  });
});
