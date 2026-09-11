import PWAHeader from '@app/components/PWAHeader';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

// NOTE: intentionally no IntlProvider — PWAHeader renders inside
// next/head and must never depend on React context (SSR crash, DAN-65).
const renderHeader = (props?: {
  applicationTitle?: string;
  applicationUrl?: string;
}) => {
  const container = document.createElement('div');
  document.head.appendChild(container);
  render(<PWAHeader {...props} />, {
    container,
    baseElement: document.head as unknown as Element,
  });
  return container;
};

afterEach(() => {
  cleanup();
  document.head
    .querySelectorAll('meta[property^="og:"], meta[name^="twitter:"]')
    .forEach((el) => el.remove());
});

describe('PWAHeader social metadata (DAN-65)', () => {
  it('renders Loom branding with an absolute preview image URL', () => {
    renderHeader({
      applicationTitle: 'Loom',
      applicationUrl: 'https://loom.example.com/',
    });

    const meta = (selector: string) =>
      document.head.querySelector(selector)?.getAttribute('content');

    expect(meta('meta[property="og:site_name"]')).toBe('Loom');
    expect(meta('meta[property="og:title"]')).toBe('Loom');
    expect(meta('meta[property="og:description"]')).toContain('Loom');
    expect(meta('meta[property="og:image"]')).toBe(
      'https://loom.example.com/og-banner.png'
    );
    expect(meta('meta[name="twitter:card"]')).toBe('summary_large_image');
    expect(meta('meta[name="twitter:image"]')).toBe(
      'https://loom.example.com/og-banner.png'
    );
  });

  it('trims whitespace and slashes from the application URL', () => {
    renderHeader({
      applicationTitle: 'Loom',
      applicationUrl: 'https://loom.example.com/ ',
    });

    expect(
      document.head
        .querySelector('meta[property="og:image"]')
        ?.getAttribute('content')
    ).toBe('https://loom.example.com/og-banner.png');
  });

  it('omits image tags when no application URL is configured', () => {
    renderHeader({ applicationTitle: 'Loom', applicationUrl: '' });

    expect(document.head.querySelector('meta[property="og:image"]')).toBeNull();
    expect(
      document.head.querySelector('meta[name="twitter:image"]')
    ).toBeNull();
    expect(
      document.head
        .querySelector('meta[property="og:title"]')
        ?.getAttribute('content')
    ).toBe('Loom');
  });
});
