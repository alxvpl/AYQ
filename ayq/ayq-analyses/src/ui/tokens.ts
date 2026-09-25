// AYQ Analyses — the one source of colour, metric and type (A2 foundation).
//
// Every value the interface shows is stated here once and referenced by role
// everywhere else: the Fluent theme is built from it (theme.ts), the
// stylesheet reads it as CSS variables (cssVariables()), and the chart takes
// its one colour from it. No component and no stylesheet rule carries a
// colour, a length or a face of its own; a change of direction is an edit to
// this file. The discipline is the one the A2 extraction found in both
// reference implementations (A2_DESIGN_FOUNDATION_EXTRACTION r01 §G, J-G1)
// and is held to by test/tokens.test.ts.
//
// Two roles never share a value: the accent (where you are — the active
// destination, the selected row, focus) and the state scale (what something
// is — attention, error). The accent never carries a state and a state is
// never rendered in the accent (04_DESIGN A17; extraction J-D1…J-D4).

/**
 * The accent ramp — Electric Violet, the Product Owner's decision of
 * 2026-09-20 (A2 exchange 003) in the three-token ramp jointly accepted in
 * 006 §8. Each value carries the surface it was measured against; the
 * measured ratios are asserted by test/tokens.test.ts.
 *
 * - fill: non-text accent geometry — the active-destination bar, the selected
 *   row's bar, the focus ring, the chart bars. 4.56:1 on white.
 * - onLight: accent-coloured text and icons on the light ground. 5.78:1 on
 *   white.
 * - onDark: accent-coloured text on a dark surface — the primary button's
 *   label and the active rail item. 5.34:1 on #1F1F1F.
 */
export const ACCENT = {
  fill: '#7e5af0',
  onLight: '#6647e8',
  onDark: '#9580ff',
} as const;

/**
 * The sixteen-slot Fluent brand ramp the theme is built from (T1: relocated
 * here verbatim from theme.ts; no slot was regenerated). Slot 80 is the
 * accepted on-light value and slot 110 the accepted fill, by identity; the
 * other fourteen are the same hue at other lightnesses and are what Fluent
 * reads for control hover, pressed, selected and border treatments. Every
 * slot is pinned to its exact value by test/tokens.test.ts.
 */
export const VIOLET_RAMP = {
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
} as const;

/**
 * The dark ground shared by the filled primary button (04_DESIGN A18; r05 §3)
 * and the navigation rail (A2 decision K-2). One dark neutral, so the two
 * dark surfaces in the window are the same surface.
 */
export const DARK = {
  ground: '#1b1f24',
  /** Lifted just enough to read as hover while the on-dark label stays above 4.5:1 (measured 4.82:1). */
  groundHover: '#23282d',
  groundPressed: '#111418',
  /** Ordinary text on the dark ground: rail labels at rest. */
  ink: '#c9ced3',
  /** Text of an unavailable destination on the dark ground. */
  inkMuted: '#7b838a',
  /** The hairline between the rail and the body. */
  edge: '#10141a',
} as const;

/**
 * The two washes a rail tile takes over the dark ground: a translucent white,
 * which no opaque token can say (T1: relocated here verbatim from styles.css
 * at their current alpha). Composited over DARK.ground they are #292c31
 * (hover) and #2d3136 (active).
 */
export const RAIL_OVERLAY = {
  hover: 'rgba(255, 255, 255, 0.06)',
  active: 'rgba(255, 255, 255, 0.08)',
} as const;

/**
 * The foreground of the current destination's rail tile — its label and icon
 * — in every state in which the tile is current: on the active wash, hovered,
 * focused, and when the destination is unavailable in this version
 * (PC-A2-10; 017A: current beats unavailable for foreground). Slot 130 of the
 * pinned ramp, not a fourth violet: 5.91:1 on the active composite #2d3136,
 * where ACCENT.onDark measured 4.24:1; the current-location gate is 5.0:1.
 * ACCENT.onDark remains the on-dark text token everywhere else it already
 * passes (the primary button).
 */
export const RAIL_CURRENT = VIOLET_RAMP[130];

/** The light surfaces. Neutral, not warm (A2 decision K-9). */
export const SURFACE = {
  ground: '#f6f7f9',
  pane: '#ffffff',
  line: '#e1e3e6',
  ink: '#121212',
  inkSecondary: '#616161',
  /** The selected row's wash: a neutral, never the accent (extraction J-D5). */
  selection: '#eef0f3',
  rowHover: '#f3f4f6',
} as const;

/**
 * The state scale, its own tones: attention (the coverage-limited marker and
 * the coverage sentences, r05 §6–§7) and error (the one red, r05 §4).
 */
export const STATE = {
  /**
   * r004 §4: darkened from r003's #9a5a00 because the marker inside the
   * coverage button sits on Fluent's pressed surface (#e0e0e0) and measured
   * 4.15:1 there; every actual state is measured and the lowest governs.
   * Computed: 5.96:1 on white, 5.47:1 on the hover surface, 4.52:1 on the
   * pressed surface — asserted by the conformance suite on every surface the
   * role is drawn on.
   */
  attention: '#925500',
  error: '#b10e1c',
} as const;

/** Every length the interface uses. A1 build values kept (r05 §8; K-3, K-4). */
export const METRIC = {
  railWidth: 64,
  rowHeight: 36,
  gap: 12,
  radius: 4,
  bodyInset: 24,
  detailPaneWidth: 520,
  statusHeight: 32,
  /** The bar that marks the active destination and the selected row. */
  markerWidth: 3,
  focusRing: 2,
  /** The window never opens or shrinks below this (K-8). */
  window: { minWidth: 1100, minHeight: 720, width: 1360, height: 860 },
} as const;

/** The type scale. One face; figures are tabular numerals in it (A19). */
export const TYPE = {
  family: "'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif",
  size: { caption: 11, secondary: 12, body: 14, headline: 32 },
  figures: 'tabular-nums',
} as const;

/**
 * The roles as CSS custom properties, for the stylesheet. Rendered once onto
 * the document root by the renderer at start; styles.css names only these.
 */
export function cssVariables(): Record<string, string> {
  return {
    '--accent': ACCENT.fill,
    '--accent-text': ACCENT.onLight,
    '--accent-on-dark': ACCENT.onDark,
    '--dark-ground': DARK.ground,
    '--dark-ink': DARK.ink,
    '--dark-ink-muted': DARK.inkMuted,
    '--dark-edge': DARK.edge,
    '--rail-hover': RAIL_OVERLAY.hover,
    '--rail-active': RAIL_OVERLAY.active,
    '--rail-current': RAIL_CURRENT,
    '--ground': SURFACE.ground,
    '--surface': SURFACE.pane,
    '--line': SURFACE.line,
    '--ink': SURFACE.ink,
    '--secondary': SURFACE.inkSecondary,
    '--selection': SURFACE.selection,
    '--row-hover': SURFACE.rowHover,
    '--attention': STATE.attention,
    '--error': STATE.error,
    '--rail-width': `${METRIC.railWidth}px`,
    '--row-height': `${METRIC.rowHeight}px`,
    '--gap': `${METRIC.gap}px`,
    '--radius': `${METRIC.radius}px`,
    '--body-inset': `${METRIC.bodyInset}px`,
    '--detail-pane-width': `${METRIC.detailPaneWidth}px`,
    '--status-height': `${METRIC.statusHeight}px`,
    '--marker-width': `${METRIC.markerWidth}px`,
    '--focus-ring': `${METRIC.focusRing}px`,
    '--font-ui': TYPE.family,
    '--size-caption': `${TYPE.size.caption}px`,
    '--size-secondary': `${TYPE.size.secondary}px`,
    '--size-body': `${TYPE.size.body}px`,
    '--size-headline': `${TYPE.size.headline}px`,
    '--figures': TYPE.figures,
  };
}

/** Applies the roles to an element's inline style, normally the document root. */
export function applyCssVariables(target: { style: { setProperty(name: string, value: string): void } }): void {
  for (const [name, value] of Object.entries(cssVariables())) {
    target.style.setProperty(name, value);
  }
}

// ---- contrast, so the ramp's claims can be checked rather than believed ----

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance of a `#rrggbb` colour. */
export function luminance(hex: string): number {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) throw new Error(`not a #rrggbb colour: ${hex}`);
  const value = Number.parseInt(match[1], 16);
  return (
    0.2126 * channel((value >> 16) & 0xff) + 0.7152 * channel((value >> 8) & 0xff) + 0.0722 * channel(value & 0xff)
  );
}

/** WCAG contrast ratio between two `#rrggbb` colours, ≥ 1. */
export function contrastRatio(one: string, other: string): number {
  const a = luminance(one);
  const b = luminance(other);
  const [light, dark] = a >= b ? [a, b] : [b, a];
  return (light + 0.05) / (dark + 0.05);
}
