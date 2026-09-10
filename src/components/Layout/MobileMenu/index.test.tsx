import MobileMenu from '@app/components/Layout/MobileMenu';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    className,
    onClick,
  }: {
    children: React.ReactNode;
    href: string;
    className?: string;
    onClick?: () => void;
  }) => (
    <a href={href} className={className} onClick={onClick}>
      {children}
    </a>
  ),
}));

vi.mock('next/router', () => ({
  useRouter: () => ({ pathname: '/discover/movies' }),
}));

vi.mock('@app/hooks/useUser', () => ({
  useUser: () => ({ hasPermission: () => true }),
  Permission: { ADMIN: 1 },
}));

const renderMenu = () =>
  render(
    <IntlProvider locale="en" defaultLocale="en">
      <MobileMenu
        pendingRequestsCount={0}
        openIssuesCount={0}
        revalidateIssueCount={() => undefined}
        revalidateRequestsCount={() => undefined}
      />
    </IntlProvider>
  );

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('MobileMenu bottom bar (DAN-59)', () => {
  it('renders icon tabs with 44px touch targets plus a More button', () => {
    renderMenu();

    // First links are bar tabs; the rest live in the More sheet.
    const barTabHrefs = ['/discover', '/discover/movies', '/discover/anime'];
    for (const href of barTabHrefs) {
      const tab = document.querySelector(
        `a[href="${href}"]`
      ) as HTMLElement | null;
      expect(tab).toBeTruthy();
      expect(tab?.className).toContain('min-h-[44px]');
      expect(tab?.className).toContain('min-w-[44px]');
    }

    // Active tab is highlighted.
    expect(
      document.querySelector('a[href="/discover/movies"]')?.className
    ).toContain('text-indigo-500');
  });

  it('opens the More sheet with 44px rows and closes on selection', async () => {
    renderMenu();

    // Sheet starts closed — settings link not rendered.
    expect(document.querySelector('a[href="/settings"]')).toBeNull();

    const moreButton = screen.getByRole('button');
    fireEvent.click(moreButton);

    await waitFor(() => {
      expect(document.querySelector('a[href="/settings"]')).toBeTruthy();
    });

    const sheetLink = document.querySelector(
      'a[href="/settings"]'
    ) as HTMLElement | null;
    expect(sheetLink?.className).toContain('min-h-[44px]');

    // Sheet is top-anchored below the search bar and scrolls when full.
    const sheet = screen.getByTestId('mobile-more-sheet');
    expect(sheet.className).toContain('overflow-y-auto');

    // Floating pill bar with rounded corners.
    expect(screen.getByTestId('mobile-nav-bar').className).toContain(
      'rounded-2xl'
    );

    fireEvent.click(sheetLink as HTMLElement);

    await waitFor(() => {
      expect(document.querySelector('a[href="/settings"]')).toBeNull();
    });
  });

  it('shows tab labels when idle and collapses them scrolling down', async () => {
    Object.defineProperty(window, 'pageYOffset', {
      value: 0,
      writable: true,
      configurable: true,
    });
    renderMenu();

    const moviesTab = document.querySelector(
      'a[href="/discover/movies"]'
    ) as HTMLElement | null;
    expect(moviesTab?.textContent).toContain('Movies');
    expect(moviesTab?.querySelector('span:last-child')?.className).toContain(
      'max-h-4'
    );

    // Scroll down: labels collapse to icons only.
    Object.defineProperty(window, 'pageYOffset', {
      value: 600,
      writable: true,
      configurable: true,
    });
    fireEvent.scroll(window);
    expect(moviesTab?.querySelector('span:last-child')?.className).toContain(
      'max-h-0'
    );

    // Scroll back up: labels return.
    Object.defineProperty(window, 'pageYOffset', {
      value: 100,
      writable: true,
      configurable: true,
    });
    fireEvent.scroll(window);
    expect(moviesTab?.querySelector('span:last-child')?.className).toContain(
      'max-h-4'
    );
  });
});
