// AYQ Analyses — A1 exact money formatting.
//
// One formatter supplies every visible money figure (007 §15). It starts from
// integer minor units and the currency's exponent, builds the exact decimal
// digits itself, and lets `Intl` apply grouping, separators and currency
// presentation to that exact string. No display path divides a minor-unit
// amount by a power of ten, so no precision is lost before formatting.

import type { Currency } from './types.js';

/** Minor units may exceed the IEEE-754 safe integer range, so bigint is accepted. */
export type MinorUnits = number | bigint;

const exponentCache = new Map<Currency, number>();

/**
 * The currency's exponent. Currency data is not locale data, so this is read
 * through one fixed locale and never varies with the operating-system locale.
 */
export function currencyExponent(currency: Currency): number {
  const cached = exponentCache.get(currency);
  if (cached !== undefined) return cached;
  const resolved = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    currencyDisplay: 'code',
  }).resolvedOptions();
  const exponent = resolved.minimumFractionDigits;
  if (exponent === undefined) throw new RangeError(`no exponent is known for ${currency}`);
  exponentCache.set(currency, exponent);
  return exponent;
}

function toBigInt(minor: MinorUnits): bigint {
  if (typeof minor === 'bigint') return minor;
  if (!Number.isInteger(minor)) {
    throw new RangeError('money values are integer minor units');
  }
  if (!Number.isSafeInteger(minor)) {
    throw new RangeError('minor units beyond the safe integer range must be passed as bigint');
  }
  return BigInt(minor);
}

/**
 * The exact decimal digits of a minor-unit amount, as a string. This is the
 * only place the decimal point is placed, and it is placed by moving digits,
 * never by dividing.
 */
export function exactDecimalString(minor: MinorUnits, exponent: number): string {
  const value = toBigInt(minor);
  const negative = value < 0n;
  const digits = (negative ? -value : value).toString();
  if (exponent === 0) return `${negative ? '-' : ''}${digits}`;
  const padded = digits.padStart(exponent + 1, '0');
  const whole = padded.slice(0, padded.length - exponent);
  const fraction = padded.slice(padded.length - exponent);
  return `${negative ? '-' : ''}${whole}.${fraction}`;
}

/** The inverse of {@link exactDecimalString}: exact decimal digits back to minor units. */
export function minorUnitsFromDecimalString(decimal: string, exponent: number): bigint {
  const match = /^(-?)(\d+)(?:\.(\d*))?$/.exec(decimal);
  if (!match) throw new RangeError(`not an exact decimal string: ${decimal}`);
  const [, sign, whole, fraction = ''] = match;
  if (fraction.length > exponent) {
    throw new RangeError(`more fraction digits than the currency's exponent: ${decimal}`);
  }
  const scaled = `${whole}${fraction.padEnd(exponent, '0')}`;
  const value = BigInt(scaled);
  return sign === '-' ? -value : value;
}

const formatterCache = new Map<string, Intl.NumberFormat>();

function currencyFormatter(currency: Currency, locale: string, signDisplay: 'auto' | 'exceptZero'): Intl.NumberFormat {
  const cacheKey = `${locale}|${currency}|${signDisplay}`;
  const cached = formatterCache.get(cacheKey);
  if (cached) return cached;
  const exponent = currencyExponent(currency);
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
    signDisplay,
  });
  formatterCache.set(cacheKey, formatter);
  return formatter;
}

/**
 * Every visible money figure comes from here: headline, table cells, comparison
 * line, chart labels and tooltips, exclusion amounts, the reconciliation
 * difference and the detail pane.
 */
export function formatMoney(minor: MinorUnits, currency: Currency, locale: string): string {
  const exponent = currencyExponent(currency);
  return currencyFormatter(currency, locale, 'auto').format(
    exactDecimalString(minor, exponent) as unknown as number,
  );
}

/** A signed figure, so a change of zero still reads as a change rather than a total. */
export function formatSignedMoney(minor: MinorUnits, currency: Currency, locale: string): string {
  const exponent = currencyExponent(currency);
  return currencyFormatter(currency, locale, 'exceptZero').format(
    exactDecimalString(minor, exponent) as unknown as number,
  );
}

/**
 * The minor units a formatted figure actually prints, read back from the
 * formatter's own parts. This is what makes the round-trip a property of the
 * display path rather than of the string that fed it.
 */
export function minorUnitsFromFormatted(minor: MinorUnits, currency: Currency, locale: string): bigint {
  const exponent = currencyExponent(currency);
  const parts = currencyFormatter(currency, locale, 'auto').formatToParts(
    exactDecimalString(minor, exponent) as unknown as number,
  );
  let digits = '';
  let fractionDigits = '';
  let negative = false;
  for (const part of parts) {
    if (part.type === 'minusSign') negative = true;
    else if (part.type === 'integer') digits += part.value;
    else if (part.type === 'fraction') fractionDigits += part.value;
  }
  if (fractionDigits.length !== exponent) {
    throw new RangeError('formatted figure does not carry the currency exponent exactly');
  }
  const value = BigInt(`${digits}${fractionDigits}`);
  return negative ? -value : value;
}

/** An integer count, formatted for the interface locale. */
export function formatCount(value: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(value);
}
