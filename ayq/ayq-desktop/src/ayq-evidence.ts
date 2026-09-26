// What AYQ has actually read, as intervals — and what that proves.
//
// Two facts about an account get confused constantly, and 03 §8 keeps them
// apart: *when AYQ last managed to import something* and *how far the bank's
// own movements reach*. A person who imported last night a statement that ends
// on the 31st of August has a fresh import and month-old data, and a screen
// that shows one timestamp for both is lying about one of them.
//
// Version 7 made a second mistake underneath that one: it recorded coverage
// only where the bank had stated a closing balance. A CAMT file that proves
// every movement in March but states no closing figure advanced nothing, so
// AYQ held a full month of evidence and could not say it had it. Coverage is
// about movements. The closing balance is a separate fact and belongs to the
// anchor.
//
// So evidence here is an interval — `fromDate` to `toDate`, per import, per
// account — and `fromDate` may be null when the file did not say. Null is not a
// hole to be filled in from the first transaction that happened to be in the
// file: a statement whose start is unknown could be missing the first fortnight
// of the month and nothing in it would say so. Unknown means unproven, and
// unproven months stay out of the Plan's arithmetic.

import type { AyqCoverageEvidence, AyqStore } from './ayq-store.ts';

import { ayqAddDays, ayqMonthEnd, ayqMonthStart } from './ayq-dates.ts';

/** One closed interval of days, both ends inclusive. */
export type AyqInterval = { from: string; to: string };

/**
 * The intervals one account's evidence actually proves.
 *
 * Evidence with an unknown start proves no interval at all and is dropped here
 * rather than defaulted: it is still kept in the store, still shown as the day
 * the bank's data reaches to, and still carries its closing balance — it simply
 * cannot be part of a union that is asked to prove continuity.
 */
export function ayqProvenIntervals(
  store: AyqStore,
  accountId: string,
): AyqInterval[] {
  const intervals: AyqInterval[] = [];
  for (const one of store.evidence) {
    if (one.accountId !== accountId) continue;
    if (one.fromDate === null || one.toDate === null) continue;
    if (one.fromDate > one.toDate) continue;
    intervals.push({ from: one.fromDate, to: one.toDate });
  }
  return ayqUnion(intervals);
}

/**
 * Overlapping and adjacent intervals merged; everything else left apart.
 *
 * Adjacent counts: a statement ending on the 15th and one beginning on the 16th
 * are a fortnight with no gap in it. A day between them is a gap, and a gap of
 * one day is the difference between a month AYQ can vouch for and a month it
 * cannot.
 */
export function ayqUnion(intervals: AyqInterval[]): AyqInterval[] {
  const sorted = [...intervals].sort((left, right) =>
    left.from === right.from
      ? left.to < right.to
        ? -1
        : 1
      : left.from < right.from
        ? -1
        : 1,
  );

  const merged: AyqInterval[] = [];
  for (const one of sorted) {
    const last = merged.at(-1);
    if (last !== undefined && one.from <= ayqAddDays(last.to, 1)) {
      if (one.to > last.to) last.to = one.to;
      continue;
    }
    merged.push({ ...one });
  }
  return merged;
}

/** Whether a union of intervals covers every day from `from` to `to`. */
export function ayqCovers(
  intervals: AyqInterval[],
  from: string,
  to: string,
): boolean {
  return ayqUnion(intervals).some(one => one.from <= from && one.to >= to);
}

/**
 * How far the bank's own data reaches for one account (§6.2).
 *
 * The furthest `toDate` of any evidence, whether or not that file stated a
 * closing balance and whether or not its start was known. A file that proves
 * movements to the 31st has told AYQ something about the 31st.
 */
export function ayqBankDataThrough(
  store: AyqStore,
  accountId: string,
): string | null {
  let furthest: string | null = null;
  for (const one of store.evidence) {
    if (one.accountId !== accountId) continue;
    if (furthest === null || one.toDate > furthest) furthest = one.toDate;
  }
  return furthest;
}

/**
 * The newest evidence that carries a bank-stated closing balance.
 *
 * This is the only thing reconciliation may be computed against (§5): without a
 * figure from the bank there is nothing to agree or disagree with, and a
 * comparison against AYQ's own arithmetic would be AYQ agreeing with itself.
 */
export function ayqClosingEvidence(
  store: AyqStore,
  accountId: string,
): AyqCoverageEvidence | null {
  let found: AyqCoverageEvidence | null = null;
  for (const one of store.evidence) {
    if (one.accountId !== accountId) continue;
    if (one.closingBalanceCents === null) continue;
    if (found === null || one.toDate > found.toDate) found = one;
  }
  return found;
}

/**
 * Whether the statements AYQ holds for one account reported on more than one
 * account (PF-006 F6).
 *
 * Read from what each statement said it was about, recorded since store
 * version 12. Evidence written before that recorded nothing, so it cannot
 * prove a mix and is not treated as one — it is not guessed at from a file
 * name.
 */
export function ayqStatementsMixed(
  store: AyqStore,
  accountId: string,
  accountName: string,
): boolean {
  for (const one of store.evidence) {
    if (one.accountId !== accountId) continue;
    const said = one.statementAccount ?? null;
    if (said !== null && said !== accountName) return true;
  }
  return false;
}

/** When an account last had a successful import, from the import records (§6.1). */
export function ayqLastSuccessfulImport(
  store: AyqStore,
  accountId: string,
): string | null {
  let latest: string | null = null;
  for (const record of store.imports) {
    if (record.accountId !== accountId) continue;
    // A failed import is not in this list at all — `ayqImportCamt` throws
    // before it writes a record when nothing could be read — but a record that
    // imported nothing and reported only problems is not a success either.
    if (record.imported === 0 && record.duplicates === 0) continue;
    if (latest === null || record.at > latest) latest = record.at;
  }
  return latest;
}

/**
 * What AYQ knows about when an account was in use.
 *
 * `firstSeen` is the earliest day it holds any evidence or any transaction for.
 * Null is an account it knows nothing about at all — which is not the same as
 * an account that did not exist, and is treated accordingly below.
 */
export type AyqAccountLifetime = {
  accountId: string;
  firstSeen: string | null;
};

/**
 * The calendar months that are complete and reliably covered (§6.3).
 *
 * The rule is a conjunction over accounts, and the conservative direction is
 * always "not proven":
 *
 *   - an account whose evidence does not reach continuously from the first to
 *     the last day of the month fails the month;
 *   - evidence of unknown start proves nothing and so fails it;
 *   - a gap of a single day fails it;
 *   - an account AYQ first sees *after* the month ended is not held against
 *     that month, because it was not there to have statements;
 *   - an account AYQ knows nothing about at all fails every month, because
 *     "insufficient to prove the account did not exist" is explicitly a reason
 *     to exclude the month rather than to wave the account through.
 *
 * A closed account is *not* waved through either. Actual records that an
 * account is closed and does not record when, so "closed before the month
 * began" is a fact AYQ cannot establish; the rule above says to prefer
 * excluding the month over fabricating completeness, so a closed account goes
 * on being counted from the day it was first seen. The consequence is real and
 * is the intended one: closing an account does not silently make a year of
 * uncovered months look complete.
 */
export function ayqCompleteMonths(
  store: AyqStore,
  lifetimes: AyqAccountLifetime[],
  months: string[],
): Set<string> {
  const proven = new Map<string, AyqInterval[]>(
    lifetimes.map(one => [one.accountId, ayqProvenIntervals(store, one.accountId)]),
  );

  const complete = new Set<string>();
  for (const month of months) {
    const first = ayqMonthStart(month);
    const last = ayqMonthEnd(month);

    // A month no account was there for is not a complete month. It is a month
    // AYQ knows nothing whatever about — and "every account is covered" is
    // vacuously true of no accounts, which would quietly qualify every month
    // before the owner opened their first account and drag the mean of every
    // category down towards nought with months that never existed.
    let participating = 0;
    let held = true;
    for (const account of lifetimes) {
      // Introduced after the month ended: it had no statements to be missing.
      if (account.firstSeen !== null && account.firstSeen > last) continue;
      participating += 1;
      // An account AYQ knows nothing about has no intervals, so it fails here,
      // which is §6.3's "prefer excluding the month".
      if (!ayqCovers(proven.get(account.accountId) ?? [], first, last)) {
        held = false;
        break;
      }
    }

    if (participating > 0 && held) complete.add(month);
  }
  return complete;
}
