import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyUnmatchedOccurrences,
  fixedCosts,
  forecastBacktest,
  moneyOutContribution,
  summarizeCounterparty,
} from '../src/analysis.js';
import { validateSnapshot } from '../src/validate.js';
import type { AyqAnalyticalSnapshot } from '../src/types.js';

function fixture(): AyqAnalyticalSnapshot {
  return {
    meta: {
      contractVersion: '1.0',
      snapshotId: 'snp_test_2',
      generatedAt: '2026-09-12T18:40:00Z',
      budgetKey: 'bdg_test',
      producer: { productVersion: 'test', buildNumber: 1, commitSha: '0'.repeat(40) },
      currencies: ['EUR'],
      coverage: { reliabilityBoundary: '2026-07-31', reliabilityBoundaryBasis: ['acc_buffer'] },
      counts: {
        accounts: 2,
        transactions: 7,
        counterparties: 4,
        categories: 3,
        uncategorisedTransactions: 1,
        unresolvedCounterparties: 0,
        counterpartyNotApplicable: 0,
        expectedOccurrences: 4,
      },
    },
    accounts: [
      {
        accountKey: 'acc_current', name: 'Current', type: 'current', displayIdentifier: null,
        countsTowardAvailableFunds: true, currency: 'EUR', openingDate: '2026-01-01',
        openingBalance: { amount: 100000, currency: 'EUR' }, ledgerBalance: { amount: 89000, currency: 'EUR' },
        statementCoverage: { lastStatementDate: '2026-08-31', closingBalance: { amount: 89000, currency: 'EUR' } },
        reconciliation: { state: 'agrees', ledgerBalanceAtCoverageDate: { amount: 89000, currency: 'EUR' }, statementClosingBalance: { amount: 89000, currency: 'EUR' }, difference: { amount: 0, currency: 'EUR' } },
      },
      {
        accountKey: 'acc_buffer', name: 'Buffer', type: 'unknown', displayIdentifier: null,
        countsTowardAvailableFunds: true, currency: 'EUR', openingDate: '2026-01-01',
        openingBalance: { amount: 50000, currency: 'EUR' }, ledgerBalance: { amount: 50000, currency: 'EUR' },
        statementCoverage: { lastStatementDate: '2026-07-31', closingBalance: { amount: 51250, currency: 'EUR' } },
        reconciliation: { state: 'differs', ledgerBalanceAtCoverageDate: { amount: 50000, currency: 'EUR' }, statementClosingBalance: { amount: 51250, currency: 'EUR' }, difference: { amount: 1250, currency: 'EUR' } },
      },
    ],
    counterparties: [
      { counterpartyKey: 'cpy_shop', displayName: 'Shop' },
      { counterpartyKey: 'cpy_rent', displayName: 'Landlord' },
      { counterpartyKey: 'cpy_gym', displayName: 'Gym' },
      { counterpartyKey: 'cpy_bank', displayName: 'Bank' },
    ],
    categoryGroups: [{ categoryGroupId: 'grp', name: 'Expenses' }],
    categories: [
      { categoryId: 'cat_shop', name: 'Groceries', categoryGroupId: 'grp' },
      { categoryId: 'cat_rent', name: 'Rent', categoryGroupId: 'grp' },
      { categoryId: 'cat_bank', name: 'Bank fees', categoryGroupId: 'grp' },
    ],
    transactions: [
      { transactionKey: 't1', accountKey: 'acc_current', bookingDate: '2026-07-02', valueDate: '2026-07-02', amount: { amount: -1000, currency: 'EUR' }, transactionClass: 'card_payment', counterpartyKey: 'cpy_shop', categoryId: 'cat_shop', categorisation: { source: 'rule' }, isInternalTransfer: false, internalTransferPairKey: null, counterAccountKey: null, isReversal: false, reversalOfTransactionKey: null, evidenceText: 'Shop A' },
      { transactionKey: 't2', accountKey: 'acc_current', bookingDate: '2026-08-02', valueDate: '2026-08-02', amount: { amount: -1500, currency: 'EUR' }, transactionClass: 'card_payment', counterpartyKey: 'cpy_shop', categoryId: 'cat_shop', categorisation: { source: 'rule' }, isInternalTransfer: false, internalTransferPairKey: null, counterAccountKey: null, isReversal: false, reversalOfTransactionKey: null, evidenceText: 'Shop B' },
      { transactionKey: 't3', accountKey: 'acc_current', bookingDate: '2026-08-05', valueDate: '2026-08-05', amount: { amount: 1500, currency: 'EUR' }, transactionClass: 'card_payment', counterpartyKey: 'cpy_shop', categoryId: 'cat_shop', categorisation: { source: 'manual' }, isInternalTransfer: false, internalTransferPairKey: null, counterAccountKey: null, isReversal: true, reversalOfTransactionKey: 't2', evidenceText: 'Refund' },
      { transactionKey: 't4', accountKey: 'acc_current', bookingDate: '2026-07-01', valueDate: '2026-07-01', amount: { amount: -10000, currency: 'EUR' }, transactionClass: 'direct_debit', counterpartyKey: 'cpy_rent', categoryId: 'cat_rent', categorisation: { source: 'rule' }, isInternalTransfer: false, internalTransferPairKey: null, counterAccountKey: null, isReversal: false, reversalOfTransactionKey: null, evidenceText: 'Rent' },
      { transactionKey: 't5', accountKey: 'acc_current', bookingDate: '2026-08-01', valueDate: '2026-08-01', amount: { amount: -11000, currency: 'EUR' }, transactionClass: 'direct_debit', counterpartyKey: 'cpy_rent', categoryId: 'cat_rent', categorisation: { source: 'rule' }, isInternalTransfer: false, internalTransferPairKey: null, counterAccountKey: null, isReversal: false, reversalOfTransactionKey: null, evidenceText: 'Rent' },
      { transactionKey: 't6', accountKey: 'acc_current', bookingDate: '2026-08-03', valueDate: '2026-08-03', amount: { amount: -3750, currency: 'EUR' }, transactionClass: 'direct_debit', counterpartyKey: 'cpy_gym', categoryId: null, categorisation: { source: 'manual' }, isInternalTransfer: false, internalTransferPairKey: null, counterAccountKey: null, isReversal: false, reversalOfTransactionKey: null, evidenceText: 'Gym' },
      { transactionKey: 't7', accountKey: 'acc_current', bookingDate: '2026-08-20', valueDate: '2026-08-20', amount: { amount: -500, currency: 'EUR' }, transactionClass: 'bank_fee', counterpartyKey: 'cpy_bank', categoryId: 'cat_bank', categorisation: { source: 'rule' }, isInternalTransfer: false, internalTransferPairKey: null, counterAccountKey: null, isReversal: false, reversalOfTransactionKey: null, evidenceText: 'Monthly fee' },
    ],
    categoryPlans: [],
    expectationRecords: [
      { recordKey: 'exp_rent', accountKey: 'acc_current', kind: 'expense', name: 'Rent', categoryId: 'cat_rent', counterpartyKey: 'cpy_rent', amount: { amount: -11000, currency: 'EUR' }, recurrence: { type: 'monthly', dayOfMonth: 1 }, state: 'confirmed', stateSince: '2026-01-01' },
      { recordKey: 'exp_gym', accountKey: 'acc_current', kind: 'expense', name: 'Gym', categoryId: null, counterpartyKey: 'cpy_gym', amount: { amount: -3750, currency: 'EUR' }, recurrence: { type: 'monthly', dayOfMonth: 3 }, state: 'suggested', stateSince: '2026-08-01' },
    ],
    expectedOccurrences: [
      { occurrenceKey: 'o1', recordKey: 'exp_rent', expectedDate: '2026-07-01', amount: { amount: -10000, currency: 'EUR' }, state: 'matched', match: { transactionKey: 't4', source: 'automatic', matchedOn: '2026-07-01' } },
      { occurrenceKey: 'o2', recordKey: 'exp_rent', expectedDate: '2026-08-01', amount: { amount: -11000, currency: 'EUR' }, state: 'matched', match: { transactionKey: 't5', source: 'automatic', matchedOn: '2026-08-01' } },
      { occurrenceKey: 'o3', recordKey: 'exp_gym', expectedDate: '2026-08-03', amount: { amount: -3750, currency: 'EUR' }, state: 'matched', match: { transactionKey: 't6', source: 'automatic', matchedOn: '2026-08-03' } },
      { occurrenceKey: 'o4', recordKey: 'exp_rent', expectedDate: '2026-09-01', amount: { amount: -11000, currency: 'EUR' }, state: 'overdue', match: null },
    ],
    forecast: {
      kind: 'canonical_ayq_forecast', asOfDate: '2026-09-12', horizonMonths: 1, horizonEnd: '2026-10-12', currency: 'EUR', basisAccountKeys: ['acc_current', 'acc_buffer'], openingPosition: { amount: 139000, currency: 'EUR' }, series: [{ date: '2026-09-30', projectedPosition: { amount: 140000, currency: 'EUR' } }], unavailableReason: null,
    },
  };
}

test('runtime guard requires both counterparty counters', () => {
  const raw = fixture() as unknown as Record<string, any>;
  delete raw.meta.counts.counterpartyNotApplicable;
  assert.throws(() => validateSnapshot(raw), /counterpartyNotApplicable/);
});

test('positive reversal reduces money-out rather than becoming income', () => {
  const snapshot = fixture();
  const reversal = snapshot.transactions.find(x => x.transactionKey === 't3')!;
  assert.equal(moneyOutContribution(snapshot, reversal), -1500);
});

test('counterparty evidence is deterministic', () => {
  const summary = summarizeCounterparty(fixture(), 'cpy_shop');
  assert.equal(summary.total, 1000);
  assert.equal(summary.transactionCount, 3);
  assert.deepEqual(summary.evidenceTexts, ['Refund', 'Shop A', 'Shop B']);
});

test('fixed costs start from canonical expectationRecords only', () => {
  const result = fixedCosts(fixture());
  assert.deepEqual(result.items.map(x => x.recordKey), ['exp_rent', 'exp_gym']);
  assert.equal(result.items.some(x => x.name === 'Bank fee'), false);
  assert.equal(result.items.find(x => x.recordKey === 'exp_gym')?.evidenceStatus, 'insufficient');
  assert.equal(result.committedMonthly, 11000);
  assert.deepEqual(result.items.find(x => x.recordKey === 'exp_rent')?.paidHistory.map(x => x.amount), [10000, 11000]);
});

test('overdue classification uses the expectation record own account coverage', () => {
  const snapshot = fixture();
  const classes = classifyUnmatchedOccurrences(snapshot);
  assert.equal(classes.length, 1);
  assert.equal(classes[0].occurrence.occurrenceKey, 'o4');
  assert.equal(classes[0].kind, 'not-yet-imported');
  snapshot.accounts[0].statementCoverage.lastStatementDate = '2026-09-05';
  assert.equal(classifyUnmatchedOccurrences(snapshot)[0].kind, 'missing');
});

test('forecast backtest compares sealed forecast with later observed position', () => {
  const old = fixture();
  old.meta.snapshotId = 'snp_old';
  old.meta.generatedAt = '2026-07-12T12:00:00Z';
  old.forecast.asOfDate = '2026-07-12';
  old.forecast.series = [{ date: '2026-08-20', projectedPosition: { amount: 130000, currency: 'EUR' } }];
  const latest = fixture();
  const rows = forecastBacktest([old, latest]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].forecastAmount, 130000);
  assert.equal(rows[0].targetDate, '2026-08-20');
});
