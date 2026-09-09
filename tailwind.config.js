// eslint-disable-next-line @typescript-eslint/no-require-imports
const defaultTheme = require('tailwindcss/defaultTheme');

/**
 * Loom design tokens (DAN-55).
 *
 * Colors: `brand` is the primary accent scale built around the logo red
 * (#7A1F1F, cross-checked against loom-logo.svg). Grays/near-blacks stay
 * Tailwind defaults per the restrained minimal direction — only the accent
 * is branded. `indigo` is aliased to the same scale (see below).
 *
 * Type: Inter Variable (sans default), default Tailwind type scale.
 * Spacing: default Tailwind spacing scale.
 *
 * Why alias indigo instead of migrating ~40 files: every indigo usage in
 * the app is an accent role (primary buttons, active nav, links, focus
 * rings, badges) — exactly what the issue assigns to the brand accent.
 * The alias recolors them all at the config level with zero scattered
 * edits. New code MUST use `brand-*` (semantic); a future pass may rename
 * old `indigo-*` classes file by file with no visual change.
 */
const brand = {
  50: '#FBF3F3',
  100: '#F4E0E0',
  200: '#E7C2C2',
  300: '#D49494',
  400: '#BC6363',
  500: '#9A3B3B',
  600: '#7E2929',
  700: '#7A1F1F',
  800: '#5D1717',
  900: '#461010',
  950: '#2B0A0A',
};

/** @type {import('tailwindcss').Config} */
module.exports = {
  mode: 'jit',
  content: [
    './node_modules/@seerr-team/react-tailwindcss-datepicker/dist/index.esm.js',
    './src/pages/**/*.{ts,tsx}',
    './src/components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand,
        indigo: brand,
      },
      transitionProperty: {
        'max-height': 'max-height',
        width: 'width',
      },
      fontFamily: {
        sans: ['Inter Variable', ...defaultTheme.fontFamily.sans],
      },
      typography: (theme) => ({
        DEFAULT: {
          css: {
            color: theme('colors.gray.300'),
            a: {
              color: theme('colors.indigo.500'),
              '&:hover': {
                color: theme('colors.indigo.400'),
              },
            },

            h1: {
              color: theme('colors.gray.300'),
            },
            h2: {
              color: theme('colors.gray.300'),
            },
            h3: {
              color: theme('colors.gray.300'),
            },
            h4: {
              color: theme('colors.gray.300'),
            },
            h5: {
              color: theme('colors.gray.300'),
            },
            h6: {
              color: theme('colors.gray.300'),
            },

            strong: {
              color: theme('colors.gray.400'),
            },

            code: {
              color: theme('colors.gray.300'),
            },

            figcaption: {
              color: theme('colors.gray.500'),
            },
          },
        },
      }),
    },
    aspectRatio: {
      auto: 'auto',
      square: '1 / 1',
      video: '16 / 9',
      1: '1',
      2: '2',
      3: '3',
      4: '4',
      5: '5',
      6: '6',
      7: '7',
      8: '8',
      9: '9',
      10: '10',
      11: '11',
      12: '12',
      13: '13',
      14: '14',
      15: '15',
      16: '16',
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography'),
    require('@tailwindcss/aspect-ratio'),
  ],
};
