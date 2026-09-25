// Synthetic contract-1.0 snapshots at scale (directive 039 W2).
//
// Accounts, counterparties and transactions vary independently; names can be
// long; the span can be many years. Everything is invented from a seeded
// generator, so a shape is reproducible and nothing here has ever been near a
// bank. What is built validates under the executable contract, which the
// measurement runner asserts before it times anything.

import type { Account, AyqAnalyticalSnapshot, Category, Counterparty, Transaction, TransactionClass } from '../src/types.js';

export interface Shape {
  name: string;
  accounts: number;
  counterparties: number;
  transactions: number;
  /** Years of history before the last statement date. */
  years: number;
  /** Counterparty name length range. */
  nameLength: [number, number];
}

const LAST_STATEMENT = '2026-03-04';
const GENERATED_AT = '2026-03-05T06:00:00Z';
const CLASSES: TransactionClass[] = ['card_payment', 'direct_debit', 'credit_transfer', 'bank_fee', 'other'];
const WORDS = [
  'Northwind', 'Harbour', 'Superstore', 'Energy', 'Cafe', 'Market', 'Telecom', 'Insurance', 'Pharmacy', 'Garage',
  'Books', 'Cinema', 'Bakery', 'Transit', 'Dental', 'Florist', 'Hardware', 'Optician', 'Studio', 'Gallery',
  'Cooperative', 'Association', 'Foundation', 'Partners', 'Holdings', 'Services', 'Logistics', 'Workshop',
];

/** mulberry32 — small, seeded, good enough for shapes. */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function isoDate(daysBefore: number): string {
  const end = Date.UTC(2026, 2, 4);
  const d = new Date(end - daysBefore * 86_400_000);
  return d.toISOString().slice(0, 10);
}

function nameOf(rng: () => number, index: number, length: [number, number]): string {
  const target = length[0] + Math.floor(rng() * (length[1] - length[0] + 1));
  let name = '';
  while (name.length < target) {
    name += (name === '' ? '' : ' ') + WORDS[Math.floor(rng() * WORDS.length)];
  }
  // Distinct, and never an obvious IBAN or number run the contract would flag.
  return `${name.slice(0, target)} ${index + 1}`.replace(/\s+/g, ' ').trim();
}

export function generate(shape: Shape, seed = 1): AyqAnalyticalSnapshot {
  const rng = random(seed);
  const currency = 'EUR';
  const spanDays = Math.max(30, Math.round(shape.years * 365.25));

  const accounts: Account[] = Array.from({ length: shape.accounts }, (_, i) => {
    const start = isoDate(spanDays - Math.floor(rng() * 30));
    return {
      accountKey: `acc-${i + 1}`,
      name: `Account ${i + 1}`,
      type: 'current',
      displayIdentifier: `NL…${String(1000 + i).padStart(4, '0')}`,
      countsTowardAvailableFunds: true,
      currency,
      statementCoverage: { coverageStartDate: start, lastStatementDate: LAST_STATEMENT, bankClosingBalance: { amount: 100000, currency } },
      absoluteBalance: { state: 'known', amount: { amount: 100000, currency } },
      reconciliation: {
        state: 'agrees',
        ledgerBalanceAtCoverageDate: { amount: 100000, currency },
        difference: { amount: 0, currency },
      },
    };
  });

  const counterparties: Counterparty[] = Array.from({ length: shape.counterparties }, (_, i) => ({
    counterpartyKey: `cp-${i + 1}`,
    displayName: nameOf(rng, i, shape.nameLength),
  }));

  const categories: Category[] = Array.from({ length: 20 }, (_, i) => ({
    categoryId: `cat-${i + 1}`,
    name: `Category ${i + 1}`,
    categoryGroupId: i < 10 ? 'grp-daily' : 'grp-fixed',
  }));

  let uncategorised = 0;
  let unresolved = 0;
  let notApplicable = 0;
  const transactions: Transaction[] = Array.from({ length: shape.transactions }, (_, i) => {
    const roll = rng();
    const cash = roll < 0.02;
    const noCounterparty = !cash && roll < 0.05;
    const noCategory = rng() < 0.08;
    const transactionClass: TransactionClass = cash ? 'cash_withdrawal' : CLASSES[Math.floor(rng() * CLASSES.length)];
    // Mostly money out; some money in.
    const magnitude = 100 + Math.floor(rng() * 25_000);
    const amount = rng() < 0.12 ? magnitude : -magnitude;
    const sourceRoll = rng();
    const source = sourceRoll < 0.5 ? 'learned_rule' : sourceRoll < 0.8 ? 'automatic' : 'manual';
    if (cash) notApplicable += 1;
    if (noCounterparty) unresolved += 1;
    if (noCategory) uncategorised += 1;
    return {
      transactionKey: `tx-${i + 1}`,
      accountKey: accounts[Math.floor(rng() * accounts.length)].accountKey,
      bookingDate: isoDate(Math.floor(rng() * spanDays)),
      amount: { amount, currency },
      transactionClass,
      counterparty: cash
        ? { state: 'not_applicable' }
        : noCounterparty
          ? { state: 'unresolved' }
          : { state: 'identified', counterpartyKey: counterparties[Math.floor(rng() * counterparties.length)].counterpartyKey },
      category: noCategory
        ? { state: 'uncategorised' }
        : {
            state: 'categorised',
            categoryId: categories[Math.floor(rng() * categories.length)].categoryId,
            source,
            ...(source === 'learned_rule' ? { ruleKey: `rule-${1 + Math.floor(rng() * 40)}` } : {}),
          },
      evidenceText: `Synthetic evidence ${i + 1}`,
    };
  });

  return {
    meta: {
      contractVersion: '1.0',
      snapshotId: `snap-scale-${shape.name}`,
      generatedAt: GENERATED_AT,
      budgetKey: 'budget-scale',
      producer: { productVersion: '0.0.0', buildNumber: 0, commitSha: 'x'.repeat(40) },
      currencies: [currency],
      coverage: { reliabilityBoundary: LAST_STATEMENT, reliabilityBoundaryBasis: accounts.map(a => a.accountKey) },
      counts: {
        accounts: accounts.length,
        transactions: transactions.length,
        counterparties: counterparties.length,
        categories: categories.length,
        expectedOccurrences: 0,
        uncategorisedTransactions: uncategorised,
        unresolvedCounterparties: unresolved,
        counterpartyNotApplicable: notApplicable,
      },
    },
    accounts,
    counterparties,
    categoryGroups: [
      { categoryGroupId: 'grp-daily', name: 'Daily living' },
      { categoryGroupId: 'grp-fixed', name: 'Fixed costs' },
    ],
    categories,
    transactions,
    categoryPlans: [],
    expectationRecords: [],
    expectedOccurrences: [],
    forecast: {
      state: 'available',
      kind: 'canonical_ayq_forecast',
      asOfDate: GENERATED_AT.slice(0, 10),
      horizonMonths: 12,
      horizonEnd: '2027-03-05',
      currency,
      basisAccountKeys: accounts.map(a => a.accountKey),
      openingPosition: { amount: 100000, currency },
      series: [],
    },
  } as AyqAnalyticalSnapshot;
}

/** The grid: accounts, counterparties and transactions varied independently, plus long names and many years. */
export const SHAPES: Shape[] = [
  { name: 'S1', accounts: 2, counterparties: 50, transactions: 1_000, years: 2, nameLength: [8, 24] },
  { name: 'S2', accounts: 5, counterparties: 500, transactions: 10_000, years: 3, nameLength: [8, 24] },
  { name: 'S3', accounts: 10, counterparties: 2_000, transactions: 50_000, years: 5, nameLength: [8, 24] },
  { name: 'S4', accounts: 20, counterparties: 5_000, transactions: 100_000, years: 8, nameLength: [8, 24] },
  { name: 'S5', accounts: 50, counterparties: 5_000, transactions: 250_000, years: 10, nameLength: [8, 24] },
  { name: 'A50', accounts: 50, counterparties: 300, transactions: 10_000, years: 3, nameLength: [8, 24] },
  { name: 'C20k', accounts: 5, counterparties: 20_000, transactions: 50_000, years: 3, nameLength: [8, 24] },
  { name: 'LONG', accounts: 5, counterparties: 2_000, transactions: 20_000, years: 3, nameLength: [60, 120] },
  { name: 'YEARS', accounts: 5, counterparties: 300, transactions: 50_000, years: 15, nameLength: [8, 24] },
];
