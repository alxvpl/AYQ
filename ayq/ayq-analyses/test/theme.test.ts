// The theme is built from the accent ramp (r05 §1, PC2; A2 006 §8): no
// Fluent default blue survives as an app-owned brand, focus or selection
// token, every brand-derived token is violet, and the filled primary button
// is dark with the ramp's on-dark value as its text.

import assert from 'node:assert/strict';
import test from 'node:test';
import { webLightTheme } from '@fluentui/react-components';
import { PRIMARY_GROUND, VIOLET, analysesTheme } from '../src/ui/theme.js';
import { ACCENT, DARK } from '../src/ui/tokens.js';

/** Hue in degrees and saturation in [0, 1] of a `#rrggbb` colour. */
function hueSaturation(hex: string): { hue: number; saturation: number } | null {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const value = Number.parseInt(match[1], 16);
  const r = ((value >> 16) & 0xff) / 255;
  const g = ((value >> 8) & 0xff) / 255;
  const b = (value & 0xff) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const lightness = (max + min) / 2;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  let hue = 0;
  if (delta !== 0) {
    if (max === r) hue = 60 * (((g - b) / delta) % 6);
    else if (max === g) hue = 60 * ((b - r) / delta + 2);
    else hue = 60 * ((r - g) / delta + 4);
  }
  if (hue < 0) hue += 360;
  return { hue, saturation };
}

/** Fluent's default brand ramp is blue: hue around 210°, saturated. */
function isBlueFamily(hex: string): boolean {
  const parsed = hueSaturation(hex);
  return parsed !== null && parsed.hue >= 190 && parsed.hue <= 240 && parsed.saturation > 0.3;
}

/** The accepted family: Electric Violet, held off the blue axis (004 §2). */
function isViolet(hex: string): boolean {
  const parsed = hueSaturation(hex);
  return parsed !== null && parsed.hue > 245 && parsed.hue <= 270 && parsed.saturation > 0.3;
}

const APP_OWNED = /Brand|Link|Focus|Selected/;

test('the sanity of the check: Fluent\'s own light theme carries the default blue', () => {
  const blue = Object.entries(webLightTheme).filter(
    ([key, value]) => !key.startsWith('colorPalette') && APP_OWNED.test(key) && isBlueFamily(String(value)),
  );
  assert.ok(blue.length > 10, 'webLightTheme should expose blue brand tokens for this check to mean anything');
});

test('no default-blue brand, focus, selection or link token survives in the A2 theme', () => {
  // Fluent's fixed colorPalette* swatches are not app-owned treatments;
  // every token the brand ramp derives must come from the violet ramp, the
  // dark ground or a neutral.
  const survivors = Object.entries(analysesTheme).filter(
    ([key, value]) => !key.startsWith('colorPalette') && APP_OWNED.test(key) && isBlueFamily(String(value)),
  );
  assert.deepEqual(survivors, []);
});

test('every step of the brand ramp is violet, and the accepted values sit at their steps', () => {
  for (const [step, value] of Object.entries(VIOLET)) {
    assert.ok(isViolet(value), `brand step ${step} should be violet, got ${value}`);
  }
  assert.equal(VIOLET[110], ACCENT.fill);
  assert.equal(VIOLET[80], ACCENT.onLight);
});

test('the filled primary button is dark with the on-dark accent as its text', () => {
  assert.equal(PRIMARY_GROUND, DARK.ground);
  assert.equal(analysesTheme.colorBrandBackground, DARK.ground);
  assert.equal(analysesTheme.colorNeutralForegroundOnBrand, ACCENT.onDark);
  const ground = hueSaturation(DARK.ground)!;
  assert.ok(ground.saturation < 0.3, 'the ground is a dark neutral, not a colour');
});

test('focus and selection geometry take the fill; accent text takes the on-light value', () => {
  for (const token of ['colorStrokeFocus2', 'colorCompoundBrandStroke', 'colorBrandStroke1'] as const) {
    assert.equal(analysesTheme[token], ACCENT.fill, token);
  }
  for (const token of ['colorBrandForegroundLink', 'colorCompoundBrandForeground1', 'colorBrandForeground1'] as const) {
    assert.equal(analysesTheme[token], ACCENT.onLight, token);
  }
});
