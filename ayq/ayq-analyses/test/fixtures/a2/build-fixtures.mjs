// AYQ Analyses — A2 Stage 1 acceptance fixtures S1–S4 (checklist
// A2_P2_HUMAN_PRODUCT_CHECKLIST R002 §2), contract 1.1 (S2: 1.0).
//
// Every value here is invented. No real banking or personally identifying
// financial data may ever enter this directory. These files are test and
// acceptance fixtures only: the installer ships dist/** and package.json, and
// nothing under test/.
//
// The builder writes explicit literal data in the executable contract shape.
// It performs no analysis and derives no fact AYQ owns: every
// automaticMatchThroughDate and automaticMatchWindowCovered below is written
// out as the producer would state it, not computed. The only arithmetic is
// counting records for meta.counts. Run it with
// `node test/fixtures/a2/build-fixtures.mjs` after changing the data below.

import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

const AS_OF = '2026-09-15';
// One day after the basis date, as S1 requires.
const GENERATED_AT = '2026-09-16T07:30:00Z';

const eur = amount => ({ amount, currency: 'EUR' });

const ACCOUNTS = [
  {
    accountKey: 'acc-main',
    name: 'Everyday account',
    type: 'current',
    displayIdentifier: 'NL…1001',
    countsTowardAvailableFunds: true,
    currency: 'EUR',
    statementCoverage: { coverageStartDate: '2025-01-01', lastStatementDate: '2026-09-10' },
    absoluteBalance: { state: 'unknown' },
    reconciliation: { state: 'unavailable' },
  },
  {
    accountKey: 'acc-card',
    name: 'Card account',
    type: 'current',
    displayIdentifier: 'NL…1002',
    countsTowardAvailableFunds: false,
    currency: 'EUR',
    // Its data ends before some automatic matching windows do: presentation A.
    statementCoverage: { coverageStartDate: '2026-01-01', lastStatementDate: '2026-08-20' },
    absoluteBalance: { state: 'unknown' },
    reconciliation: { state: 'unavailable' },
  },
  {
    accountKey: 'acc-savings',
    name: 'Savings account',
    type: 'savings',
    displayIdentifier: 'NL…1003',
    countsTowardAvailableFunds: false,
    currency: 'EUR',
    // Data past the window, but AYQ's proven coverage has a one-day gap in it:
    // the producer states the window uncovered. Presentation B.
    statementCoverage: { coverageStartDate: '2025-06-01', lastStatementDate: '2026-09-12' },
    absoluteBalance: { state: 'unknown' },
    reconciliation: { state: 'unavailable' },
  },
  {
    accountKey: 'acc-joint',
    name: 'Joint account',
    type: 'current',
    displayIdentifier: 'NL…1004',
    countsTowardAvailableFunds: false,
    currency: 'EUR',
    // The start of its coverage is not established (T07).
    statementCoverage: { lastStatementDate: '2026-09-12' },
    absoluteBalance: { state: 'unknown' },
    reconciliation: { state: 'unavailable' },
  },
];

const COUNTERPARTIES = [
  { counterpartyKey: 'cp-employer', displayName: 'Contoso Payroll' },
  { counterpartyKey: 'cp-energy', displayName: 'Northwind Energy' },
  { counterpartyKey: 'cp-gym', displayName: 'Northside Gym' },
  { counterpartyKey: 'cp-isp', displayName: 'Fibrenet' },
  { counterpartyKey: 'cp-lender', displayName: 'Meridian Car Finance' },
  { counterpartyKey: 'cp-superstore', displayName: 'Superstore' },
];

const CATEGORY_GROUPS = [
  { categoryGroupId: 'grp-home', name: 'Home & bills' },
  { categoryGroupId: 'grp-daily', name: 'Daily living' },
];

const CATEGORIES = [
  { categoryId: 'cat-bills', name: 'Bills', categoryGroupId: 'grp-home' },
  { categoryId: 'cat-loans', name: 'Loans', categoryGroupId: 'grp-home' },
  { categoryId: 'cat-groceries', name: 'Groceries', categoryGroupId: 'grp-daily' },
];

function tx(transactionKey, accountKey, bookingDate, amount, counterpartyKey, categoryId, transactionClass, evidenceText) {
  return {
    transactionKey,
    accountKey,
    bookingDate,
    amount: eur(amount),
    transactionClass,
    counterparty: { state: 'identified', counterpartyKey },
    category: categoryId === null ? { state: 'uncategorised' } : { state: 'categorised', categoryId, source: 'manual' },
    evidenceText,
  };
}

const TRANSACTIONS = [
  tx('tx-loan-0712', 'acc-main', '2026-07-12', -25000, 'cp-lender', 'cat-loans', 'direct_debit', 'Car finance July'),
  tx('tx-loan-0812', 'acc-main', '2026-08-12', -25000, 'cp-lender', 'cat-loans', 'direct_debit', 'Car finance August'),
  tx('tx-card-0810', 'acc-card', '2026-08-10', -2150, 'cp-superstore', 'cat-groceries', 'card_payment', 'Superstore, card'),
  tx('tx-shop-0815', 'acc-main', '2026-08-15', -6230, 'cp-superstore', 'cat-groceries', 'card_payment', 'Superstore'),
  tx('tx-salary-0825', 'acc-main', '2026-08-25', 310000, 'cp-employer', null, 'credit_transfer', 'Salary August'),
  tx('tx-shop-0902', 'acc-main', '2026-09-02', -4815, 'cp-superstore', 'cat-groceries', 'card_payment', 'Superstore'),
  // T21: in the Gym window, in the expected account, of a different amount;
  // AYQ did not match it.
  tx('tx-gym-0903', 'acc-main', '2026-09-03', -3990, 'cp-gym', 'cat-bills', 'direct_debit', 'Northside Gym'),
  tx('tx-energy-0907', 'acc-main', '2026-09-07', -12840, 'cp-energy', 'cat-bills', 'direct_debit', 'Northwind Energy advance'),
  tx('tx-isp-0908', 'acc-main', '2026-09-08', -4500, 'cp-isp', 'cat-bills', 'direct_debit', 'Fibrenet September'),
];

function record(recordKey, name, amount, options = {}) {
  return {
    recordKey,
    kind: options.kind ?? 'expense',
    name,
    ...(options.counterpartyKey !== undefined ? { counterpartyKey: options.counterpartyKey } : {}),
    category: options.kind === 'income' ? { state: 'uncategorised' } : { state: 'categorised', categoryId: options.categoryId ?? 'cat-bills' },
    amount: eur(amount),
    schedule: { type: 'recurring', frequency: 'monthly', interval: 1, anchorDate: options.anchorDate ?? '2026-01-01' },
    state: options.state ?? 'confirmed',
    stateSince: '2026-01-01',
    ...(options.account !== undefined ? { expectedAccountKey: options.account } : {}),
  };
}

/**
 * One occurrence as the producer states it. `through` and `covered` are
 * written out, never derived here; `covered` is present exactly when the
 * record has an expected account.
 */
function occurrence(recordKey, dueDate, amount, through, options = {}) {
  const expectedDate = options.movedTo ?? dueDate;
  const state = options.matchedTo !== undefined ? 'matched' : options.dismissed ? 'dismissed' : expectedDate < AS_OF ? 'overdue' : 'expected';
  return {
    occurrenceKey: `occ-${recordKey.replace(/^rec-/, '')}-${dueDate}`,
    recordKey,
    expectedDate,
    amount: eur(amount),
    state,
    ...(options.matchedTo !== undefined ? { match: { transactionKey: options.matchedTo, source: 'automatic', matchedOn: options.matchedOn ?? expectedDate } } : {}),
    automaticMatchThroughDate: through,
    ...(options.covered !== undefined ? { automaticMatchWindowCovered: options.covered } : {}),
  };
}

const RECORDS = {
  insurance: record('rec-insurance', 'Home insurance', 4200, { account: 'acc-main' }),
  gym: record('rec-gym', 'Gym membership', 3500, { account: 'acc-main', counterpartyKey: 'cp-gym' }),
  phone: record('rec-phone', 'Phone plan', 2500, { account: 'acc-card' }),
  water: record('rec-water', 'Water', 3100, { account: 'acc-savings' }),
  parking: record('rec-parking', 'Parking permit', 1800, { account: 'acc-joint' }),
  // Can't tell, cause 1: the AYQ record names no account.
  newspaper: record('rec-newspaper', 'Newspaper', 1500),
  // Can't tell, cause 2: the AYQ record names an account that is not in the
  // snapshot; P1 therefore emits no expectedAccountKey, exactly as for cause 1.
  lessons: record('rec-lessons', 'Music lessons', 6000),
  streaming: record('rec-streaming', 'Streaming', 1299, { account: 'acc-main' }),
  rent: record('rec-rent', 'Rent', 95000, { account: 'acc-main' }),
  electricity: record('rec-electricity', 'Electricity', 8000, { account: 'acc-main' }),
  internet: record('rec-internet', 'Internet', 4500, { account: 'acc-main', counterpartyKey: 'cp-isp' }),
  energy: record('rec-energy', 'Energy advance', 12000, { account: 'acc-main', counterpartyKey: 'cp-energy' }),
  loan: record('rec-loan', 'Car loan', 25000, { account: 'acc-main', counterpartyKey: 'cp-lender', categoryId: 'cat-loans' }),
  council: record('rec-council', 'Council tax', 21000, { account: 'acc-main' }),
  salary: record('rec-salary', 'Salary', 310000, { kind: 'income', account: 'acc-main', counterpartyKey: 'cp-employer' }),
  subscription: record('rec-subscription', 'Possible subscription', 999, { state: 'suggested', account: 'acc-main' }),
};

const OCCURRENCES = {
  insurance: [occurrence('rec-insurance', '2026-09-01', 4200, '2026-09-08', { covered: true })],
  gym: [occurrence('rec-gym', '2026-09-03', 3500, '2026-09-10', { covered: true })],
  phone: [occurrence('rec-phone', '2026-08-25', 2500, '2026-09-01', { covered: false })],
  water: [occurrence('rec-water', '2026-08-28', 3100, '2026-09-04', { covered: false })],
  parking: [occurrence('rec-parking', '2026-09-02', 1800, '2026-09-09', { covered: false })],
  newspaper: [occurrence('rec-newspaper', '2026-08-20', 1500, '2026-08-27')],
  lessons: [occurrence('rec-lessons', '2026-08-22', 6000, '2026-08-29')],
  streaming: [occurrence('rec-streaming', '2026-09-20', 1299, '2026-09-27', { covered: false })],
  rent: [
    // Dismissed in AYQ: never shown.
    occurrence('rec-rent', '2026-08-15', 95000, '2026-08-22', { covered: true, dismissed: true }),
    occurrence('rec-rent', '2026-09-15', 95000, '2026-09-22', { covered: false }),
  ],
  electricity: [occurrence('rec-electricity', '2026-09-10', 8000, '2026-09-17', { covered: false })],
  internet: [occurrence('rec-internet', '2026-09-08', 4500, '2026-09-15', { covered: true, matchedTo: 'tx-isp-0908' })],
  energy: [occurrence('rec-energy', '2026-09-06', 12000, '2026-09-13', { covered: true, matchedTo: 'tx-energy-0907', matchedOn: '2026-09-07' })],
  loan: [
    // An old occurrence nobody resolved: still shown, a quarter later.
    occurrence('rec-loan', '2026-06-12', 25000, '2026-06-19', { covered: true }),
    // An older Arrived: not shown.
    occurrence('rec-loan', '2026-07-12', 25000, '2026-07-19', { covered: true, matchedTo: 'tx-loan-0712' }),
    // The most recent Arrived: shown.
    occurrence('rec-loan', '2026-08-12', 25000, '2026-08-19', { covered: true, matchedTo: 'tx-loan-0812' }),
    occurrence('rec-loan', '2026-09-12', 25000, '2026-09-19', { covered: false }),
    // The next one after the basis date: shown. The one after it: not.
    occurrence('rec-loan', '2026-10-12', 25000, '2026-10-19', { covered: false }),
    occurrence('rec-loan', '2026-11-12', 25000, '2026-11-19', { covered: false }),
  ],
  // Rescheduled in AYQ from 1 September to 9 September (P1-C1): the moved
  // date is the expectedDate, the window is centred on it.
  council: [occurrence('rec-council', '2026-09-01', 21000, '2026-09-16', { covered: false, movedTo: '2026-09-09' })],
  salary: [occurrence('rec-salary', '2026-08-25', 310000, '2026-09-01', { covered: true, matchedTo: 'tx-salary-0825' })],
  subscription: [occurrence('rec-subscription', '2026-09-05', 999, '2026-09-12', { covered: true })],
};

function snapshotOf(names, { contractVersion = '1.1' } = {}) {
  const expectationRecords = names.map(name => RECORDS[name]);
  const expectedOccurrences = names.flatMap(name => OCCURRENCES[name]);
  const nonTransfer = TRANSACTIONS.filter(t => t.internalTransfer === undefined);
  const snapshot = {
    meta: {
      contractVersion,
      snapshotId: `snap-a2-${names.length}-${contractVersion}`,
      generatedAt: GENERATED_AT,
      ...(contractVersion === '1.1' ? { expectationsAsOfDate: AS_OF } : {}),
      budgetKey: 'budget-a2-synthetic',
      producer: { productVersion: '0.4.1', buildNumber: 12, commitSha: '0000000000000000000000000000000000000000' },
      currencies: ['EUR'],
      coverage: { reliabilityBoundary: '2026-09-10', reliabilityBoundaryBasis: ['acc-main'] },
      counts: {
        accounts: ACCOUNTS.length,
        transactions: TRANSACTIONS.length,
        counterparties: COUNTERPARTIES.length,
        categories: CATEGORIES.length,
        expectedOccurrences: expectedOccurrences.length,
        uncategorisedTransactions: TRANSACTIONS.filter(t => t.category.state === 'uncategorised').length,
        unresolvedCounterparties: nonTransfer.filter(t => t.counterparty.state === 'unresolved').length,
        counterpartyNotApplicable: nonTransfer.filter(t => t.counterparty.state === 'not_applicable').length,
      },
    },
    accounts: ACCOUNTS,
    counterparties: COUNTERPARTIES,
    categoryGroups: CATEGORY_GROUPS,
    categories: CATEGORIES,
    transactions: TRANSACTIONS,
    categoryPlans: [],
    expectationRecords,
    expectedOccurrences,
    forecast: {
      state: 'unavailable',
      kind: 'canonical_ayq_forecast',
      asOfDate: AS_OF,
      horizonMonths: 12,
      horizonEnd: '2027-09-15',
      basisAccountKeys: ['acc-main'],
      unavailableReason: 'available funds unknown: an account that counts has no balance anchor',
    },
  };
  if (contractVersion === '1.0') {
    // The same world as AYQ 0.4.0 would have written it: no 1.1 fact at all.
    snapshot.expectationRecords = expectationRecords.map(({ expectedAccountKey, ...rest }) => rest);
    snapshot.expectedOccurrences = expectedOccurrences.map(({ automaticMatchThroughDate, automaticMatchWindowCovered, ...rest }) => rest);
  }
  return snapshot;
}

const ALL = Object.keys(RECORDS);

const FIXTURES = {
  // S1 — all readings, the visibility cases, and what must not appear.
  's1-all-readings.json': snapshotOf(ALL),
  // S2 — contract 1.0, otherwise the same valid world, with transactions for Explore.
  's2-contract-1-0.json': snapshotOf(ALL, { contractVersion: '1.0' }),
  // S3 — no confirmed expense: one suggested expense and one expected income.
  's3-no-confirmed-expenses.json': snapshotOf(['subscription', 'salary']),
  // S4 — only Pending and Arrived.
  's4-pending-and-arrived.json': snapshotOf(['streaming', 'rent', 'electricity', 'internet', 'energy']),
};

for (const [name, snapshot] of Object.entries(FIXTURES)) {
  await writeFile(join(here, name), `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  console.log(`wrote ${name}`);
}
