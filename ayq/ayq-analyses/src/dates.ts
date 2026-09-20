// AYQ Analyses — A1 dates.
//
// Every period is [fromDate, toDate], inclusive on both ends, evaluated on
// bookingDate. Presets are a way to choose a period, never the way it is
// reported: they resolve to explicit dates before the engine runs.
//
// The preset anchor is the UTC calendar date represented by
// snapshot.meta.generatedAt — not the machine clock, and not generatedAt
// converted through a local timezone (006, 007 §5).

import type { IsoDate } from './types.js';

export type PeriodPreset =
  | 'thisMonth'
  | 'lastMonth'
  | 'thisQuarter'
  | 'lastQuarter'
  | 'thisYear'
  | 'lastYear'
  | 'custom';

export const PERIOD_PRESETS: readonly PeriodPreset[] = [
  'thisMonth',
  'lastMonth',
  'thisQuarter',
  'lastQuarter',
  'thisYear',
  'lastYear',
  'custom',
] as const;

export interface Period {
  fromDate: IsoDate;
  toDate: IsoDate;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface CalendarDate {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
}

export function isIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== 'string') return false;
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return false;
  return day >= 1 && day <= daysInMonth(year, month);
}

export function parseIsoDate(value: IsoDate): CalendarDate {
  const match = ISO_DATE.exec(value);
  if (!match || !isIsoDate(value)) throw new RangeError(`not a calendar date: ${value}`);
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

export function isoDate(year: number, month: number, day: number): IsoDate {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** Days since the epoch, in UTC. Used only for ordering and span arithmetic. */
export function epochDay(value: IsoDate): number {
  const { year, month, day } = parseIsoDate(value);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

export function fromEpochDay(days: number): IsoDate {
  const date = new Date(days * 86_400_000);
  return isoDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

export function addDays(value: IsoDate, days: number): IsoDate {
  return fromEpochDay(epochDay(value) + days);
}

/** Negative when `a` is earlier. Calendar dates compare as plain strings too. */
export function compareDates(a: IsoDate, b: IsoDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function minDate(a: IsoDate, b: IsoDate): IsoDate {
  return a <= b ? a : b;
}

export function maxDate(a: IsoDate, b: IsoDate): IsoDate {
  return a >= b ? a : b;
}

export function lengthInDays(period: Period): number {
  return epochDay(period.toDate) - epochDay(period.fromDate) + 1;
}

/**
 * The UTC calendar date represented by an instant. The Windows clock is never
 * consulted, and generatedAt is never converted through a local timezone
 * before the anchor date is decided.
 */
export function utcCalendarDate(instant: string): IsoDate {
  const parsed = Date.parse(instant);
  if (Number.isNaN(parsed)) throw new RangeError(`not an instant: ${instant}`);
  const date = new Date(parsed);
  return isoDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function monthPeriod(year: number, month: number): Period {
  let y = year;
  let m = month;
  while (m < 1) {
    m += 12;
    y -= 1;
  }
  while (m > 12) {
    m -= 12;
    y += 1;
  }
  return { fromDate: isoDate(y, m, 1), toDate: isoDate(y, m, daysInMonth(y, m)) };
}

function quarterPeriod(year: number, quarter: number): Period {
  let y = year;
  let q = quarter;
  while (q < 1) {
    q += 4;
    y -= 1;
  }
  while (q > 4) {
    q -= 4;
    y += 1;
  }
  const first = (q - 1) * 3 + 1;
  const last = first + 2;
  return { fromDate: isoDate(y, first, 1), toDate: isoDate(y, last, daysInMonth(y, last)) };
}

function yearPeriod(year: number): Period {
  return { fromDate: isoDate(year, 1, 1), toDate: isoDate(year, 12, 31) };
}

/** Resolves a preset against the snapshot's own anchor date. */
export function resolvePreset(preset: Exclude<PeriodPreset, 'custom'>, anchor: IsoDate): Period {
  const { year, month } = parseIsoDate(anchor);
  const quarter = Math.floor((month - 1) / 3) + 1;
  switch (preset) {
    case 'thisMonth':
      return monthPeriod(year, month);
    case 'lastMonth':
      return monthPeriod(year, month - 1);
    case 'thisQuarter':
      return quarterPeriod(year, quarter);
    case 'lastQuarter':
      return quarterPeriod(year, quarter - 1);
    case 'thisYear':
      return yearPeriod(year);
    case 'lastYear':
      return yearPeriod(year - 1);
  }
}

export type PeriodShape = 'month' | 'quarter' | 'year' | 'custom';

/**
 * The calendar shape of a resolved period.
 *
 * The analytical context carries dates only — a preset resolves to dates and
 * the dates are what is reported afterwards (007 §5, r03 §5). The shape is
 * therefore read back from the dates, so that a month, a quarter and a year
 * each shift back by one whole unit as r003 §4 requires.
 */
export function periodShape(period: Period): PeriodShape {
  const from = parseIsoDate(period.fromDate);
  const to = parseIsoDate(period.toDate);
  if (from.day !== 1) return 'custom';
  if (to.day !== daysInMonth(to.year, to.month)) return 'custom';
  if (from.year === to.year && from.month === 1 && to.month === 12) return 'year';
  if (from.year !== to.year) return 'custom';
  if (from.month === to.month) return 'month';
  if (from.month % 3 === 1 && to.month === from.month + 2) return 'quarter';
  return 'custom';
}

/**
 * The previous period: a whole month, quarter or year shifts back one unit;
 * any other span is the equal-length span immediately preceding fromDate.
 */
export function previousPeriod(period: Period): Period {
  const from = parseIsoDate(period.fromDate);
  switch (periodShape(period)) {
    case 'month':
      return monthPeriod(from.year, from.month - 1);
    case 'quarter':
      return quarterPeriod(from.year, Math.floor((from.month - 1) / 3));
    case 'year':
      return yearPeriod(from.year - 1);
    case 'custom': {
      const toDate = addDays(period.fromDate, -1);
      const fromDate = addDays(toDate, -(lengthInDays(period) - 1));
      return { fromDate, toDate };
    }
  }
}

export interface ClampedDate {
  requestedDate: IsoDate;
  clampedDate: IsoDate;
  year: number;
}

export interface SameLastYearPeriod extends Period {
  clamped: ClampedDate | null;
}

/**
 * The same calendar dates with the year decremented by one. 29 February does
 * not exist in a common year and clamps to the last day of that month; the
 * clamp is stated in the context.
 */
export function sameLastYearPeriod(period: Period): SameLastYearPeriod {
  let clamped: ClampedDate | null = null;

  const shift = (value: IsoDate): IsoDate => {
    const { year, month, day } = parseIsoDate(value);
    const target = year - 1;
    const available = daysInMonth(target, month);
    if (day <= available) return isoDate(target, month, day);
    const clampedDate = isoDate(target, month, available);
    clamped = { requestedDate: isoDate(target, month, day), clampedDate, year: target };
    return clampedDate;
  };

  const fromDate = shift(period.fromDate);
  const toDate = shift(period.toDate);
  return { fromDate, toDate, clamped };
}

export function comparisonPeriod(
  period: Period,
  mode: 'previous' | 'sameLastYear',
): SameLastYearPeriod {
  if (mode === 'sameLastYear') return sameLastYearPeriod(period);
  return { ...previousPeriod(period), clamped: null };
}
