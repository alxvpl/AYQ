// The A1 regression matrix: r003 §11 cases 1–25 and r03 §13 case 27, inside
// the real `npm test`. Case 26 lives in truth-manifest.test.ts.
//
// Every expected money value is written as a bigint literal: the engine's
// financial values are exact bigint, and the tests state their expectations in
// that type rather than weakening it (011 §6).

import assert from 'node:assert/strict';
import test from 'node:test';
import { analyse, moneyOutContribution, subjectOf } from '../src/engine.js';
import { DEFAULT_SORT, nextSortState, sortRows } from '../src/sort.js';
import { formatMoney } from '../src/money.js';
import { translate } from '../src/strings.js';
import { account, allCategories, context, snapshot, transaction } from './helpers.js';
import type { AnalysisResult } from '../src/types.js';

const FEBRUARY = { fromDate: '2026-02-01', toDate: '2026-02-28' } as const;

function rowOf(result: AnalysisResult, counterpartyKey: string): bigint {
  return result.rows.find(x => x.counterpartyKey === counterpartyKey)?.moneyOutMinor ?? 0n;
}

function exclusion(result: AnalysisResult, kind: 'notApplicable' | 'notIdentified') {
  return result.exclusions.find(x => x.exclusion === kind) ?? null;
}

test('case 1 — a transaction exactly on fromDate and one exactly on toDate are both counted', () => {
  const held = snapshot({
    accounts: [account({ key: 'acc-a', from: '2025-01-01', to: '2026-03-04' })],
    transactions: [
      transaction({ key: 'edge-from', date: '2026-02-01', amount: -1000 }),
      transaction({ key: 'edge-to', date: '2026-02-28', amount: -2000 }),
      transaction({ key: 'before', date: '2026-01-31', amount: -9999 }),
      transaction({ key: 'after', date: '2026-03-01', amount: -9999 }),
    ],
  });
  const result = analyse(held, context({ ...FEBRUARY }));
  assert.equal(result.totalMinor, 3000n);
  assert.equal(result.rows[0].transactionCount, 2);
});

test('case 3 — coverage comes from the selected accounts, not the global reliability boundary', () => {
  const held = snapshot({
    accounts: [
      account({ key: 'acc-a', from: '2025-01-01', to: '2026-03-04' }),
      account({ key: 'acc-b', from: '2025-01-01', to: '2026-02-10' }),
    ],
    transactions: [transaction({ key: 't1', date: '2026-02-03', amount: -1000 })],
  });
  // The snapshot's own boundary is the earliest of the two, but a result over
  // acc-a alone is fully covered.
  assert.equal(held.meta.coverage.reliabilityBoundary, '2026-02-10');
  const alone = analyse(held, context({ ...FEBRUARY, accountKeys: ['acc-a'] }));
  assert.equal(alone.coverage.status, 'full');
  const both = analyse(held, context({ ...FEBRUARY, accountKeys: ['acc-a', 'acc-b'] }));
  assert.equal(both.coverage.status, 'limited');
});

test('case 4 — accounts tied at the end boundary are all named', () => {
  const held = snapshot({
    accounts: [
      account({ key: 'acc-a', from: '2025-01-01', to: '2026-02-10' }),
      account({ key: 'acc-b', from: '2025-01-01', to: '2026-02-10' }),
      account({ key: 'acc-c', from: '2025-01-01', to: '2026-03-04' }),
    ],
    transactions: [transaction({ key: 't1', date: '2026-02-03', amount: -1000 })],
  });
  const result = analyse(held, context({ ...FEBRUARY, accountKeys: ['acc-a', 'acc-b', 'acc-c'] }));
  assert.equal(result.coverage.status, 'limited');
  assert.deepEqual(result.coverage.endLimit, { date: '2026-02-10', accountKeys: ['acc-a', 'acc-b'] });
  assert.equal(result.coverage.startLimit, null);
});

test('case 5 — a period starting before one account opens is limited at the start, and names it', () => {
  const held = snapshot({
    accounts: [
      account({ key: 'acc-a', from: '2025-01-01', to: '2026-03-04' }),
      account({ key: 'acc-b', from: '2026-02-09', to: '2026-03-04' }),
    ],
    transactions: [transaction({ key: 't1', date: '2026-02-12', amount: -1000 })],
  });
  const result = analyse(held, context({ ...FEBRUARY, accountKeys: ['acc-a', 'acc-b'] }));
  assert.equal(result.coverage.status, 'limited');
  assert.deepEqual(result.coverage.startLimit, { date: '2026-02-09', accountKeys: ['acc-b'] });
  assert.equal(result.coverage.endLimit, null);
});

test('case 6 — a period straddling an openingDate is coverage-limited, never Insufficient', () => {
  const held = snapshot({
    accounts: [account({ key: 'acc-a', from: '2026-02-15', to: '2026-03-04' })],
    transactions: [transaction({ key: 't1', date: '2026-02-20', amount: -1000 })],
  });
  const result = analyse(held, context({ ...FEBRUARY }));
  assert.equal(result.state, 'coverageLimited');
  assert.notEqual(result.state, 'insufficient');
  assert.equal(result.totalMinor, 1000n);
});

test('case 7 — different opening dates with tied end dates report both limits with the right accounts', () => {
  const held = snapshot({
    accounts: [
      account({ key: 'acc-a', from: '2026-02-05', to: '2026-02-20' }),
      account({ key: 'acc-b', from: '2026-01-10', to: '2026-02-20' }),
    ],
    transactions: [transaction({ key: 't1', date: '2026-02-06', amount: -1000 })],
  });
  const result = analyse(held, context({ ...FEBRUARY, accountKeys: ['acc-a', 'acc-b'] }));
  assert.deepEqual(result.coverage.startLimit, { date: '2026-02-05', accountKeys: ['acc-a'] });
  assert.deepEqual(result.coverage.endLimit, { date: '2026-02-20', accountKeys: ['acc-a', 'acc-b'] });
});

test('case 8 — a period wholly outside every selected account is Insufficient and gives no figure', () => {
  const held = snapshot({
    accounts: [account({ key: 'acc-a', from: '2025-01-01', to: '2025-06-30' })],
    transactions: [transaction({ key: 't1', date: '2025-05-05', amount: -1000 })],
  });
  const result = analyse(held, context({ ...FEBRUARY }));
  assert.equal(result.state, 'insufficient');
  assert.equal(result.totalMinor, null);
  assert.equal(result.rows.length, 0);
});

test('case 9 — a partly covered comparison period produces no delta, with the coverage reason', () => {
  const held = snapshot({
    accounts: [account({ key: 'acc-a', from: '2026-01-10', to: '2026-03-04' })],
    transactions: [
      transaction({ key: 't1', date: '2026-02-03', amount: -1000 }),
      transaction({ key: 'p1', date: '2026-01-20', amount: -500 }),
    ],
  });
  const result = analyse(held, context({ ...FEBRUARY, comparison: 'previous' }));
  assert.equal(result.deltaMinor, null);
  assert.equal(result.comparison?.unavailable, 'coverage');
  assert.equal(result.comparison?.totalMinor, null);
  assert.equal(result.state, 'result');
  assert.equal(result.totalMinor, 1000n);
});

test('case 10 — a comparison period covered by one account but not another is limited, not "no data"', () => {
  const held = snapshot({
    accounts: [
      account({ key: 'acc-a', from: '2025-01-01', to: '2026-03-04' }),
      account({ key: 'acc-b', from: '2026-01-20', to: '2026-03-04' }),
    ],
    transactions: [transaction({ key: 't1', date: '2026-02-03', amount: -1000 })],
  });
  const result = analyse(held, context({ ...FEBRUARY, comparison: 'previous', accountKeys: ['acc-a', 'acc-b'] }));
  assert.equal(result.comparison?.coverage.status, 'limited');
  assert.equal(result.comparison?.unavailable, 'coverage');
});

test('case 12 — a reversal whose original is outside the period, the accounts or the filter is still attributed to it', () => {
  const held = snapshot({
    accounts: [
      account({ key: 'acc-a', from: '2025-01-01', to: '2026-03-04' }),
      account({ key: 'acc-b', from: '2025-01-01', to: '2026-03-04' }),
    ],
    transactions: [
      transaction({ key: 'orig-period', date: '2026-01-20', amount: -5000, counterparty: 'cp-b' }),
      transaction({ key: 'rev-period', date: '2026-02-04', amount: 5000, counterparty: null, reversalOf: 'orig-period' }),
      transaction({ key: 'orig-account', account: 'acc-b', date: '2026-02-06', amount: -3000, counterparty: 'cp-b' }),
      transaction({ key: 'rev-account', date: '2026-02-07', amount: 1000, counterparty: null, reversalOf: 'orig-account' }),
      transaction({ key: 'orig-filter', date: '2026-02-08', amount: -2000, counterparty: 'cp-b', category: 'cat-utilities' }),
      transaction({ key: 'rev-filter', date: '2026-02-09', amount: 500, counterparty: null, reversalOf: 'orig-filter' }),
      transaction({ key: 'spend', date: '2026-02-10', amount: -20000, counterparty: 'cp-b' }),
    ],
  });
  const result = analyse(
    held,
    context({ ...FEBRUARY, accountKeys: ['acc-a'], categoryKeys: ['cat-groceries'] }),
  );
  // 20000 − 5000 − 1000 − 500, all under the original's counterparty.
  assert.equal(rowOf(result, 'cp-b'), 13500n);
  const reasons = result.contributions
    .filter(x => x.original !== null)
    .map(x => x.original!.outsideReason)
    .sort();
  assert.deepEqual(reasons, ['accounts', 'filter', 'period']);
});

test('case 13 — a reversal of an original with no canonical counterparty inherits its classification', () => {
  const held = snapshot({
    accounts: [account({ key: 'acc-a', from: '2025-01-01', to: '2026-03-04' })],
    transactions: [
      transaction({ key: 'cash', date: '2026-01-15', amount: -10000, class: 'cash_withdrawal', counterparty: null }),
      transaction({ key: 'cash-rev', date: '2026-02-03', amount: 2500, counterparty: 'cp-a', reversalOf: 'cash' }),
      transaction({ key: 'unknown', date: '2026-01-16', amount: -8000, class: 'credit_transfer', counterparty: null }),
      transaction({ key: 'unknown-rev', date: '2026-02-04', amount: 1500, counterparty: 'cp-a', reversalOf: 'unknown' }),
    ],
  });
  const result = analyse(held, context({ ...FEBRUARY }));
  assert.equal(exclusion(result, 'notApplicable')?.amountMinor, -2500n);
  assert.equal(exclusion(result, 'notIdentified')?.amountMinor, -1500n);
  assert.equal(result.rows.length, 0);
});

test('case 14 — a reversal of something that was not money-out contributes nothing and cannot become an expense', () => {
  const held = snapshot({
    accounts: [account({ key: 'acc-a', from: '2025-01-01', to: '2026-03-04' })],
    transactions: [
      transaction({ key: 'income', date: '2026-01-10', amount: 250000, class: 'credit_transfer' }),
      transaction({ key: 'income-rev', date: '2026-02-05', amount: -250000, reversalOf: 'income' }),
      transaction({ key: 'transfer', date: '2026-01-11', amount: -50000, transfer: true }),
      transaction({ key: 'transfer-rev', date: '2026-02-06', amount: 50000, reversalOf: 'transfer' }),
    ],
  });
  const result = analyse(held, context({ ...FEBRUARY }));
  assert.equal(result.state, 'empty');
  assert.equal(result.contributions.length, 0);
});

test('case 15 — a current population in more than one currency is refused before anything is summed', () => {
  const held = snapshot({
    accounts: [
      account({ key: 'acc-a', from: '2025-01-01', to: '2026-03-04' }),
      account({ key: 'acc-usd', currency: 'USD', counts: false, from: '2025-01-01', to: '2026-03-04' }),
    ],
    transactions: [
      transaction({ key: 't1', date: '2026-02-03', amount: -1000 }),
      transaction({ key: 't2', account: 'acc-usd', date: '2026-02-04', amount: -2000, currency: 'USD', counterparty: 'cp-b' }),
    ],
  });
  const result = analyse(held, context({ ...FEBRUARY, accountKeys: ['acc-a', 'acc-usd'] }));
  assert.equal(result.state, 'unsupported');
  assert.equal(result.totalMinor, null);
  assert.equal(result.deltaMinor, null);
  assert.equal(result.rows.length, 0);
  assert.deepEqual(result.currencies, ['EUR', 'USD']);
});

test('case 16 — every aggregate of a single-currency population carries that currency', () => {
  const held = snapshot({
    accounts: [account({ key: 'acc-a', from: '2025-01-01', to: '2026-03-04' })],
    transactions: [
      transaction({ key: 't1', date: '2026-02-03', amount: -1000 }),
      transaction({ key: 't2', date: '2026-02-04', amount: -2000, class: 'cash_withdrawal', counterparty: null }),
    ],
  });
  const result = analyse(held, context({ ...FEBRUARY }));
  assert.equal(result.currency, 'EUR');
  for (const row of result.rows) assert.equal(row.currency, 'EUR');
  for (const group of result.exclusions) assert.equal(group.currency, 'EUR');
});

test('cases 18 and 19 — a comparison in other currencies leaves the current result standing with no delta', () => {
  const build = (comparisonCurrencies: string[]) =>
    snapshot({
        accounts: [
        account({ key: 'acc-a', from: '2025-01-01', to: '2026-03-04' }),
        account({ key: 'acc-usd', currency: 'USD', counts: false, from: '2025-01-01', to: '2026-03-04' }),
      ],
      transactions: [
        transaction({ key: 't1', date: '2026-02-03', amount: -1000 }),
        ...comparisonCurrencies.map((currency, index) =>
          transaction({
            key: `p${index}`,
            account: currency === 'EUR' ? 'acc-a' : 'acc-usd',
            date: '2026-01-10',
            amount: -500,
            currency,
            counterparty: 'cp-b',
          }),
        ),
      ],
    });

  const mixed = analyse(
    build(['EUR', 'USD']),
    context({ ...FEBRUARY, comparison: 'previous', accountKeys: ['acc-a', 'acc-usd'] }),
  );
  assert.equal(mixed.state, 'result');
  assert.equal(mixed.totalMinor, 1000n);
  assert.equal(mixed.deltaMinor, null);
  assert.equal(mixed.comparison?.unavailable, 'currency');

  const other = analyse(
    build(['USD']),
    context({ ...FEBRUARY, comparison: 'previous', accountKeys: ['acc-a', 'acc-usd'] }),
  );
  assert.equal(other.state, 'result');
  assert.equal(other.deltaMinor, null);
  assert.equal(other.comparison?.unavailable, 'currency');
});

test('case 20 — a fully covered comparison period that is empty is an exact zero, and the delta is computed', () => {
  const held = snapshot({
    accounts: [account({ key: 'acc-a', from: '2025-01-01', to: '2026-03-04' })],
    transactions: [transaction({ key: 't1', date: '2026-02-03', amount: -1000 })],
  });
  const result = analyse(held, context({ ...FEBRUARY, comparison: 'previous' }));
  assert.equal(result.comparison?.unavailable, null);
  assert.equal(result.comparison?.totalMinor, 0n);
  assert.equal(result.comparison?.currency, 'EUR');
  assert.equal(result.deltaMinor, 1000n);
});

test('case 21 — the five money-out rules, each on its own', () => {
  const ordinaryOut = transaction({ key: 'a', date: '2026-02-01', amount: -4500 });
  const ordinaryIn = transaction({ key: 'b', date: '2026-02-01', amount: 4500 });
  const transfer = transaction({ key: 'c', date: '2026-02-01', amount: -4500, transfer: true });
  const reversal = transaction({ key: 'd', date: '2026-02-02', amount: 4500, reversalOf: 'a' });

  assert.equal(moneyOutContribution(transfer, null), 0n);
  assert.equal(moneyOutContribution(ordinaryOut, null), 4500n);
  assert.equal(moneyOutContribution(ordinaryIn, null), 0n);
  assert.equal(moneyOutContribution(reversal, ordinaryOut), -4500n);
  assert.equal(moneyOutContribution(reversal, ordinaryIn), 0n);
  assert.equal(moneyOutContribution(reversal, transfer), 0n);
});

test('case 22 — the exclusion counts are result-scoped, split, and reconcile with their own evidence lists', () => {
  const held = snapshot({
    accounts: [account({ key: 'acc-a', from: '2025-01-01', to: '2026-03-04' })],
    transactions: [
      transaction({ key: 'cash-in', date: '2026-02-05', amount: -10000, class: 'cash_withdrawal', counterparty: null, category: null }),
      transaction({ key: 'unknown-in', date: '2026-02-06', amount: -7500, class: 'credit_transfer', counterparty: null, category: 'cat-groceries' }),
      transaction({ key: 'cash-out', date: '2026-01-05', amount: -30000, class: 'cash_withdrawal', counterparty: null, category: null }),
      transaction({ key: 'unknown-out', date: '2026-01-06', amount: -9000, class: 'credit_transfer', counterparty: null, category: null }),
    ],
  });

  const whole = analyse(held, context({ ...FEBRUARY, categoryKeys: allCategories() }));
  assert.equal(exclusion(whole, 'notApplicable')?.transactionCount, 1);
  assert.equal(exclusion(whole, 'notApplicable')?.amountMinor, 10000n);
  assert.equal(exclusion(whole, 'notIdentified')?.transactionCount, 1);
  assert.equal(exclusion(whole, 'notIdentified')?.amountMinor, 7500n);
  // The snapshot-wide counters are larger: they are not the filtered result.
  assert.equal(held.meta.counts.counterpartyNotApplicable, 2);
  assert.equal(held.meta.counts.unresolvedCounterparties, 2);

  const filtered = analyse(held, context({ ...FEBRUARY, categoryKeys: ['cat-groceries'] }));
  assert.equal(exclusion(filtered, 'notApplicable'), null);
  assert.equal(exclusion(filtered, 'notIdentified')?.transactionCount, 1);

  for (const group of whole.exclusions) {
    assert.equal(group.transactionCount, group.contributions.length);
    assert.equal(group.amountMinor, group.contributions.reduce((sum, x) => sum + x.amountMinor, 0n));
  }
});

test('case 23 — an empty population inside a fully covered period says so and says nothing about reliability', () => {
  const held = snapshot({
    accounts: [account({ key: 'acc-a', from: '2025-01-01', to: '2026-03-04' })],
    transactions: [transaction({ key: 'income', date: '2026-02-03', amount: 250000, class: 'credit_transfer' })],
  });
  const result = analyse(held, context({ ...FEBRUARY }));
  assert.equal(result.state, 'empty');
  assert.equal(result.coverage.status, 'full');
  assert.equal(result.totalMinor, null);
});

test('case 24 — a reconciliation mismatch is stated and still produces the result', () => {
  const held = snapshot({
    accounts: [account({ key: 'acc-a', from: '2025-01-01', to: '2026-03-04', ledger: 100000, statement: 98500 })],
    transactions: [transaction({ key: 't1', date: '2026-02-03', amount: -1000 })],
  });
  const result = analyse(held, context({ ...FEBRUARY }));
  assert.equal(result.state, 'result');
  assert.equal(result.totalMinor, 1000n);
  assert.deepEqual(result.reconciliation, [
    {
      accountKey: 'acc-a',
      name: 'acc-a',
      displayIdentifier: held.accounts[0].displayIdentifier,
      state: 'differs',
      differenceMinor: -1500n,
      differenceMagnitudeMinor: 1500n,
      currency: 'EUR',
    },
  ]);
});

test('case 25 — headline, rows, drill-down, exclusions and chart order are one result', () => {
  const held = snapshot({
    accounts: [account({ key: 'acc-a', from: '2025-01-01', to: '2026-03-04' })],
    transactions: [
      transaction({ key: 't1', date: '2026-02-03', amount: -4500 }),
      transaction({ key: 't2', date: '2026-02-05', amount: -6250 }),
      transaction({ key: 't3', date: '2026-02-07', amount: -12000, counterparty: 'cp-b' }),
      transaction({ key: 't4', date: '2026-02-09', amount: -10000, class: 'cash_withdrawal', counterparty: null }),
      transaction({ key: 't5', date: '2026-02-11', amount: 2000, counterparty: 'cp-b', reversalOf: 't3' }),
    ],
  });
  const result = analyse(held, context({ ...FEBRUARY }));

  const rowSum = result.rows.reduce((sum, row) => sum + row.moneyOutMinor, 0n);
  assert.equal(result.totalMinor, rowSum);
  for (const row of result.rows) {
    assert.equal(row.moneyOutMinor, row.contributions.reduce((sum, x) => sum + x.amountMinor, 0n));
    assert.equal(row.transactionCount, row.contributions.length);
  }
  const excluded = result.exclusions.reduce((sum, group) => sum + (group.amountMinor ?? 0n), 0n);
  assert.equal(excluded, 10000n);
  assert.notEqual(result.totalMinor, rowSum + excluded);

  // The chart draws the table's rows in the table's order from the table's
  // values, so sorting can never make them disagree.
  const ordered = sortRows(result.rows, DEFAULT_SORT);
  assert.deepEqual(
    ordered.map(row => row.moneyOutMinor),
    [10750n, 10000n],
  );
});

test('case 27 — the category filter is tested on the transaction being filtered, reversals included', () => {
  const held = snapshot({
    accounts: [account({ key: 'acc-a', from: '2025-01-01', to: '2026-03-04' })],
    transactions: [
      transaction({ key: 'orig', date: '2026-02-03', amount: -9000, counterparty: 'cp-b', category: 'cat-groceries' }),
      transaction({ key: 'rev', date: '2026-02-10', amount: 2000, counterparty: 'cp-a', category: 'cat-utilities', reversalOf: 'orig' }),
    ],
  });

  // The filter admits the original and excludes the refund.
  const groceries = analyse(held, context({ ...FEBRUARY, categoryKeys: ['cat-groceries'] }));
  assert.equal(rowOf(groceries, 'cp-b'), 9000n);
  assert.equal(groceries.contributions.length, 1);

  // The filter admits the refund and excludes the original, and the refund is
  // still attributed to the original's counterparty.
  const utilities = analyse(held, context({ ...FEBRUARY, categoryKeys: ['cat-utilities'] }));
  assert.equal(rowOf(utilities, 'cp-b'), -2000n);
  assert.equal(utilities.contributions[0].original?.outsideReason, 'filter');
  assert.equal(utilities.rows.find(x => x.counterpartyKey === 'cp-a'), undefined);
});

test('the tie comparator is deterministic and locale-independent', () => {
  const held = snapshot({
    accounts: [account({ key: 'acc-a', from: '2025-01-01', to: '2026-03-04' })],
    transactions: [
      transaction({ key: 't1', date: '2026-02-03', amount: -5000, counterparty: 'cp-a' }),
      transaction({ key: 't2', date: '2026-02-04', amount: -5000, counterparty: 'cp-c' }),
    ],
  });
  const result = analyse(held, context({ ...FEBRUARY }));
  // Equal values, equal display names: the key decides, the same way always.
  const ordered = sortRows(result.rows, DEFAULT_SORT).map(row => row.counterpartyKey);
  assert.deepEqual(ordered, ['cp-a', 'cp-c']);
  assert.deepEqual(sortRows(result.rows, { column: 'moneyOut', direction: 'ascending' }).map(x => x.counterpartyKey), [
    'cp-a',
    'cp-c',
  ]);
});

test('a header click cycles descending, ascending, back to the default order', () => {
  const first = nextSortState(DEFAULT_SORT, 'counterparty');
  assert.deepEqual(first, { column: 'counterparty', direction: 'descending' });
  const second = nextSortState(first, 'counterparty');
  assert.deepEqual(second, { column: 'counterparty', direction: 'ascending' });
  assert.deepEqual(nextSortState(second, 'counterparty'), DEFAULT_SORT);
});

test('a contributing transaction without a counterparty is classified, never shown as a row', () => {
  assert.deepEqual(subjectOf(transaction({ key: 'x', date: '2026-02-01', amount: -1, class: 'cash_withdrawal', counterparty: null })), {
    kind: 'excluded',
    exclusion: 'notApplicable',
  });
  assert.deepEqual(subjectOf(transaction({ key: 'y', date: '2026-02-01', amount: -1, class: 'direct_debit', counterparty: null })), {
    kind: 'excluded',
    exclusion: 'notIdentified',
  });
  assert.deepEqual(subjectOf(transaction({ key: 'z', date: '2026-02-01', amount: -1 })), {
    kind: 'counterparty',
    counterpartyKey: 'cp-a',
  });
});

test('PC4 — the flyout states the magnitude of the supplied difference while the result keeps the signed fact', () => {
  const held = snapshot({
    accounts: [account({ key: 'acc-a', from: '2025-01-01', to: '2026-03-04', ledger: 250000, statement: 248500 })],
    transactions: [transaction({ key: 't1', date: '2026-02-03', amount: -1000 })],
  });
  const result = analyse(held, context({ ...FEBRUARY }));
  const fact = result.reconciliation[0];
  assert.equal(fact.state, 'differs');
  assert.equal(fact.differenceMinor, -1500n);
  assert.equal(fact.differenceMagnitudeMinor, 1500n);
  const line = translate('coverage.flyout.reconciliation.line', {
    account: fact.name,
    text: translate('coverage.flyout.reconciliation.differs', { amount: formatMoney(fact.differenceMagnitudeMinor, fact.currency, 'en-US') }),
  });
  assert.equal(line, 'acc-a — Differs from the statement by €15.00');
});
