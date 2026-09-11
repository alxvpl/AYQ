// The forecast: available funds, and how that position develops forward.
//
// 03 §7, and nothing else. A pure function of things already decided elsewhere
// — the available-funds flags (S2), the planned and recurring records (S1) and
// the per-category monthly plan (S3) — so every rule in §7 can be shown to hold
// on invented data rather than demonstrated on a screenshot.
//
// It takes `today` as an argument and never reads the clock, and it is never
// stored: a stored forecast is one that can be stale while still looking
// authoritative.
//
// Actual has a forecast module. It was read and it was run, and it models none
// of this: no available-funds flag, no confirmation rule for expected income,
// no unused-plan remainder, no state, no provenance, no match to an actual
// transaction. 04 A11 asked for exactly that check before assuming otherwise.

import type {
  AyqForecast,
  AyqForecastEvent,
  AyqForecastMonth,
  AyqForecastPlanRow,
  AyqPlanOccurrence,
} from '../../ayq-client/src/ayq-ipc-contract.ts';

import { ayqMonthOf, ayqMonthStart, ayqMonthsBetween } from './ayq-dates.ts';

export type AyqForecastInput = {
  today: string;
  /** The end of the horizon, inclusive. */
  horizon: string;
  /** Only the accounts flagged as counting (03 §7.6). */
  availableFundsCents: number;
  /** Everything the records fall on, arrears included (03 §7.13). */
  occurrences: AyqPlanOccurrence[];
  /** What each category is planned to take, month by month. */
  plan: AyqForecastPlanRow[];
};

/**
 * Whether an occurrence still counts as expected. 03 §7.7 and §7.12.
 *
 * §7.7 decides the income half: only confirmed income counts, and income
 * detected from history is a suggestion that does not count until it is
 * accepted. §7.12 decides the expense half the other way — a detected expense
 * counts before it is accepted, because counting it shows less money available
 * and §7.5 says that is the direction to err in.
 *
 * A matched occurrence has happened and is in the balance already. A dismissed
 * one is a person saying it will not happen.
 */
export function ayqCountsAsExpected(occurrence: AyqPlanOccurrence): boolean {
  if (occurrence.state === 'matched' || occurrence.state === 'dismissed') {
    return false;
  }
  // An expected income whose date has passed without a match is flagged and
  // stops counting (03 §7.7). Its expense counterpart does the opposite; see
  // `ayqEffectiveDate`.
  if (occurrence.kind === 'income' && occurrence.state === 'overdue') {
    return false;
  }
  // Income detected from history is an offer, and an offer is not money coming
  // in (03 §7.7).
  if (occurrence.kind === 'income' && occurrence.suggested) return false;
  return true;
}

/**
 * When the forecast puts an occurrence. 03 §7.13.
 *
 * An expected expense past its date without a match keeps counting, as due
 * today, until it is matched, rescheduled or dismissed — and never stops
 * through the passage of time alone. Today rather than its original date
 * because the position is being projected forward from today, and an amount
 * dated in the past would never be subtracted from anything.
 */
export function ayqEffectiveDate(
  occurrence: AyqPlanOccurrence,
  today: string,
): string {
  return occurrence.effectiveDate < today ? today : occurrence.effectiveDate;
}

/**
 * What a category is expected to take in one month. 03 §7.10.
 *
 * The larger of the two, never their sum. A person who has planned 400 for
 * groceries and also has a standing order for 120 in the same category has not
 * planned 520 — the plan is the frame and the record is one of the things
 * inside it. Taking the larger is also the cautious reading (03 §7.5).
 *
 * A record with no category is outside this entirely and counts in full: there
 * is no plan for it to be part of.
 */
export function ayqExpectedExpenseForCategory(
  planCents: number,
  recordsCents: number,
): number {
  return Math.max(planCents, recordsCents);
}

/**
 * Where the part of the plan that no record accounts for is placed. 03 §7.11.
 *
 * At the start of its month, and today for the month already under way — the
 * earliest the money could go. 03 §7.5 again: putting it at the end of the
 * month would make the position look better than can be relied on for the whole
 * of that month, which is the one direction the forecast is not allowed to err.
 */
function planDate(month: string, today: string): string {
  const start = ayqMonthStart(month);
  return start < today ? today : start;
}

/**
 * The position, from today to the horizon.
 *
 * Actual expenses are not a separate term. The available funds this starts from
 * are today's balances, which already have this month's spending taken out of
 * them, and the current month's plan contribution is the *remainder* of the
 * plan rather than the whole of it — so what has been spent is subtracted once
 * and once only.
 */
export function ayqComputeForecast(input: AyqForecastInput): AyqForecast {
  const { today, horizon, availableFundsCents } = input;
  const months = ayqMonthsBetween(ayqMonthOf(today), ayqMonthOf(horizon));
  const currentMonth = ayqMonthOf(today);

  const events: Array<Omit<AyqForecastEvent, 'balanceCents'>> = [];
  /** Expense from records, by month and category, for the plan comparison. */
  const fromRecords = new Map<string, number>();

  for (const occurrence of input.occurrences) {
    if (!ayqCountsAsExpected(occurrence)) continue;
    const date = ayqEffectiveDate(occurrence, today);
    if (date > horizon) continue;

    events.push({
      date,
      kind: occurrence.kind,
      label: occurrence.name,
      amountCents: occurrence.amountCents,
      source: 'record',
      recordId: occurrence.recordId,
      dueDate: occurrence.dueDate,
      categoryName: occurrence.categoryName,
      suggested: occurrence.suggested,
      flagged: occurrence.state === 'overdue',
    });

    if (occurrence.kind === 'expense' && occurrence.categoryName !== null) {
      const key = `${ayqMonthOf(date)} ${occurrence.categoryName}`;
      fromRecords.set(key, (fromRecords.get(key) ?? 0) + occurrence.amountCents);
    }
  }

  for (const row of input.plan) {
    if (!months.includes(row.month)) continue;
    // The current month contributes what is left of its plan; a future month
    // contributes the whole of it (03 §7.8).
    const planCents =
      row.month === currentMonth ? row.remainingCents : row.planCents;
    if (planCents <= 0) continue;

    const recordsCents = fromRecords.get(`${row.month} ${row.categoryName}`) ?? 0;
    const total = ayqExpectedExpenseForCategory(planCents, recordsCents);
    const uncovered = total - recordsCents;
    if (uncovered <= 0) continue;

    events.push({
      date: planDate(row.month, today),
      kind: 'expense',
      label: row.categoryName,
      amountCents: uncovered,
      source: 'plan',
      recordId: null,
      dueDate: null,
      categoryName: row.categoryName,
      suggested: false,
      flagged: false,
    });
  }

  events.sort((left, right) => {
    if (left.date !== right.date) return left.date < right.date ? -1 : 1;
    // Money out before money in on the same day: the position must not look
    // better than it can be relied on to be, even for one row (03 §7.5).
    if (left.kind !== right.kind) return left.kind === 'expense' ? -1 : 1;
    return left.label < right.label ? -1 : 1;
  });

  let running = availableFundsCents;
  let lowest = { date: today, balanceCents: availableFundsCents };
  const dated: AyqForecastEvent[] = [];

  for (const event of events) {
    running += event.kind === 'income' ? event.amountCents : -event.amountCents;
    dated.push({ ...event, balanceCents: running });
    if (running < lowest.balanceCents) {
      lowest = { date: event.date, balanceCents: running };
    }
  }

  const byMonth = new Map<string, AyqForecastMonth>();
  for (const month of months) {
    byMonth.set(month, {
      month,
      expectedIncomeCents: 0,
      expectedExpenseCents: 0,
      closingCents: availableFundsCents,
    });
  }
  for (const event of dated) {
    const month = byMonth.get(ayqMonthOf(event.date));
    if (month === undefined) continue;
    if (event.kind === 'income') month.expectedIncomeCents += event.amountCents;
    else month.expectedExpenseCents += event.amountCents;
    month.closingCents = event.balanceCents;
  }
  // A month with nothing in it closes where the month before it closed, not at
  // today's balance — otherwise a quiet month would look like a recovery.
  let carried = availableFundsCents;
  for (const month of months) {
    const row = byMonth.get(month) as AyqForecastMonth;
    if (row.expectedIncomeCents === 0 && row.expectedExpenseCents === 0) {
      row.closingCents = carried;
    }
    carried = row.closingCents;
  }

  return {
    today,
    horizon,
    availableFundsCents,
    events: dated,
    months: months.map(month => byMonth.get(month) as AyqForecastMonth),
    lowest,
    /** Where the twelve months end, which is the question 03 §7.9 exists for. */
    closingCents: running,
  };
}
