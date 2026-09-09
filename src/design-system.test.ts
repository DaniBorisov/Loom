import resolveConfig from 'tailwindcss/resolveConfig';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore: untyped CJS config outside src (no absolute alias reaches it)
// eslint-disable-next-line no-relative-import-paths/no-relative-import-paths
import tailwindConfig from '../tailwind.config.js';
import { describe, expect, it } from 'vitest';

const theme = resolveConfig(tailwindConfig).theme as unknown as {
  colors: Record<string, Record<string, string>>;
  fontFamily: { sans: string[] };
};

describe('design tokens (DAN-55)', () => {
  it('defines the brand accent scale on the logo red', () => {
    expect(theme.colors.brand[700]).toBe('#7A1F1F');
    expect(theme.colors.brand[600]).toBe('#7E2929');
    expect(theme.colors.brand[100]).toBe('#F4E0E0');
  });

  it('aliases indigo to the brand scale so existing accents follow', () => {
    expect(theme.colors.indigo).toEqual(theme.colors.brand);
  });

  it('keeps Inter Variable as the default sans stack', () => {
    expect(theme.fontFamily.sans[0]).toContain('Inter Variable');
  });
});
