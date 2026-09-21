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
