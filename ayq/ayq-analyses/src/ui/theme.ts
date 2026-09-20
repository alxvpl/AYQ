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
import { ACCENT, DARK, VIOLET_RAMP } from './tokens.js';

/** Kept for callers and tests that name the accent; the ramp is the source. */
export const PRIMARY_GROUND = DARK.ground;

/**
 * The brand ramp around the accent, owned by the token module (T1). 110 is
 * the fill; 80 is the on-light text value, which is where Fluent's light
 * theme reads links, compound brand foreground and brand strokes from; the
 * steps between and beyond are the same hue at other lightnesses, so every
 * derived token stays violet. Nothing is derived or generated here.
 */
export const VIOLET: BrandVariants = VIOLET_RAMP;

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
