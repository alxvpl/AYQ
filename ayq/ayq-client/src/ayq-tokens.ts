// The one source of colour, metric and type.
//
// 04 A16-A19 and A23 decide what AYQ looks like; this module is where those
// decisions are written down, once. Every component reads from here, and
// nothing anywhere else may hold a colour, a length or a font. Changing the
// palette is one edit: the accent is a single constant and its hover, pressed,
// focus and soft derivations are computed from it, per ground.
//
// The state scale is deliberately *not* derived from the accent (A17). Accent
// and state are two scales that never meet: the accent marks where you are,
// the state scale says what something is. `ayq-tokens.test.ts` holds both to
// that, and to 4.5:1 on every filled accent surface.

import { ayqRgb } from './ayq-colour.ts';
import type { AyqGround } from './ayq-ipc-contract.ts';

export type { AyqGround };

/** What `system` resolves to once the window is asked (04 A23). */
export type AyqGroundResolved = 'light' | 'dark';

export const AYQ_GROUNDS: readonly AyqGround[] = ['light', 'dark', 'system'];
export const AYQ_GROUNDS_RESOLVED: readonly AyqGroundResolved[] = [
  'light',
  'dark',
];

// ---------------------------------------------------------------- arithmetic

function hex(value: number): string {
  return Math.max(0, Math.min(255, Math.round(value)))
    .toString(16)
    .padStart(2, '0');
}

/** `t` of `other` mixed into `one`, in sRGB. */
function mix(one: string, other: string, t: number): string {
  const a = ayqRgb(one);
  const b = ayqRgb(other);
  return `#${hex(a.r + (b.r - a.r) * t)}${hex(a.g + (b.g - a.g) * t)}${hex(
    a.b + (b.b - a.b) * t,
  )}`;
}

const BLACK = '#000000';
const WHITE = '#ffffff';

const shade = (colour: string, t: number): string => mix(colour, BLACK, t);
const tint = (colour: string, t: number): string => mix(colour, WHITE, t);

// ------------------------------------------------------------------ identity

/**
 * Electric Mint (04 A16). The one edit.
 *
 * An accent, never a background for large surfaces: it marks the active
 * destination, the selected tab, the selected row and focus. Distinct from
 * CIVION's identity green `#1D3B32`, which is never used here, as a value or
 * as a derivation.
 */
export const AYQ_ACCENT = '#22d3a6';

/**
 * The near-black that goes on filled mint (A16, A18).
 *
 * Never white: white on this mint is about 1.9:1, which is not a contrast, it
 * is a rumour. `ayq-tokens.test.ts` asserts both halves of that.
 */
export const AYQ_ACCENT_INK = '#10201c';

/** CIVION's identity green. Held here so a test can prove AYQ never uses it. */
export const CIVION_GREEN = '#1d3b32';

export type AyqIdentityTokens = {
  accent: string;
  /** The accent as a line: the selected tab's underline, the selected row's edge. */
  accentLineOn: string;
  /** The foreground on any filled accent surface. */
  accentInk: string;
  accentHover: string;
  accentPressed: string;
  /** The focus ring. Legible on the ground it is drawn against. */
  accentFocus: string;
  /** A wash of the accent: filter chips, the row a change just landed on. */
  accentSoft: string;
  /** The line around a soft accent surface. */
  accentLine: string;
  /**
   * The filled primary button (A18): dark with mint text, one treatment
   * everywhere. On a dark ground it lightens enough to stay visible against
   * the pane it sits on.
   */
  buttonFill: string;
  buttonFillHover: string;
  buttonFillPressed: string;
  /** The primary button's text: mint, lifted on the dark button (A18). */
  buttonInk: string;
  buttonEdge: string;
};

// --------------------------------------------------------------- state scale

/**
 * The five states of A17, as their own scale.
 *
 * `overdue` is the one Canon names "overdue and error": red means one thing —
 * something is wrong — and a negative amount is not one of them (A19).
 */
export type AyqStateName =
  | 'confirmed'
  | 'rule'
  | 'suggested'
  | 'overdue'
  | 'neutral'
  | 'uncategorised'
  | 'operational';

export const AYQ_STATES: readonly AyqStateName[] = [
  'confirmed',
  'rule',
  'suggested',
  'overdue',
  'neutral',
  'uncategorised',
  'operational',
];

/**
 * A state's ink and fill, and where the template draws one, its edge.
 *
 * `rule` is dashed and carries the ƒ glyph; `suggested` has a solid edge;
 * `operational` — coverage, reconciliation, the balance anchor — is an
 * outlined chip with no fill, visibly not a domain state (TV).
 */
export type AyqStatePair = { fg: string; bg: string; edge?: string };
export type AyqStateTokens = Record<AyqStateName, AyqStatePair>;

// ------------------------------------------------------------------ surfaces

export type AyqSurfaceTokens = {
  /** The window's ground: what the screen body sits on. */
  ground: string;
  /** A pane: where figures and tables live. Never a material (A14). */
  pane: string;
  /** A quiet surface inside a pane: the table header, a count box. */
  quiet: string;
  /** A field's fill. */
  field: string;
  /** The status bar's surface. */
  status: string;
  rail: string;
  railInk: string;
  railInkOn: string;
  /** The line the rail's groups are separated by. */
  railLine: string;
  railHover: string;
  /** The current destination's surface, and its ink. */
  railCurrent: string;
  railCurrentInk: string;
  railBadge: string;
  ink: string;
  /** Secondary text: labels, the second line of a cell. */
  inkQuiet: string;
  /** Tertiary text: the notes beside a figure. */
  inkFaint: string;
  /** A label over a field or a table column. */
  label: string;
  line: string;
  lineStrong: string;
  /** The line between rows and sections inside a pane. */
  section: string;
  /** The edge of a control: a field, a secondary button. */
  controlEdge: string;
  rowHover: string;
  rowSelected: string;
  /** A secondary button, hovered. */
  secondaryHover: string;
  danger: string;
  disabledFill: string;
  disabledInk: string;
  /** Behind a dialog. */
  scrim: string;
};

export type AyqTokenSet = {
  identity: AyqIdentityTokens;
  state: AyqStateTokens;
  surface: AyqSurfaceTokens;
};

/** The accent's derivations, per ground. Darkened on light, lifted on dark. */
function identity(ground: AyqGroundResolved, pane: string): AyqIdentityTokens {
  const accent = AYQ_ACCENT;
  if (ground === 'light') {
    return {
      accent,
      accentLineOn: '#0d9474',
      accentInk: AYQ_ACCENT_INK,
      accentHover: shade(accent, 0.1),
      accentPressed: shade(accent, 0.25),
      accentFocus: '#0b8f70',
      accentSoft: tint(accent, 0.88),
      accentLine: tint(accent, 0.45),
      buttonFill: '#26231f',
      buttonFillHover: '#33302b',
      buttonFillPressed: '#1c1a17',
      buttonInk: '#5fe9c4',
      buttonEdge: '#26231f',
    };
  }
  return {
    accent,
    accentLineOn: accent,
    accentInk: AYQ_ACCENT_INK,
    accentHover: tint(accent, 0.2),
    accentPressed: shade(accent, 0.15),
    // On a dark ground the ring is the accent itself: a darkened mint would
    // disappear into the pane it is meant to be drawn on top of.
    accentFocus: accent,
    accentSoft: mix(accent, pane, 0.86),
    accentLine: mix(accent, pane, 0.52),
    // Near-black would vanish into a dark pane, so the button surface lifts
    // away from it instead (A18).
    buttonFill: '#4a463f',
    buttonFillHover: '#55504a',
    buttonFillPressed: '#403c36',
    buttonInk: '#7ef1d0',
    buttonEdge: '#776f66',
  };
}

// The warm Light foundation and the dark neutral axis of template r003, not a
// grey inversion (TV).
const LIGHT_SURFACE: AyqSurfaceTokens = {
  ground: '#f7f5f0',
  pane: '#ffffff',
  quiet: '#f4f1ea',
  field: '#f6f3ec',
  status: '#efece4',
  rail: '#232120',
  railInk: '#cfc9c1',
  railInkOn: '#f1ede7',
  railLine: '#363330',
  railHover: '#2e2b29',
  railCurrent: '#3a3633',
  railCurrentInk: '#f6f3ee',
  railBadge: '#4a4642',
  ink: '#1e1b18',
  inkQuiet: '#5b554d',
  inkFaint: '#665f57',
  label: '#625c54',
  line: '#e2ddd2',
  lineStrong: '#cfc8ba',
  section: '#ece8df',
  controlEdge: '#b3ab9b',
  rowHover: '#f1eee7',
  rowSelected: '#eceae4',
  secondaryHover: '#f5f2ec',
  danger: '#a33b31',
  disabledFill: '#ece9e2',
  disabledInk: '#8a8479',
  scrim: 'rgba(10, 12, 14, 0.55)',
};

const DARK_SURFACE: AyqSurfaceTokens = {
  ground: '#1a1917',
  pane: '#211f1d',
  quiet: '#282623',
  field: '#262421',
  status: '#1e1c1a',
  rail: '#121110',
  railInk: '#b9b4ac',
  railInkOn: '#f4f1ec',
  railLine: '#2b2926',
  railHover: '#201e1c',
  railCurrent: '#2b2926',
  railCurrentInk: '#f4f1ec',
  railBadge: '#3e3b37',
  ink: '#f2efea',
  inkQuiet: '#c6c1ba',
  inkFaint: '#a9a39a',
  label: '#b5afa6',
  line: '#3a3733',
  lineStrong: '#4e4a45',
  section: '#302e2b',
  controlEdge: '#665f58',
  rowHover: '#2c2a27',
  rowSelected: '#302e2b',
  secondaryHover: '#302e2b',
  danger: '#f28b82',
  disabledFill: '#2a2825',
  disabledInk: '#7a756e',
  scrim: 'rgba(4, 6, 8, 0.62)',
};

/**
 * The state scale, per ground.
 *
 * Uncategorised is a valid state (03 §4.5) and therefore has a tone of its
 * own rather than borrowing neutral's: a transaction nobody has filed is not
 * the same as one there is nothing to say about.
 *
 * Confirmed is blue rather than the green the prototypes used, and that is
 * A17 rather than taste: the accent is a mint green, and a green "confirmed"
 * sits twelve degrees of hue from it — close enough that a confirmed chip
 * reads as something the accent has marked. Blue is ninety-five degrees away.
 *
 * Both are PROVISIONAL: 04 r002 names the five states and fixes no value for
 * any of them.
 */
const LIGHT_STATE: AyqStateTokens = {
  confirmed: { fg: '#1b4f8a', bg: '#e4ecf7' },
  rule: { fg: '#5b554d', bg: '#f4f1ea', edge: '#b3ab9b' },
  suggested: { fg: '#7a5610', bg: '#fff3d2', edge: '#d6ae50' },
  overdue: { fg: '#9a2f26', bg: '#fbe9e6' },
  neutral: { fg: '#4e5761', bg: '#edeff2' },
  uncategorised: { fg: '#66506d', bg: '#f1ebf3' },
  operational: { fg: '#5b554d', bg: 'transparent', edge: '#cfc8ba' },
};

const DARK_STATE: AyqStateTokens = {
  confirmed: { fg: '#9dc4ef', bg: '#16283d' },
  rule: { fg: '#c6c1ba', bg: '#282623', edge: '#665f58' },
  suggested: { fg: '#e9c874', bg: '#43340f', edge: '#8f742e' },
  overdue: { fg: '#f2a59c', bg: '#4a2420' },
  neutral: { fg: '#bac3cc', bg: '#30363d' },
  uncategorised: { fg: '#d2bbda', bg: '#3b2f40' },
  operational: { fg: '#c6c1ba', bg: 'transparent', edge: '#4e4a45' },
};

export const AYQ_TOKENS: Record<AyqGroundResolved, AyqTokenSet> = {
  light: {
    identity: identity('light', LIGHT_SURFACE.pane),
    state: LIGHT_STATE,
    surface: LIGHT_SURFACE,
  },
  dark: {
    identity: identity('dark', DARK_SURFACE.pane),
    state: DARK_STATE,
    surface: DARK_SURFACE,
  },
};

// -------------------------------------------------------------------- metric

/**
 * Every length the interface uses.
 *
 * Density, spacing and radius are not decided by 04 r002. These are what the
 * work needs, kept here so that changing them is one edit and so that the
 * report can list what was chosen. PROVISIONAL.
 */
export const AYQ_METRIC = {
  /** 04 A20, A39. */
  railWidth: 64,
  railItemWidth: 56,
  railItemHeight: 58,
  railIcon: 20,
  railCaption: 11,
  /** The title bar, in the rail's surface, with the native controls on it. */
  titleBarHeight: 32,
  /** 04 A20: a status bar, carrying no version number. A39: 24. */
  statusHeight: 24,
  /** The screen strip, and the hit target of a tab on it (A39). */
  stripHeight: 38,
  stripHit: 36,
  /** A pane's header, and its padding (A39). */
  paneHeaderHeight: 40,
  panePadding: 18,
  /** The gap between the table and the detail (A39). */
  splitGap: 8,
  /** 04 A4: the detail pane beside the table, at every width. */
  paneWidth: 390,
  /** AYQ-owned compact controls: buttons, chips' hosts (A39). */
  controlHeight: 28,
  hairline: 1,
  radiusSmall: 3,
  radiusMedium: 4,
  radiusPill: 11,
  /** The 2 / 4 / 6 / 8 / 10 / 12 / 18 scale (A39). */
  space: {
    hair: 2,
    tight: 4,
    small: 6,
    medium: 8,
    ten: 10,
    wide: 12,
    screen: 18,
    edge: 18,
  },
  row: { paddingY: 6, paddingX: 10 },
  header: { paddingY: 6, paddingX: 10 },
  focusRing: 2,
} as const;

// ---------------------------------------------------------------------- type

/**
 * The type scale. Segoe UI Variable first, because AYQ is tuned toward
 * Windows 11 (A12), with a system stack behind it for every other machine.
 *
 * Figures are the interface face with tabular numerals (A19); there is no
 * separate numeric face, which is the whole point of the Ledger treatment.
 */
export const AYQ_TYPE = {
  family: {
    ui: '"Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif',
    display: '"Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif',
    mono: '"Cascadia Mono", Consolas, ui-monospace, monospace',
  },
  /** A39: 11 / 12.5 / 14 / 15 / 20 / 28 / 38. */
  size: {
    caption: '11px',
    small: '12.5px',
    body: '14px',
    heading: '15px',
    screen: '20px',
    figure: '28px',
    headline: '38px',
  },
  weight: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  /** 04 A19: tabular numerals everywhere a figure is shown. */
  figures: 'tabular-nums',
} as const;

// ------------------------------------------------------- what the tests read

export type AyqFilledSurface = {
  /** What it is, so a failure names the surface rather than a hex value. */
  name: string;
  surface: string;
  ink: string;
};

/**
 * Every surface that is filled with the accent or with the accent's button
 * treatment, paired with the foreground that goes on it.
 *
 * The contrast rule is checked against this list, so a new filled surface is
 * either in here and proved, or it is not a filled accent surface.
 */
export function ayqFilledAccentSurfaces(
  ground: AyqGroundResolved,
): AyqFilledSurface[] {
  const { accent, accentInk, accentHover, accentPressed, accentSoft } =
    AYQ_TOKENS[ground].identity;
  const { buttonFill, buttonFillHover, buttonFillPressed, buttonInk } =
    AYQ_TOKENS[ground].identity;
  const { ink } = AYQ_TOKENS[ground].surface;
  return [
    { name: 'accent fill', surface: accent, ink: accentInk },
    { name: 'accent fill, hovered', surface: accentHover, ink: accentInk },
    { name: 'accent fill, pressed', surface: accentPressed, ink: accentInk },
    { name: 'accent wash', surface: accentSoft, ink },
    { name: 'primary button', surface: buttonFill, ink: buttonInk },
    {
      name: 'primary button, hovered',
      surface: buttonFillHover,
      ink: buttonInk,
    },
    {
      name: 'primary button, pressed',
      surface: buttonFillPressed,
      ink: buttonInk,
    },
  ];
}

/** Every identity colour, flat, for the tests that hold A17. */
export function ayqIdentityColours(ground: AyqGroundResolved): string[] {
  return Object.values(AYQ_TOKENS[ground].identity);
}

/** Every state colour, flat. */
export function ayqStateColours(ground: AyqGroundResolved): string[] {
  return AYQ_STATES.flatMap(name => {
    const pair = AYQ_TOKENS[ground].state[name];
    return [pair.fg, pair.bg, ...(pair.edge ? [pair.edge] : [])].filter(
      one => one !== 'transparent',
    );
  });
}

// ------------------------------------------------------------ css variables

/**
 * The tokens as custom properties, for the AYQ-owned components.
 *
 * Fluent's own components read Fluent's tokens, which `ayq-theme.ts` fills
 * from exactly these values; the tables, the rail and the figures are AYQ's
 * own (A13) and read these. One set of values, two consumers.
 */
export function ayqCssVariables(
  ground: AyqGroundResolved,
): Record<string, string> {
  const { identity: id, state, surface } = AYQ_TOKENS[ground];
  const variables: Record<string, string> = {
    '--ayq-accent': id.accent,
    '--ayq-accent-ink': id.accentInk,
    '--ayq-accent-hover': id.accentHover,
    '--ayq-accent-pressed': id.accentPressed,
    '--ayq-accent-focus': id.accentFocus,
    '--ayq-accent-soft': id.accentSoft,
    '--ayq-accent-line': id.accentLine,
    '--ayq-button-fill': id.buttonFill,
    '--ayq-button-fill-hover': id.buttonFillHover,
    '--ayq-button-fill-pressed': id.buttonFillPressed,
    '--ayq-button-ink': id.buttonInk,
    '--ayq-button-edge': id.buttonEdge,
    '--ayq-accent-line-on': id.accentLineOn,
    '--ayq-ground': surface.ground,
    '--ayq-pane': surface.pane,
    '--ayq-quiet': surface.quiet,
    '--ayq-field': surface.field,
    '--ayq-status': surface.status,
    '--ayq-rail': surface.rail,
    '--ayq-rail-ink': surface.railInk,
    '--ayq-rail-ink-on': surface.railInkOn,
    '--ayq-rail-line': surface.railLine,
    '--ayq-rail-hover': surface.railHover,
    '--ayq-rail-current': surface.railCurrent,
    '--ayq-rail-current-ink': surface.railCurrentInk,
    '--ayq-rail-badge': surface.railBadge,
    '--ayq-ink': surface.ink,
    '--ayq-ink-quiet': surface.inkQuiet,
    '--ayq-ink-faint': surface.inkFaint,
    '--ayq-label': surface.label,
    '--ayq-line': surface.line,
    '--ayq-line-strong': surface.lineStrong,
    '--ayq-section': surface.section,
    '--ayq-control-edge': surface.controlEdge,
    '--ayq-row-hover': surface.rowHover,
    '--ayq-row-selected': surface.rowSelected,
    '--ayq-secondary-hover': surface.secondaryHover,
    '--ayq-danger': surface.danger,
    '--ayq-disabled-fill': surface.disabledFill,
    '--ayq-disabled-ink': surface.disabledInk,
    '--ayq-scrim': surface.scrim,
    '--ayq-rail-width': `${AYQ_METRIC.railWidth}px`,
    '--ayq-status-height': `${AYQ_METRIC.statusHeight}px`,
    '--ayq-pane-width': `${AYQ_METRIC.paneWidth}px`,
    '--ayq-control-height': `${AYQ_METRIC.controlHeight}px`,
    '--ayq-hairline': `${AYQ_METRIC.hairline}px`,
    '--ayq-radius-small': `${AYQ_METRIC.radiusSmall}px`,
    '--ayq-radius-medium': `${AYQ_METRIC.radiusMedium}px`,
    '--ayq-font-ui': AYQ_TYPE.family.ui,
    '--ayq-font-display': AYQ_TYPE.family.display,
    '--ayq-font-mono': AYQ_TYPE.family.mono,
    '--ayq-size-caption': AYQ_TYPE.size.caption,
    '--ayq-size-small': AYQ_TYPE.size.small,
    '--ayq-size-body': AYQ_TYPE.size.body,
    '--ayq-size-heading': AYQ_TYPE.size.heading,
    '--ayq-size-screen': AYQ_TYPE.size.screen,
    '--ayq-size-figure': AYQ_TYPE.size.figure,
    '--ayq-size-headline': AYQ_TYPE.size.headline,
  };
  for (const name of AYQ_STATES) {
    variables[`--ayq-state-${name}-fg`] = state[name].fg;
    variables[`--ayq-state-${name}-bg`] = state[name].bg;
    variables[`--ayq-state-${name}-edge`] = state[name].edge ?? 'transparent';
  }
  return variables;
}
