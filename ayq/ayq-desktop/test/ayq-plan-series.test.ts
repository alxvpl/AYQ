// The rhythm of a planned record, on invented data and a stated today.
//
// Nothing here opens a budget or loads the Actual API: these are the pure
// functions the forecast is built out of, and they are the reason 03 §7 can be
// proved rather than demonstrated. Every date the tests use is fictional and
// every amount is round.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type {
  AyqPlanFrequency,
  AyqPlannedRecord,
} from '../../ayq-client/src/ayq-ipc-contract.ts';
import {
  ayqAddMonths,
  ayqDaysInMonth,
  ayqMonthEnd,
  ayqMonthsBetween,
} from '../src/ayq-dates.ts';
import {
  AYQ_OVERDUE_WINDOW_DAYS,
  ayqIsOccurrenceOf,
  ayqOccurrenceDates,
  ayqOccurrencesBetween,
  ayqPlanWindow,
} from '../src/ayq-plan-series.ts';
import type { AyqPlanOccurrenceRecord } from '../src/ayq-store.ts';

function record(
  over: Partial<AyqPlannedRecord> & {
    startDate: string;
    frequency: AyqPlanFrequency;
  },
): AyqPlannedRecord {
  return {
    id: over.id ?? 'plan-1',
    name: over.name ?? 'Rent',
    kind: over.kind ?? 'expense',
    amountCents: over.amountCents ?? 120_000,
    categoryName: over.categoryName ?? 'Housing',
    counterpartyKey: over.counterpartyKey ?? null,
    accountId: over.accountId ?? null,
    startDate: over.startDate,
    recurrence: { frequency: over.frequency, interval: over.recurrence?.interval ?? 1 },
    endDate: over.endDate ?? null,
    state: over.state ?? 'confirmed',
    provenance: over.provenance ?? 'manual',
    mandateId: over.mandateId ?? null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

test('a one-off falls once, and only inside the window asked for', () => {
  const once = record({ startDate: '2026-03-10', frequency: 'once' });
  assert.deepEqual(ayqOccurrenceDates(once, '2026-01-01', '2026-12-31'), [
    '2026-03-10',
  ]);
  assert.deepEqual(ayqOccurrenceDates(once, '2026-04-01', '2026-12-31'), []);
  assert.deepEqual(ayqOccurrenceDates(once, '2026-01-01', '2026-03-09'), []);
});

test('a monthly payment collected on the 31st keeps the 31st', () => {
  // The defect this exists to prevent: stepping from the previous result would
  // clamp to 28 in February and never come back, so a mortgage taken on the
  // last day of the month would silently move to the 28th for ever.
  const monthly = record({ startDate: '2026-01-31', frequency: 'monthly' });
  assert.deepEqual(ayqOccurrenceDates(monthly, '2026-01-01', '2026-05-31'), [
    '2026-01-31',
    '2026-02-28',
    '2026-03-31',
    '2026-04-30',
    '2026-05-31',
  ]);
});

test('a leap February clamps to the 29th, not the 28th', () => {
  const monthly = record({ startDate: '2028-01-31', frequency: 'monthly' });
  assert.deepEqual(ayqOccurrenceDates(monthly, '2028-02-01', '2028-02-29'), [
    '2028-02-29',
  ]);
  assert.equal(ayqDaysInMonth(2028, 2), 29);
  assert.equal(ayqDaysInMonth(2026, 2), 28);
});

test('every frequency steps by the period it names', () => {
  const cases: Array<[AyqPlanFrequency, string]> = [
    ['weekly', '2026-03-17'],
    ['fortnightly', '2026-03-24'],
    ['monthly', '2026-04-10'],
    ['quarterly', '2026-06-10'],
    ['half-yearly', '2026-09-10'],
    ['yearly', '2027-03-10'],
  ];
  for (const [frequency, second] of cases) {
    const dates = ayqOccurrenceDates(
      record({ startDate: '2026-03-10', frequency }),
      '2026-03-10',
      '2027-03-10',
    );
    assert.equal(dates[0], '2026-03-10', frequency);
    assert.equal(dates[1], second, frequency);
  }
});

test('an interval multiplies the period', () => {
  const everyOther = record({ startDate: '2026-03-10', frequency: 'monthly' });
  everyOther.recurrence.interval = 2;
  assert.deepEqual(ayqOccurrenceDates(everyOther, '2026-01-01', '2026-07-31'), [
    '2026-03-10',
    '2026-05-10',
    '2026-07-10',
  ]);
});

test('an end date stops the series, inclusively', () => {
  const ending = record({
    startDate: '2026-03-10',
    frequency: 'monthly',
    endDate: '2026-05-10',
  });
  assert.deepEqual(ayqOccurrenceDates(ending, '2026-01-01', '2026-12-31'), [
    '2026-03-10',
    '2026-04-10',
    '2026-05-10',
  ]);
});

test('a date the record does not fall on is not one of its occurrences', () => {
  const monthly = record({ startDate: '2026-03-10', frequency: 'monthly' });
  assert.equal(ayqIsOccurrenceOf(monthly, '2026-04-10'), true);
  assert.equal(ayqIsOccurrenceOf(monthly, '2026-04-11'), false);
  assert.equal(ayqIsOccurrenceOf(monthly, '2026-02-10'), false);
});

test('the states of 03 §7.7 are derived, and in the order of consequence', () => {
  const today = '2026-06-15';
  const monthly = record({ startDate: '2026-04-10', frequency: 'monthly' });
  const decided: AyqPlanOccurrenceRecord[] = [
    {
      recordId: 'plan-1',
      dueDate: '2026-04-10',
      rescheduledTo: null,
      matchedTransactionId: 'txn-1',
      matchedAt: '2026-04-11T00:00:00.000Z',
      matchProvenance: 'automatic',
      dismissed: false,
    },
    {
      recordId: 'plan-1',
      dueDate: '2026-05-10',
      rescheduledTo: null,
      matchedTransactionId: null,
      matchedAt: null,
      matchProvenance: null,
      dismissed: true,
    },
    {
      recordId: 'plan-1',
      dueDate: '2026-07-10',
      rescheduledTo: '2026-07-20',
      matchedTransactionId: null,
      matchedAt: null,
      matchProvenance: null,
      dismissed: false,
    },
  ];

  const found = ayqOccurrencesBetween(
    [monthly],
    decided,
    '2026-04-01',
    '2026-08-31',
    today,
  );
  const state = (due: string) =>
    found.find(one => one.dueDate === due)?.state ?? 'missing';

  assert.equal(state('2026-04-10'), 'matched', 'a match outranks being late');
  assert.equal(state('2026-05-10'), 'dismissed', 'dismissal outranks everything');
  assert.equal(state('2026-06-10'), 'overdue', 'past, unmatched, not dismissed');
  assert.equal(state('2026-07-10'), 'rescheduled');
  assert.equal(state('2026-08-10'), 'expected');

  const moved = found.find(one => one.dueDate === '2026-07-10');
  assert.equal(moved?.effectiveDate, '2026-07-20', 'the move is not lost');
});

test('a rescheduled occurrence that is still in the past is overdue', () => {
  // Because that is the fact a person can act on. That it was moved is still
  // visible: the effective date and the due date differ.
  const monthly = record({ startDate: '2026-05-10', frequency: 'monthly' });
  const found = ayqOccurrencesBetween(
    [monthly],
    [
      {
        recordId: 'plan-1',
        dueDate: '2026-05-10',
        rescheduledTo: '2026-05-20',
        matchedTransactionId: null,
        matchedAt: null,
        matchProvenance: null,
        dismissed: false,
      },
    ],
    '2026-05-01',
    '2026-05-31',
    '2026-06-15',
  );
  assert.equal(found[0].state, 'overdue');
  assert.equal(found[0].dueDate, '2026-05-10');
  assert.equal(found[0].effectiveDate, '2026-05-20');
});

test('a record that is only a suggestion says so on every occurrence', () => {
  const offered = record({
    startDate: '2026-07-01',
    frequency: 'monthly',
    state: 'suggested',
    provenance: 'detected',
  });
  const found = ayqOccurrencesBetween(
    [offered],
    [],
    '2026-07-01',
    '2026-09-30',
    '2026-06-15',
  );
  assert.equal(found.length, 3);
  assert.ok(found.every(one => one.suggested));
});

test('occurrences come back soonest first, by the date they actually fall on', () => {
  const early = record({ id: 'a', startDate: '2026-07-05', frequency: 'monthly' });
  const late = record({ id: 'b', startDate: '2026-07-20', frequency: 'monthly' });
  const found = ayqOccurrencesBetween(
    [late, early],
    [
      {
        recordId: 'a',
        dueDate: '2026-07-05',
        rescheduledTo: '2026-07-28',
        matchedTransactionId: null,
        matchedAt: null,
        matchProvenance: null,
        dismissed: false,
      },
    ],
    '2026-07-01',
    '2026-07-31',
    '2026-07-01',
  );
  assert.deepEqual(
    found.map(one => one.effectiveDate),
    ['2026-07-20', '2026-07-28'],
    'the moved one sorts where it now falls, not where it was',
  );
});

test('the window is the overdue tail plus twelve months', () => {
  const { from, to } = ayqPlanWindow('2026-06-15');
  assert.equal(from, '2026-03-17', `${AYQ_OVERDUE_WINDOW_DAYS} days back`);
  assert.equal(to, '2027-06-15', 'twelve months ahead (03 §7.9)');
});

test('month arithmetic knows the ends of months', () => {
  assert.equal(ayqMonthEnd('2026-02'), '2026-02-28');
  assert.equal(ayqMonthEnd('2028-02'), '2028-02-29');
  assert.equal(ayqMonthEnd('2026-04'), '2026-04-30');
  assert.equal(ayqAddMonths('2026-12-15', 1), '2027-01-15');
  assert.deepEqual(ayqMonthsBetween('2026-11', '2027-02'), [
    '2026-11',
    '2026-12',
    '2027-01',
    '2027-02',
  ]);
});
