// AYQ Analyses — chart geometry.
//
// A bar's length is presentation, not a financial result (r03 §8, 011 §6).
// The exact bigint row values stay authoritative for everything the chart
// prints — label and tooltip — and this derives a bounded Number for the bar
// only, preserving sign, order and relative magnitude. Nothing derived here is
// ever read back as an amount, and no rounded value re-enters a result.

const SAFE = BigInt(Number.MAX_SAFE_INTEGER);

/**
 * Display-only bar lengths for exact row values. While every value fits the
 * safe integer range the Number is exact; beyond it all values are divided by
 * one common power of ten so that the largest fits, which keeps sign, order
 * and proportion for the geometry and nothing else.
 */
export function chartGeometry(values: readonly bigint[]): number[] {
  let largest = 0n;
  for (const value of values) {
    const magnitude = value < 0n ? -value : value;
    if (magnitude > largest) largest = magnitude;
  }
  let divisor = 1n;
  while (largest / divisor > SAFE) divisor *= 10n;
  return values.map(value => Number(value / divisor));
}

/**
 * A counterparty label on the chart's category axis: at most 240 CSS pixels,
 * about forty characters of the chart's 12 px type. A longer name is shortened
 * at its end with exactly one "…" (U+2026) and never wraps, so a shortened
 * name cannot read as a whole one (037 Observation A; directive 004 T2). The
 * table and the detail pane keep the full name. The width is chart-only
 * geometry, revisable on evidence; amount labels and tooltips are untouched.
 *
 * Size, family and margin are the ones ECharts already draws with on Windows,
 * named here so that the gutter below is measured in the font that is drawn.
 */
export const CATEGORY_AXIS_LABEL = {
  width: 240,
  overflow: 'truncate',
  ellipsis: '…',
  fontSize: 12,
  fontFamily: 'Microsoft YaHei',
  margin: 8,
} as const;

/**
 * The room left of the axis for its labels: the widest label as it will be
 * drawn, over every row. ECharts' own containLabel measures one label in
 * ⌈n/40⌉ above forty rows, and in sans-serif rather than the family it draws
 * with, so a longer label could start beyond the canvas's left edge and lose
 * its first letters without any mark. `measure` returns a name's full width.
 */
export function categoryLabelGutter(names: readonly string[], measure: (text: string) => number): number {
  let widest = 0;
  for (const name of names) widest = Math.max(widest, Math.min(CATEGORY_AXIS_LABEL.width, measure(name)));
  return Math.ceil(widest) + CATEGORY_AXIS_LABEL.margin;
}

/**
 * What the platform will rasterise as one canvas, measured in this Electron
 * on 2026-09-21 (evidence/hardening-039): a side of at most 65 535 device
 * pixels and an area of at most 268 435 456 (16 384²). Above either the
 * canvas exists and draws nothing, silently. The chart asks this before it
 * draws, so that a result it cannot show is stated instead of left blank
 * (r004 §8.2). The limits are implementation facts, revisable on evidence.
 */
export const MAX_CANVAS_SIDE = 65_535;
export const MAX_CANVAS_AREA = 268_435_456;

/** Whether a chart of this CSS size, at this device pixel ratio, fits what the platform will rasterise. */
export function canvasFitsRaster(cssWidth: number, cssHeight: number, devicePixelRatio: number): boolean {
  const width = Math.ceil(cssWidth * devicePixelRatio);
  const height = Math.ceil(cssHeight * devicePixelRatio);
  if (width <= 0 || height <= 0) return true;
  return width <= MAX_CANVAS_SIDE && height <= MAX_CANVAS_SIDE && width * height <= MAX_CANVAS_AREA;
}

/**
 * The safe-render budget, in device pixels of canvas area (directive 004 T3):
 * 4 096², a sixteenth of the raster limit. Well below that limit a chart still
 * draws, but measured in this Electron on 2026-09-24 (evidence/overnight-t1-t3)
 * a canvas taller than 16 384 device pixels leaves the GPU and the process
 * tree grows by gigabytes: 211 rows at 175 % cost 1.1 GB, 212 rows 2.4 GB. At
 * the default window the first such canvas is 1 209 × 16 384 device pixels, at
 * 100 %; this budget sits below it at every scale. Above it the chart is not
 * drawn and says so, as at the raster limit (r005 §8.2). An implementation
 * safety limit, not Canon, revisable on evidence.
 */
export const SAFE_CANVAS_AREA = 16_777_216;

/** Whether a chart of this CSS size, at this device pixel ratio, stays within the safe-render budget. */
export function canvasWithinSafeBudget(cssWidth: number, cssHeight: number, devicePixelRatio: number): boolean {
  const width = Math.ceil(cssWidth * devicePixelRatio);
  const height = Math.ceil(cssHeight * devicePixelRatio);
  if (width <= 0 || height <= 0) return true;
  return width * height <= SAFE_CANVAS_AREA;
}
