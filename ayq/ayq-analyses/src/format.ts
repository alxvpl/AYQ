// AYQ Analyses — A1 presentation formatting.
//
// Dates, times, relative ages and lists go through `Intl` with the locale
// parameter. No component names a locale, and changing the locale changes
// presentation only: never a result value, coverage, filtering, ordering or
// contribution semantics.

import type { IsoDate } from './types.js';
import { parseIsoDate } from './dates.js';

/**
 * A calendar date is a calendar date: it is formatted in UTC so that the
 * machine's timezone cannot move it to the day before.
 */
export function formatDate(value: IsoDate, locale: string): string {
  const { year, month, day } = parseIsoDate(value);
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, month - 1, day)),
  );
}

/** An instant, as the owner's own machine presents it. */
export function formatDateTime(instant: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(instant));
}

/**
 * The age of the snapshot. It states age only and never implies whether newer
 * data exists.
 */
export function formatRelative(instant: string, now: Date, locale: string): string {
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const seconds = (new Date(instant).getTime() - now.getTime()) / 1000;
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return formatter.format(Math.round(seconds / size), unit);
  }
  return formatter.format(Math.round(seconds), 'second');
}

export function formatList(items: readonly string[], locale: string): string {
  return new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(items);
}
