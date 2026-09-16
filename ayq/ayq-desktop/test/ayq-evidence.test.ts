// What AYQ has read, and what that proves (§6).
//
// The complete-month helper is the gate on Plan suggestions, so what it refuses
// matters more than what it allows: a month wrongly called complete makes every
// suggestion built on it quietly too small, in the one direction that leaves a
// person planning less than they spend.
//
// Everything here is a pure function of a store, so no budget is opened.
// Every account, date and amount is invented.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ayqBankDataThrough,
  ayqClosingEvidence,
  ayqCompleteMonths,
  ayqCovers,
  ayqLastSuccessfulImport,
  ayqProvenIntervals,
  ayqUnion,
} from '../src/ayq-evidence.ts';
import {
  ayqMigrate,
  type AyqCoverageEvidence,
  type AyqStore,
} from '../src/ayq-store.ts';

function evidence(
  accountId: string,
  fromDate: string | null,
  toDate: string,
  closingBalanceCents: number | null = null,
): AyqCoverageEvidence {
  return {
    accountId,
    importId: `imp-${accountId}-${toDate}`,
    fromDate,
    toDate,
    closingBalanceCents,
    file: `invented-${toDate}.xml`,
    readAt: `${toDate}T10:00:00.000Z`,
  };
}

function store(rows: AyqCoverageEvidence[]): AyqStore {
  const held = ayqMigrate({ version: 8 });
  held.evidence = rows;
  return held;
}

test('adjacent intervals join; a one-day gap does not', () => {
  assert.deepEqual(
    ayqUnion([
      { from: '2026-03-01', to: '2026-03-15' },
      { from: '2026-03-16', to: '2026-03-31' },
    ]),
    [{ from: '2026-03-01', to: '2026-03-31' }],
  );

  assert.deepEqual(
    ayqUnion([
      { from: '2026-03-01', to: '2026-03-15' },
      { from: '2026-03-17', to: '2026-03-31' },
    ]),
    [
      { from: '2026-03-01', to: '2026-03-15' },
      { from: '2026-03-17', to: '2026-03-31' },
    ],
  );
});

test('overlapping intervals are one interval', () => {
  assert.deepEqual(
    ayqUnion([
      { from: '2026-03-01', to: '2026-03-20' },
      { from: '2026-03-10', to: '2026-03-31' },
      // Wholly inside the first; it must not extend anything.
      { from: '2026-03-05', to: '2026-03-06' },
    ]),
    [{ from: '2026-03-01', to: '2026-03-31' }],
  );
});

test('evidence with no start proves no interval at all', () => {
  const held = store([evidence('acc-1', null, '2026-03-31', 120_000)]);

  assert.deepEqual(ayqProvenIntervals(held, 'acc-1'), []);
  // And it is still evidence: it still says how far the bank's data reaches,
  // and it still carries the closing balance the bank stated.
  assert.equal(ayqBankDataThrough(held, 'acc-1'), '2026-03-31');
  assert.equal(ayqClosingEvidence(held, 'acc-1')?.closingBalanceCents, 120_000);
});

test('a month is complete only when every day of it is covered', () => {
  const lifetimes = [{ accountId: 'acc-1', firstSeen: '2025-01-05' }];

  const whole = store([evidence('acc-1', '2026-03-01', '2026-03-31')]);
  assert.deepEqual([...ayqCompleteMonths(whole, lifetimes, ['2026-03'])], ['2026-03']);

  // One day short at the end.
  const short = store([evidence('acc-1', '2026-03-01', '2026-03-30')]);
  assert.equal(ayqCompleteMonths(short, lifetimes, ['2026-03']).size, 0);

  // One day short at the start.
  const late = store([evidence('acc-1', '2026-03-02', '2026-03-31')]);
  assert.equal(ayqCompleteMonths(late, lifetimes, ['2026-03']).size, 0);

  // A single day missing in the middle, assembled from two statements.
  const gapped = store([
    evidence('acc-1', '2026-03-01', '2026-03-14'),
    evidence('acc-1', '2026-03-16', '2026-03-31'),
  ]);
  assert.equal(ayqCompleteMonths(gapped, lifetimes, ['2026-03']).size, 0);

  // And the same two statements with the missing day filled in.
  const filled = store([
    evidence('acc-1', '2026-03-01', '2026-03-14'),
    evidence('acc-1', '2026-03-15', '2026-03-31'),
  ]);
  assert.equal(ayqCompleteMonths(filled, lifetimes, ['2026-03']).size, 1);
});

test('a month needs every account, not just one of them', () => {
  const held = store([
    evidence('acc-1', '2026-03-01', '2026-03-31'),
    evidence('acc-2', '2026-03-01', '2026-03-20'),
  ]);

  const lifetimes = [
    { accountId: 'acc-1', firstSeen: '2025-01-05' },
    { accountId: 'acc-2', firstSeen: '2025-06-01' },
  ];
  assert.equal(ayqCompleteMonths(held, lifetimes, ['2026-03']).size, 0);
});

test('an account introduced after the month does not invalidate it', () => {
  const held = store([
    evidence('acc-1', '2026-03-01', '2026-03-31'),
    // A second account whose first trace is in June. March is not its month to
    // be missing from.
    evidence('acc-2', '2026-06-01', '2026-06-30'),
  ]);

  const lifetimes = [
    { accountId: 'acc-1', firstSeen: '2026-01-05' },
    { accountId: 'acc-2', firstSeen: '2026-06-01' },
  ];
  assert.deepEqual([...ayqCompleteMonths(held, lifetimes, ['2026-03'])], ['2026-03']);

  // And it does invalidate a month it was there for.
  assert.equal(ayqCompleteMonths(held, lifetimes, ['2026-07']).size, 0);
});

test('an account AYQ knows nothing about fails every month', () => {
  const held = store([evidence('acc-1', '2026-03-01', '2026-03-31')]);

  // §6.3: insufficient to prove the account did not exist is a reason to
  // exclude the month, not a reason to wave the account through.
  const lifetimes = [
    { accountId: 'acc-1', firstSeen: '2026-01-05' },
    { accountId: 'acc-unknown', firstSeen: null },
  ];
  assert.equal(ayqCompleteMonths(held, lifetimes, ['2026-03']).size, 0);
});

test('evidence from several imports unions into whole months', () => {
  const held = store([
    evidence('acc-1', '2026-01-01', '2026-01-31'),
    evidence('acc-1', '2026-02-01', '2026-02-28'),
    // March arrives as four weekly exports, one of them overlapping.
    evidence('acc-1', '2026-03-01', '2026-03-08'),
    evidence('acc-1', '2026-03-08', '2026-03-16'),
    evidence('acc-1', '2026-03-17', '2026-03-24'),
    evidence('acc-1', '2026-03-25', '2026-03-31'),
  ]);

  const lifetimes = [{ accountId: 'acc-1', firstSeen: '2026-01-01' }];
  assert.deepEqual(
    [...ayqCompleteMonths(held, lifetimes, ['2026-01', '2026-02', '2026-03'])],
    ['2026-01', '2026-02', '2026-03'],
  );
});

test('a statement with no closing balance still proves its month', () => {
  const held = store([evidence('acc-1', '2026-04-01', '2026-04-30', null)]);
  const lifetimes = [{ accountId: 'acc-1', firstSeen: '2026-01-01' }];

  // The whole of what version 7 could not do: coverage does not depend on the
  // bank having stated a balance.
  assert.equal(ayqCompleteMonths(held, lifetimes, ['2026-04']).size, 1);
  assert.equal(ayqBankDataThrough(held, 'acc-1'), '2026-04-30');
  // And there is nothing to reconcile against, which is a different fact.
  assert.equal(ayqClosingEvidence(held, 'acc-1'), null);
});

test('bank data through is the furthest date, whatever order files arrived in', () => {
  const held = store([
    evidence('acc-1', '2026-05-01', '2026-05-31'),
    evidence('acc-1', '2026-01-01', '2026-01-31'),
    evidence('acc-1', '2026-03-01', '2026-03-31'),
  ]);
  assert.equal(ayqBankDataThrough(held, 'acc-1'), '2026-05-31');
});

test('the newest closing balance is the one reconciliation uses', () => {
  const held = store([
    evidence('acc-1', '2026-01-01', '2026-01-31', 100_000),
    evidence('acc-1', '2026-03-01', '2026-03-31', 140_000),
    // Later reading, no balance: it moves the coverage and not the comparison.
    evidence('acc-1', '2026-04-01', '2026-04-30', null),
  ]);

  assert.equal(ayqClosingEvidence(held, 'acc-1')?.toDate, '2026-03-31');
  assert.equal(ayqClosingEvidence(held, 'acc-1')?.closingBalanceCents, 140_000);
  assert.equal(ayqBankDataThrough(held, 'acc-1'), '2026-04-30');
});

test('a failed import advances neither freshness fact', () => {
  const held = store([]);
  // A failed import writes no record and no evidence: `ayqImportCamt` throws
  // before either. What is being pinned here is that nothing else fills them
  // in — an account with no successful import has no last-import date and no
  // bank-data-through date, rather than today's.
  assert.equal(ayqLastSuccessfulImport(held, 'acc-1'), null);
  assert.equal(ayqBankDataThrough(held, 'acc-1'), null);
});

test('last successful import is the newest import for that account', () => {
  const held = ayqMigrate({ version: 8 });
  held.imports = [
    {
      id: 'imp-1',
      at: '2026-03-01T09:00:00.000Z',
      accountId: 'acc-1',
      imported: 12,
      duplicates: 0,
    },
    {
      id: 'imp-2',
      at: '2026-04-01T09:00:00.000Z',
      accountId: 'acc-2',
      imported: 4,
      duplicates: 0,
    },
    {
      id: 'imp-3',
      at: '2026-03-20T09:00:00.000Z',
      accountId: 'acc-1',
      imported: 0,
      duplicates: 9,
    },
  ] as unknown as AyqStore['imports'];

  // A re-import that added nothing new is still a successful import: the file
  // was read, and the account's data is as fresh as that file.
  assert.equal(ayqLastSuccessfulImport(held, 'acc-1'), '2026-03-20T09:00:00.000Z');
  assert.equal(ayqLastSuccessfulImport(held, 'acc-2'), '2026-04-01T09:00:00.000Z');
  assert.equal(ayqLastSuccessfulImport(held, 'acc-3'), null);
});

test('covering a span is not the same as touching it', () => {
  const intervals = [
    { from: '2026-03-01', to: '2026-03-10' },
    { from: '2026-03-20', to: '2026-03-31' },
  ];
  assert.equal(ayqCovers(intervals, '2026-03-01', '2026-03-10'), true);
  assert.equal(ayqCovers(intervals, '2026-03-01', '2026-03-31'), false);
  assert.equal(ayqCovers(intervals, '2026-03-25', '2026-03-31'), true);
});

test('a month before any account existed is not a complete month', () => {
  const held = store([evidence('acc-1', '2026-03-01', '2026-03-31')]);
  const lifetimes = [{ accountId: 'acc-1', firstSeen: '2026-03-01' }];

  // "Every account is covered" is vacuously true of no accounts. A month the
  // owner had not opened an account in is a month AYQ knows nothing about, and
  // averaging it in as nought would understate every suggestion built on it.
  assert.equal(ayqCompleteMonths(held, lifetimes, ['2025-11']).size, 0);
  assert.equal(ayqCompleteMonths(held, [], ['2026-03']).size, 0);
  assert.equal(ayqCompleteMonths(held, lifetimes, ['2026-03']).size, 1);
});
