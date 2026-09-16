// When history is allowed to invent a future expense — and when it is not.
//
// Build 004 offered a suggestion whenever the *median* interval between a
// counterparty's payments fell in a cadence window, and it took the average
// amount. On a supermarket that meant a confident "EUR 47.31 expected on the
// 14th" built out of a year of unrelated shopping — and once such a record
// exists it is subtracted from the forecast, so the position on Today was wrong
// because of a pattern nobody had ever agreed to.
//
// 9 §9.1 replaces that with three conditions, all of which must hold:
//
//   1. the same canonical counterparty;
//   2. the **exact** same amount, to the cent, in every occurrence;
//   3. every consecutive interval inside one cadence window — not the median,
//      every one of them.
//
// A median is what let the old rule through: four intervals of 3, 30, 31 and
// 90 days have a median of 30 and are not a monthly rhythm. So the median is
// used here only to *place* the next date, and only after every interval has
// already passed the window test.
//
// A SEPA mandate is evidence of identity and of a standing authorisation, and
// it is deliberately not a way round condition 3: a mandate that collects
// whenever a meter is read is a real mandate and an irregular payment, and a
// forecast is about dates. It rides along on a qualifying series and qualifies
// nothing on its own.
//
// Two series of different exact amounts under one counterparty are two series.
// A monthly 9.99 and a yearly 95.00 from the same shop must not be averaged
// into one nonsense figure, so grouping is by counterparty **and** amount.

import type { AyqPlanFrequency } from '../../ayq-client/src/ayq-ipc-contract.ts';

import { ayqAddDays, ayqDaysBetween } from './ayq-dates.ts';

/** 9 §9.1, exactly: the window each cadence's every interval must fall in. */
export const AYQ_CADENCE_WINDOWS: ReadonlyArray<{
  frequency: AyqPlanFrequency;
  least: number;
  most: number;
}> = [
  { frequency: 'weekly', least: 5, most: 9 },
  { frequency: 'fortnightly', least: 12, most: 17 },
  { frequency: 'monthly', least: 24, most: 38 },
  { frequency: 'quarterly', least: 80, most: 100 },
  { frequency: 'half-yearly', least: 170, most: 195 },
  { frequency: 'yearly', least: 350, most: 380 },
];

/** Below this a repetition is a coincidence (9 §9.1). */
export const AYQ_MINIMUM_OCCURRENCES = 3;

/** One payment, as the detector needs to see it. */
export type AyqSeriesOccurrence = {
  counterpartyKey: string;
  /** The name to show. Already resolved through 8 §8.2 by the caller. */
  name: string;
  date: string;
  /** Signed cents, as the ledger holds them. Only outgoings are considered. */
  amountCents: number;
  mandateId: string | null;
};

/** A series strict enough to be offered as an expectation. */
export type AyqSeries = {
  counterpartyKey: string;
  name: string;
  /** Positive cents: the exact amount every occurrence carried. */
  amountCents: number;
  frequency: AyqPlanFrequency;
  occurrences: number;
  firstDate: string;
  lastDate: string;
  /** Last occurrence plus the representative interval. */
  nextExpectedDate: string;
  mandateId: string | null;
};

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[middle - 1] + sorted[middle]) / 2)
    : sorted[middle];
}

/**
 * Every qualifying series, one per counterparty *and exact amount*.
 *
 * Income is not considered at all: §9 is about a future *expense* suggestion,
 * and 03 §7.7 already says expected income counts only once a person has
 * confirmed it — so detecting income here would produce offers that could never
 * do anything until they were confirmed anyway.
 */
export function ayqDetectSeries(
  occurrences: AyqSeriesOccurrence[],
): AyqSeries[] {
  const groups = new Map<string, AyqSeriesOccurrence[]>();

  for (const one of occurrences) {
    if (one.amountCents >= 0) continue;
    // Counterparty *and* amount. This is condition 2 expressed as the grouping
    // rather than as a check afterwards, which is what keeps one amount from
    // contaminating another under the same counterparty.
    const key = `${one.counterpartyKey} @ ${one.amountCents}`;
    const held = groups.get(key);
    if (held) held.push(one);
    else groups.set(key, [one]);
  }

  const found: AyqSeries[] = [];
  for (const group of groups.values()) {
    if (group.length < AYQ_MINIMUM_OCCURRENCES) continue;

    const sorted = [...group].sort((left, right) =>
      left.date < right.date ? -1 : left.date > right.date ? 1 : 0,
    );

    const intervals: number[] = [];
    for (let at = 1; at < sorted.length; at += 1) {
      intervals.push(ayqDaysBetween(sorted[at - 1].date, sorted[at].date));
    }

    // Condition 3, stated as it reads: one window, and every interval in it.
    // Two payments on the same day give an interval of nought, which is in no
    // window, so a double charge cannot pass for a rhythm either.
    const window = AYQ_CADENCE_WINDOWS.find(candidate =>
      intervals.every(
        interval => interval >= candidate.least && interval <= candidate.most,
      ),
    );
    if (window === undefined) continue;

    const last = sorted[sorted.length - 1];
    found.push({
      counterpartyKey: last.counterpartyKey,
      name: last.name,
      amountCents: Math.abs(last.amountCents),
      frequency: window.frequency,
      occurrences: sorted.length,
      firstDate: sorted[0].date,
      lastDate: last.date,
      // The median, and only now: every interval has already been proved to be
      // this cadence, so the median is a representative of a known rhythm
      // rather than a summary of an unknown one.
      nextExpectedDate: ayqAddDays(last.date, median(intervals)),
      mandateId: sorted.find(one => one.mandateId !== null)?.mandateId ?? null,
    });
  }

  // Most recent first, then the longest-running: what was charged last week is
  // more likely to be charged again than what stopped in March.
  found.sort((left, right) => {
    if (left.lastDate !== right.lastDate) {
      return left.lastDate < right.lastDate ? 1 : -1;
    }
    return right.occurrences - left.occurrences;
  });
  return found;
}

/**
 * Whether one already-offered record is still something history supports.
 *
 * The comparison is on what the record *is* — its counterparty, its amount and
 * its rhythm — rather than on how it was created, so a suggestion made by an
 * older AYQ under a looser rule is judged by the rule that holds now.
 */
export function ayqSeriesStillHolds(
  series: AyqSeries[],
  record: {
    counterpartyKey: string | null;
    amountCents: number;
    recurrence: { frequency: AyqPlanFrequency };
  },
): boolean {
  if (record.counterpartyKey === null) return false;
  return series.some(
    one =>
      one.counterpartyKey === record.counterpartyKey &&
      one.amountCents === record.amountCents &&
      one.frequency === record.recurrence.frequency,
  );
}
