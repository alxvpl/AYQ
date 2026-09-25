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
import { MAX_CANVAS_AREA, MAX_CANVAS_SIDE, SAFE_CANVAS_HEIGHT, canvasFitsRaster, canvasWithinSafeHeight, safeHeightLimit } from '../src/geometry.js';
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
  // raster limit and the GPU's largest texture (F1) — and re-decided on resize.
  assert.match(result, /const limit = safeHeightLimit\(gpuMaxTexture\(\)\);\s*setTooLarge\(!canvasFitsRaster\(width, height, dpr\) \|\| !canvasWithinSafeHeight\(height, dpr, limit\)\);/);
  assert.match(result, /getContext\('webgl'\)[\s\S]*MAX_TEXTURE_SIZE/);
  assert.match(result, /window\.addEventListener\('resize', decide\)/);
  // Nothing is drawn when it would not rasterise; the sentence takes the chart's place.
  assert.match(result, /if \(tooLarge \|\| host\.current === null\) return undefined;/);
  assert.match(result, /tooLarge \? \(\s*<p className="chart-too-large">\{t\('chart\.tooLarge'\)\}<\/p>/);
});

// F1 (directive 025 §2, replacing T3's area budget): the canvas's device-pixel
// height against the GPU's largest texture. Above it the chart is not drawn
// and the same sentence stands in its place; the raster limits above are
// unchanged, and there is no area cap beside it.
const DEFAULT_FRAME = 1220;
const lastDrawn = (dpr: number, width = DEFAULT_FRAME, limit = SAFE_CANVAS_HEIGHT): number => {
  let rows = 0;
  while (
    canvasFitsRaster(width, chartHeight(rows + 1), dpr) &&
    canvasWithinSafeHeight(chartHeight(rows + 1), dpr, limit)
  ) rows += 1;
  return rows;
};

test('the limit is 16 384 device pixels of height, lowered to a smaller reported texture, never raised', () => {
  assert.equal(SAFE_CANVAS_HEIGHT, 16_384);
  assert.equal(safeHeightLimit(16_384), 16_384);
  assert.equal(safeHeightLimit(32_768), 16_384);
  assert.equal(safeHeightLimit(8_192), 8_192);
  for (const unknown of [null, undefined, 0, -1, Number.NaN, '16384']) assert.equal(safeHeightLimit(unknown), 16_384);
});

test('the height is the backing store as allocated: CSS height times the ratio, truncated', () => {
  // 14 895 × 1.1 = 16 384.5 → a 16 384-pixel canvas; 14 896 × 1.1 = 16 385.6 → 16 385.
  assert.equal(canvasWithinSafeHeight(14_895, 1.1, 16_384), true);
  assert.equal(canvasWithinSafeHeight(14_896, 1.1, 16_384), false);
});

test('at 175 % 211 rows draw (16 331 px) and 212 are refused (16 408 px), where memory jumped', () => {
  assert.equal(Math.floor(chartHeight(211) * 1.75), 16_331);
  assert.equal(Math.floor(chartHeight(212) * 1.75), 16_408);
  assert.equal(canvasWithinSafeHeight(chartHeight(211), 1.75, SAFE_CANVAS_HEIGHT), true);
  assert.equal(canvasWithinSafeHeight(chartHeight(212), 1.75, SAFE_CANVAS_HEIGHT), false);
  // The height guard, not the raster limit, is what stops it.
  assert.equal(canvasFitsRaster(DEFAULT_FRAME, chartHeight(212), 1.75), true);
});

test('the chart draws to 371 rows at 100 %, 211 at 175 %, 185 at 200 % and 123 at 300 %, at any window width', () => {
  for (const width of [961, 1209, DEFAULT_FRAME, 2055]) {
    assert.deepEqual([1, 1.75, 2, 3].map(dpr => lastDrawn(dpr, width)), [371, 211, 185, 123], `width ${width}`);
  }
});

test('a smaller GPU limit refuses earlier', () => {
  assert.equal(lastDrawn(1.75, DEFAULT_FRAME, 8_192), 105);
  assert.equal(canvasWithinSafeHeight(chartHeight(106), 1.75, 8_192), false);
  assert.equal(canvasWithinSafeHeight(chartHeight(106), 1.75, SAFE_CANVAS_HEIGHT), true);
});

test('no admitted canvas is taller than the limit, however narrow the window — the gap T3 left is closed', () => {
  // T3's area budget admitted up to ~395 rows at 100 % in a 961-pixel frame (17 428 px tall).
  for (const dpr of [1, 1.25, 1.5, 1.75, 2, 2.5, 3]) {
    for (const width of [400, 961, 1209, 2055, 4000]) {
      const rows = lastDrawn(dpr, width);
      assert.ok(Math.floor(chartHeight(rows) * dpr) <= SAFE_CANVAS_HEIGHT, `${dpr} / ${width}`);
      assert.ok(Math.floor(chartHeight(rows + 1) * dpr) > SAFE_CANVAS_HEIGHT, `${dpr} / ${width}: stops at the limit`);
    }
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
      assert.equal(canvasWithinSafeHeight(chartHeight(count), dpr, SAFE_CANVAS_HEIGHT), true);
    }
  }
});
