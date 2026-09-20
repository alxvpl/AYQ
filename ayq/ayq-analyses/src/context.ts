// AYQ Analyses — the A1 analytical context.

import { resolvePreset, utcCalendarDate, type PeriodPreset } from './dates.js';
import type { AnalysisContext, AyqAnalyticalSnapshot, CategorySelectionEntry } from './types.js';

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

export function anchorDate(snapshot: AyqAnalyticalSnapshot): string {
  return utcCalendarDate(snapshot.meta.generatedAt);
}

export function presetPeriod(snapshot: AyqAnalyticalSnapshot, preset: Exclude<PeriodPreset, 'custom'>) {
  return resolvePreset(preset, anchorDate(snapshot));
}
