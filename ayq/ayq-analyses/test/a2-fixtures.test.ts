// The A2 Stage 1 acceptance fixtures S1–S4 (checklist R002 §2): each file
// passes the shared validator — S1, S3 and S4 as contract 1.1, S2 as 1.0 —
// and reads exactly as the checklist expects. These are the snapshots the
// installed-application checks load. All values are invented.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fixedCostsView } from '../src/fixed-costs.js';
import { validateSnapshot } from '../src/validate.js';
import type { AyqAnalyticalSnapshot } from '../src/types.js';

const DIRECTORY = join(process.cwd(), 'test', 'fixtures', 'a2');

function load(name: string): AyqAnalyticalSnapshot {
  return validateSnapshot(JSON.parse(readFileSync(join(DIRECTORY, name), 'utf8')));
}

function rows(snapshot: AyqAnalyticalSnapshot): string[] {
  const view = fixedCostsView(snapshot);
  assert.equal(view.kind, 'ready');
  if (view.kind !== 'ready') return [];
  return view.groups.flatMap(group =>
    group.rows.map(row => {
      const c = row.classification;
      const detail = c.reading === 'pending' || c.reading === 'notImported' ? `/${c.presentation}` : '';
      return `${c.reading}${detail} ${row.recordName} ${row.expectedDate}`;
    }),
  );
}

test('S1 — contract 1.1, judged one day before its production day', () => {
  const s1 = load('s1-all-readings.json');
  assert.equal(s1.meta.contractVersion, '1.1');
  assert.equal(s1.meta.expectationsAsOfDate, '2026-09-15');
  assert.equal(s1.meta.generatedAt.slice(0, 10), '2026-09-16');
});

test('S1 — every reading and presentation the checklist names, in the fixed order, nothing that must not appear', () => {
  const s1 = load('s1-all-readings.json');
  assert.deepEqual(rows(s1), [
    // Missing: most recent first. Gym carries the different-amount payment (T21);
    // the Car loan row is the old unresolved occurrence (§9.4).
    'missing Gym membership 2026-09-03',
    'missing Home insurance 2026-09-01',
    'missing Car loan 2026-06-12',
    // Not imported yet: unknown start (T07), then B (gap), then A (data ends).
    'notImported/gap Parking permit 2026-09-02',
    'notImported/gap Water 2026-08-28',
    'notImported/dataEnds Phone plan 2026-08-25',
    // Can't tell: an account outside the snapshot, and no account at all.
    'cantTell Music lessons 2026-08-22',
    'cantTell Newspaper 2026-08-20',
    // Pending: soonest first. Council tax is shown on its moved date (P1-C1).
    'pending/openWindow Council tax 2026-09-09',
    'pending/openWindow Electricity 2026-09-10',
    'pending/openWindow Car loan 2026-09-12',
    'pending/today Rent 2026-09-15',
    'pending/future Streaming 2026-09-20',
    'pending/future Car loan 2026-10-12',
    // Arrived: most recent first; Energy advance paid a different amount.
    'arrived Internet 2026-09-08',
    'arrived Energy advance 2026-09-06',
    'arrived Car loan 2026-08-12',
  ]);
  const view = fixedCostsView(s1);
  assert.ok(view.kind === 'ready');
  assert.deepEqual(view.counts, { missing: 3, notImported: 3, cantTell: 2, pending: 6, arrived: 3 });
  const shown = rows(s1).join('\n');
  // Not shown: expected income, the suggestion, the dismissed Rent, the older
  // Arrived Car loan and the later future one.
  for (const absent of ['Salary', 'Possible subscription', 'Rent 2026-08-15', 'Car loan 2026-07-12', 'Car loan 2026-11-12']) {
    assert.ok(!shown.includes(absent), absent);
  }
});

test('S1 — the rescheduled Council tax keeps its occurrence and its due date in the key, shown on the moved date', () => {
  const s1 = load('s1-all-readings.json');
  const council = s1.expectedOccurrences.find(o => o.recordKey === 'rec-council');
  assert.equal(council?.occurrenceKey, 'occ-council-2026-09-01');
  assert.equal(council?.expectedDate, '2026-09-09');
});

test('S2 — contract 1.0, otherwise valid, with a result for Explore; Fixed costs shows only the older-snapshot state', () => {
  const s2 = load('s2-contract-1-0.json');
  assert.equal(s2.meta.contractVersion, '1.0');
  assert.deepEqual(fixedCostsView(s2), { kind: 'olderSnapshot' });
  assert.ok(s2.transactions.some(t => t.bookingDate.startsWith('2026-08') && t.amount.amount < 0), 'August money-out for Explore');
});

test('S3 — contract 1.1 with only a suggested expense and an expected income: the empty state', () => {
  const s3 = load('s3-no-confirmed-expenses.json');
  assert.deepEqual(
    s3.expectationRecords.map(r => [r.kind, r.state]),
    [
      ['expense', 'suggested'],
      ['income', 'confirmed'],
    ],
  );
  assert.deepEqual(fixedCostsView(s3), { kind: 'empty', asOf: '2026-09-15' });
});

test('S4 — contract 1.1 with Pending and Arrived only: three zeros, two groups', () => {
  const view = fixedCostsView(load('s4-pending-and-arrived.json'));
  assert.ok(view.kind === 'ready');
  assert.deepEqual(view.counts, { missing: 0, notImported: 0, cantTell: 0, pending: 3, arrived: 2 });
  assert.deepEqual(view.groups.map(group => group.reading), ['pending', 'arrived']);
});

test('the acceptance fixtures are not production payload: the installer ships dist/** and package.json only', () => {
  const manifest = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as { build: { files: string[] } };
  assert.deepEqual(manifest.build.files, ['dist/**/*', 'package.json', '!**/*.map']);
  const build = readFileSync(join(process.cwd(), 'build.mjs'), 'utf8');
  assert.doesNotMatch(build, /fixtures/);
});
