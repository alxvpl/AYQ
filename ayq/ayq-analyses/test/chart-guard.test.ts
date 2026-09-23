// The chart guard of r004 §8.2: a result the chart cannot draw is stated,
// never left blank. The limits are the ones measured in this Electron
// (evidence/hardening-039): a side of at most 65 535 device pixels, an area
// of at most 268 435 456. The decision is a pure function of the chart's
// CSS size and the device pixel ratio, so it is proven here and re-checked
// by the component on every resize.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MAX_CANVAS_AREA, MAX_CANVAS_SIDE, SAFE_CANVAS_AREA, canvasFitsRaster, canvasWithinSafeBudget } from '../src/geometry.js';
import { translate } from '../src/strings.js';
import { analyse } from '../src/engine.js';
import { defaultContext } from '../src/context.js';
import { loadFixture } from './helpers.js';

const chartHeight = (rows: number): number => Math.max(140, rows * 44 + 48);

test('the limits are the measured ones', () => {
  assert.equal(MAX_CANVAS_SIDE, 65_535);
  assert.equal(MAX_CANVAS_AREA, 268_435_456);
});

test('at 175 % the chart fits up to 850 rows and is refused from 851, exactly where the platform stops rasterising', () => {
  // 850 rows: (850 × 44 + 48) × 1.75 = 65 534 device pixels — the last height that draws.
  assert.equal(canvasFitsRaster(1220, chartHeight(850), 1.75), true);
  assert.equal(Math.ceil(chartHeight(850) * 1.75), 65_534);
  // 851 rows: 65 611 — the first that would draw nothing.
  assert.equal(canvasFitsRaster(1220, chartHeight(851), 1.75), false);
  // The shapes measured in 039: S3 (540 rows) drew, S5 (1 377 rows) did not.
  assert.equal(canvasFitsRaster(1220, chartHeight(540), 1.75), true);
  assert.equal(canvasFitsRaster(1220, chartHeight(1377), 1.75), false);
});

test('at 100 % the same chart fits to 1 488 rows; at 200 % to 743; at 300 % to 495', () => {
  const lastFitting = (dpr: number): number => {
    let rows = 0;
    while (canvasFitsRaster(1220, chartHeight(rows + 1), dpr)) rows += 1;
    return rows;
  };
  assert.equal(lastFitting(1), 1_488);
  assert.equal(lastFitting(1.75), 850);
  assert.equal(lastFitting(2), 743);
  assert.equal(lastFitting(3), 495);
});

test('the area limit governs a wide chart before the side limit does', () => {
  // 16 384 × 16 384 device pixels is the last area that draws; one more row of pixels is not.
  assert.equal(canvasFitsRaster(16_384, 16_384, 1), true);
  assert.equal(canvasFitsRaster(16_384, 16_385, 1), false);
  // A 4K-wide chart at 175 % (3 675 px) still fits 65 535 in height by area …
  assert.equal(canvasFitsRaster(2100, 37_448, 1.75), true);
  // … but a wider one runs into the area first, below the side limit.
  assert.equal(canvasFitsRaster(4200, 37_448, 1.75), false);
  // A frame not yet laid out (width 0) is not refused.
  assert.equal(canvasFitsRaster(0, chartHeight(2000), 1.75), true);
});

test('the sentence is r004 §8.2, word for word, and the chart component says it instead of drawing', () => {
  assert.equal(
    translate('chart.tooLarge'),
    'This result is too large to show as a chart. The table still shows the complete result.',
  );
  const result = readFileSync(join(process.cwd(), 'src', 'ui', 'result.tsx'), 'utf8');
  // Decided before drawing, from the frame's width, the rows' height and the pixel ratio — against the
  // raster limit and the safe-render budget (T3) — and re-decided on resize.
  assert.match(result, /const dpr = window\.devicePixelRatio;\s*setTooLarge\(!canvasFitsRaster\(width, height, dpr\) \|\| !canvasWithinSafeBudget\(width, height, dpr\)\);/);
  assert.match(result, /window\.addEventListener\('resize', decide\)/);
  // Nothing is drawn when it would not rasterise; the sentence takes the chart's place.
  assert.match(result, /if \(tooLarge \|\| host\.current === null\) return undefined;/);
  assert.match(result, /tooLarge \? \(\s*<p className="chart-too-large">\{t\('chart\.tooLarge'\)\}<\/p>/);
});

// T3 (directive 004 + 005): a second, lower budget in device-pixel canvas
// area. Above it the chart is not drawn and the same sentence stands in its
// place; the hard raster limits above are unchanged.
const DEFAULT_FRAME = 1220;
const lastDrawn = (dpr: number, width = DEFAULT_FRAME): number => {
  let rows = 0;
  while (canvasFitsRaster(width, chartHeight(rows + 1), dpr) && canvasWithinSafeBudget(width, chartHeight(rows + 1), dpr)) rows += 1;
  return rows;
};

test('the safe-render budget is 4 096² device pixels, a sixteenth of the raster area', () => {
  assert.equal(SAFE_CANVAS_AREA, 4_096 * 4_096);
  assert.equal(SAFE_CANVAS_AREA * 16, MAX_CANVAS_AREA);
  assert.equal(canvasWithinSafeBudget(4_096, 4_096, 1), true);
  assert.equal(canvasWithinSafeBudget(4_096, 4_097, 1), false);
  assert.equal(canvasWithinSafeBudget(0, chartHeight(2000), 1.75), true);
});

test('with the budget the chart draws to 311 rows at 100 %, 100 at 175 %, 77 at 200 % and 33 at 300 %', () => {
  assert.equal(lastDrawn(1), 311);
  assert.equal(lastDrawn(1.75), 100);
  assert.equal(lastDrawn(2), 77);
  assert.equal(lastDrawn(3), 33);
  // The budget, not the raster limit, is what stops it now.
  assert.equal(canvasFitsRaster(DEFAULT_FRAME, chartHeight(101), 1.75), true);
  assert.equal(canvasWithinSafeBudget(DEFAULT_FRAME, chartHeight(101), 1.75), false);
});

test('at the default window no canvas the budget admits is taller than 16 384 device pixels, where memory jumped', () => {
  // Measured: 211 rows at 175 % (16 331 px tall) cost 1.1 GB, 212 rows (16 408 px) 2.4 GB.
  for (const dpr of [1, 1.25, 1.5, 1.75, 2, 2.5, 3]) {
    const tallest = Math.ceil(chartHeight(lastDrawn(dpr, 1209)) * dpr);
    assert.ok(tallest <= 16_384, `${dpr}: ${tallest}`);
  }
});

test('the frozen synthetic-input baseline still draws: Period A and Period B, all accounts, at 100 % and 175 % (005)', () => {
  const snapshot = loadFixture('a1-result.json');
  const all = defaultContext(snapshot);
  const periodA = analyse(snapshot, { ...all, fromDate: '2026-02-01', toDate: '2026-02-28' });
  const periodB = analyse(snapshot, { ...all, fromDate: '2025-01-01', toDate: '2025-12-31' });
  assert.equal(periodA.rows.length, 3);
  assert.equal(periodB.rows.length, 1);
  const counts: number[] = [periodA.rows.length, periodB.rows.length];
  for (const dpr of [1, 1.75]) {
    for (const count of counts) {
      assert.equal(canvasFitsRaster(DEFAULT_FRAME, chartHeight(count), dpr), true);
      assert.equal(canvasWithinSafeBudget(DEFAULT_FRAME, chartHeight(count), dpr), true);
    }
  }
});
