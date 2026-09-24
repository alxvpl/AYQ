// Fixed costs › Expected now — the capability gate, the five readings and
// which occurrences appear (AYQ_ANALYSES_A2_SPECIFICATION r001 §5.1, §8, §9.4,
// §11; §15 T01–T23 as far as they concern the consumer).
//
// Every snapshot below is the contract's own synthetic 1.1 baseline with its
// expectation section replaced, and every one passes the shared validator
// before it is classified: a case the validator would refuse is not a case
// the view can meet. Its world: generatedAt 2026-03-05T06:00Z, judged as of
// 2026-03-05; "Everyday account" covered 2025-01-01 – 2026-03-04; "Card
// account" through 2026-02-28 with its start not established. All values are
// invented.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { baselineJson, baselineV11Json } from '../../ayq-analytical-contract/fixtures/synthetic.ts';
import { AS_OF, build, type OccurrenceSpec, type RecordSpec } from './a2-builder.js';
import { classify, fixedCostsView, hasExpectationFacts, READING_ORDER, type FixedCostRow } from '../src/fixed-costs.js';
import { validateSnapshot } from '../src/validate.js';
import type { AyqAnalyticalSnapshot } from '../src/types.js';

/** The one row of a single-occurrence snapshot. */
function only(records: RecordSpec[], occurrence: Omit<OccurrenceSpec, 'record' | 'key'> & Partial<OccurrenceSpec>): FixedCostRow {
  const view = fixedCostsView(build(records, [{ key: 'occ-1', record: records[0].key, ...occurrence }]));
  assert.equal(view.kind, 'ready');
  const rows = view.kind === 'ready' ? view.groups.flatMap(group => group.rows) : [];
  assert.equal(rows.length, 1);
  return rows[0];
}

// ---- the capability gate (r001 §5.1, §11.1; V8, T14) ---------------------------

test('a valid 1.0 snapshot keeps its contract and does not open Fixed costs; a 1.1 snapshot does', () => {
  const oneZero = validateSnapshot(baselineJson());
  assert.equal(hasExpectationFacts(oneZero), false);
  assert.deepEqual(fixedCostsView(oneZero), { kind: 'olderSnapshot' });
  // A 1.0 file that happens to carry the 1.1 names is still 1.0 to the reader.
  const stray = baselineV11Json() as Record<string, any>;
  stray.meta.contractVersion = '1.0';
  assert.deepEqual(fixedCostsView(validateSnapshot(stray)), { kind: 'olderSnapshot' });
  const oneOne = validateSnapshot(baselineV11Json());
  assert.equal(hasExpectationFacts(oneOne), true);
  assert.equal(fixedCostsView(oneOne).kind, 'ready');
});

test('the capability test is the contract, never the product or build version', () => {
  const source = readFileSync(join(process.cwd(), 'src', 'fixed-costs.ts'), 'utf8');
  assert.doesNotMatch(source, /productVersion|buildNumber|commitSha/);
  const oneZero = baselineJson() as Record<string, any>;
  oneZero.meta.producer = { productVersion: '0.9.9', buildNumber: 999, commitSha: 'f'.repeat(40) };
  assert.deepEqual(fixedCostsView(validateSnapshot(oneZero)), { kind: 'olderSnapshot' });
});

test('with no confirmed expected expense the view is empty — expected income and suggestions do not count (r001 §11.2)', () => {
  const view = fixedCostsView(
    build(
      [
        { key: 'rec-salary', kind: 'income', account: 'acc-everyday' },
        { key: 'rec-maybe', state: 'suggested' },
      ],
      [
        { key: 'o1', record: 'rec-salary', expected: '2026-02-25', through: '2026-03-04', covered: true },
        { key: 'o2', record: 'rec-maybe', expected: '2026-02-20', through: '2026-02-27' },
      ],
    ),
  );
  assert.deepEqual(view, { kind: 'empty', asOf: AS_OF });
});

// ---- the five readings (r001 §8; T01–T09, T17, T18, T21) ------------------------

test('T01 — a matched occurrence is Arrived, with its supplied transaction as evidence', () => {
  const row = only([{ key: 'rec-energy', account: 'acc-everyday', amount: 12000 }], {
    expected: '2026-02-10',
    through: '2026-02-17',
    covered: true,
    matchedTo: 'tx-02',
  });
  assert.equal(row.classification.reading, 'arrived');
  assert.equal(row.classification.reading === 'arrived' && row.classification.transaction.transactionKey, 'tx-02');
});

test('T18 — Arrived outranks every timing and coverage branch', () => {
  // Window closed, not covered, and no expected account at all: still Arrived.
  const closedNoAccount = only([{ key: 'r' }], { expected: '2026-02-10', through: '2026-02-17', matchedTo: 'tx-02' });
  assert.equal(closedNoAccount.classification.reading, 'arrived');
  const closedUncovered = only([{ key: 'r', account: 'acc-card' }], {
    expected: '2026-02-10',
    through: '2026-02-17',
    covered: false,
    matchedTo: 'tx-02',
  });
  assert.equal(closedUncovered.classification.reading, 'arrived');
  const future = only([{ key: 'r', account: 'acc-everyday' }], { expected: '2026-03-20', through: '2026-03-27', matchedTo: 'tx-02' });
  assert.equal(future.classification.reading, 'arrived');
});

test('T02 / T03 / T04 — Pending while the window is open: future, due today, and date passed with the window open', () => {
  const future = only([{ key: 'r', account: 'acc-everyday' }], { expected: '2026-03-10', through: '2026-03-17' });
  assert.deepEqual(future.classification, { reading: 'pending', presentation: 'future' });
  const today = only([{ key: 'r', account: 'acc-everyday' }], { expected: AS_OF, through: '2026-03-12' });
  assert.deepEqual(today.classification, { reading: 'pending', presentation: 'today' });
  const open = only([{ key: 'r', account: 'acc-everyday' }], { expected: '2026-03-01', through: '2026-03-08' });
  assert.deepEqual(open.classification, { reading: 'pending', presentation: 'openWindow' });
});

test('the window is open through its last day: a window ending on the basis date is Pending, one ending the day before is closed', () => {
  const endsToday = only([{ key: 'r', account: 'acc-everyday' }], { expected: '2026-02-26', through: AS_OF, covered: true });
  assert.deepEqual(endsToday.classification, { reading: 'pending', presentation: 'openWindow' });
  const endedYesterday = only([{ key: 'r', account: 'acc-everyday' }], { expected: '2026-02-25', through: '2026-03-04', covered: true });
  assert.deepEqual(endedYesterday.classification, { reading: 'missing' });
  // Nothing about an open window depends on the account: without one it is still Pending.
  const noAccount = only([{ key: 'r' }], { expected: '2026-03-01', through: '2026-03-08' });
  assert.deepEqual(noAccount.classification, { reading: 'pending', presentation: 'openWindow' });
});

test('T08 — window closed, expected account, whole window proven covered: Missing', () => {
  const row = only([{ key: 'r', account: 'acc-everyday' }], { expected: '2026-02-15', through: '2026-02-22', covered: true });
  assert.deepEqual(row.classification, { reading: 'missing' });
  assert.deepEqual(row.account, { accountKey: 'acc-everyday', name: 'Everyday account' });
});

test('T21 — a transaction of a different amount in the window is not near-matched: the occurrence stays Missing', () => {
  // tx-02 is -120.00 on 2026-02-10 in Everyday account; the payment expected
  // that day is 110.00 and AYQ did not match it.
  const row = only([{ key: 'r', account: 'acc-everyday', amount: 11000 }], { expected: '2026-02-10', through: '2026-02-17', covered: true });
  assert.deepEqual(row.classification, { reading: 'missing' });
});

test('T05 — window closed, the account\'s data ends before the window does: Not imported yet, presentation A', () => {
  const row = only([{ key: 'r', account: 'acc-card' }], { expected: '2026-02-25', through: '2026-03-04', covered: false });
  assert.deepEqual(row.classification, { reading: 'notImported', presentation: 'dataEnds', lastStatementDate: '2026-02-28' });
});

test('T06 — window closed, data reaching past the window, whole window not proven covered (a gap): presentation B', () => {
  const row = only([{ key: 'r', account: 'acc-everyday' }], { expected: '2026-02-20', through: '2026-02-27', covered: false });
  assert.deepEqual(row.classification, { reading: 'notImported', presentation: 'gap', lastStatementDate: '2026-03-04' });
  // Data reaching exactly the window's last day already covers that day: B, not "import through".
  const exact = only([{ key: 'r', account: 'acc-card' }], { expected: '2026-02-21', through: '2026-02-28', covered: false });
  assert.deepEqual(exact.classification, { reading: 'notImported', presentation: 'gap', lastStatementDate: '2026-02-28' });
});

test('T07 — an unproven coverage start blocks the proof: Not imported yet, never Missing', () => {
  // Card account's start is not established; AYQ states the window uncovered.
  const row = only([{ key: 'r', account: 'acc-card' }], { expected: '2026-02-10', through: '2026-02-17', covered: false });
  assert.equal(row.classification.reading, 'notImported');
});

test('lastStatementDate is never the truth test: data far past the window with covered false is still Not imported yet', () => {
  const row = only([{ key: 'r', account: 'acc-everyday' }], { expected: '2026-01-05', through: '2026-01-12', covered: false });
  assert.equal(row.classification.reading, 'notImported');
});

test('T09 / T22 — window closed and no expected account: Can\'t tell, the two causes indistinguishable', () => {
  // Cause 1: the AYQ record names no account. Cause 2: it names one outside
  // the snapshot. Both cross without expectedAccountKey (P1), so the view
  // cannot tell them apart and does not try.
  const view = fixedCostsView(
    build(
      [
        { key: 'rec-no-account', name: 'Newspaper' },
        { key: 'rec-outside', name: 'Music lessons' },
      ],
      [
        { key: 'o1', record: 'rec-no-account', expected: '2026-02-20', through: '2026-02-27' },
        { key: 'o2', record: 'rec-outside', expected: '2026-02-20', through: '2026-02-27' },
      ],
    ),
  );
  assert.equal(view.kind, 'ready');
  const rows = view.kind === 'ready' ? view.groups.flatMap(group => group.rows) : [];
  assert.equal(rows.length, 2);
  for (const row of rows) {
    assert.deepEqual(row.classification, { reading: 'cantTell' });
    assert.equal(row.account, null);
  }
});

test('T17 — the same counterparty and amount as a real payment in an account, without an expected account: still Can\'t tell', () => {
  // tx-02 (Northwind Energy, -120.00) is in Everyday account; the record has
  // the same counterparty and amount but names no account. Nothing is inferred.
  const row = only([{ key: 'r', counterpartyKey: 'cp-energy', amount: 12000 }], { expected: '2026-02-12', through: '2026-02-19' });
  assert.deepEqual(row.classification, { reading: 'cantTell' });
  assert.equal(row.account, null);
});

test('classify reads only snapshot facts: the account\'s last statement date chooses the sentence, the coverage fact decides', () => {
  const snapshot = build([{ key: 'r', account: 'acc-everyday' }], [{ key: 'o', record: 'r', expected: '2026-02-01', through: '2026-02-08', covered: true }]);
  const [record] = snapshot.expectationRecords;
  const [occurrence] = snapshot.expectedOccurrences;
  const transactions = new Map();
  assert.deepEqual(classify(occurrence, record, AS_OF, new Map([['acc-everyday', '2026-02-05']]), transactions), { reading: 'missing' });
  assert.deepEqual(
    classify({ ...occurrence, automaticMatchWindowCovered: false }, record, AS_OF, new Map([['acc-everyday', '2026-02-05']]), transactions),
    { reading: 'notImported', presentation: 'dataEnds', lastStatementDate: '2026-02-05' },
  );
});

// ---- which occurrences appear (r001 §9.4; T19, T20; V1–V3) ---------------------

test('per record: every unresolved occurrence up to the basis date without an age limit, only the most recent Arrived, only the next future one', () => {
  const view = fixedCostsView(
    build(
      [{ key: 'rec-loan', name: 'Car loan', account: 'acc-everyday', amount: 12000 }],
      [
        { key: 'loan-2025-03', record: 'rec-loan', expected: '2025-03-10', through: '2025-03-17', covered: true },
        { key: 'loan-2026-01', record: 'rec-loan', expected: '2026-01-10', through: '2026-01-17', covered: true, matchedTo: 'tx-01' },
        { key: 'loan-2026-02', record: 'rec-loan', expected: '2026-02-10', through: '2026-02-17', covered: true, matchedTo: 'tx-02' },
        { key: 'loan-2026-03', record: 'rec-loan', expected: '2026-03-01', through: '2026-03-08', covered: false },
        { key: 'loan-2026-02b', record: 'rec-loan', expected: '2026-02-20', through: '2026-02-27', dismissed: true, covered: true },
        { key: 'loan-2026-04', record: 'rec-loan', expected: '2026-04-10', through: '2026-04-17', covered: false },
        { key: 'loan-2026-05', record: 'rec-loan', expected: '2026-05-10', through: '2026-05-17', covered: false },
      ],
    ),
  );
  assert.equal(view.kind, 'ready');
  if (view.kind !== 'ready') return;
  const shown = view.groups.flatMap(group => group.rows.map(row => [row.occurrenceKey, row.classification.reading]));
  assert.deepEqual(shown, [
    ['loan-2025-03', 'missing'], // a year old, unresolved, still shown
    ['loan-2026-03', 'pending'], // date passed, window open
    ['loan-2026-04', 'pending'], // the next one after the basis date
    ['loan-2026-02', 'arrived'], // the most recent Arrived only
  ]);
  // Not shown: the older Arrived, the dismissed one, the later future one.
});

test('a rescheduled occurrence is judged and shown on the effective date the snapshot carries (P1-C1, V3)', () => {
  const row = only([{ key: 'rec-tax', account: 'acc-everyday' }], { key: 'occ-tax-2026-02-20', expected: '2026-03-02', through: '2026-03-09' });
  assert.equal(row.expectedDate, '2026-03-02');
  assert.deepEqual(row.classification, { reading: 'pending', presentation: 'openWindow' });
});

test('expected income, suggested records and dismissed occurrences never appear (r001 §3, §9.4; V2)', () => {
  const view = fixedCostsView(
    build(
      [
        { key: 'rec-rent', name: 'Rent', account: 'acc-everyday' },
        { key: 'rec-salary', name: 'Salary', kind: 'income', account: 'acc-everyday' },
        { key: 'rec-maybe', name: 'Possible subscription', state: 'suggested' },
      ],
      [
        { key: 'rent-due', record: 'rec-rent', expected: AS_OF, through: '2026-03-12' },
        { key: 'rent-dismissed', record: 'rec-rent', expected: '2026-02-05', through: '2026-02-12', dismissed: true, covered: true },
        { key: 'salary', record: 'rec-salary', expected: '2026-02-25', through: '2026-03-04', covered: true },
        { key: 'maybe', record: 'rec-maybe', expected: '2026-02-20', through: '2026-02-27' },
      ],
    ),
  );
  assert.equal(view.kind, 'ready');
  const keys = view.kind === 'ready' ? view.groups.flatMap(group => group.rows.map(row => row.occurrenceKey)) : [];
  assert.deepEqual(keys, ['rent-due']);
});

// ---- the summary and the groups (r001 §9.2–§9.3) --------------------------------

test('five counts in the fixed order, zeros included, each equal to its group; groups in order, empty ones absent, ordered within', () => {
  const view = fixedCostsView(
    build(
      [
        { key: 'a', name: 'Alpha', account: 'acc-everyday' },
        { key: 'b', name: 'Bravo', account: 'acc-everyday' },
        { key: 'c', name: 'Charlie', account: 'acc-everyday' },
        { key: 'd', name: 'Delta', account: 'acc-everyday' },
      ],
      [
        { key: 'a1', record: 'a', expected: '2026-02-01', through: '2026-02-08', covered: true },
        { key: 'b1', record: 'b', expected: '2026-02-15', through: '2026-02-22', covered: true },
        { key: 'c1', record: 'c', expected: '2026-03-20', through: '2026-03-27' },
        { key: 'd1', record: 'd', expected: '2026-03-09', through: '2026-03-16' },
        { key: 'd0', record: 'd', expected: '2026-03-02', through: '2026-03-09' },
      ],
    ),
  );
  assert.equal(view.kind, 'ready');
  if (view.kind !== 'ready') return;
  assert.deepEqual(Object.keys(view.counts), [...READING_ORDER]);
  assert.deepEqual(view.counts, { missing: 2, notImported: 0, cantTell: 0, pending: 3, arrived: 0 });
  assert.deepEqual(
    view.groups.map(group => group.reading),
    ['missing', 'pending'],
  );
  for (const group of view.groups) assert.equal(group.rows.length, view.counts[group.reading]);
  // Missing: most recent first. Pending: soonest first.
  assert.deepEqual(view.groups[0].rows.map(row => row.occurrenceKey), ['b1', 'a1']);
  assert.deepEqual(view.groups[1].rows.map(row => row.occurrenceKey), ['d0', 'd1', 'c1']);
});

// ---- no viewer clock (r001 §4, §16 consumer) -------------------------------------

test('the reading never depends on the viewer\'s clock: the module reads none, and a clock that throws changes nothing', () => {
  const source = readFileSync(join(process.cwd(), 'src', 'fixed-costs.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(source, /\bDate\b|performance\.now|process\.hrtime/);
  const snapshot = build(
    [{ key: 'r', account: 'acc-everyday' }],
    [
      { key: 'o1', record: 'r', expected: '2026-02-15', through: '2026-02-22', covered: true },
      { key: 'o2', record: 'r', expected: '2026-03-10', through: '2026-03-17' },
    ],
  );
  const before = fixedCostsView(snapshot);
  const RealDate = globalThis.Date;
  try {
    (globalThis as { Date: unknown }).Date = new Proxy(RealDate, {
      construct() {
        throw new Error('the viewer clock was read');
      },
      get(target, property, receiver) {
        if (property === 'now') {
          return () => {
            throw new Error('the viewer clock was read');
          };
        }
        return Reflect.get(target, property, receiver);
      },
    });
    assert.deepEqual(fixedCostsView(snapshot), before);
  } finally {
    globalThis.Date = RealDate;
  }
});
