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

/** Twelve months from today, so a yearly payment is always in view (03 §7.9). */
export const AYQ_PLAN_HORIZON_MONTHS = 12;

/**
 * How far back an unmatched occurrence keeps counting. PROVISIONAL.
 *
 * 03 §7.7 says an expected payment past its date without a match is flagged,
 * and the caution principle (§7.5) says an unmatched expense keeps counting.
 * Neither says for how long, and "for ever" is not an answer: a monthly record
 * that stopped being collected six years ago would put seventy-two overdue
 * items into today's forecast and make it useless.
 *
 * A quarter is the window. Something unmatched for longer is not a forecast
 * input — it is a record that needs a person to look at it, and the record
 * itself is still there to be looked at.
 */
export const AYQ_OVERDUE_WINDOW_DAYS = 90;

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
  record: Pick<AyqPlannedRecord, 'startDate' | 'recurrence' | 'endDate'>,
  from: string,
  to: string,
): string[] {
  const last =
    record.endDate !== null && record.endDate < to ? record.endDate : to;
  if (last < record.startDate) return [];

  if (record.recurrence.frequency === 'once') {
    return record.startDate >= from && record.startDate <= last
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
    if (date >= from) dates.push(date);
  }
  return dates;
}

/** Whether a date is one this record actually falls on. */
export function ayqIsOccurrenceOf(
  record: Pick<AyqPlannedRecord, 'startDate' | 'recurrence' | 'endDate'>,
  dueDate: string,
): boolean {
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

/** The window the plan is read over: the overdue tail plus the horizon. */
export function ayqPlanWindow(today: string): { from: string; to: string } {
  return {
    from: ayqAddDays(today, -AYQ_OVERDUE_WINDOW_DAYS),
    to: ayqAddMonths(today, AYQ_PLAN_HORIZON_MONTHS),
  };
}
