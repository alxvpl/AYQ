// AYQ Analyses — A1 synthetic fixture builder, contract 1.0.
//
// Every value here is invented. No real banking or personally identifying
// financial data may ever enter this directory.
//
// This builder assembles snapshot JSON from explicit literal data in the
// executable contract 1.0 shape (ayq/ayq-analytical-contract). It imports
// nothing from ../../../src and performs no analysis: the only arithmetic it
// does is counting records for `meta.counts`. Run it with
// `node test/fixtures/a1/build-fixtures.mjs` after changing the data below.

import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

const CATEGORY_GROUPS = [
  { categoryGroupId: 'grp-daily', name: 'Daily living' },
  { categoryGroupId: 'grp-home', name: 'Home & bills' },
];

const CATEGORIES = [
  { categoryId: 'cat-groceries', name: 'Groceries', categoryGroupId: 'grp-daily' },
  { categoryId: 'cat-eating', name: 'Eating out', categoryGroupId: 'grp-daily' },
  { categoryId: 'cat-utilities', name: 'Utilities', categoryGroupId: 'grp-home' },
];

const COUNTERPARTIES = [
  { counterpartyKey: 'cp-superstore', displayName: 'Superstore' },
  { counterpartyKey: 'cp-northwind', displayName: 'Northwind Energy' },
  { counterpartyKey: 'cp-harbour', displayName: 'Harbour Café' },
  { counterpartyKey: 'cp-employer', displayName: 'Meridian Studios' },
  { counterpartyKey: 'cp-overseas', displayName: 'Overseas Supplies' },
];

function money(amount, currency) {
  return { amount, currency };
}

function account(options) {
  const {
    accountKey,
    name,
    displayIdentifier,
    currency = 'EUR',
    countsTowardAvailableFunds = true,
    // The proven coverage start; omitted (undefined) is UNKNOWN_START.
    openingDate,
    lastStatementDate,
    ledgerAtCoverage = 250000,
    // null: the bank stated no closing balance at the coverage date, so the
    // reconciliation is unavailable and no absolute balance is known.
    statementClosing = 250000,
  } = options;
  const unavailable = statementClosing === null;
  return {
    accountKey,
    name,
    type: 'current',
    displayIdentifier,
    countsTowardAvailableFunds,
    currency,
    statementCoverage: {
      ...(openingDate === undefined ? {} : { coverageStartDate: openingDate }),
      lastStatementDate,
      ...(unavailable ? {} : { bankClosingBalance: money(statementClosing, currency) }),
    },
    absoluteBalance: unavailable ? { state: 'unknown' } : { state: 'known', amount: money(ledgerAtCoverage, currency) },
    reconciliation: unavailable
      ? { state: 'unavailable' }
      : {
          state: statementClosing - ledgerAtCoverage === 0 ? 'agrees' : 'differs',
          ledgerBalanceAtCoverageDate: money(ledgerAtCoverage, currency),
          difference: money(statementClosing - ledgerAtCoverage, currency),
        },
  };
}

function tx(options) {
  const {
    transactionKey,
    accountKey,
    bookingDate,
    amount,
    currency = 'EUR',
    transactionClass,
    counterpartyKey = null,
    categoryId = null,
    // Provenance follows the category, never the counterparty (03 §4.3,
    // §11.11): a set category was set by a learned rule unless the row says
    // otherwise, and a transaction with no category claims none.
    source = 'learned_rule',
    isInternalTransfer = false,
    internalTransferPairKey = null,
    counterAccountKey = null,
    reversalOfTransactionKey = null,
    evidenceText,
  } = options;
  // The three counterparty states (03 §13.14): a cash withdrawal and an
  // internal transfer have no counterparty by nature; a transaction that
  // should have one and does not is unresolved.
  const counterparty =
    isInternalTransfer || transactionClass === 'cash_withdrawal'
      ? { state: 'not_applicable' }
      : counterpartyKey === null
        ? { state: 'unresolved' }
        : { state: 'identified', counterpartyKey };
  const category = isInternalTransfer
    ? { state: 'not_applicable' }
    : categoryId === null
      ? { state: 'uncategorised' }
      : { state: 'categorised', categoryId, source, ...(source === 'learned_rule' ? { ruleKey: 'rule-001' } : {}) };
  return {
    transactionKey,
    accountKey,
    bookingDate,
    amount: money(amount, currency),
    transactionClass,
    counterparty,
    category,
    ...(isInternalTransfer ? { internalTransfer: { pairKey: internalTransferPairKey, counterAccountKey } } : {}),
    ...(reversalOfTransactionKey === null ? {} : { reversal: { originalTransactionKey: reversalOfTransactionKey } }),
    evidenceText,
  };
}

function snapshot(options) {
  const {
    snapshotId,
    generatedAt,
    currencies = ['EUR'],
    accounts,
    transactions,
    forecastCurrency = currencies[0],
  } = options;

  const fundsAccounts = accounts.filter(x => x.countsTowardAvailableFunds);
  const boundary = fundsAccounts
    .map(x => x.statementCoverage.lastStatementDate)
    .sort()[0];

  // Integrity counts over the content (017 §3): the counterparty tallies are
  // over the transactions that are not internal transfers.
  const nonTransfer = transactions.filter(x => x.internalTransfer === undefined);
  const notApplicable = nonTransfer.filter(x => x.counterparty.state === 'not_applicable').length;
  const unresolved = nonTransfer.filter(x => x.counterparty.state === 'unresolved').length;

  return {
    meta: {
      contractVersion: '1.0',
      snapshotId,
      generatedAt,
      budgetKey: 'budget-synthetic',
      producer: { productVersion: '0.3.1', buildNumber: 7, commitSha: '0000000000000000000000000000000000000000' },
      currencies,
      coverage: {
        reliabilityBoundary: boundary,
        reliabilityBoundaryBasis: fundsAccounts
          .filter(x => x.statementCoverage.lastStatementDate === boundary)
          .map(x => x.accountKey),
      },
      counts: {
        accounts: accounts.length,
        transactions: transactions.length,
        counterparties: COUNTERPARTIES.length,
        categories: CATEGORIES.length,
        uncategorisedTransactions: transactions.filter(x => x.category.state === 'uncategorised').length,
        unresolvedCounterparties: unresolved,
        counterpartyNotApplicable: notApplicable,
        expectedOccurrences: 0,
      },
    },
    accounts,
    counterparties: COUNTERPARTIES,
    categoryGroups: CATEGORY_GROUPS,
    categories: CATEGORIES,
    transactions,
    categoryPlans: [],
    expectationRecords: [],
    expectedOccurrences: [],
    forecast: {
      state: 'available',
      kind: 'canonical_ayq_forecast',
      asOfDate: generatedAt.slice(0, 10),
      horizonMonths: 12,
      horizonEnd: '2027-03-04',
      currency: forecastCurrency,
      basisAccountKeys: fundsAccounts.map(x => x.accountKey),
      openingPosition: money(250000, forecastCurrency),
      series: [],
    },
  };
}

// ---------------------------------------------------------------------------
// F01 — ordinary Result: EUR, full coverage, supported previous comparison,
// two exclusion classes, and a fully covered comparison period that is empty.
// ---------------------------------------------------------------------------

const f01Accounts = [
  account({ accountKey: 'acc-daily', name: 'Everyday account', displayIdentifier: 'NL…0708', openingDate: '2025-01-01', lastStatementDate: '2026-03-04' }),
  account({ accountKey: 'acc-card', name: 'Card account', displayIdentifier: 'NL…1142', openingDate: '2025-01-01', lastStatementDate: '2026-03-04', ledgerAtCoverage: 80000, statementClosing: 80000 }),
];

const f01 = snapshot({
  snapshotId: 'snap-a1-result',
  generatedAt: '2026-03-05T06:00:00Z',
  accounts: f01Accounts,
  transactions: [
    tx({ transactionKey: 'f01-t01', accountKey: 'acc-daily', bookingDate: '2026-02-03', amount: -4500, transactionClass: 'card_payment', counterpartyKey: 'cp-superstore', categoryId: 'cat-groceries', evidenceText: 'Superstore, Amsterdam' }),
    tx({ transactionKey: 'f01-t02', accountKey: 'acc-daily', bookingDate: '2026-02-10', amount: -6250, transactionClass: 'card_payment', counterpartyKey: 'cp-superstore', categoryId: 'cat-groceries', evidenceText: 'Superstore, Amsterdam' }),
    tx({ transactionKey: 'f01-t03', accountKey: 'acc-daily', bookingDate: '2026-02-14', amount: -12000, transactionClass: 'direct_debit', counterpartyKey: 'cp-northwind', categoryId: 'cat-utilities', source: 'manual', evidenceText: 'Northwind Energy monthly instalment' }),
    tx({ transactionKey: 'f01-t04', accountKey: 'acc-card', bookingDate: '2026-02-18', amount: -1875, transactionClass: 'card_payment', counterpartyKey: 'cp-harbour', categoryId: 'cat-eating', evidenceText: 'Harbour Café' }),
    tx({ transactionKey: 'f01-t05', accountKey: 'acc-daily', bookingDate: '2026-02-20', amount: -10000, transactionClass: 'cash_withdrawal', evidenceText: 'Cash withdrawal' }),
    tx({ transactionKey: 'f01-t06', accountKey: 'acc-daily', bookingDate: '2026-02-24', amount: -3300, transactionClass: 'credit_transfer', evidenceText: 'Transfer, reference 8841-A' }),
    tx({ transactionKey: 'f01-t07', accountKey: 'acc-daily', bookingDate: '2026-02-26', amount: 250000, transactionClass: 'credit_transfer', counterpartyKey: 'cp-employer', evidenceText: 'Salary' }),
    tx({ transactionKey: 'f01-t08', accountKey: 'acc-daily', bookingDate: '2026-02-27', amount: -50000, transactionClass: 'credit_transfer', isInternalTransfer: true, internalTransferPairKey: 'f01-t09', counterAccountKey: 'acc-card', evidenceText: 'To card account' }),
    tx({ transactionKey: 'f01-t09', accountKey: 'acc-card', bookingDate: '2026-02-27', amount: 50000, transactionClass: 'credit_transfer', isInternalTransfer: true, internalTransferPairKey: 'f01-t08', counterAccountKey: 'acc-daily', evidenceText: 'From everyday account' }),

    tx({ transactionKey: 'f01-p01', accountKey: 'acc-daily', bookingDate: '2026-01-06', amount: -5000, transactionClass: 'card_payment', counterpartyKey: 'cp-superstore', categoryId: 'cat-groceries', evidenceText: 'Superstore, Amsterdam' }),
    tx({ transactionKey: 'f01-p02', accountKey: 'acc-daily', bookingDate: '2026-01-14', amount: -11500, transactionClass: 'direct_debit', counterpartyKey: 'cp-northwind', categoryId: 'cat-utilities', source: 'manual', evidenceText: 'Northwind Energy monthly instalment' }),
    tx({ transactionKey: 'f01-p03', accountKey: 'acc-card', bookingDate: '2026-01-22', amount: -2100, transactionClass: 'card_payment', counterpartyKey: 'cp-harbour', categoryId: 'cat-eating', evidenceText: 'Harbour Café' }),

    // June 2025 spends and May 2025 holds nothing: a fully covered comparison
    // period that is empty reads as an exact zero, never as missing data.
    tx({ transactionKey: 'f01-j01', accountKey: 'acc-daily', bookingDate: '2025-06-12', amount: -3000, transactionClass: 'card_payment', counterpartyKey: 'cp-superstore', categoryId: 'cat-groceries', evidenceText: 'Superstore, Amsterdam' }),
  ],
});

// ---------------------------------------------------------------------------
// F02 — coverage-limited at both ends, with a result inside the intersection.
// ---------------------------------------------------------------------------

const f02 = snapshot({
  snapshotId: 'snap-a1-coverage-limited',
  generatedAt: '2026-03-05T06:00:00Z',
  accounts: [
    account({ accountKey: 'acc-daily', name: 'Everyday account', displayIdentifier: 'NL…0708', openingDate: '2026-02-05', lastStatementDate: '2026-02-20' }),
    account({ accountKey: 'acc-card', name: 'Card account', displayIdentifier: 'NL…1142', openingDate: '2026-01-10', lastStatementDate: '2026-02-10', ledgerAtCoverage: 80000, statementClosing: 80000 }),
  ],
  transactions: [
    tx({ transactionKey: 'f02-t01', accountKey: 'acc-daily', bookingDate: '2026-02-06', amount: -2500, transactionClass: 'card_payment', counterpartyKey: 'cp-superstore', categoryId: 'cat-groceries', evidenceText: 'Superstore, Amsterdam' }),
    tx({ transactionKey: 'f02-t02', accountKey: 'acc-card', bookingDate: '2026-02-09', amount: -9000, transactionClass: 'direct_debit', counterpartyKey: 'cp-northwind', categoryId: 'cat-utilities', source: 'manual', evidenceText: 'Northwind Energy monthly instalment' }),
    tx({ transactionKey: 'f02-t03', accountKey: 'acc-card', bookingDate: '2026-01-20', amount: -1500, transactionClass: 'card_payment', counterpartyKey: 'cp-harbour', categoryId: 'cat-eating', evidenceText: 'Harbour Café' }),
  ],
});

// ---------------------------------------------------------------------------
// F03 — empty population inside a fully covered period.
// ---------------------------------------------------------------------------

const f03 = snapshot({
  snapshotId: 'snap-a1-empty',
  generatedAt: '2026-03-05T06:00:00Z',
  accounts: [
    account({ accountKey: 'acc-daily', name: 'Everyday account', displayIdentifier: 'NL…0708', openingDate: '2025-01-01', lastStatementDate: '2026-03-04' }),
    account({ accountKey: 'acc-card', name: 'Card account', displayIdentifier: 'NL…1142', openingDate: '2025-01-01', lastStatementDate: '2026-03-04', ledgerAtCoverage: 80000, statementClosing: 80000 }),
  ],
  transactions: [
    tx({ transactionKey: 'f03-t01', accountKey: 'acc-daily', bookingDate: '2026-02-26', amount: 250000, transactionClass: 'credit_transfer', counterpartyKey: 'cp-employer', evidenceText: 'Salary' }),
    tx({ transactionKey: 'f03-t02', accountKey: 'acc-daily', bookingDate: '2026-02-27', amount: -50000, transactionClass: 'credit_transfer', isInternalTransfer: true, internalTransferPairKey: 'f03-t03', counterAccountKey: 'acc-card', evidenceText: 'To card account' }),
    tx({ transactionKey: 'f03-t03', accountKey: 'acc-card', bookingDate: '2026-02-27', amount: 50000, transactionClass: 'credit_transfer', isInternalTransfer: true, internalTransferPairKey: 'f03-t02', counterAccountKey: 'acc-daily', evidenceText: 'From everyday account' }),
    tx({ transactionKey: 'f03-t04', accountKey: 'acc-daily', bookingDate: '2026-01-06', amount: -5000, transactionClass: 'card_payment', counterpartyKey: 'cp-superstore', categoryId: 'cat-groceries', evidenceText: 'Superstore, Amsterdam' }),
  ],
});

// ---------------------------------------------------------------------------
// F04 — the requested period lies wholly outside every account's coverage.
// ---------------------------------------------------------------------------

const f04 = snapshot({
  snapshotId: 'snap-a1-insufficient',
  generatedAt: '2026-03-05T06:00:00Z',
  accounts: [
    account({ accountKey: 'acc-daily', name: 'Everyday account', displayIdentifier: 'NL…0708', openingDate: '2025-01-01', lastStatementDate: '2025-06-30' }),
    account({ accountKey: 'acc-card', name: 'Card account', displayIdentifier: 'NL…1142', openingDate: '2025-01-01', lastStatementDate: '2025-06-30', ledgerAtCoverage: 80000, statementClosing: 80000 }),
  ],
  transactions: [
    tx({ transactionKey: 'f04-t01', accountKey: 'acc-daily', bookingDate: '2025-05-12', amount: -4200, transactionClass: 'card_payment', counterpartyKey: 'cp-superstore', categoryId: 'cat-groceries', evidenceText: 'Superstore, Amsterdam' }),
    tx({ transactionKey: 'f04-t02', accountKey: 'acc-card', bookingDate: '2025-06-03', amount: -1650, transactionClass: 'card_payment', counterpartyKey: 'cp-harbour', categoryId: 'cat-eating', evidenceText: 'Harbour Café' }),
  ],
});

// ---------------------------------------------------------------------------
// F05 — supported EUR current result, comparison population in USD.
// ---------------------------------------------------------------------------

const dualCurrencyAccounts = [
  account({ accountKey: 'acc-daily', name: 'Everyday account', displayIdentifier: 'NL…0708', openingDate: '2025-01-01', lastStatementDate: '2026-03-04' }),
  account({
    accountKey: 'acc-usd',
    name: 'Dollar account',
    displayIdentifier: 'US…4417',
    currency: 'USD',
    countsTowardAvailableFunds: false,
    openingDate: '2025-01-01',
    lastStatementDate: '2026-03-04',
    ledgerAtCoverage: 120000,
    statementClosing: 120000,
  }),
];

const f05 = snapshot({
  snapshotId: 'snap-a1-comparison-unavailable-currency',
  generatedAt: '2026-03-05T06:00:00Z',
  currencies: ['EUR', 'USD'],
  accounts: dualCurrencyAccounts,
  transactions: [
    tx({ transactionKey: 'f05-t01', accountKey: 'acc-daily', bookingDate: '2026-02-05', amount: -4000, transactionClass: 'card_payment', counterpartyKey: 'cp-superstore', categoryId: 'cat-groceries', evidenceText: 'Superstore, Amsterdam' }),
    tx({ transactionKey: 'f05-t02', accountKey: 'acc-daily', bookingDate: '2026-02-16', amount: -8000, transactionClass: 'direct_debit', counterpartyKey: 'cp-northwind', categoryId: 'cat-utilities', source: 'manual', evidenceText: 'Northwind Energy monthly instalment' }),
    tx({ transactionKey: 'f05-p01', accountKey: 'acc-usd', bookingDate: '2026-01-15', amount: -5000, currency: 'USD', transactionClass: 'card_payment', counterpartyKey: 'cp-overseas', categoryId: 'cat-groceries', evidenceText: 'Overseas Supplies' }),
  ],
});

// ---------------------------------------------------------------------------
// F06 — the current population itself spans two currencies.
// ---------------------------------------------------------------------------

const f06 = snapshot({
  snapshotId: 'snap-a1-unsupported-multicurrency',
  generatedAt: '2026-03-05T06:00:00Z',
  currencies: ['EUR', 'USD'],
  accounts: dualCurrencyAccounts,
  transactions: [
    tx({ transactionKey: 'f06-t01', accountKey: 'acc-daily', bookingDate: '2026-02-05', amount: -4000, transactionClass: 'card_payment', counterpartyKey: 'cp-superstore', categoryId: 'cat-groceries', evidenceText: 'Superstore, Amsterdam' }),
    tx({ transactionKey: 'f06-t02', accountKey: 'acc-usd', bookingDate: '2026-02-11', amount: -7000, currency: 'USD', transactionClass: 'card_payment', counterpartyKey: 'cp-overseas', categoryId: 'cat-groceries', evidenceText: 'Overseas Supplies' }),
    tx({ transactionKey: 'f06-t03', accountKey: 'acc-daily', bookingDate: '2026-02-19', amount: -2500, transactionClass: 'cash_withdrawal', evidenceText: 'Cash withdrawal' }),
  ],
});

// ---------------------------------------------------------------------------
// F07 — the only intentionally invalid fixture: a reversal that resolves to
// nothing. The validator refuses the whole snapshot.
// ---------------------------------------------------------------------------

const f07 = snapshot({
  snapshotId: 'snap-a1-invalid-broken-reversal',
  generatedAt: '2026-03-05T06:00:00Z',
  accounts: [
    account({ accountKey: 'acc-daily', name: 'Everyday account', displayIdentifier: 'NL…0708', openingDate: '2025-01-01', lastStatementDate: '2026-03-04' }),
  ],
  transactions: [
    tx({ transactionKey: 'f07-t01', accountKey: 'acc-daily', bookingDate: '2026-02-10', amount: -5500, transactionClass: 'card_payment', counterpartyKey: 'cp-superstore', categoryId: 'cat-groceries', evidenceText: 'Superstore, Amsterdam' }),
    tx({ transactionKey: 'f07-t02', accountKey: 'acc-daily', bookingDate: '2026-02-18', amount: 5500, transactionClass: 'card_payment', counterpartyKey: 'cp-superstore', categoryId: 'cat-groceries', reversalOfTransactionKey: 'f07-does-not-exist', evidenceText: 'Superstore refund' }),
  ],
});

// ---------------------------------------------------------------------------
// F08 — a supported result where one selected account differs from its
// statement by a stated amount.
// ---------------------------------------------------------------------------

const f08 = snapshot({
  snapshotId: 'snap-a1-reconciliation-difference',
  generatedAt: '2026-03-05T06:00:00Z',
  accounts: [
    account({ accountKey: 'acc-daily', name: 'Everyday account', displayIdentifier: 'NL…0708', openingDate: '2025-01-01', lastStatementDate: '2026-03-04', ledgerAtCoverage: 250000, statementClosing: 248500 }),
    account({ accountKey: 'acc-card', name: 'Card account', displayIdentifier: 'NL…1142', openingDate: '2025-01-01', lastStatementDate: '2026-03-04', ledgerAtCoverage: 80000, statementClosing: 80000 }),
  ],
  transactions: [
    tx({ transactionKey: 'f08-t01', accountKey: 'acc-daily', bookingDate: '2026-02-07', amount: -7300, transactionClass: 'card_payment', counterpartyKey: 'cp-superstore', categoryId: 'cat-groceries', evidenceText: 'Superstore, Amsterdam' }),
    tx({ transactionKey: 'f08-t02', accountKey: 'acc-card', bookingDate: '2026-02-21', amount: -2450, transactionClass: 'card_payment', counterpartyKey: 'cp-harbour', categoryId: 'cat-eating', evidenceText: 'Harbour Café' }),
  ],
});

// ---------------------------------------------------------------------------
// F09 — a reversal inside the period whose original lies outside it.
// ---------------------------------------------------------------------------

const f09 = snapshot({
  snapshotId: 'snap-a1-reversal-detail',
  generatedAt: '2026-03-05T06:00:00Z',
  accounts: [
    account({ accountKey: 'acc-daily', name: 'Everyday account', displayIdentifier: 'NL…0708', openingDate: '2025-01-01', lastStatementDate: '2026-03-04' }),
  ],
  transactions: [
    tx({ transactionKey: 'f09-orig', accountKey: 'acc-daily', bookingDate: '2026-01-20', amount: -9900, transactionClass: 'card_payment', counterpartyKey: 'cp-superstore', categoryId: 'cat-groceries', evidenceText: 'Superstore, Amsterdam' }),
    // The reversal carries no counterparty of its own: attribution comes from
    // the transaction it reverses, resolved against the whole snapshot.
    tx({ transactionKey: 'f09-rev', accountKey: 'acc-daily', bookingDate: '2026-02-04', amount: 9900, transactionClass: 'card_payment', categoryId: 'cat-groceries', reversalOfTransactionKey: 'f09-orig', evidenceText: 'Superstore refund' }),
    tx({ transactionKey: 'f09-t01', accountKey: 'acc-daily', bookingDate: '2026-02-12', amount: -15000, transactionClass: 'card_payment', counterpartyKey: 'cp-superstore', categoryId: 'cat-groceries', evidenceText: 'Superstore, Amsterdam' }),
    tx({ transactionKey: 'f09-t02', accountKey: 'acc-daily', bookingDate: '2026-02-14', amount: -12000, transactionClass: 'direct_debit', counterpartyKey: 'cp-northwind', categoryId: 'cat-utilities', source: 'manual', evidenceText: 'Northwind Energy monthly instalment' }),
  ],
});

// ---------------------------------------------------------------------------
// F10 — both exclusion classes, and snapshot-wide counters that are larger
// than the result-scoped counts.
// ---------------------------------------------------------------------------

const f10 = snapshot({
  snapshotId: 'snap-a1-not-identified',
  generatedAt: '2026-03-05T06:00:00Z',
  accounts: [
    account({ accountKey: 'acc-daily', name: 'Everyday account', displayIdentifier: 'NL…0708', openingDate: '2025-01-01', lastStatementDate: '2026-03-04' }),
  ],
  transactions: [
    tx({ transactionKey: 'f10-t01', accountKey: 'acc-daily', bookingDate: '2026-02-05', amount: -5000, transactionClass: 'card_payment', counterpartyKey: 'cp-superstore', categoryId: 'cat-groceries', evidenceText: 'Superstore, Amsterdam' }),
    tx({ transactionKey: 'f10-t02', accountKey: 'acc-daily', bookingDate: '2026-02-09', amount: -7500, transactionClass: 'credit_transfer', evidenceText: 'Transfer, reference 5512-B' }),
    tx({ transactionKey: 'f10-t03', accountKey: 'acc-daily', bookingDate: '2026-02-17', amount: -2500, transactionClass: 'direct_debit', evidenceText: 'Direct debit, mandate 77-C' }),
    tx({ transactionKey: 'f10-t04', accountKey: 'acc-daily', bookingDate: '2026-02-23', amount: -20000, transactionClass: 'cash_withdrawal', evidenceText: 'Cash withdrawal' }),
    // Outside the requested period, so the snapshot-wide counters exceed the
    // result-scoped exclusion counts.
    tx({ transactionKey: 'f10-p01', accountKey: 'acc-daily', bookingDate: '2026-01-08', amount: -3100, transactionClass: 'credit_transfer', evidenceText: 'Transfer, reference 4410-D' }),
    tx({ transactionKey: 'f10-p02', accountKey: 'acc-daily', bookingDate: '2026-01-19', amount: -15000, transactionClass: 'cash_withdrawal', evidenceText: 'Cash withdrawal' }),
  ],
});

// ---------------------------------------------------------------------------
// F11 — one of two accounts has no proven coverage start (UNKNOWN_START,
// 03 §8.7) and no statement balance at its coverage date (reconciliation
// unavailable, 03 §13.3). The other is ordinary. The result over both is
// qualified, its comparison refused, and its empty form replaced (010 §3).
// ---------------------------------------------------------------------------

const f11 = snapshot({
  snapshotId: 'snap-a1-unknown-start',
  generatedAt: '2026-03-05T06:00:00Z',
  accounts: [
    account({ accountKey: 'acc-daily', name: 'Everyday account', displayIdentifier: 'NL…0708', openingDate: '2025-01-01', lastStatementDate: '2026-03-04' }),
    account({ accountKey: 'acc-card', name: 'Card account', displayIdentifier: 'NL…1142', lastStatementDate: '2026-02-28', statementClosing: null }),
  ],
  transactions: [
    tx({ transactionKey: 'f11-t01', accountKey: 'acc-daily', bookingDate: '2026-02-03', amount: -4500, transactionClass: 'card_payment', counterpartyKey: 'cp-superstore', categoryId: 'cat-groceries', evidenceText: 'Superstore, Amsterdam' }),
    tx({ transactionKey: 'f11-t02', accountKey: 'acc-card', bookingDate: '2026-02-18', amount: -1875, transactionClass: 'card_payment', counterpartyKey: 'cp-harbour', categoryId: 'cat-eating', source: 'automatic', evidenceText: 'Harbour Café' }),
    tx({ transactionKey: 'f11-t03', accountKey: 'acc-card', bookingDate: '2026-02-21', amount: -3000, transactionClass: 'card_payment', counterpartyKey: 'cp-harbour', categoryId: 'cat-eating', source: 'manual', evidenceText: 'Harbour Café' }),
    tx({ transactionKey: 'f11-p01', accountKey: 'acc-daily', bookingDate: '2026-01-06', amount: -5000, transactionClass: 'card_payment', counterpartyKey: 'cp-superstore', categoryId: 'cat-groceries', evidenceText: 'Superstore, Amsterdam' }),
  ],
});

const FIXTURES = [
  ['a1-result.json', f01],
  ['a1-coverage-limited.json', f02],
  ['a1-empty.json', f03],
  ['a1-insufficient.json', f04],
  ['a1-comparison-unavailable-currency.json', f05],
  ['a1-unsupported-multicurrency.json', f06],
  ['a1-invalid-broken-reversal.json', f07],
  ['a1-reconciliation-difference.json', f08],
  ['a1-reversal-detail.json', f09],
  ['a1-not-identified.json', f10],
  ['a1-unknown-start.json', f11],
];

for (const [name, data] of FIXTURES) {
  await writeFile(join(here, name), `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  console.log(`wrote ${name}`);
}
