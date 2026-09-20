// Shared synthetic material for the A1 regression matrix. Every value is
// invented; no real banking data may appear in this directory.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateSnapshot } from '../src/validate.js';
import type {
  Account,
  AnalysisContext,
  AyqAnalyticalSnapshot,
  Category,
  Counterparty,
  Transaction,
} from '../src/types.js';

export const FIXTURE_DIRECTORY = join(process.cwd(), 'test', 'fixtures', 'a1');

export function readFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURE_DIRECTORY, name), 'utf8'));
}

export function loadFixture(name: string): AyqAnalyticalSnapshot {
  return validateSnapshot(readFixture(name));
}

export const CATEGORIES: Category[] = [
  { categoryId: 'cat-groceries', name: 'Groceries', categoryGroupId: null },
  { categoryId: 'cat-utilities', name: 'Utilities', categoryGroupId: null },
];

export const COUNTERPARTIES: Counterparty[] = [
  { counterpartyKey: 'cp-a', displayName: 'Alpha Stores' },
  { counterpartyKey: 'cp-b', displayName: 'Beta Energy' },
  { counterpartyKey: 'cp-c', displayName: 'Alpha Stores' },
];

export interface AccountSpec {
  key: string;
  name?: string;
  currency?: string;
  counts?: boolean;
  from: string;
  to: string;
  ledger?: number;
  statement?: number;
}

export function account(spec: AccountSpec): Account {
  const currency = spec.currency ?? 'EUR';
  const ledger = spec.ledger ?? 100000;
  const statement = spec.statement ?? ledger;
  return {
    accountKey: spec.key,
    name: spec.name ?? spec.key,
    type: 'current',
    displayIdentifier: null,
    countsTowardAvailableFunds: spec.counts ?? true,
    currency,
    openingDate: spec.from,
    openingBalance: { amount: 0, currency },
    ledgerBalance: { amount: ledger, currency },
    statementCoverage: { lastStatementDate: spec.to, closingBalance: { amount: statement, currency } },
    reconciliation: {
      state: statement - ledger === 0 ? 'agrees' : 'differs',
      ledgerBalanceAtCoverageDate: { amount: ledger, currency },
      statementClosingBalance: { amount: statement, currency },
      difference: { amount: statement - ledger, currency },
    },
  };
}

export interface TransactionSpec {
  key: string;
  account?: string;
  date: string;
  amount: number;
  currency?: string;
  class?: string;
  counterparty?: string | null;
  category?: string | null;
  transfer?: boolean;
  reversalOf?: string;
}

export function transaction(spec: TransactionSpec): Transaction {
  const currency = spec.currency ?? 'EUR';
  // An internal transfer carries neither a category nor a canonical
  // counterparty (r003 I7), so the helper never invents one for it.
  const transfer = spec.transfer ?? false;
  const counterpartyKey = transfer ? null : spec.counterparty === undefined ? 'cp-a' : spec.counterparty;
  const categoryId = transfer ? null : spec.category === undefined ? 'cat-groceries' : spec.category;
  return {
    transactionKey: spec.key,
    accountKey: spec.account ?? 'acc-a',
    bookingDate: spec.date,
    valueDate: spec.date,
    amount: { amount: spec.amount, currency },
    transactionClass: spec.class ?? 'card_payment',
    counterpartyKey,
    categoryId,
    categorisation: categoryId === null ? { source: 'none' } : { source: 'rule', ruleKey: 'rule-1' },
    isInternalTransfer: transfer,
    internalTransferPairKey: null,
    counterAccountKey: null,
    isReversal: spec.reversalOf !== undefined,
    reversalOfTransactionKey: spec.reversalOf ?? null,
    evidenceText: 'Synthetic evidence',
  };
}

export interface SnapshotSpec {
  generatedAt?: string;
  currencies?: string[];
  accounts: Account[];
  transactions: Transaction[];
}

export function snapshot(spec: SnapshotSpec): AyqAnalyticalSnapshot {
  const currencies = spec.currencies ?? ['EUR'];
  const funds = spec.accounts.filter(x => x.countsTowardAvailableFunds);
  const boundary = funds.map(x => x.statementCoverage.lastStatementDate).sort()[0] ?? '2026-01-01';
  return {
    meta: {
      contractVersion: '1.3.0',
      snapshotId: 'snap-test',
      generatedAt: spec.generatedAt ?? '2026-03-05T06:00:00Z',
      budgetKey: 'budget-test',
      producer: { productVersion: '0.0.0', buildNumber: 0, commitSha: 'x'.repeat(40) },
      currencies,
      coverage: {
        reliabilityBoundary: boundary,
        reliabilityBoundaryBasis: funds
          .filter(x => x.statementCoverage.lastStatementDate === boundary)
          .map(x => x.accountKey),
      },
      counts: {
        accounts: spec.accounts.length,
        transactions: spec.transactions.length,
        counterparties: COUNTERPARTIES.length,
        categories: CATEGORIES.length,
        uncategorisedTransactions: spec.transactions.filter(x => x.categoryId === null).length,
        unresolvedCounterparties: spec.transactions.filter(
          x => x.counterpartyKey === null && x.transactionClass !== 'cash_withdrawal',
        ).length,
        counterpartyNotApplicable: spec.transactions.filter(
          x => x.counterpartyKey === null && x.transactionClass === 'cash_withdrawal',
        ).length,
        expectedOccurrences: 0,
      },
    },
    accounts: spec.accounts,
    counterparties: COUNTERPARTIES,
    categoryGroups: [],
    categories: CATEGORIES,
    transactions: spec.transactions,
    categoryPlans: [],
    expectationRecords: [],
    expectedOccurrences: [],
    forecast: {
      kind: 'canonical_ayq_forecast',
      asOfDate: '2026-03-05',
      horizonMonths: 12,
      horizonEnd: '2027-03-05',
      currency: currencies[0],
      basisAccountKeys: funds.map(x => x.accountKey),
      openingPosition: { amount: 100000, currency: currencies[0] },
      series: [],
      unavailableReason: null,
    },
  };
}

export function context(over: Partial<AnalysisContext> & Pick<AnalysisContext, 'fromDate' | 'toDate'>): AnalysisContext {
  return {
    comparison: 'none',
    accountKeys: ['acc-a'],
    categoryKeys: ['cat-groceries', 'cat-utilities', null],
    ...over,
  };
}

export function allCategories(): Array<string | null> {
  return [...CATEGORIES.map(x => x.categoryId), null];
}
