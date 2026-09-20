// The theme is built from the accent (r05 §1, PC2): no Fluent default blue
// survives as an app-owned brand, focus or selection token, and the filled
// primary button is dark with mint text.

import assert from 'node:assert/strict';
import test from 'node:test';
import { webLightTheme } from '@fluentui/react-components';
import { ACCENT, PRIMARY_GROUND, analysesTheme } from '../src/ui/theme.js';

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
  return parsed !== null && parsed.hue >= 190 && parsed.hue <= 250 && parsed.saturation > 0.3;
}

const BRAND_TOKEN = /Brand/;

test('the sanity of the check: Fluent\'s own light theme carries the default blue', () => {
  const blue = Object.entries(webLightTheme).filter(([key, value]) => BRAND_TOKEN.test(key) && isBlueFamily(String(value)));
  assert.ok(blue.length > 10, 'webLightTheme should expose blue brand tokens for this check to mean anything');
});

test('no default-blue brand, focus, selection or link token survives in the A1 theme', () => {
  // Fluent's fixed colorPalette* swatches are not app-owned treatments;
  // every token the brand ramp derives — brand, compound brand, link, focus —
  // must come from the mint ramp or a neutral.
  const APP_OWNED = /Brand|Link|Focus|Selected/;
  const survivors = Object.entries(analysesTheme).filter(
    ([key, value]) => !key.startsWith('colorPalette') && APP_OWNED.test(key) && isBlueFamily(String(value)),
  );
  assert.deepEqual(survivors, []);
  // And the check bites: the same filter over Fluent's own theme finds blue.
  const fluent = Object.entries(webLightTheme).filter(
    ([key, value]) => !key.startsWith('colorPalette') && APP_OWNED.test(key) && isBlueFamily(String(value)),
  );
  assert.ok(fluent.length > 10);
});

test('the filled primary button is dark with mint text', () => {
  assert.equal(analysesTheme.colorBrandBackground, PRIMARY_GROUND);
  assert.equal(analysesTheme.colorNeutralForegroundOnBrand, ACCENT);
  const ground = hueSaturation(PRIMARY_GROUND)!;
  assert.ok(ground.saturation < 0.3, 'the ground is a dark neutral, not a colour');
  // The accent itself is the mint the design names.
  assert.equal(ACCENT.toLowerCase(), '#22d3a6');
});

test('focus and selection tokens come from the mint ramp', () => {
  for (const token of ['colorCompoundBrandStroke', 'colorCompoundBrandForeground1', 'colorBrandStroke1'] as const) {
    const parsed = hueSaturation(String(analysesTheme[token]));
    assert.ok(parsed !== null, token);
    assert.ok(parsed!.hue >= 150 && parsed!.hue <= 175, `${token} should be a mint, got ${String(analysesTheme[token])}`);
  }
});
