// 04 A25: where the window opens.
//
// Three ways this could quietly be wrong, each with a test that fails for it:
// the default forced on every launch, the saved size and position ignored, and
// a saved position restored even though no screen shows it any more.

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  AYQ_WINDOW_DEFAULT_WIDTH,
  AYQ_WINDOW_MIN_HEIGHT,
  AYQ_WINDOW_MIN_WIDTH,
  ayqDefaultBounds,
  ayqOpeningBounds,
  ayqReadWindowBounds,
  ayqWriteWindowBounds,
} from '../src/ayq-window-bounds.ts';

/** A 1920 × 1080 monitor with a 40 px taskbar. */
const WIDE = { x: 0, y: 0, width: 1920, height: 1040 };
/** A laptop screen narrower than the default. */
const LAPTOP = { x: 0, y: 0, width: 1366, height: 728 };
/** A second monitor to the right of WIDE. */
const RIGHT = { x: 1920, y: 0, width: 1920, height: 1040 };

test('the first launch is 1600 px wide, centred on the work area', () => {
  const { bounds, restored } = ayqOpeningBounds(null, [WIDE], WIDE);
  assert.equal(restored, false);
  assert.equal(AYQ_WINDOW_DEFAULT_WIDTH, 1600);
  assert.equal(bounds.width, 1600);
  assert.equal(bounds.x, 160);
  assert.ok(
    bounds.y >= WIDE.y && bounds.y + bounds.height <= WIDE.y + WIDE.height,
  );
});

test('on a work area narrower than 1600 px the first launch fits it', () => {
  const { bounds } = ayqOpeningBounds(null, [LAPTOP], LAPTOP);
  assert.equal(bounds.width, LAPTOP.width);
  assert.ok(bounds.height <= LAPTOP.height);
  assert.equal(bounds.x, 0);
  assert.ok(bounds.y >= 0);
});

test('saved bounds are used, not the default', () => {
  const saved = { x: 200, y: 150, width: 1100, height: 700 };
  const { bounds, restored } = ayqOpeningBounds(saved, [WIDE], WIDE);
  assert.equal(restored, true, 'the saved bounds were ignored');
  assert.deepEqual(bounds, saved);
  // The failure this guards: every launch at 1600 again.
  assert.notEqual(
    bounds.width,
    AYQ_WINDOW_DEFAULT_WIDTH,
    'the default was forced',
  );
});

test('a window left on the second monitor opens there again', () => {
  const saved = { x: 2100, y: 100, width: 1400, height: 900 };
  const { bounds, restored } = ayqOpeningBounds(saved, [WIDE, RIGHT], WIDE);
  assert.equal(restored, true);
  assert.deepEqual(bounds, saved);
});

test('a window left on a monitor that is gone opens at the default', () => {
  const saved = { x: 2100, y: 100, width: 1400, height: 900 };
  const { bounds, restored } = ayqOpeningBounds(saved, [WIDE], WIDE);
  assert.equal(restored, false, 'an off-screen position was restored');
  assert.deepEqual(bounds, ayqDefaultBounds(WIDE));
});

test('a window whose title bar would be out of reach is not restored', () => {
  // Above the top of the screen: the body shows, the bar to drag it by does not.
  const above = { x: 100, y: -600, width: 1200, height: 800 };
  assert.equal(ayqOpeningBounds(above, [WIDE], WIDE).restored, false);
  // Hanging almost entirely off the left edge.
  const left = { x: -1150, y: 100, width: 1200, height: 800 };
  assert.equal(ayqOpeningBounds(left, [WIDE], WIDE).restored, false);
  // Below the bottom.
  const below = { x: 100, y: 1100, width: 1200, height: 800 };
  assert.equal(ayqOpeningBounds(below, [WIDE], WIDE).restored, false);
});

test('a saved window larger than the screen it is on now is fitted to it', () => {
  // Left 1800 × 1000 on a big monitor; the machine is now a laptop.
  const saved = { x: 50, y: 20, width: 1800, height: 1000 };
  const { bounds, restored } = ayqOpeningBounds(saved, [LAPTOP], LAPTOP);
  assert.equal(restored, true);
  assert.ok(bounds.x >= LAPTOP.x && bounds.y >= LAPTOP.y);
  assert.ok(bounds.x + bounds.width <= LAPTOP.x + LAPTOP.width);
  assert.ok(bounds.y + bounds.height <= LAPTOP.y + LAPTOP.height);
});

test('a saved window below the minimum opens at the minimum', () => {
  const saved = { x: 100, y: 100, width: 200, height: 100 };
  const { bounds } = ayqOpeningBounds(saved, [WIDE], WIDE);
  assert.equal(bounds.width, AYQ_WINDOW_MIN_WIDTH);
  assert.equal(bounds.height, AYQ_WINDOW_MIN_HEIGHT);
});

test('anything that is not a set of bounds opens at the default', () => {
  for (const damaged of [
    null,
    'nonsense',
    {},
    { x: 1, y: 2, width: 'wide', height: 3 },
    { x: 0, y: 0, width: 0, height: 0 },
    { x: Number.NaN, y: 0, width: 800, height: 600 },
  ]) {
    const { bounds, restored } = ayqOpeningBounds(damaged, [WIDE], WIDE);
    assert.equal(restored, false, `${JSON.stringify(damaged)} was restored`);
    assert.deepEqual(bounds, ayqDefaultBounds(WIDE));
  }
});

test('what a close writes is what the next launch reads', () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'ayq-window-'));
  try {
    assert.equal(
      ayqReadWindowBounds(dataDir),
      null,
      'a first launch found bounds',
    );

    const closed = { x: 300, y: 120, width: 1250, height: 760 };
    ayqWriteWindowBounds(dataDir, closed);
    const reopened = ayqOpeningBounds(
      ayqReadWindowBounds(dataDir),
      [WIDE],
      WIDE,
    );
    assert.equal(reopened.restored, true);
    assert.deepEqual(reopened.bounds, closed);

    // A file that cannot be read is a first launch, not a crash.
    writeFileSync(join(dataDir, 'ayq-window.json'), '{ half a fi');
    assert.equal(ayqReadWindowBounds(dataDir), null);
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
});
