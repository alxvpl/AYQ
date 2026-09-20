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
