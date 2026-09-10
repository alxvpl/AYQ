// 03 §7, proved rather than demonstrated.
//
// The forecast is a pure function of things decided elsewhere, and `today` is
// one of its arguments, so every rule in §7 can be put a question with a stated
// answer. Nothing here opens a budget, and every figure is invented.
//
// The cases are the ones the canon is specific about and the ones a screenshot
// would never catch: a month boundary, a yearly payment, income that never
// arrived, plan and record in the same category, and a transfer.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type {
  AyqForecastPlanRow,
  AyqPlanOccurrence,
  AyqPlanOccurrenceState,
} from '../../ayq-client/src/ayq-ipc-contract.ts';
import {
  ayqComputeForecast,
  ayqCountsAsExpected,
  ayqEffectiveDate,
  ayqExpectedExpenseForCategory,
} from '../src/ayq-forecast.ts';

const TODAY = '2026-06-15';
const HORIZON = '2027-06-15';

function occurrence(
  over: Partial<AyqPlanOccurrence> & { date: string } & {
    kind?: 'expense' | 'income';
  },
): AyqPlanOccurrence {
  const state: AyqPlanOccurrenceState =
    over.state ?? (over.date < TODAY ? 'overdue' : 'expected');
  return {
    recordId: over.recordId ?? 'plan-1',
    name: over.name ?? 'Something',
    kind: over.kind ?? 'expense',
    amountCents: over.amountCents ?? 10_000,
    categoryName: over.categoryName ?? null,
    dueDate: over.dueDate ?? over.date,
    effectiveDate: over.date,
    state,
    suggested: over.suggested ?? false,
    matchedTransactionId: over.matchedTransactionId ?? null,
    matchProvenance: over.matchProvenance ?? null,
  };
}

function forecast(
  occurrences: AyqPlanOccurrence[],
  plan: AyqForecastPlanRow[] = [],
  availableFundsCents = 100_000,
) {
  return ayqComputeForecast({
    today: TODAY,
    horizon: HORIZON,
    availableFundsCents,
    occurrences,
    plan,
  });
}

test('with nothing expected, the position is today s available funds', () => {
  const answer = forecast([]);
  assert.equal(answer.availableFundsCents, 100_000);
  assert.equal(answer.closingCents, 100_000);
  assert.deepEqual(answer.events, []);
  assert.equal(answer.months.length, 13, 'twelve months ahead, plus this one');
  assert.equal(answer.months[0].month, '2026-06');
  assert.equal(answer.months[12].month, '2027-06');
  assert.equal(answer.lowest.balanceCents, 100_000);
});

test('the position is available funds plus income minus expenses, in order', () => {
  const answer = forecast([
    occurrence({ date: '2026-06-25', kind: 'income', amountCents: 200_000, name: 'Salary' }),
    occurrence({ date: '2026-06-20', amountCents: 120_000, name: 'Rent' }),
  ]);
  assert.deepEqual(
    answer.events.map(one => [one.date, one.label, one.balanceCents]),
    [
      ['2026-06-20', 'Rent', -20_000],
      ['2026-06-25', 'Salary', 180_000],
    ],
  );
  assert.equal(answer.closingCents, 180_000);
  assert.deepEqual(
    answer.lowest,
    { date: '2026-06-20', balanceCents: -20_000 },
    'the worst it gets is the question a forecast is for',
  );
});

test('money out comes before money in on the same day', () => {
  // 03 §7.5: where the order of two things on one day would change what the
  // position looks like, the one that shows less money goes first.
  const answer = forecast([
    occurrence({ date: '2026-07-01', kind: 'income', amountCents: 50_000, name: 'In' }),
    occurrence({ date: '2026-07-01', amountCents: 130_000, name: 'Out' }),
  ]);
  assert.deepEqual(
    answer.events.map(one => one.label),
    ['Out', 'In'],
  );
  assert.equal(answer.lowest.balanceCents, -30_000);
});

test('a yearly payment is inside the horizon, and a later one is not', () => {
  // The reason 03 §7.9 fixes twelve months: an annual insurance premium has to
  // be in view, or the forecast is a monthly forecast wearing a year's clothes.
  const answer = forecast([
    occurrence({ date: '2027-03-01', amountCents: 90_000, name: 'Insurance' }),
    occurrence({ date: '2027-07-01', amountCents: 90_000, name: 'Beyond the horizon' }),
  ]);
  assert.deepEqual(
    answer.events.map(one => one.label),
    ['Insurance'],
  );
  assert.equal(answer.closingCents, 10_000);
});

test('a matched or dismissed occurrence stops being expected', () => {
  const answer = forecast([
    occurrence({
      date: '2026-07-01',
      amountCents: 50_000,
      name: 'Already paid',
      state: 'matched',
      matchedTransactionId: 'txn-1',
    }),
    occurrence({
      date: '2026-07-02',
      amountCents: 50_000,
      name: 'Struck out',
      state: 'dismissed',
    }),
    occurrence({ date: '2026-07-03', amountCents: 1_000, name: 'Still coming' }),
  ]);
  assert.deepEqual(
    answer.events.map(one => one.label),
    ['Still coming'],
  );
});

test('expected income counts only when it is confirmed (03 §7.7)', () => {
  const answer = forecast([
    occurrence({
      date: '2026-07-25',
      kind: 'income',
      amountCents: 200_000,
      name: 'Detected salary',
      suggested: true,
    }),
    occurrence({
      date: '2026-07-26',
      kind: 'income',
      amountCents: 5_000,
      name: 'Confirmed refund',
    }),
  ]);
  assert.deepEqual(
    answer.events.map(one => one.label),
    ['Confirmed refund'],
    'income detected from history is an offer, and an offer is not money',
  );
  assert.equal(answer.closingCents, 105_000);
});

test('a detected expense counts, because counting it shows less money', () => {
  // PROVISIONAL. 03 §7.7 decides the income half outright and is silent here;
  // §7.5 is not.
  const answer = forecast([
    occurrence({
      date: '2026-07-10',
      amountCents: 4_000,
      name: 'Detected subscription',
      suggested: true,
    }),
  ]);
  assert.equal(answer.events.length, 1);
  assert.equal(answer.events[0].suggested, true);
  assert.equal(answer.closingCents, 96_000);
});

test('an expected income that never arrived stops counting, and an expense does not', () => {
  // 03 §7.7 for the income: flagged, and it stops counting until it is matched
  // or rescheduled. PROVISIONAL for the expense: it keeps counting, as due
  // today, because that is the reading that shows less money available.
  const answer = forecast([
    occurrence({
      date: '2026-06-01',
      kind: 'income',
      amountCents: 200_000,
      name: 'Salary that did not arrive',
    }),
    occurrence({
      date: '2026-06-05',
      amountCents: 30_000,
      name: 'Rent nobody collected',
    }),
  ]);
  assert.deepEqual(
    answer.events.map(one => [one.label, one.date, one.flagged]),
    [['Rent nobody collected', TODAY, true]],
    'dated today, so it is actually subtracted, and flagged so it is dealt with',
  );
  assert.equal(answer.closingCents, 70_000);
});

test('plan and record in one category are never counted twice', () => {
  // PROVISIONAL: the larger of the two, not their sum. Somebody with a 400 plan
  // for groceries and a 120 standing order in the same category has not planned
  // 520.
  const withBoth = forecast(
    [
      occurrence({
        date: '2026-07-04',
        amountCents: 12_000,
        name: 'Weekly box',
        categoryName: 'Groceries',
      }),
    ],
    [
      {
        month: '2026-07',
        categoryName: 'Groceries',
        planCents: 40_000,
        remainingCents: 40_000,
      },
    ],
  );
  assert.equal(
    withBoth.months.find(one => one.month === '2026-07')?.expectedExpenseCents,
    40_000,
    'the plan is the larger, so the plan is what July costs',
  );
  assert.deepEqual(
    withBoth.events
      .filter(one => one.date.startsWith('2026-07'))
      .map(one => [one.label, one.source, one.amountCents]),
    [
      ['Groceries', 'plan', 28_000],
      ['Weekly box', 'record', 12_000],
    ],
    'the record is shown as itself and the plan makes up the difference',
  );

  const recordsBigger = forecast(
    [
      occurrence({
        date: '2026-07-04',
        amountCents: 60_000,
        name: 'Big shop',
        categoryName: 'Groceries',
      }),
    ],
    [
      {
        month: '2026-07',
        categoryName: 'Groceries',
        planCents: 40_000,
        remainingCents: 40_000,
      },
    ],
  );
  assert.equal(
    recordsBigger.months.find(one => one.month === '2026-07')
      ?.expectedExpenseCents,
    60_000,
    'and when the records are larger, they are what the month costs',
  );
});

test('a record with no category counts in full, beside the plan', () => {
  const answer = forecast(
    [occurrence({ date: '2026-07-04', amountCents: 12_000, name: 'Uncategorised' })],
    [
      {
        month: '2026-07',
        categoryName: 'Groceries',
        planCents: 40_000,
        remainingCents: 40_000,
      },
    ],
  );
  assert.equal(
    answer.months.find(one => one.month === '2026-07')?.expectedExpenseCents,
    52_000,
    'there is no plan for it to be part of, so it is added',
  );
});

test('the current month contributes what is left of its plan, a future month all of it', () => {
  // 03 §7.8, and the reason actual expenses are not a separate term: today's
  // available funds already have this month's spending taken out of them.
  const answer = forecast(
    [],
    [
      {
        month: '2026-06',
        categoryName: 'Groceries',
        planCents: 40_000,
        remainingCents: 15_000,
      },
      {
        month: '2026-07',
        categoryName: 'Groceries',
        planCents: 40_000,
        remainingCents: 40_000,
      },
    ],
  );
  assert.equal(
    answer.months.find(one => one.month === '2026-06')?.expectedExpenseCents,
    15_000,
    'June is under way and 25 000 of it is already spent and already in the balance',
  );
  assert.equal(
    answer.months.find(one => one.month === '2026-07')?.expectedExpenseCents,
    40_000,
  );
  assert.equal(
    answer.events[0].date,
    TODAY,
    'the month under way contributes from today, not from the 1st that has passed',
  );
  assert.equal(
    answer.events[1].date,
    '2026-07-01',
    'and a future month from its own first day, which is the earliest it could go',
  );
});

test('a month with nothing in it closes where the month before it closed', () => {
  const answer = forecast([
    occurrence({ date: '2026-07-10', amountCents: 30_000, name: 'One thing' }),
  ]);
  const july = answer.months.find(one => one.month === '2026-07');
  const august = answer.months.find(one => one.month === '2026-08');
  assert.equal(july?.closingCents, 70_000);
  assert.equal(
    august?.closingCents,
    70_000,
    'a quiet month is not a recovery back to today s balance',
  );
});

test('an occurrence that crosses a month boundary lands in the month it falls in', () => {
  const answer = forecast([
    occurrence({ date: '2026-06-30', amountCents: 1_000, name: 'June' }),
    occurrence({ date: '2026-07-01', amountCents: 2_000, name: 'July' }),
  ]);
  assert.equal(
    answer.months.find(one => one.month === '2026-06')?.expectedExpenseCents,
    1_000,
  );
  assert.equal(
    answer.months.find(one => one.month === '2026-07')?.expectedExpenseCents,
    2_000,
  );
});

test('a transfer never reaches the forecast as income or expense', () => {
  // 03 §7.6. The forecast starts from the flagged accounts' balances, and a
  // transfer between two of the owner's accounts is not a planned record and
  // never becomes an occurrence — so the only thing that can be asserted here
  // is that moving money changes available funds and nothing else.
  const both = forecast([], [], 897_740);
  const flaggedOnly = forecast([], [], 147_500);
  assert.equal(both.closingCents, 897_740);
  assert.equal(flaggedOnly.closingCents, 147_500);
  assert.equal(
    both.months[0].expectedIncomeCents + both.months[0].expectedExpenseCents,
    0,
    'the movement is in the balance it starts from, not in what it expects',
  );
});

test('the rules are each one function, so overruling one is one edit', () => {
  assert.equal(ayqExpectedExpenseForCategory(40_000, 12_000), 40_000);
  assert.equal(ayqExpectedExpenseForCategory(10_000, 12_000), 12_000);

  assert.equal(
    ayqCountsAsExpected(occurrence({ date: '2026-07-01', suggested: true })),
    true,
    'a detected expense counts',
  );
  assert.equal(
    ayqCountsAsExpected(
      occurrence({ date: '2026-07-01', kind: 'income', suggested: true }),
    ),
    false,
    'a detected income does not',
  );

  assert.equal(
    ayqEffectiveDate(occurrence({ date: '2026-05-01' }), TODAY),
    TODAY,
    'the past is brought forward to today, or it would never be subtracted',
  );
  assert.equal(
    ayqEffectiveDate(occurrence({ date: '2026-08-01' }), TODAY),
    '2026-08-01',
  );
});
