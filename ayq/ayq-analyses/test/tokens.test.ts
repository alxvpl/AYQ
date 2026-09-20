// The one source of colour (src/ui/tokens.ts), held to what it claims:
// the accepted ramp's measured contrast on the surfaces it is used on, the
// sixteen brand-ramp slots and the two rail overlays pinned to the exact
// values that shipped (T1: relocated, never regenerated), the current rail
// tile's foreground measured on every composited surface it is rendered on
// (PC-A2-10), the accent kept apart from the state scale, no reference
// palette carried over, and no production colour literal anywhere else in
// the interface — theme.ts and styles.css included, rgba() included.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  ACCENT,
  DARK,
  RAIL_CURRENT,
  RAIL_OVERLAY,
  STATE,
  SURFACE,
  VIOLET_RAMP,
  contrastRatio,
  cssVariables,
} from '../src/ui/tokens.js';
import { VIOLET, analysesTheme } from '../src/ui/theme.js';

const ROOT = join(import.meta.dirname, '..', 'src');

// ---- T1: relocation, proven ------------------------------------------------

test('T1 — the sixteen brand-ramp slots are exactly the values that shipped at 371bcb37e, relocated and not regenerated', () => {
  const SHIPPED: Record<number, string> = {
    10: '#0e042f',
    20: '#17074b',
    30: '#200967',
    40: '#2a0c88',
    50: '#340fa8',
    60: '#3e12c9',
    70: '#4c1aea',
    80: '#6647e8',
    90: '#744def',
    100: '#7a54ef',
    110: '#7e5af0',
    120: '#a085f4',
    130: '#b6a2f6',
    140: '#ccbef9',
    150: '#ded5fb',
    160: '#f0ecfd',
  };
  assert.deepEqual(
    Object.keys(VIOLET_RAMP).map(Number).sort((a, b) => a - b),
    Object.keys(SHIPPED).map(Number),
  );
  for (const [slot, value] of Object.entries(SHIPPED)) {
    assert.equal(VIOLET_RAMP[Number(slot) as keyof typeof VIOLET_RAMP], value, `slot ${slot}`);
  }
  // The theme builds from this object and no other.
  assert.equal(VIOLET, VIOLET_RAMP);
});

test('T1 — slot 80 is the accepted on-light value and slot 110 the accepted fill, by identity', () => {
  assert.equal(VIOLET_RAMP[80], ACCENT.onLight);
  assert.equal(ACCENT.onLight, '#6647e8');
  assert.equal(VIOLET_RAMP[110], ACCENT.fill);
  assert.equal(ACCENT.fill, '#7e5af0');
});

test('T1 — the two rail overlays keep the exact translucent values that shipped', () => {
  assert.equal(RAIL_OVERLAY.hover, 'rgba(255, 255, 255, 0.06)');
  assert.equal(RAIL_OVERLAY.active, 'rgba(255, 255, 255, 0.08)');
  assert.equal(cssVariables()['--rail-hover'], RAIL_OVERLAY.hover);
  assert.equal(cssVariables()['--rail-active'], RAIL_OVERLAY.active);
});

// ---- contrast ---------------------------------------------------------------

test('the ramp\'s measured contrast is what 006 §8 accepted, on the surfaces the tokens name', () => {
  // The reference measurements, to two decimals (006 §8).
  assert.equal(contrastRatio(ACCENT.fill, '#ffffff').toFixed(2), '4.56');
  assert.equal(contrastRatio(ACCENT.onLight, '#ffffff').toFixed(2), '5.78');
  assert.equal(contrastRatio(ACCENT.onDark, '#1f1f1f').toFixed(2), '5.34');
  // Re-verified on the surfaces this application actually uses (007 §10).
  assert.ok(contrastRatio(ACCENT.fill, SURFACE.pane) >= 3, 'fill as non-text geometry on the pane');
  assert.ok(contrastRatio(ACCENT.fill, SURFACE.ground) >= 3, 'fill as non-text geometry on the ground');
  assert.ok(contrastRatio(ACCENT.fill, SURFACE.selection) >= 3, 'the selected row\'s bar on its wash');
  assert.ok(contrastRatio(ACCENT.onLight, SURFACE.pane) >= 4.5, 'accent text on the pane');
  assert.ok(contrastRatio(ACCENT.onLight, SURFACE.ground) >= 4.5, 'accent text on the ground');
  assert.ok(contrastRatio(ACCENT.onDark, DARK.ground) >= 4.5, 'the primary button\'s label');
  assert.ok(contrastRatio(ACCENT.onDark, DARK.groundHover) >= 4.5, 'the same label while hovered');
  assert.ok(contrastRatio(DARK.ink, DARK.ground) >= 4.5, 'rail labels at rest');
  assert.ok(contrastRatio(SURFACE.ink, SURFACE.pane) >= 7, 'body text');
  assert.ok(contrastRatio(SURFACE.inkSecondary, SURFACE.pane) >= 4.5, 'secondary text');
  assert.ok(contrastRatio(STATE.attention, SURFACE.pane) >= 4.5, 'the attention tone as text');
  assert.ok(contrastRatio(STATE.error, SURFACE.pane) >= 4.5, 'the one red as text');
});

/**
 * A translucent overlay composited over an opaque ground, in sRGB — the
 * colour the eye actually meets on a rail tile (RAIL_OVERLAY over DARK.ground).
 */
function composite(ground: string, alpha: number): string {
  const value = Number.parseInt(ground.slice(1), 16);
  const channels = [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff].map(c =>
    Math.round(c + (255 - c) * alpha),
  );
  return `#${channels.map(c => c.toString(16).padStart(2, '0')).join('')}`;
}

test('every Fluent-derived brand token this candidate actually uses resolves to an accepted anchor or the dark ground, and meets its contrast (014 §6)', () => {
  // The Fluent components in use are Button (primary, subtle, outline),
  // Dropdown/Option (multiselect), Input, Field, Menu and Popover. Of the
  // brand-derived tokens they read, these are the ones that reach the screen;
  // each is asserted to be an accepted value, so no undeclared ramp slot is
  // exposed as text, icon, focus or essential geometry in this candidate.
  const white = SURFACE.pane;
  // Focus ring on every Fluent control (tabster), and the app's own ring.
  assert.equal(analysesTheme.colorStrokeFocus2, ACCENT.fill);
  assert.ok(contrastRatio(ACCENT.fill, white) >= 3, 'focus ring on the pane');
  assert.ok(contrastRatio(ACCENT.fill, SURFACE.ground) >= 3, 'focus ring on the ground');
  assert.ok(contrastRatio(ACCENT.fill, DARK.ground) >= 3, 'focus ring beside the rail ground');
  // Input and Dropdown: the focused underline, at rest and pressed.
  assert.equal(analysesTheme.colorCompoundBrandStroke, ACCENT.fill);
  assert.equal(analysesTheme.colorCompoundBrandStrokePressed, ACCENT.onLight);
  assert.ok(contrastRatio(ACCENT.fill, white) >= 3, 'focused underline on the control');
  assert.ok(contrastRatio(ACCENT.onLight, white) >= 3, 'pressed underline on the control');
  // Option (multiselect): the checked box is the fill with an inverted checkmark.
  assert.equal(analysesTheme.colorCompoundBrandBackground, ACCENT.fill);
  assert.ok(contrastRatio(ACCENT.fill, white) >= 3, 'checked box on the listbox');
  assert.ok(
    contrastRatio(String(analysesTheme.colorNeutralForegroundInverted), ACCENT.fill) >= 3,
    'checkmark on the checked box',
  );
  // Primary button: the dark ground in three states, with the on-dark label.
  assert.equal(analysesTheme.colorBrandBackground, DARK.ground);
  assert.equal(analysesTheme.colorBrandBackgroundHover, DARK.groundHover);
  assert.equal(analysesTheme.colorBrandBackgroundPressed, DARK.groundPressed);
  assert.equal(analysesTheme.colorNeutralForegroundOnBrand, ACCENT.onDark);
  for (const ground of [DARK.ground, DARK.groundHover, DARK.groundPressed]) {
    assert.ok(contrastRatio(ACCENT.onDark, ground) >= 4.5, `primary button label on ${ground}`);
  }
  // The rail's own tiles at rest and hovered, not current.
  const hover = composite(DARK.ground, 0.06);
  assert.equal(hover, '#292c31');
  assert.ok(contrastRatio(DARK.ink, DARK.ground) >= 4.5, 'rail label at rest');
  assert.ok(contrastRatio(DARK.ink, hover) >= 4.5, 'rail label on the hover wash');
});

// ---- the standing composited-surface rule (016; PC-A2-10) -------------------
//
// Any accent- or state-coloured text or icon is measured against the surface
// it is actually rendered on, after every overlay, wash or state treatment;
// where the element has several states, each is measured and the lowest
// governs.

/** The rail tile's states in which it is the current destination, and the surface each composites to. */
function currentRailStates(): Array<{ state: string; background: string }> {
  const active = composite(DARK.ground, 0.08);
  return [
    // .rail-item.active: the active wash.
    { state: 'current', background: active },
    // .rail-item.active:hover — the active rule follows the hover rule at equal
    // specificity, so the active wash stays.
    { state: 'current + hover', background: active },
    // Focus adds an outline outside the tile; the surface is unchanged.
    { state: 'current + focused', background: active },
    // .rail-item.active.unavailable, with and without hover and focus: the
    // precedence rule keeps the active wash (017A).
    { state: 'current + unavailable', background: active },
    { state: 'current + unavailable + hover', background: active },
    { state: 'current + unavailable + focused', background: active },
    { state: 'current + unavailable + focused + hover', background: active },
  ];
}

test('PC-A2-10 — the current destination\'s label and icon reach the 5.0:1 gate in every state in which the tile is current, the lowest governing', () => {
  // The role is slot 130 of the pinned ramp, by identity; no fourth violet.
  assert.equal(RAIL_CURRENT, VIOLET_RAMP[130]);
  assert.equal(RAIL_CURRENT, '#b6a2f6');
  assert.equal(cssVariables()['--rail-current'], RAIL_CURRENT);
  assert.equal(composite(DARK.ground, 0.08), '#2d3136');
  const measured = currentRailStates().map(({ state, background }) => ({
    state,
    background,
    ratio: contrastRatio(RAIL_CURRENT, background),
  }));
  const lowest = measured.reduce((a, b) => (a.ratio <= b.ratio ? a : b));
  assert.ok(
    lowest.ratio >= 5,
    `lowest current-rail state ${lowest.state}: ${lowest.ratio.toFixed(2)}:1 on ${lowest.background}`,
  );
  // The ordinary active composite, as 017 §3 states it, to two decimals.
  assert.equal(contrastRatio(RAIL_CURRENT, '#2d3136').toFixed(2), '5.91');
  // The slot below would not have cleared the gate; the slot chosen is the first that does.
  assert.ok(contrastRatio(VIOLET_RAMP[120], '#2d3136') < 5);
});

test('PC-A2-10 — the stylesheet gives the current tile its foreground and wash even when the destination is unavailable, hovered or focused', () => {
  const css = readFileSync(join(ROOT, 'styles.css'), 'utf8').replace(/\r\n/g, '\n');
  const rule = (selector: string): string => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = new RegExp(`\n${escaped}\\s*\\{([^}]*)\\}`).exec(css);
    assert.ok(match, `rule for ${selector}`);
    return match![1];
  };
  assert.match(rule('.rail-item.active'), /color:\s*var\(--rail-current\)/);
  assert.match(rule('.rail-item.active'), /background:\s*var\(--rail-active\)/);
  // The muted rule for a non-current unavailable tile stays as it was (017A §3).
  assert.match(rule('.rail-item.unavailable'), /color:\s*var\(--dark-ink-muted\)/);
  // The precedence rule: two classes beat one, and it names both rest and hover.
  const precedence = rule('.rail-item.active.unavailable,\n.rail-item.active.unavailable:hover');
  assert.match(precedence, /color:\s*var\(--rail-current\)/);
  assert.match(precedence, /background:\s*var\(--rail-active\)/);
  // It comes after every single-class rail rule, so nothing later overrides it.
  const lastSingle = Math.max(
    css.indexOf('\n.rail-item.unavailable {'),
    css.indexOf('\n.rail-item.unavailable:hover {'),
    css.indexOf('\n.rail-item.active {'),
  );
  assert.ok(css.indexOf('\n.rail-item.active.unavailable,') > lastSingle);
  // The on-dark accent no longer colours any rail rule; it stays the button's.
  assert.ok(!css.includes('--accent-on-dark'));
});

test('the standing rule — every accent or state foreground whose background changes by state, measured on each actual surface', () => {
  const pairs: Array<[string, string, string, number]> = [
    ['primary button label, rest', ACCENT.onDark, DARK.ground, 4.5],
    ['primary button label, hover', ACCENT.onDark, DARK.groundHover, 4.5],
    ['primary button label, pressed', ACCENT.onDark, DARK.groundPressed, 4.5],
    ['attention text on the pane', STATE.attention, SURFACE.pane, 4.5],
    ['attention text on the ground (context bar)', STATE.attention, SURFACE.ground, 4.5],
    ['error text on the pane', STATE.error, SURFACE.pane, 4.5],
    ['accent text on the pane', ACCENT.onLight, SURFACE.pane, 4.5],
    ['accent text on the selected row', ACCENT.onLight, SURFACE.selection, 4.5],
    ['accent text on the hovered row', ACCENT.onLight, SURFACE.rowHover, 4.5],
    ['selected-row bar on its wash', ACCENT.fill, SURFACE.selection, 3],
    ['focus ring on the pane', ACCENT.fill, SURFACE.pane, 3],
    ['focus ring on the ground', ACCENT.fill, SURFACE.ground, 3],
  ];
  for (const [name, foreground, background, gate] of pairs) {
    const ratio = contrastRatio(foreground, background);
    assert.ok(ratio >= gate, `${name}: ${ratio.toFixed(2)}:1 on ${background}, gate ${gate}:1`);
  }
});

// ---- roles ------------------------------------------------------------------

test('the accent and the state scale never share a value, and neither carries the other\'s role', () => {
  const accent = new Set(Object.values(ACCENT).map(v => v.toLowerCase()));
  for (const [name, value] of Object.entries(STATE)) {
    assert.ok(!accent.has(value.toLowerCase()), `${name} reuses an accent value`);
  }
  // Selection is a neutral wash, not the accent and not a state.
  assert.ok(!accent.has(SURFACE.selection));
  assert.ok(!Object.values(STATE).includes(SURFACE.selection as never));
});

test('no reference palette travels: neither CIVION\'s identity green nor AYQ\'s mint appears', () => {
  const forbidden = ['#1d3b32', '#22d3a6', '#25514a', '#b98b32', '#8d2b21'];
  const everything = JSON.stringify({
    ACCENT,
    DARK,
    SURFACE,
    STATE,
    VIOLET_RAMP,
    RAIL_CURRENT,
    css: cssVariables(),
  }).toLowerCase();
  for (const value of forbidden) {
    assert.ok(!everything.includes(value), `${value} must not appear in the tokens`);
  }
});

// ---- one production colour source -------------------------------------------

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(tsx?|css)$/.test(entry.name) ? [path] : [];
  });
}

test('no production colour literal exists anywhere but the token module — hex, rgb, rgba, hsl or hsla (T1)', () => {
  const colour = /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/gi;
  const scanned: string[] = [];
  for (const path of sourceFiles(ROOT)) {
    if (path.endsWith(join('ui', 'tokens.ts'))) continue;
    scanned.push(path);
    // Comments are stripped so an explanatory reference is not a literal.
    const source = readFileSync(path, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    const found = [...source.matchAll(colour)].map(match => match[0]);
    assert.deepEqual(found, [], `${path} carries a colour of its own`);
  }
  // The scan reached the two files that used to be exempt.
  assert.ok(scanned.some(path => path.endsWith(join('ui', 'theme.ts'))), 'theme.ts is scanned');
  assert.ok(scanned.some(path => path.endsWith('styles.css')), 'styles.css is scanned');
  assert.ok(scanned.length >= 20, `${scanned.length} production files scanned`);
});

test('every colour the token module exports is an accepted anchor, a neutral, a state tone or a pinned ramp slot — no fourth violet', () => {
  const ramp = new Set<string>(Object.values(VIOLET_RAMP));
  // The three anchors are ramp slots (80, 110) or the accepted on-dark value.
  assert.ok(ramp.has(ACCENT.onLight) && ramp.has(ACCENT.fill));
  assert.equal(ACCENT.onDark, '#9580ff');
  // The current-rail role is a ramp slot and nothing new.
  assert.ok(ramp.has(RAIL_CURRENT));
  // Every violet-looking value anywhere in the tokens is one of these.
  const violets = new Set<string>([...ramp, ACCENT.onDark]);
  for (const [name, value] of Object.entries({ ...cssVariables() })) {
    if (!/^#[0-9a-f]{6}$/i.test(value)) continue;
    const v = Number.parseInt(value.slice(1), 16);
    const [r, g, b] = [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
    const isViolet = b > r && r > g && b - g > 60;
    if (isViolet) assert.ok(violets.has(value.toLowerCase()), `${name} = ${value} is a violet outside the ramp`);
  }
});

test('the stylesheet names every role it uses and every role is defined', () => {
  const css = readFileSync(join(ROOT, 'styles.css'), 'utf8');
  const used = new Set([...css.matchAll(/var\((--[a-z-]+)\)/g)].map(match => match[1]));
  const defined = new Set(Object.keys(cssVariables()));
  for (const role of used) assert.ok(defined.has(role), `${role} is used but not defined in tokens.ts`);
  const unused = [...defined].filter(role => !used.has(role) && !css.includes(role));
  // Roles the theme or the main process read but the stylesheet need not;
  // --accent-on-dark is the primary button's label, read by the theme.
  const consumedElsewhere = new Set(['--accent-text', '--accent-on-dark', '--dark-edge']);
  assert.deepEqual(unused.filter(role => !consumedElsewhere.has(role)), []);
});
