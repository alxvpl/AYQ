// AYQ's tokens, expressed as a Fluent theme.
//
// 04 A15 makes Fluent UI React v9 the single general component library, and
// A13 says Fluent is the platform layer rather than the product's identity.
// Both are served by the same thing: Fluent's components read Fluent's tokens,
// so the tokens are filled from `ayq-tokens.ts` and nothing is restyled
// component by component.
//
// Nothing here decides a colour. Every value comes from the token module.

import {
  createDarkTheme,
  createLightTheme,
  type BrandVariants,
  type Theme,
} from '@fluentui/react-components';

import { ayqRgb } from './ayq-colour.ts';
import {
  AYQ_ACCENT,
  AYQ_METRIC,
  AYQ_TOKENS,
  AYQ_TYPE,
  type AyqGroundResolved,
} from './ayq-tokens.ts';

function hex(value: number): string {
  return Math.max(0, Math.min(255, Math.round(value)))
    .toString(16)
    .padStart(2, '0');
}

function mix(one: string, other: string, t: number): string {
  const a = ayqRgb(one);
  const b = ayqRgb(other);
  return `#${hex(a.r + (b.r - a.r) * t)}${hex(a.g + (b.g - a.g) * t)}${hex(
    a.b + (b.b - a.b) * t,
  )}`;
}

/**
 * Fluent wants sixteen shades of the brand; AYQ has one accent (A16).
 *
 * So the ramp is computed from it rather than hand-picked: `80` is the accent
 * itself, which is the stop Fluent's light theme fills its brand surfaces
 * from, and the rest step away toward black and toward white. Changing the
 * accent changes all sixteen, which is what "one edit" has to mean.
 */
export function ayqBrandRamp(accent = AYQ_ACCENT): BrandVariants {
  const darker = [0.86, 0.72, 0.58, 0.46, 0.34, 0.23, 0.12];
  const lighter = [0.16, 0.31, 0.45, 0.57, 0.68, 0.78, 0.87, 0.94];
  const stops: string[] = [
    ...darker.map(t => mix(accent, '#000000', t)),
    accent,
    ...lighter.map(t => mix(accent, '#ffffff', t)),
  ];
  const ramp: Record<string, string> = {};
  stops.forEach((colour, index) => {
    ramp[String((index + 1) * 10)] = colour;
  });
  return ramp as unknown as BrandVariants;
}

/**
 * The theme for one ground.
 *
 * The overrides are the places where Fluent's defaults would contradict a
 * decision: white on a filled accent (A16, A18), a neutral palette that is not
 * AYQ's, and a numeric face that is not the interface face (A19).
 */
export function ayqTheme(ground: AyqGroundResolved): Theme {
  const ramp = ayqBrandRamp();
  const base = ground === 'light' ? createLightTheme(ramp) : createDarkTheme(ramp);
  const { identity, surface } = AYQ_TOKENS[ground];

  return {
    ...base,

    // Surfaces. A pane is a pane and never a material: Mica and Acrylic are
    // for the window and for transient surfaces only (A14).
    colorNeutralBackground1: surface.pane,
    colorNeutralBackground1Hover: surface.rowHover,
    colorNeutralBackground1Pressed: surface.rowSelected,
    colorNeutralBackground1Selected: surface.rowSelected,
    colorNeutralBackground2: surface.ground,
    colorNeutralBackground3: surface.ground,
    colorNeutralBackground4: surface.ground,
    colorNeutralBackground6: surface.ground,
    colorSubtleBackgroundHover: surface.rowHover,
    colorSubtleBackgroundPressed: surface.rowSelected,
    colorSubtleBackgroundSelected: surface.rowSelected,

    // Ink.
    colorNeutralForeground1: surface.ink,
    colorNeutralForeground2: surface.inkQuiet,
    colorNeutralForeground3: surface.inkFaint,
    colorNeutralForeground4: surface.inkFaint,

    // Lines.
    colorNeutralStroke1: surface.line,
    colorNeutralStroke2: surface.line,
    colorNeutralStroke3: surface.line,
    colorNeutralStroke1Hover: surface.lineStrong,
    colorNeutralStroke1Pressed: surface.lineStrong,
    colorNeutralStrokeAccessible: surface.lineStrong,

    // The accent, and the one foreground that may sit on it (A16, A18).
    colorBrandBackground: identity.accent,
    colorBrandBackgroundHover: identity.accentHover,
    colorBrandBackgroundPressed: identity.accentPressed,
    colorBrandBackgroundSelected: identity.accentPressed,
    colorBrandBackground2: identity.accentSoft,
    colorBrandStroke1: identity.accentLine,
    colorBrandStroke2: identity.accentLine,
    colorNeutralForegroundOnBrand: identity.accentInk,
    colorCompoundBrandBackground: identity.accent,
    colorCompoundBrandBackgroundHover: identity.accentHover,
    colorCompoundBrandBackgroundPressed: identity.accentPressed,
    colorCompoundBrandStroke: identity.accent,
    colorCompoundBrandStrokeHover: identity.accentHover,
    colorCompoundBrandStrokePressed: identity.accentPressed,
    colorCompoundBrandForeground1: identity.accentPressed,
    colorCompoundBrandForeground1Hover: identity.accentPressed,
    colorCompoundBrandForeground1Pressed: identity.accentPressed,
    colorBrandForeground1: identity.accentPressed,
    colorBrandForeground2: identity.accentPressed,
    colorBrandForegroundLink: identity.accentPressed,
    colorBrandForegroundLinkHover: identity.accentPressed,

    // Focus is visible everywhere, and it is the accent (A16).
    colorStrokeFocus2: identity.accentFocus,

    // Type. The numeric face is the interface face: the Ledger treatment is
    // tabular numerals in the text face, not a second typeface (A19).
    fontFamilyBase: AYQ_TYPE.family.ui,
    fontFamilyNumeric: AYQ_TYPE.family.ui,
    fontFamilyMonospace: AYQ_TYPE.family.mono,

    borderRadiusSmall: `${AYQ_METRIC.radiusSmall}px`,
    borderRadiusMedium: `${AYQ_METRIC.radiusMedium}px`,
  };
}
