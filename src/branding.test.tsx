import PWAHeader from '@app/components/PWAHeader';
import { cleanup, render } from '@testing-library/react';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { IntlProvider } from 'react-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';

const ROOT = process.cwd();

const readJson = (rel: string) =>
  JSON.parse(readFileSync(join(ROOT, rel), 'utf8')) as Record<string, string>;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Loom branding (DAN-63)', () => {
  it('has no Jellyseerr or standalone Seerr strings in English copy', () => {
    const en = readJson('src/i18n/locale/en.json');
    for (const value of Object.values(en)) {
      expect(value).not.toContain('Jellyseerr');
      // No Jellyseerr exists in en.json, so any 'Seerr' is standalone.
      expect(value).not.toContain('Seerr');
    }
  });

  it('defaults the app name metadata to Loom', () => {
    render(
      <IntlProvider locale="en" defaultLocale="en">
        <PWAHeader />
      </IntlProvider>
    );

    expect(
      document
        .querySelector('meta[name="application-name"]')
        ?.getAttribute('content')
    ).toBe('Loom');
    expect(
      document
        .querySelector('meta[name="apple-mobile-web-app-title"]')
        ?.getAttribute('content')
    ).toBe('Loom');
  });

  it('serves Loom logo SVGs carrying the brand color', () => {
    for (const file of ['public/logo_full.svg', 'public/logo_stacked.svg']) {
      const svg = readFileSync(join(ROOT, file), 'utf8');
      expect(svg).toContain('#7A1F1F');
      expect(svg).not.toContain('Jellyseerr');
    }
  });

  it('links only splash screens that exist on disk', () => {
    render(
      <IntlProvider locale="en" defaultLocale="en">
        <PWAHeader />
      </IntlProvider>
    );

    // React hoists link/meta elements to document.head.
    const hrefs = [...document.head.querySelectorAll('link')]
      .map((link) => link.getAttribute('href'))
      .filter((href): href is string => href?.startsWith('/') ?? false);

    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(
        existsSync(join(ROOT, 'public', href.slice(1))),
        `missing asset: ${href}`
      ).toBe(true);
    }
  });

  it('references only manifest icons that exist on disk', () => {
    const manifest = JSON.parse(
      readFileSync(join(ROOT, 'public/site.webmanifest'), 'utf8')
    ) as {
      icons: { src: string }[];
      shortcuts: { icons: { src: string }[] }[];
    };

    const srcs = [
      ...manifest.icons.map((icon) => icon.src),
      ...manifest.shortcuts.flatMap((shortcut) =>
        shortcut.icons.map((icon) => icon.src)
      ),
    ];
    expect(srcs.length).toBeGreaterThan(0);
    for (const src of srcs) {
      const file = src.replace(/^\.\//, '');
      expect(existsSync(join(ROOT, 'public', file)), `missing: ${src}`).toBe(
        true
      );
    }
  });
});
