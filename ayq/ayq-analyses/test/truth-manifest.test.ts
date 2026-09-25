// Case 26 — the engine's counterparty totals against an independent truth
// manifest, in integer minor units. The manifest is hand-authored from the
// fixture construction and is never produced by the code under test.
//
// The manifest states ordinary small integers; the engine's values are exact
// bigint. The test converts the manifest's expectation explicitly, so the
// engine's type is never weakened to meet a fixture (011 §6).

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { analyse } from '../src/engine.js';
import { allCategoryKeys } from '../src/context.js';
import { FIXTURE_DIRECTORY, loadFixture } from './helpers.js';
import type { AnalysisContext, CategorySelectionEntry } from '../src/types.js';

interface ExpectedExclusion {
  count: number;
  amountMinor: number | null;
}

interface ManifestView {
  id: string;
  fixture: string;
  description: string;
  context: {
    fromDate: string;
    toDate: string;
    comparison: 'none' | 'previous' | 'sameLastYear';
    accounts: 'all' | string[];
    categories: 'all' | string[];
  };
  expected: {
    state: string;
    coverage: string;
    currency: string | null;
    totalMinor: number | null;
    currencies?: string[];
    counterparties: Array<{ counterpartyKey: string; displayName: string; transactionCount: number; moneyOutMinor: number }>;
    exclusions: { notApplicable: ExpectedExclusion | null; notIdentified: ExpectedExclusion | null };
    comparison: { fromDate: string; toDate: string; totalMinor: number | null; deltaMinor: number | null; unavailable: string | null } | null;
    startLimit?: { date: string; accountKeys: string[] };
    endLimit?: { date: string; accountKeys: string[] };
    reconciliation?: Array<{ accountKey: string; state: string; differenceMinor: number | null }>;
    unknownStartAccountKeys?: string[];
    snapshotCounters?: { counterpartyNotApplicable: number; unresolvedCounterparties: number };
  };
}

/** A manifest integer, stated in the engine's exact type. */
function exact(value: number): bigint;
function exact(value: number | null): bigint | null;
function exact(value: number | null): bigint | null {
  return value === null ? null : BigInt(value);
}

const manifest = JSON.parse(readFileSync(join(FIXTURE_DIRECTORY, 'truth-manifest.json'), 'utf8')) as {
  views: ManifestView[];
};

test('the manifest covers every valid fixture', () => {
  const covered = new Set(manifest.views.map(view => view.fixture));
  for (const fixture of [
    'a1-result.json',
    'a1-coverage-limited.json',
    'a1-empty.json',
    'a1-insufficient.json',
    'a1-comparison-unavailable-currency.json',
    'a1-unsupported-multicurrency.json',
    'a1-reconciliation-difference.json',
    'a1-reversal-detail.json',
    'a1-not-identified.json',
  ]) {
    assert.ok(covered.has(fixture), `${fixture} has no truth in the manifest`);
  }
});

for (const view of manifest.views) {
  test(`case 26 — ${view.id}: ${view.description}`, () => {
    const snapshot = loadFixture(view.fixture);

    const categories: CategorySelectionEntry[] =
      view.context.categories === 'all'
        ? allCategoryKeys(snapshot)
        : view.context.categories.map(entry => (entry === '__uncategorised__' ? null : entry));

    const context: AnalysisContext = {
      fromDate: view.context.fromDate,
      toDate: view.context.toDate,
      comparison: view.context.comparison,
      accountKeys:
        view.context.accounts === 'all' ? snapshot.accounts.map(x => x.accountKey) : view.context.accounts,
      categoryKeys: categories,
    };

    const result = analyse(snapshot, context);
    const expected = view.expected;

    assert.equal(result.state, expected.state, 'state');
    assert.equal(result.coverage.status, expected.coverage, 'coverage');
    assert.equal(result.currency, expected.currency, 'currency');
    assert.equal(result.totalMinor, exact(expected.totalMinor), 'total');
    if (expected.currencies) assert.deepEqual(result.currencies, expected.currencies);

    const rows = [...result.rows].sort((a, b) => (a.counterpartyKey < b.counterpartyKey ? -1 : 1));
    const wanted = [...expected.counterparties].sort((a, b) => (a.counterpartyKey < b.counterpartyKey ? -1 : 1));
    assert.equal(rows.length, wanted.length, 'row count');
    for (const [index, row] of rows.entries()) {
      assert.equal(row.counterpartyKey, wanted[index].counterpartyKey);
      assert.equal(row.displayName, wanted[index].displayName);
      assert.equal(row.transactionCount, wanted[index].transactionCount, `${row.counterpartyKey} count`);
      assert.equal(row.moneyOutMinor, exact(wanted[index].moneyOutMinor), `${row.counterpartyKey} money out`);
    }

    // The headline is the sum of the rows the manifest states, exactly.
    if (expected.totalMinor !== null) {
      assert.equal(
        expected.totalMinor,
        wanted.reduce((sum, row) => sum + row.moneyOutMinor, 0),
        'the manifest total is the sum of its own rows',
      );
    }

    for (const kind of ['notApplicable', 'notIdentified'] as const) {
      const group = result.exclusions.find(x => x.exclusion === kind) ?? null;
      const want = expected.exclusions[kind];
      if (want === null) {
        assert.equal(group, null, `${kind} should be absent`);
      } else {
        assert.equal(group?.transactionCount, want.count, `${kind} count`);
        assert.equal(group?.amountMinor ?? null, exact(want.amountMinor), `${kind} amount`);
      }
    }

    if (expected.comparison === null) {
      assert.equal(result.comparison, null);
      assert.equal(result.deltaMinor, null);
    } else {
      assert.equal(result.comparison?.fromDate, expected.comparison.fromDate);
      assert.equal(result.comparison?.toDate, expected.comparison.toDate);
      assert.equal(result.comparison?.totalMinor ?? null, exact(expected.comparison.totalMinor));
      assert.equal(result.comparison?.unavailable ?? null, expected.comparison.unavailable);
      assert.equal(result.deltaMinor, exact(expected.comparison.deltaMinor));
    }

    if (expected.startLimit) assert.deepEqual(result.coverage.startLimit, expected.startLimit);
    if (expected.unknownStartAccountKeys) assert.deepEqual(result.coverage.unknownStartAccountKeys, expected.unknownStartAccountKeys);
    if (expected.endLimit) assert.deepEqual(result.coverage.endLimit, expected.endLimit);

    if (expected.reconciliation) {
      const facts = [...result.reconciliation].sort((a, b) => (a.accountKey < b.accountKey ? -1 : 1));
      assert.equal(facts.length, expected.reconciliation.length);
      for (const [index, fact] of facts.entries()) {
        assert.equal(fact.accountKey, expected.reconciliation[index].accountKey);
        assert.equal(fact.state, expected.reconciliation[index].state);
        if (fact.state === 'unavailable') {
          assert.equal(expected.reconciliation[index].differenceMinor, null, 'unavailable carries no difference');
        } else {
          assert.equal(fact.differenceMinor, exact(expected.reconciliation[index].differenceMinor));
        }
      }
    }

    if (expected.snapshotCounters) {
      // The header counters are snapshot-wide facts and are never the counts of
      // a filtered result.
      assert.equal(snapshot.meta.counts.counterpartyNotApplicable, expected.snapshotCounters.counterpartyNotApplicable);
      assert.equal(snapshot.meta.counts.unresolvedCounterparties, expected.snapshotCounters.unresolvedCounterparties);
    }
  });
}
