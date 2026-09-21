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
import { MAX_CANVAS_AREA, MAX_CANVAS_SIDE, canvasFitsRaster } from '../src/geometry.js';
import { translate } from '../src/strings.js';

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
  // Decided before drawing, from the frame's width, the rows' height and the pixel ratio; re-decided on resize.
  assert.match(result, /setTooLarge\(!canvasFitsRaster\(width, height, window\.devicePixelRatio\)\)/);
  assert.match(result, /window\.addEventListener\('resize', decide\)/);
  // Nothing is drawn when it would not rasterise; the sentence takes the chart's place.
  assert.match(result, /if \(tooLarge \|\| host\.current === null\) return undefined;/);
  assert.match(result, /tooLarge \? \(\s*<p className="chart-too-large">\{t\('chart\.tooLarge'\)\}<\/p>/);
});
