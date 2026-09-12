// The token module, held to what 04 decided.
//
// Three of these are rules Canon states in words, and words in a file are not
// a rule: that the accent and the state scale never share a tone (A17), that
// nothing white is ever put on filled mint and that what is put there reaches
// 4.5:1 (A16, A18), and that all three grounds are complete (A23).
//
// A fourth is a boundary: CIVION's identity green never appears in AYQ, as a
// value or as a derivation (A16).

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ayqContrast, ayqLab } from '../src/ayq-colour.ts';
import {
  AYQ_ACCENT,
  AYQ_GROUNDS_RESOLVED,
  AYQ_METRIC,
  AYQ_STATES,
  AYQ_TOKENS,
  AYQ_TYPE,
  CIVION_GREEN,
  ayqCssVariables,
  ayqFilledAccentSurfaces,
  ayqIdentityColours,
  ayqStateColours,
} from '../src/ayq-tokens.ts';

/** The accent and everything derived from it. The button fill is not one. */
function accentTones(ground: 'light' | 'dark'): string[] {
  const id = AYQ_TOKENS[ground].identity;
  return [
    id.accent,
    id.accentHover,
    id.accentPressed,
    id.accentFocus,
    id.accentSoft,
    id.accentLine,
  ];
}

function hue(colour: string): { chroma: number; angle: number } {
  const [, a, b] = ayqLab(colour);
  const angle = (Math.atan2(b, a) * 180) / Math.PI;
  return { chroma: Math.hypot(a, b), angle: angle < 0 ? angle + 360 : angle };
}

function apart(one: number, other: number): number {
  const gap = Math.abs(one - other) % 360;
  return gap > 180 ? 360 - gap : gap;
}

test('every filled accent surface carries its foreground at 4.5:1', () => {
  for (const ground of AYQ_GROUNDS_RESOLVED) {
    for (const filled of ayqFilledAccentSurfaces(ground)) {
      const ratio = ayqContrast(filled.surface, filled.ink);
      assert.ok(
        ratio >= 4.5,
        `${ground}: ${filled.name} puts ${filled.ink} on ${filled.surface} ` +
          `at ${ratio.toFixed(2)}:1`,
      );
    }
  }
});

test('the foreground on filled mint is the near-black, never white', () => {
  // A18 says why in one number: white on this mint is about 1.9:1. The test
  // asserts both halves, so that "use the near-black" cannot quietly become a
  // preference somebody overrules.
  for (const ground of AYQ_GROUNDS_RESOLVED) {
    const { accent, accentInk } = AYQ_TOKENS[ground].identity;
    assert.ok(
      ayqContrast(accent, '#ffffff') < 2,
      `${ground}: white on the accent is ${ayqContrast(accent, '#ffffff').toFixed(2)}:1`,
    );
    assert.ok(ayqContrast(accent, accentInk) >= 4.5);
  }
});

test('the accent and the state scale never share a tone', () => {
  for (const ground of AYQ_GROUNDS_RESOLVED) {
    const identity = ayqIdentityColours(ground);
    const states = ayqStateColours(ground);

    for (const colour of states) {
      assert.ok(
        !identity.includes(colour),
        `${ground}: ${colour} is both an identity colour and a state colour`,
      );
    }

    // And not merely a different string: a state that had drifted to within a
    // few degrees of the accent's hue would be the accent carrying a state
    // meaning, whatever it was called. Tones with almost no chroma cannot be
    // confused with a saturated mint and are exempt.
    const accent = hue(AYQ_ACCENT);
    for (const tone of accentTones(ground)) {
      const theirs = hue(tone);
      if (theirs.chroma < 8) continue;
      assert.ok(
        apart(theirs.angle, accent.angle) < 30,
        `${ground}: ${tone} is listed as an accent tone but is not one`,
      );
    }
    for (const colour of states) {
      const theirs = hue(colour);
      if (theirs.chroma < 8) continue;
      const gap = apart(theirs.angle, accent.angle);
      assert.ok(
        gap >= 45,
        `${ground}: the state colour ${colour} is ${gap.toFixed(0)}° from the ` +
          'accent, which is close enough to read as the accent',
      );
    }
  }
});

test("CIVION's identity green is nowhere in AYQ", () => {
  for (const ground of AYQ_GROUNDS_RESOLVED) {
    for (const [name, value] of Object.entries(ayqCssVariables(ground))) {
      assert.notEqual(
        value.toLowerCase(),
        CIVION_GREEN,
        `${name} is CIVION's green`,
      );
    }
  }
});

test('all three grounds resolve to a complete token set', () => {
  const [first, ...rest] = AYQ_GROUNDS_RESOLVED.map(ground =>
    ayqCssVariables(ground),
  );

  const keys = Object.keys(first).sort();
  assert.ok(keys.length > 30, 'the token set is not a token set');

  for (const other of rest) {
    assert.deepEqual(
      Object.keys(other).sort(),
      keys,
      'the two grounds do not define the same tokens',
    );
  }

  // "Follow the system" is not a third set of values: it resolves to one of
  // these two, so a complete light and a complete dark is the whole of A23.
  for (const set of [first, ...rest]) {
    for (const [name, value] of Object.entries(set)) {
      assert.ok(
        typeof value === 'string' && value.trim() !== '',
        `${name} has no value`,
      );
      assert.ok(
        !value.includes('undefined'),
        `${name} is ${value}, which is a mistake wearing a token's name`,
      );
    }
  }

  // Every state of A17 is in both grounds, foreground and background.
  for (const ground of AYQ_GROUNDS_RESOLVED) {
    for (const state of AYQ_STATES) {
      const pair = AYQ_TOKENS[ground].state[state];
      assert.ok(pair.fg !== undefined && pair.bg !== undefined);
      assert.ok(
        ayqContrast(pair.fg, pair.bg) >= 4.5,
        `${ground}: the ${state} chip reads at ` +
          `${ayqContrast(pair.fg, pair.bg).toFixed(2)}:1`,
      );
    }
  }
});

test('the metrics 04 A20 fixes are the ones in the module', () => {
  assert.equal(AYQ_METRIC.railWidth, 64);
  assert.ok(AYQ_METRIC.statusHeight > 0);
  assert.equal(AYQ_TYPE.figures, 'tabular-nums');
});
