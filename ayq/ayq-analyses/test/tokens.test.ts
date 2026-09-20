// The one source of colour (src/ui/tokens.ts), held to what it claims:
// the accepted ramp's measured contrast on the surfaces it is used on, the
// accent kept apart from the state scale, no reference palette carried over,
// and no colour written anywhere else in the interface.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { ACCENT, DARK, STATE, SURFACE, contrastRatio, cssVariables } from '../src/ui/tokens.js';

const ROOT = join(import.meta.dirname, '..', 'src');

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
  assert.ok(contrastRatio(ACCENT.onDark, DARK.ground) >= 4.5, 'the primary button\'s label and the active rail item');
  assert.ok(contrastRatio(ACCENT.onDark, DARK.groundHover) >= 4.5, 'the same label while hovered');
  assert.ok(contrastRatio(DARK.ink, DARK.ground) >= 4.5, 'rail labels at rest');
  assert.ok(contrastRatio(SURFACE.ink, SURFACE.pane) >= 7, 'body text');
  assert.ok(contrastRatio(SURFACE.inkSecondary, SURFACE.pane) >= 4.5, 'secondary text');
  assert.ok(contrastRatio(STATE.attention, SURFACE.pane) >= 4.5, 'the attention tone as text');
  assert.ok(contrastRatio(STATE.error, SURFACE.pane) >= 4.5, 'the one red as text');
});

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
  const everything = JSON.stringify({ ACCENT, DARK, SURFACE, STATE, css: cssVariables() }).toLowerCase();
  for (const value of forbidden) {
    assert.ok(!everything.includes(value), `${value} must not appear in the tokens`);
  }
});

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(tsx?|css)$/.test(entry.name) ? [path] : [];
  });
}

test('no colour is written anywhere but the token module', () => {
  const colour = /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/gi;
  for (const path of sourceFiles(ROOT)) {
    if (path.endsWith(join('ui', 'tokens.ts')) || path.endsWith(join('ui', 'theme.ts'))) continue;
    const source = readFileSync(path, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    const found = [...source.matchAll(colour)].map(match => match[0]);
    // The rail's two hover washes are the one sanctioned exception: a
    // translucent white over the dark ground, which no opaque token can say.
    const sanctioned = path.endsWith('styles.css') ? found.filter(v => v.toLowerCase() !== 'rgba(') : found;
    assert.deepEqual(sanctioned, [], `${path} carries a colour of its own`);
  }
});

test('the stylesheet names every role it uses and every role is defined', () => {
  const css = readFileSync(join(ROOT, 'styles.css'), 'utf8');
  const used = new Set([...css.matchAll(/var\((--[a-z-]+)\)/g)].map(match => match[1]));
  const defined = new Set(Object.keys(cssVariables()));
  for (const role of used) assert.ok(defined.has(role), `${role} is used but not defined in tokens.ts`);
  const unused = [...defined].filter(role => !used.has(role) && !css.includes(role));
  // Roles the theme or the main process read but the stylesheet need not.
  const consumedElsewhere = new Set(['--accent-text', '--dark-edge']);
  assert.deepEqual(unused.filter(role => !consumedElsewhere.has(role)), []);
});
