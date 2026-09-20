// AYQ Analyses — the theme, built from the tokens.
//
// Fluent's default brand ramp is not our accent (r05 §1: A16–A18; PC2). The
// theme is built from the Electric Violet ramp of tokens.ts, so no default
// blue survives as an app-owned focus, selection or brand treatment, and the
// filled primary button is dark with accent text — the on-dark value of the
// ramp, never white on the accent, never Fluent's blue (04_DESIGN A18 as
// restated for the violet ramp in A2 exchange 004 §3 / 006 §8). Ordinary
// window chrome drawn by Windows is outside this rule.

import { createLightTheme, type BrandVariants, type Theme } from '@fluentui/react-components';
import { ACCENT, DARK } from './tokens.js';

/** Kept for callers and tests that name the accent; the ramp is the source. */
export const PRIMARY_GROUND = DARK.ground;

/**
 * The brand ramp around the accent. 110 is the fill; 80 is the on-light text
 * value, which is where Fluent's light theme reads links, compound brand
 * foreground and brand strokes from; the steps between and beyond are the
 * same hue at other lightnesses, so every derived token stays violet.
 */
export const VIOLET: BrandVariants = {
  10: '#0e042f',
  20: '#17074b',
  30: '#200967',
  40: '#2a0c88',
  50: '#340fa8',
  60: '#3e12c9',
  70: '#4c1aea',
  80: ACCENT.onLight,
  90: '#744def',
  100: '#7a54ef',
  110: ACCENT.fill,
  120: '#a085f4',
  130: '#b6a2f6',
  140: '#ccbef9',
  150: '#ded5fb',
  160: '#f0ecfd',
};

export const analysesTheme: Theme = {
  ...createLightTheme(VIOLET),
  // The filled primary button: the dark ground with the on-dark accent as its
  // label (A18; r05 §3; 004 §3).
  colorBrandBackground: DARK.ground,
  colorBrandBackgroundHover: DARK.groundHover,
  colorBrandBackgroundPressed: DARK.groundPressed,
  colorBrandBackgroundSelected: DARK.groundHover,
  colorNeutralForegroundOnBrand: ACCENT.onDark,
  // Focus and selection geometry take the fill; accent text takes on-light.
  colorStrokeFocus2: ACCENT.fill,
  colorCompoundBrandStroke: ACCENT.fill,
  colorCompoundBrandStrokeHover: ACCENT.fill,
  colorCompoundBrandStrokePressed: ACCENT.onLight,
  colorCompoundBrandBackground: ACCENT.fill,
  colorCompoundBrandBackgroundHover: ACCENT.fill,
  colorCompoundBrandBackgroundPressed: ACCENT.onLight,
  colorBrandStroke1: ACCENT.fill,
  colorCompoundBrandForeground1: ACCENT.onLight,
  colorBrandForegroundLink: ACCENT.onLight,
  colorBrandForegroundLinkHover: ACCENT.onLight,
  colorBrandForegroundLinkPressed: ACCENT.onLight,
  colorBrandForeground1: ACCENT.onLight,
  colorBrandForeground2: ACCENT.onLight,
};
