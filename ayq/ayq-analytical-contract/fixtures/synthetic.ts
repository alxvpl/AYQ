// Synthetic contract fixtures — invented values only (03 §6.1, 016 §7).
//
// A test-only entry point: nothing here is part of the production API. The
// baseline is one small snapshot that exercises every group of the 1.0 shape;
// each fixture case of 016 §9 / 017 PC3 is a deterministic mutation of it.
// No account, transaction, merchant, balance, path, user or banking datum
// here is real.

import type { AnalyticalSnapshotV1 } from '../src/types.ts';

export const GENERATED_AT = '2026-03-05T06:00:00Z';
export const TODAY = '2026-03-05';

type Deep = Record<string, unknown>;

/** A deep clone, so a mutation never leaks into the next case. */
export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * F01 — the valid 1.0 baseline: two accounts (one with a proven start, one
 * with UNKNOWN_START), one of them reconciled, the other with no bank
 * balance and an unknown absolute balance; every counterparty and category
 * state; an internal transfer pair; a reversal; a one-time and a recurring
 * expectation with occurrences in every state; an available forecast.
 */
export function baseline(): AnalyticalSnapshotV1 {
  return {
    meta: {
      contractVersion: '1.0',
      snapshotId: 'snap-0001',
      generatedAt: GENERATED_AT,
      budgetKey: 'budget-alpha',
      producer: { productVersion: '0.4.0', buildNumber: 9, commitSha: '0000000000000000000000000000000000000000' },
      currencies: ['EUR'],
      coverage: { reliabilityBoundary: '2026-02-28', reliabilityBoundaryBasis: ['acc-card'] },
      counts: {
        accounts: 2,
        transactions: 8,
        counterparties: 3,
        categories: 3,
        expectedOccurrences: 4,
        uncategorisedTransactions: 2,
        unresolvedCounterparties: 1,
        counterpartyNotApplicable: 1,
      },
    },
    accounts: [
      {
        accountKey: 'acc-everyday',
        name: 'Everyday account',
        type: 'current',
        displayIdentifier: 'NL…0001',
        countsTowardAvailableFunds: true,
        currency: 'EUR',
        statementCoverage: {
          coverageStartDate: '2025-01-01',
          lastStatementDate: '2026-03-04',
          bankClosingBalance: { amount: 250000, currency: 'EUR' },
        },
        absoluteBalance: { state: 'known', amount: { amount: 250000, currency: 'EUR' } },
        reconciliation: {
          state: 'agrees',
          ledgerBalanceAtCoverageDate: { amount: 250000, currency: 'EUR' },
          difference: { amount: 0, currency: 'EUR' },
        },
      },
      {
        accountKey: 'acc-card',
        name: 'Card account',
        type: 'unknown',
        displayIdentifier: 'NL…0002',
        countsTowardAvailableFunds: true,
        currency: 'EUR',
        statementCoverage: {
          lastStatementDate: '2026-02-28',
        },
        absoluteBalance: { state: 'unknown' },
        reconciliation: { state: 'unavailable' },
      },
    ],
    counterparties: [
      { counterpartyKey: 'cp-superstore', displayName: 'Superstore' },
      { counterpartyKey: 'cp-energy', displayName: 'Northwind Energy' },
      { counterpartyKey: 'cp-employer', displayName: 'Contoso Payroll' },
    ],
    categoryGroups: [
      { categoryGroupId: 'grp-daily', name: 'Daily living' },
      { categoryGroupId: 'grp-home', name: 'Home & bills' },
    ],
    categories: [
      { categoryId: 'cat-groceries', name: 'Groceries', categoryGroupId: 'grp-daily' },
      { categoryId: 'cat-utilities', name: 'Utilities', categoryGroupId: 'grp-home' },
      { categoryId: 'cat-eating', name: 'Eating out', categoryGroupId: 'grp-daily' },
    ],
    transactions: [
      {
        transactionKey: 'tx-01',
        accountKey: 'acc-everyday',
        bookingDate: '2026-02-03',
        amount: { amount: -4550, currency: 'EUR' },
        transactionClass: 'card_payment',
        counterparty: { state: 'identified', counterpartyKey: 'cp-superstore' },
        category: { state: 'categorised', categoryId: 'cat-groceries', source: 'learned_rule', ruleKey: 'rule-groceries' },
        evidenceText: 'Superstore, Amsterdam',
      },
      {
        transactionKey: 'tx-02',
        accountKey: 'acc-everyday',
        bookingDate: '2026-02-10',
        amount: { amount: -12000, currency: 'EUR' },
        transactionClass: 'direct_debit',
        counterparty: { state: 'identified', counterpartyKey: 'cp-energy' },
        category: { state: 'categorised', categoryId: 'cat-utilities', source: 'manual' },
        evidenceText: 'Monthly energy',
      },
      {
        transactionKey: 'tx-03',
        accountKey: 'acc-everyday',
        bookingDate: '2026-02-12',
        amount: { amount: -2500, currency: 'EUR' },
        transactionClass: 'card_payment',
        counterparty: { state: 'identified', counterpartyKey: 'cp-superstore' },
        category: { state: 'categorised', categoryId: 'cat-eating', source: 'automatic' },
        evidenceText: 'Superstore cafe',
      },
      {
        transactionKey: 'tx-04',
        accountKey: 'acc-everyday',
        bookingDate: '2026-02-14',
        amount: { amount: -10000, currency: 'EUR' },
        transactionClass: 'cash_withdrawal',
        counterparty: { state: 'not_applicable' },
        category: { state: 'uncategorised' },
        evidenceText: 'Cash',
      },
      {
        transactionKey: 'tx-05',
        accountKey: 'acc-everyday',
        bookingDate: '2026-02-16',
        amount: { amount: -3300, currency: 'EUR' },
        transactionClass: 'direct_debit',
        counterparty: { state: 'unresolved' },
        category: { state: 'uncategorised' },
        evidenceText: 'Direct debit, mandate reference withheld',
      },
      {
        transactionKey: 'tx-06',
        accountKey: 'acc-everyday',
        bookingDate: '2026-02-20',
        amount: { amount: -50000, currency: 'EUR' },
        transactionClass: 'credit_transfer',
        counterparty: { state: 'not_applicable' },
        category: { state: 'not_applicable' },
        internalTransfer: { pairKey: 'pair-0220', counterAccountKey: 'acc-card' },
        evidenceText: 'To card account',
      },
      {
        transactionKey: 'tx-07',
        accountKey: 'acc-card',
        bookingDate: '2026-02-20',
        amount: { amount: 50000, currency: 'EUR' },
        transactionClass: 'credit_transfer',
        counterparty: { state: 'not_applicable' },
        category: { state: 'not_applicable' },
        internalTransfer: { pairKey: 'pair-0220', counterAccountKey: 'acc-everyday' },
        evidenceText: 'From everyday account',
      },
      {
        transactionKey: 'tx-08',
        accountKey: 'acc-everyday',
        bookingDate: '2026-02-22',
        amount: { amount: 2500, currency: 'EUR' },
        transactionClass: 'other',
        counterparty: { state: 'identified', counterpartyKey: 'cp-superstore' },
        category: { state: 'categorised', categoryId: 'cat-eating', source: 'automatic' },
        reversal: { originalTransactionKey: 'tx-03' },
        evidenceText: 'Superstore cafe refund',
      },
    ],
    categoryPlans: [
      { categoryId: 'cat-groceries', month: '2026-03', plannedAmount: { amount: 40000, currency: 'EUR' } },
    ],
    expectationRecords: [
      {
        recordKey: 'rec-energy',
        kind: 'expense',
        name: 'Energy',
        counterpartyKey: 'cp-energy',
        category: { state: 'categorised', categoryId: 'cat-utilities' },
        amount: { amount: 12000, currency: 'EUR' },
        schedule: { type: 'recurring', frequency: 'monthly', interval: 1, anchorDate: '2026-01-10' },
        state: 'confirmed',
        stateSince: '2026-01-05',
      },
      {
        recordKey: 'rec-insurance',
        kind: 'expense',
        name: 'Yearly insurance',
        category: { state: 'uncategorised' },
        amount: { amount: 30000, currency: 'EUR' },
        schedule: { type: 'one_time', date: '2026-04-01' },
        state: 'suggested',
        stateSince: '2026-02-01',
      },
    ],
    expectedOccurrences: [
      {
        occurrenceKey: 'occ-energy-02',
        recordKey: 'rec-energy',
        expectedDate: '2026-02-10',
        amount: { amount: 12000, currency: 'EUR' },
        state: 'matched',
        match: { transactionKey: 'tx-02', source: 'automatic', matchedOn: '2026-02-11' },
      },
      {
        occurrenceKey: 'occ-energy-03',
        recordKey: 'rec-energy',
        expectedDate: '2026-03-01',
        amount: { amount: 12000, currency: 'EUR' },
        state: 'overdue',
      },
      {
        occurrenceKey: 'occ-energy-04',
        recordKey: 'rec-energy',
        expectedDate: '2026-04-10',
        amount: { amount: 12000, currency: 'EUR' },
        categoryOverride: { state: 'categorised', categoryId: 'cat-eating' },
        state: 'expected',
      },
      {
        occurrenceKey: 'occ-insurance',
        recordKey: 'rec-insurance',
        expectedDate: '2026-04-01',
        amount: { amount: 30000, currency: 'EUR' },
        state: 'dismissed',
      },
    ],
    forecast: {
      state: 'available',
      kind: 'canonical_ayq_forecast',
      asOfDate: TODAY,
      horizonMonths: 12,
      horizonEnd: '2027-03-04',
      currency: 'EUR',
      basisAccountKeys: ['acc-everyday', 'acc-card'],
      openingPosition: { amount: 250000, currency: 'EUR' },
      series: [
        { date: '2026-03-31', projectedPosition: { amount: 238000, currency: 'EUR' } },
        { date: '2026-04-30', projectedPosition: { amount: 196000, currency: 'EUR' } },
      ],
    },
  };
}

/** The baseline as untyped JSON, for mutations the types would refuse. */
export function baselineJson(): Deep {
  return clone(baseline()) as unknown as Deep;
}

/** Sets a dotted path on an untyped object; arrays are indexed by number. */
export function setAt(target: Deep, path: string, value: unknown): void {
  const parts = path.split('.');
  let cursor: unknown = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    cursor = (cursor as Deep)[parts[i]];
  }
  const last = parts[parts.length - 1];
  if (value === undefined) delete (cursor as Deep)[last];
  else (cursor as Deep)[last] = value;
}
