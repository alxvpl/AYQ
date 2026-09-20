// Shared synthetic material for the A1 regression matrix. Every value is
// invented; no real banking data may appear in this directory.
//
// The builders speak the executable contract 1.0 (ayq/ayq-analytical-contract)
// and what they build validates under it, so a test that constructs a
// snapshot here exercises the same shape the producer writes.

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
  TransactionClass,
} from '../src/types.js';

export const FIXTURE_DIRECTORY = join(process.cwd(), 'test', 'fixtures', 'a1');

export function readFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURE_DIRECTORY, name), 'utf8'));
}

export function loadFixture(name: string): AyqAnalyticalSnapshot {
  return validateSnapshot(readFixture(name));
}

export const CATEGORIES: Category[] = [
  { categoryId: 'cat-groceries', name: 'Groceries', categoryGroupId: 'grp-daily' },
  { categoryId: 'cat-utilities', name: 'Utilities', categoryGroupId: 'grp-daily' },
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
  /** The proven coverage start; `null` is UNKNOWN_START (03 §8.7). */
  from: string | null;
  to: string;
  ledger?: number;
  statement?: number;
  /** The bank stated no closing balance at the coverage date. */
  reconciliation?: 'unavailable';
}

let identifierCounter = 0;

export function account(spec: AccountSpec): Account {
  const currency = spec.currency ?? 'EUR';
  const ledger = spec.ledger ?? 100000;
  const statement = spec.statement ?? ledger;
  identifierCounter += 1;
  const unavailable = spec.reconciliation === 'unavailable';
  return {
    accountKey: spec.key,
    name: spec.name ?? spec.key,
    type: 'current',
    displayIdentifier: `NL…${String(identifierCounter).padStart(4, '0')}`,
    countsTowardAvailableFunds: spec.counts ?? true,
    currency,
    statementCoverage: {
      ...(spec.from === null ? {} : { coverageStartDate: spec.from }),
      lastStatementDate: spec.to,
      ...(unavailable ? {} : { bankClosingBalance: { amount: statement, currency } }),
    },
    absoluteBalance: { state: 'known', amount: { amount: ledger, currency } },
    reconciliation: unavailable
      ? { state: 'unavailable' }
      : {
          state: statement - ledger === 0 ? 'agrees' : 'differs',
          ledgerBalanceAtCoverageDate: { amount: ledger, currency },
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
  class?: TransactionClass;
  /** `null` is no canonical counterparty: unresolved, or not applicable for a cash withdrawal. */
  counterparty?: string | null;
  /** `null` is uncategorised. */
  category?: string | null;
  /** The provenance of a set category; a learned rule names itself. */
  source?: 'manual' | 'learned_rule' | 'automatic';
  transfer?: boolean;
  /** The other side of an internal transfer; defaults to `acc-b`. */
  counterAccount?: string;
  pairKey?: string;
  reversalOf?: string;
}

export function transaction(spec: TransactionSpec): Transaction {
  const currency = spec.currency ?? 'EUR';
  const transactionClass = spec.class ?? 'card_payment';
  // An internal transfer carries neither a category nor a canonical
  // counterparty (03 §13.14, 017 PC2), so the helper never invents one for it.
  const transfer = spec.transfer ?? false;
  const counterpartyKey = transfer ? null : spec.counterparty === undefined ? 'cp-a' : spec.counterparty;
  const categoryId = transfer ? null : spec.category === undefined ? 'cat-groceries' : spec.category;
  const source = spec.source ?? 'learned_rule';

  const counterparty: Transaction['counterparty'] =
    transfer || transactionClass === 'cash_withdrawal'
      ? { state: 'not_applicable' }
      : counterpartyKey === null
        ? { state: 'unresolved' }
        : { state: 'identified', counterpartyKey };
  const category: Transaction['category'] = transfer
    ? { state: 'not_applicable' }
    : categoryId === null
      ? { state: 'uncategorised' }
      : { state: 'categorised', categoryId, source, ...(source === 'learned_rule' ? { ruleKey: 'rule-1' } : {}) };

  return {
    transactionKey: spec.key,
    accountKey: spec.account ?? 'acc-a',
    bookingDate: spec.date,
    amount: { amount: spec.amount, currency },
    transactionClass,
    counterparty,
    category,
    ...(transfer
      ? { internalTransfer: { pairKey: spec.pairKey ?? `pair-${spec.key}`, counterAccountKey: spec.counterAccount ?? 'acc-b' } }
      : {}),
    ...(spec.reversalOf === undefined ? {} : { reversal: { originalTransactionKey: spec.reversalOf } }),
    evidenceText: 'Synthetic evidence',
  };
}

export interface SnapshotSpec {
  generatedAt?: string;
  accounts: Account[];
  transactions: Transaction[];
}

export function snapshot(spec: SnapshotSpec): AyqAnalyticalSnapshot {
  const currencies = [...new Set(spec.accounts.map(x => x.currency))];
  const funds = spec.accounts.filter(x => x.countsTowardAvailableFunds);
  const boundary = funds.map(x => x.statementCoverage.lastStatementDate).sort()[0];
  const generatedAt = spec.generatedAt ?? '2026-03-05T06:00:00Z';
  const asOfDate = generatedAt.slice(0, 10);
  const nonTransfer = spec.transactions.filter(x => x.internalTransfer === undefined);
  return {
    meta: {
      contractVersion: '1.0',
      snapshotId: 'snap-test',
      generatedAt,
      budgetKey: 'budget-test',
      producer: { productVersion: '0.0.0', buildNumber: 0, commitSha: 'x'.repeat(40) },
      currencies,
      coverage: {
        ...(boundary === undefined ? {} : { reliabilityBoundary: boundary }),
        reliabilityBoundaryBasis: funds
          .filter(x => x.statementCoverage.lastStatementDate === boundary)
          .map(x => x.accountKey),
      },
      counts: {
        accounts: spec.accounts.length,
        transactions: spec.transactions.length,
        counterparties: COUNTERPARTIES.length,
        categories: CATEGORIES.length,
        expectedOccurrences: 0,
        uncategorisedTransactions: spec.transactions.filter(x => x.category.state === 'uncategorised').length,
        unresolvedCounterparties: nonTransfer.filter(x => x.counterparty.state === 'unresolved').length,
        counterpartyNotApplicable: nonTransfer.filter(x => x.counterparty.state === 'not_applicable').length,
      },
    },
    accounts: spec.accounts,
    counterparties: COUNTERPARTIES,
    categoryGroups: [{ categoryGroupId: 'grp-daily', name: 'Daily living' }],
    categories: CATEGORIES,
    transactions: spec.transactions,
    categoryPlans: [],
    expectationRecords: [],
    expectedOccurrences: [],
    forecast: {
      state: 'available',
      kind: 'canonical_ayq_forecast',
      asOfDate,
      horizonMonths: 12,
      horizonEnd: `${Number(asOfDate.slice(0, 4)) + 1}${asOfDate.slice(4)}`,
      currency: currencies[0] ?? 'EUR',
      basisAccountKeys: funds.map(x => x.accountKey),
      openingPosition: { amount: 100000, currency: currencies[0] ?? 'EUR' },
      series: [],
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
