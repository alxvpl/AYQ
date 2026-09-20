// AYQ Analyses — the A1 theme.
//
// Fluent's default brand ramp is not our accent (r05 §1: A16–A18; PC2). The
// theme is built from Electric Mint, so no default blue survives as an
// app-owned focus, selection or brand treatment, and the filled primary
// button is dark with mint text — never white on mint, never Fluent's blue.
// Ordinary window chrome drawn by Windows is outside this rule.

import { createLightTheme, type BrandVariants, type Theme } from '@fluentui/react-components';

/** Electric Mint, the product accent (04_DESIGN A16). */
export const ACCENT = '#22d3a6';

/** The ground of a filled primary button (04_DESIGN A18). */
export const PRIMARY_GROUND = '#1b1f24';

/**
 * A brand ramp around the accent. 110 is the accent itself; the darker steps
 * carry focus and selection on light ground, the lighter ones tints.
 */
export const MINT: BrandVariants = {
  10: '#031a13',
  20: '#062a22',
  30: '#08392e',
  40: '#0a4b3b',
  50: '#0d5d49',
  60: '#0f7058',
  70: '#128368',
  80: '#159778',
  90: '#18ab88',
  100: '#1bbf98',
  110: ACCENT,
  120: '#4bdbb5',
  130: '#72e2c4',
  140: '#98e9d3',
  150: '#bdf0e2',
  160: '#e0f8f1',
};

export const analysesTheme: Theme = {
  ...createLightTheme(MINT),
  colorBrandBackground: PRIMARY_GROUND,
  colorBrandBackgroundHover: '#2a3038',
  colorBrandBackgroundPressed: '#111418',
  colorBrandBackgroundSelected: '#2a3038',
  colorNeutralForegroundOnBrand: ACCENT,
};
