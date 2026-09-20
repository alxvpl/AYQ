// AYQ Analyses — the A1 analytical context.

import { isIsoDate, resolvePreset, utcCalendarDate, type PeriodPreset } from './dates.js';
import type { AnalysisContext, AyqAnalyticalSnapshot, CategorySelectionEntry, IsoDate } from './types.js';

/**
 * The context every successful load resets to (009 §4).
 *
 * `Last month` is resolved against the UTC calendar date of the snapshot's own
 * `generatedAt`, never against the machine clock. No fallback is applied when
 * that month is not fully covered: the ordinary coverage state says so.
 */
export function defaultContext(snapshot: AyqAnalyticalSnapshot): AnalysisContext {
  const anchor = utcCalendarDate(snapshot.meta.generatedAt);
  const period = resolvePreset('lastMonth', anchor);
  return {
    fromDate: period.fromDate,
    toDate: period.toDate,
    comparison: 'none',
    accountKeys: snapshot.accounts.map(account => account.accountKey),
    categoryKeys: allCategoryKeys(snapshot),
  };
}

/** Every category the snapshot holds, plus the explicit Uncategorised entry. */
export function allCategoryKeys(snapshot: AyqAnalyticalSnapshot): CategorySelectionEntry[] {
  return [...snapshot.categories.map(category => category.categoryId), null];
}

/**
 * A date field's commit (r05 §5, PC6c). Keystrokes never reach the context;
 * this is applied on blur or Enter to the field's draft. A valid date becomes
 * the context's, and if it crosses the other bound that bound moves to the
 * same date, so both dates stay visible and in order. An empty or invalid
 * draft commits nothing: the field restores the last committed value. The
 * comparison mode is never touched by a date.
 */
export function commitPeriodDate(
  context: AnalysisContext,
  field: 'fromDate' | 'toDate',
  draft: string,
): AnalysisContext | null {
  if (!isIsoDate(draft)) return null;
  const date: IsoDate = draft;
  if (date === context[field]) return null;
  if (field === 'fromDate') {
    return { ...context, fromDate: date, toDate: date > context.toDate ? date : context.toDate };
  }
  return { ...context, toDate: date, fromDate: date < context.fromDate ? date : context.fromDate };
}

export function anchorDate(snapshot: AyqAnalyticalSnapshot): string {
  return utcCalendarDate(snapshot.meta.generatedAt);
}

export function presetPeriod(snapshot: AyqAnalyticalSnapshot, preset: Exclude<PeriodPreset, 'custom'>) {
  return resolvePreset(preset, anchorDate(snapshot));
}
