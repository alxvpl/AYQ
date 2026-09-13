import type { AyqAnalyticalSnapshot, Money } from './types.js';

export class SnapshotValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotValidationError';
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new SnapshotValidationError(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertMoney(value: unknown, currencies: Set<string>, path: string): asserts value is Money {
  assert(isRecord(value), `${path} must be an object`);
  assert(Number.isInteger(value.amount), `${path}.amount must be integer minor units`);
  assert(typeof value.currency === 'string', `${path}.currency must be a string`);
  assert(currencies.has(value.currency), `${path}.currency is not declared in meta.currencies`);
}

function uniqueKeys<T>(items: T[], key: (item: T) => string, name: string): Set<string> {
  const result = new Set<string>();
  for (const item of items) {
    const value = key(item);
    assert(typeof value === 'string' && value.length > 0, `${name} contains an empty key`);
    assert(!result.has(value), `${name} contains duplicate key ${value}`);
    result.add(value);
  }
  return result;
}

export function validateSnapshot(raw: unknown): AyqAnalyticalSnapshot {
  assert(isRecord(raw), 'snapshot must be an object');
  assert(isRecord(raw.meta), 'meta is required');
  assert(typeof raw.meta.contractVersion === 'string', 'meta.contractVersion is required');
  assert(/^1\./.test(raw.meta.contractVersion), `unsupported contract major: ${raw.meta.contractVersion}`);
  assert(typeof raw.meta.snapshotId === 'string' && raw.meta.snapshotId.length > 0, 'meta.snapshotId is required');
  assert(typeof raw.meta.generatedAt === 'string' && !Number.isNaN(Date.parse(raw.meta.generatedAt)), 'meta.generatedAt must be ISO date-time');
  assert(Array.isArray(raw.meta.currencies) && raw.meta.currencies.length > 0, 'meta.currencies must be non-empty');

  const currencies = new Set<string>();
  for (const currency of raw.meta.currencies) {
    assert(typeof currency === 'string' && currency.length > 0, 'meta.currencies entries must be strings');
    currencies.add(currency);
  }

  for (const field of ['accounts', 'counterparties', 'categoryGroups', 'categories', 'transactions', 'categoryPlans', 'expectationRecords', 'expectedOccurrences']) {
    assert(Array.isArray(raw[field]), `${field} must be an array`);
  }
  assert(isRecord(raw.forecast), 'forecast must be an object');
  assert(isRecord(raw.meta.coverage), 'meta.coverage is required');
  assert(isRecord(raw.meta.counts), 'meta.counts is required');

  const snapshot = raw as unknown as AyqAnalyticalSnapshot;
  const accountKeys = uniqueKeys(snapshot.accounts, x => x.accountKey, 'accounts');
  const counterpartyKeys = uniqueKeys(snapshot.counterparties, x => x.counterpartyKey, 'counterparties');
  const categoryKeys = uniqueKeys(snapshot.categories, x => x.categoryId, 'categories');
  const transactionKeys = uniqueKeys(snapshot.transactions, x => x.transactionKey, 'transactions');
  uniqueKeys(snapshot.expectationRecords, x => x.recordKey, 'expectationRecords');
  uniqueKeys(snapshot.expectedOccurrences, x => x.occurrenceKey, 'expectedOccurrences');

  assert(snapshot.meta.counts.accounts === snapshot.accounts.length, 'meta.counts.accounts mismatch');
  assert(snapshot.meta.counts.transactions === snapshot.transactions.length, 'meta.counts.transactions mismatch');
  assert(snapshot.meta.counts.counterparties === snapshot.counterparties.length, 'meta.counts.counterparties mismatch');
  assert(snapshot.meta.counts.categories === snapshot.categories.length, 'meta.counts.categories mismatch');
  assert(snapshot.meta.counts.expectedOccurrences === snapshot.expectedOccurrences.length, 'meta.counts.expectedOccurrences mismatch');
  assert(Number.isInteger(snapshot.meta.counts.unresolvedCounterparties), 'unresolvedCounterparties count is required');
  assert(Number.isInteger(snapshot.meta.counts.counterpartyNotApplicable), 'counterpartyNotApplicable count is required');

  for (const account of snapshot.accounts) {
    assert(typeof account.name === 'string', `account ${account.accountKey} name is required`);
    assertMoney(account.openingBalance, currencies, `accounts[${account.accountKey}].openingBalance`);
    assertMoney(account.ledgerBalance, currencies, `accounts[${account.accountKey}].ledgerBalance`);
    assertMoney(account.statementCoverage?.closingBalance, currencies, `accounts[${account.accountKey}].statementCoverage.closingBalance`);
    assertMoney(account.reconciliation?.difference, currencies, `accounts[${account.accountKey}].reconciliation.difference`);
  }

  for (const transaction of snapshot.transactions) {
    assert(accountKeys.has(transaction.accountKey), `transaction ${transaction.transactionKey} references unknown account`);
    assertMoney(transaction.amount, currencies, `transactions[${transaction.transactionKey}].amount`);
    assert(typeof transaction.bookingDate === 'string', `transaction ${transaction.transactionKey} bookingDate is required`);
    if (transaction.categoryId !== null) assert(categoryKeys.has(transaction.categoryId), `transaction ${transaction.transactionKey} references unknown category`);
    if (transaction.counterpartyKey !== null) assert(counterpartyKeys.has(transaction.counterpartyKey), `transaction ${transaction.transactionKey} references unknown counterparty`);
  }

  const txByKey = new Map(snapshot.transactions.map(tx => [tx.transactionKey, tx] as const));
  const recordByKey = new Map(snapshot.expectationRecords.map(record => [record.recordKey, record] as const));

  for (const record of snapshot.expectationRecords) {
    if (record.accountKey !== null) assert(accountKeys.has(record.accountKey), `expectationRecord ${record.recordKey} references unknown account`);
    if (record.categoryId !== null) assert(categoryKeys.has(record.categoryId), `expectationRecord ${record.recordKey} references unknown category`);
    if (record.counterpartyKey !== null) assert(counterpartyKeys.has(record.counterpartyKey), `expectationRecord ${record.recordKey} references unknown counterparty`);
    assertMoney(record.amount, currencies, `expectationRecords[${record.recordKey}].amount`);
  }

  for (const occurrence of snapshot.expectedOccurrences) {
    const record = recordByKey.get(occurrence.recordKey);
    assert(record, `occurrence ${occurrence.occurrenceKey} references unknown record`);
    assertMoney(occurrence.amount, currencies, `expectedOccurrences[${occurrence.occurrenceKey}].amount`);
    if (occurrence.state === 'matched') {
      assert(occurrence.match !== null, `matched occurrence ${occurrence.occurrenceKey} is missing match`);
      const transaction = txByKey.get(occurrence.match.transactionKey);
      assert(transaction, `occurrence ${occurrence.occurrenceKey} references unknown matched transaction`);
      if (record.accountKey !== null) {
        assert(transaction.accountKey === record.accountKey, `occurrence ${occurrence.occurrenceKey} matched transaction is on a different account`);
      }
    }
  }

  assert(typeof snapshot.meta.coverage.reliabilityBoundary === 'string', 'reliabilityBoundary is required');
  assert(Array.isArray(snapshot.meta.coverage.reliabilityBoundaryBasis), 'reliabilityBoundaryBasis must be an array');
  for (const accountKey of snapshot.meta.coverage.reliabilityBoundaryBasis) {
    assert(accountKeys.has(accountKey), `reliabilityBoundaryBasis references unknown account ${accountKey}`);
    const account = snapshot.accounts.find(x => x.accountKey === accountKey)!;
    assert(account.countsTowardAvailableFunds, `reliability boundary basis account ${accountKey} does not count toward available funds`);
    assert(account.statementCoverage.lastStatementDate === snapshot.meta.coverage.reliabilityBoundary,
      `reliability boundary basis account ${accountKey} does not sit on the boundary`);
  }

  assert(snapshot.forecast.kind === 'canonical_ayq_forecast', 'forecast must be canonical_ayq_forecast');
  assert(Array.isArray(snapshot.forecast.series), 'forecast.series must be an array');
  for (const accountKey of snapshot.forecast.basisAccountKeys) {
    assert(accountKeys.has(accountKey), `forecast references unknown basis account ${accountKey}`);
  }
  assertMoney(snapshot.forecast.openingPosition, currencies, 'forecast.openingPosition');
  for (const [index, point] of snapshot.forecast.series.entries()) {
    assertMoney(point.projectedPosition, currencies, `forecast.series[${index}].projectedPosition`);
  }

  return snapshot;
}
