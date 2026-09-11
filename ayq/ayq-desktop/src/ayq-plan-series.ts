// The rhythm of a planned record, and what it is on any given date.
//
// Pure, and separate from `ayq-plan.ts` on purpose: nothing here reads a store,
// opens a budget or loads `@actual-app/api`, so the whole of it can be proved
// on invented data by a test that starts in milliseconds. The forecast reads
// these same functions, which is what makes 03 §7 testable at all.
//
// Nothing here reads the clock either. `today` is always a parameter.

import type {
  AyqPlanFrequency,
  AyqPlanOccurrence,
  AyqPlanOccurrenceState,
  AyqPlannedRecord,
} from '../../ayq-client/src/ayq-ipc-contract.ts';

import { ayqAddDays, ayqAddMonths } from './ayq-dates.ts';
import type { AyqPlanOccurrenceRecord } from './ayq-store.ts';

/** What the rhythm needs to know about a record, and nothing else. */
export type AyqSeries = Pick<
  AyqPlannedRecord,
  'state' | 'startDate' | 'recurrence' | 'endDate' | 'confirmedAt' | 'suggestedAt'
>;

/** Twelve months from today, so a yearly payment is always in view (03 §7.9). */
export const AYQ_PLAN_HORIZON_MONTHS = 12;

/**
 * The first date a record can be expected on (03 §7.14).
 *
 * Not its start date: the date it was decided. A rhythm AYQ detects in two
 * years of statements has a start date two years back, and those payments
 * already happened — they are history, and history is not overdue. The same
 * holds for a record confirmed today with a start date last January.
 *
 * This is what makes 03 §7.13 affordable. An overdue expense now counts for as
 * long as it takes, with no cut-off anywhere, because the only occurrences that
 * exist at all are the ones since somebody decided the record was real.
 */
export function ayqExpectedFrom(
  record: Pick<AyqPlannedRecord, 'state' | 'startDate' | 'confirmedAt' | 'suggestedAt'>,
): string {
  // A dismissed record keeps whichever date it had. Without the fallback a
  // suggestion somebody struck out would lose its date and reach all the way
  // back to its start — generating two years of dismissed occurrences, and
  // dragging the whole plan window back with it, for a record nobody wants.
  const decided =
    record.state === 'suggested'
      ? record.suggestedAt
      : (record.confirmedAt ?? record.suggestedAt);
  if (decided === null) return record.startDate;
  return decided > record.startDate ? decided : record.startDate;
}

/**
 * Nothing generates more occurrences than this.
 *
 * A weekly record over eight years is about four hundred; this only stops a
 * malformed one from spinning.
 */
const MAX_OCCURRENCES = 4_000;

export const AYQ_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** How many days one period of this frequency is, or null when it is months. */
function stepDays(frequency: AyqPlanFrequency): number | null {
  if (frequency === 'weekly') return 7;
  if (frequency === 'fortnightly') return 14;
  return null;
}

/** How many months one period of this frequency is, or null when it is days. */
function stepMonths(frequency: AyqPlanFrequency): number | null {
  if (frequency === 'monthly') return 1;
  if (frequency === 'quarterly') return 3;
  if (frequency === 'half-yearly') return 6;
  if (frequency === 'yearly') return 12;
  return null;
}

/**
 * Every date this record falls on between two dates, inclusive.
 *
 * Generated from the start date by index rather than by stepping from the
 * previous result, which is what keeps a payment collected on the 31st on the
 * 31st in March after February has clamped it to the 28th. Stepping would lose
 * the 31st permanently at the first February.
 */
export function ayqOccurrenceDates(
  record: AyqSeries,
  from: string,
  to: string,
): string[] {
  const last =
    record.endDate !== null && record.endDate < to ? record.endDate : to;
  if (last < record.startDate) return [];

  // The floor is applied here rather than at each call site, so no caller can
  // forget it and generate an expectation that predates the decision (§7.14).
  const earliest = ayqExpectedFrom(record);
  const first = from > earliest ? from : earliest;

  if (record.recurrence.frequency === 'once') {
    return record.startDate >= first && record.startDate <= last
      ? [record.startDate]
      : [];
  }

  const interval = Math.max(1, Math.round(record.recurrence.interval));
  const days = stepDays(record.recurrence.frequency);
  const months = stepMonths(record.recurrence.frequency);
  if (days === null && months === null) return [];

  const dates: string[] = [];
  for (let index = 0; index < MAX_OCCURRENCES; index += 1) {
    const date =
      days !== null
        ? ayqAddDays(record.startDate, index * interval * days)
        : ayqAddMonths(record.startDate, index * interval * (months as number));
    if (date > last) break;
    if (date >= first) dates.push(date);
  }
  return dates;
}

/** Whether a date is one this record actually falls on. */
export function ayqIsOccurrenceOf(record: AyqSeries, dueDate: string): boolean {
  return ayqOccurrenceDates(record, dueDate, dueDate).length === 1;
}

/**
 * What a record is on one date.
 *
 * The order is the order of consequence, not of interest: a dismissed
 * occurrence is dismissed whatever else is true of it, a matched one is
 * finished, and a rescheduled one that is *still* in the past is overdue —
 * which is the actionable fact. That it was moved is not lost: its effective
 * date and its due date differ, and the screen shows both.
 */
export function ayqOccurrenceState(
  record: Pick<AyqPlannedRecord, 'state'>,
  decided: AyqPlanOccurrenceRecord | undefined,
  effectiveDate: string,
  today: string,
): AyqPlanOccurrenceState {
  if (record.state === 'dismissed' || decided?.dismissed === true) {
    return 'dismissed';
  }
  if (decided?.matchedTransactionId) return 'matched';
  if (effectiveDate < today) return 'overdue';
  if (decided?.rescheduledTo) return 'rescheduled';
  return 'expected';
}

/**
 * Every occurrence of every record between two dates, soonest first.
 *
 * It takes the two lists rather than a directory, so the forecast and the tests
 * can call it with invented data and no budget at all.
 */
export function ayqOccurrencesBetween(
  records: AyqPlannedRecord[],
  decided: AyqPlanOccurrenceRecord[],
  from: string,
  to: string,
  today: string,
): AyqPlanOccurrence[] {
  const byKey = new Map(
    decided.map(one => [`${one.recordId} ${one.dueDate}`, one] as const),
  );

  const found: AyqPlanOccurrence[] = [];
  for (const record of records) {
    for (const dueDate of ayqOccurrenceDates(record, from, to)) {
      const one = byKey.get(`${record.id} ${dueDate}`);
      const effectiveDate = one?.rescheduledTo ?? dueDate;
      found.push({
        recordId: record.id,
        name: record.name,
        kind: record.kind,
        amountCents: record.amountCents,
        categoryName: record.categoryName,
        dueDate,
        effectiveDate,
        state: ayqOccurrenceState(record, one, effectiveDate, today),
        suggested: record.state === 'suggested',
        matchedTransactionId: one?.matchedTransactionId ?? null,
        matchProvenance: one?.matchProvenance ?? null,
      });
    }
  }

  found.sort((left, right) => {
    if (left.effectiveDate !== right.effectiveDate) {
      return left.effectiveDate < right.effectiveDate ? -1 : 1;
    }
    if (left.recordId !== right.recordId) {
      return left.recordId < right.recordId ? -1 : 1;
    }
    return left.dueDate < right.dueDate ? -1 : 1;
  });
  return found;
}

/** Today, unless a caller stated one. Only ever called at the outermost edge. */
export function ayqToday(stated?: string): string {
  if (stated !== undefined && AYQ_DATE.test(stated)) return stated;
  return new Date().toISOString().slice(0, 10);
}

/**
 * The window the plan is read over.
 *
 * Forward it is the horizon (§7.9). Backward there is no cut-off at all
 * (§7.13): an expected expense keeps counting until it is matched, rescheduled
 * or dismissed, however long that takes. What bounds the window instead is the
 * records themselves — the earliest date any of them can be expected on, which
 * §7.14 fixes at the day it was decided. So the window is exactly wide enough
 * to hold every occurrence that exists, and no wider.
 */
export function ayqPlanWindow(
  today: string,
  records: AyqSeries[],
): { from: string; to: string } {
  let from = today;
  for (const record of records) {
    const earliest = ayqExpectedFrom(record);
    if (earliest < from) from = earliest;
  }
  return { from, to: ayqAddMonths(today, AYQ_PLAN_HORIZON_MONTHS) };
}
