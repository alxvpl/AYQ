// AYQ Analyses — A1 snapshot validation.
//
// Validation completes before analytical execution. A snapshot that fails it
// produces no analytical result and no partial screen: only a bounded typed
// reason crosses the preload boundary, and the diagnostic detail is logged,
// never rendered (007 §6, r03 §4).

import { isIsoDate } from './dates.js';
import type {
  AyqAnalyticalSnapshot,
  Money,
  ReconciliationStateToken,
  TransactionClass,
} from './types.js';

/** The catalogue chooses its sentence from this code. It is never shown. */
export type SnapshotInvalidReason = 'contractMajor' | 'malformed' | 'invariant' | 'unknown';

export class SnapshotValidationError extends Error {
  readonly reason: SnapshotInvalidReason;

  constructor(reason: SnapshotInvalidReason, message: string) {
    super(message);
    this.name = 'SnapshotValidationError';
    this.reason = reason;
  }
}

const TRANSACTION_CLASSES: readonly TransactionClass[] = [
  'credit_transfer',
  'direct_debit',
  'card_payment',
  'bank_fee',
  'cash_withdrawal',
  'other',
];

const RECONCILIATION_STATES: readonly ReconciliationStateToken[] = ['agrees', 'differs'];

const CATEGORISATION_SOURCES = ['manual', 'rule', 'none'];

/** The sources that are provenance of a category that is set (r003 I14). */
const PROVENANCE_SOURCES = ['manual', 'rule'];

/**
 * The UTC representation the frozen contract requires for generatedAt (r003
 * §6.1, "RFC 3339 UTC"): a full date-time with the offset written as `Z` or
 * `+00:00`. A merely parseable local-offset instant is not that (011 §7).
 */
const RFC3339_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|\+00:00)$/;

function fail(reason: SnapshotInvalidReason, message: string): never {
  throw new SnapshotValidationError(reason, message);
}

function malformed(condition: unknown, message: string): asserts condition {
  if (!condition) fail('malformed', message);
}

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) fail('invariant', message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertMoney(value: unknown, currencies: Set<string>, path: string): asserts value is Money {
  malformed(isRecord(value), `${path} must be an object`);
  invariant(Number.isInteger(value.amount), `${path}.amount must be integer minor units`);
  invariant(
    Number.isSafeInteger(value.amount),
    `${path}.amount is outside the exactly representable integer range`,
  );
  malformed(typeof value.currency === 'string', `${path}.currency must be a string`);
  invariant(currencies.has(value.currency as string), `${path}.currency is not declared in meta.currencies`);
}

function assertDate(value: unknown, path: string): asserts value is string {
  invariant(isIsoDate(value), `${path} must be a calendar date`);
}

function uniqueKeys<T>(items: T[], key: (item: T) => string, name: string): Set<string> {
  const result = new Set<string>();
  for (const item of items) {
    const value = key(item);
    malformed(typeof value === 'string' && value.length > 0, `${name} contains an empty key`);
    invariant(!result.has(value), `${name} contains duplicate key ${value}`);
    result.add(value);
  }
  return result;
}

export function validateSnapshot(raw: unknown): AyqAnalyticalSnapshot {
  malformed(isRecord(raw), 'snapshot must be an object');
  malformed(isRecord(raw.meta), 'meta is required');
  malformed(typeof raw.meta.contractVersion === 'string', 'meta.contractVersion is required');
  if (!/^1\./.test(raw.meta.contractVersion as string)) {
    fail('contractMajor', `unsupported contract major: ${raw.meta.contractVersion}`);
  }
  malformed(
    typeof raw.meta.snapshotId === 'string' && (raw.meta.snapshotId as string).length > 0,
    'meta.snapshotId is required',
  );
  malformed(typeof raw.meta.generatedAt === 'string', 'meta.generatedAt must be a string');
  invariant(
    RFC3339_UTC.test(raw.meta.generatedAt as string) && !Number.isNaN(Date.parse(raw.meta.generatedAt as string)),
    'meta.generatedAt must be an RFC 3339 UTC date-time',
  );
  malformed(
    Array.isArray(raw.meta.currencies) && (raw.meta.currencies as unknown[]).length > 0,
    'meta.currencies must be non-empty',
  );

  const currencies = new Set<string>();
  for (const currency of raw.meta.currencies as unknown[]) {
    malformed(typeof currency === 'string' && currency.length > 0, 'meta.currencies entries must be strings');
    currencies.add(currency);
  }

  for (const field of [
    'accounts',
    'counterparties',
    'categoryGroups',
    'categories',
    'transactions',
    'categoryPlans',
    'expectationRecords',
    'expectedOccurrences',
  ]) {
    malformed(Array.isArray(raw[field]), `${field} must be an array`);
  }
  malformed(isRecord(raw.forecast), 'forecast must be an object');
  malformed(isRecord(raw.meta.coverage), 'meta.coverage is required');
  malformed(isRecord(raw.meta.counts), 'meta.counts is required');

  const snapshot = raw as unknown as AyqAnalyticalSnapshot;

  const accountKeys = uniqueKeys(snapshot.accounts, x => x.accountKey, 'accounts');
  const counterpartyKeys = uniqueKeys(snapshot.counterparties, x => x.counterpartyKey, 'counterparties');
  const categoryGroupKeys = uniqueKeys(snapshot.categoryGroups, x => x.categoryGroupId, 'categoryGroups');
  const categoryKeys = uniqueKeys(snapshot.categories, x => x.categoryId, 'categories');
  const transactionKeys = uniqueKeys(snapshot.transactions, x => x.transactionKey, 'transactions');
  uniqueKeys(snapshot.expectationRecords, x => x.recordKey, 'expectationRecords');
  uniqueKeys(snapshot.expectedOccurrences, x => x.occurrenceKey, 'expectedOccurrences');

  invariant(snapshot.meta.counts.accounts === snapshot.accounts.length, 'meta.counts.accounts mismatch');
  invariant(snapshot.meta.counts.transactions === snapshot.transactions.length, 'meta.counts.transactions mismatch');
  invariant(
    snapshot.meta.counts.counterparties === snapshot.counterparties.length,
    'meta.counts.counterparties mismatch',
  );
  invariant(snapshot.meta.counts.categories === snapshot.categories.length, 'meta.counts.categories mismatch');
  invariant(
    snapshot.meta.counts.expectedOccurrences === snapshot.expectedOccurrences.length,
    'meta.counts.expectedOccurrences mismatch',
  );
  invariant(
    Number.isInteger(snapshot.meta.counts.uncategorisedTransactions),
    'meta.counts.uncategorisedTransactions is required',
  );
  invariant(
    Number.isInteger(snapshot.meta.counts.unresolvedCounterparties),
    'meta.counts.unresolvedCounterparties is required',
  );
  invariant(
    Number.isInteger(snapshot.meta.counts.counterpartyNotApplicable),
    'meta.counts.counterpartyNotApplicable is required',
  );

  for (const category of snapshot.categories) {
    if (category.categoryGroupId !== null) {
      invariant(
        categoryGroupKeys.has(category.categoryGroupId),
        `category ${category.categoryId} references unknown category group`,
      );
    }
  }

  for (const account of snapshot.accounts) {
    const path = `accounts[${account.accountKey}]`;
    malformed(typeof account.name === 'string' && account.name.length > 0, `${path}.name is required`);
    malformed(typeof account.currency === 'string', `${path}.currency is required`);
    invariant(currencies.has(account.currency), `${path}.currency is not declared in meta.currencies`);
    assertDate(account.openingDate, `${path}.openingDate`);
    malformed(isRecord(account.statementCoverage), `${path}.statementCoverage is required`);
    assertDate(account.statementCoverage.lastStatementDate, `${path}.statementCoverage.lastStatementDate`);
    invariant(
      account.openingDate <= account.statementCoverage.lastStatementDate,
      `${path} coverage ends before it opens`,
    );
    assertMoney(account.openingBalance, currencies, `${path}.openingBalance`);
    assertMoney(account.ledgerBalance, currencies, `${path}.ledgerBalance`);
    assertMoney(account.statementCoverage.closingBalance, currencies, `${path}.statementCoverage.closingBalance`);
    // Every money field of an account is stated in that account's own currency
    // (r003 I5; 011 §7 T2.3).
    invariant(account.openingBalance.currency === account.currency, `${path}.openingBalance is not in the account currency`);
    invariant(account.ledgerBalance.currency === account.currency, `${path}.ledgerBalance is not in the account currency`);
    invariant(
      account.statementCoverage.closingBalance.currency === account.currency,
      `${path}.statementCoverage.closingBalance is not in the account currency`,
    );

    // Reconciliation is a fact carried by the snapshot, never recomputed here.
    // The frozen r003 baseline defines two states and no other, so an unknown
    // token is a validation failure rather than a third sentence on screen.
    malformed(isRecord(account.reconciliation), `${path}.reconciliation is required`);
    invariant(
      RECONCILIATION_STATES.includes(account.reconciliation.state),
      `${path}.reconciliation.state is not a state of the frozen baseline`,
    );
    assertMoney(
      account.reconciliation.ledgerBalanceAtCoverageDate,
      currencies,
      `${path}.reconciliation.ledgerBalanceAtCoverageDate`,
    );
    assertMoney(
      account.reconciliation.statementClosingBalance,
      currencies,
      `${path}.reconciliation.statementClosingBalance`,
    );
    assertMoney(account.reconciliation.difference, currencies, `${path}.reconciliation.difference`);

    const reconciliationCurrencies = new Set([
      account.currency,
      account.reconciliation.ledgerBalanceAtCoverageDate.currency,
      account.reconciliation.statementClosingBalance.currency,
      account.reconciliation.difference.currency,
    ]);
    invariant(reconciliationCurrencies.size === 1, `${path}.reconciliation is not in the account currency`);

    // Two safe integers can differ by more than a Number holds exactly, so the
    // comparison is made in bigint, never through Number subtraction (011 §6).
    const stated =
      BigInt(account.reconciliation.statementClosingBalance.amount) -
      BigInt(account.reconciliation.ledgerBalanceAtCoverageDate.amount);
    invariant(
      BigInt(account.reconciliation.difference.amount) === stated,
      `${path}.reconciliation.difference does not follow from the balances it compares`,
    );
    invariant(
      (account.reconciliation.state === 'agrees') === (account.reconciliation.difference.amount === 0),
      `${path}.reconciliation.state contradicts its difference`,
    );
  }

  const accountByKey = new Map(snapshot.accounts.map(account => [account.accountKey, account] as const));

  for (const transaction of snapshot.transactions) {
    const path = `transactions[${transaction.transactionKey}]`;
    invariant(accountKeys.has(transaction.accountKey), `${path} references unknown account`);
    assertMoney(transaction.amount, currencies, `${path}.amount`);
    // A transaction is stated in the currency of the account it sits on (r003
    // I5; 011 §7 T2.2). A EUR account carrying a USD amount is an invalid file,
    // not a multi-currency analytical state.
    invariant(
      transaction.amount.currency === accountByKey.get(transaction.accountKey)!.currency,
      `${path}.amount is not in the currency of its account`,
    );
    assertDate(transaction.bookingDate, `${path}.bookingDate`);
    if (transaction.valueDate !== null) assertDate(transaction.valueDate, `${path}.valueDate`);
    invariant(
      TRANSACTION_CLASSES.includes(transaction.transactionClass as TransactionClass),
      `${path}.transactionClass is not a class of the frozen baseline`,
    );
    if (transaction.categoryId !== null) {
      invariant(categoryKeys.has(transaction.categoryId), `${path} references unknown category`);
    }
    if (transaction.counterpartyKey !== null) {
      invariant(counterpartyKeys.has(transaction.counterpartyKey), `${path} references unknown counterparty`);
    }
    if (transaction.counterAccountKey !== null) {
      invariant(accountKeys.has(transaction.counterAccountKey), `${path} references unknown counter account`);
    }
    if (transaction.categorisation !== null) {
      malformed(isRecord(transaction.categorisation), `${path}.categorisation must be an object`);
      invariant(
        CATEGORISATION_SOURCES.includes(transaction.categorisation.source),
        `${path}.categorisation.source is not a source of the frozen baseline`,
      );
    }
    // A category that is set carries the provenance that set it, and a rule
    // names itself (r003 I14; 011 §7 T2.4). A1 shows this provenance, so its
    // absence may never read as "No category set".
    if (transaction.categoryId !== null) {
      invariant(
        transaction.categorisation !== null && PROVENANCE_SOURCES.includes(transaction.categorisation.source),
        `${path} is categorised but carries no categorisation provenance`,
      );
    }
    if (transaction.categorisation !== null && transaction.categorisation.source === 'rule') {
      invariant(
        typeof transaction.categorisation.ruleKey === 'string' && transaction.categorisation.ruleKey.length > 0,
        `${path} was categorised by a rule that is not named`,
      );
    }
    // A movement between the owner's own accounts carries neither a category
    // nor a canonical counterparty (r003 I7; 011 §7 T2.5).
    if (transaction.isInternalTransfer) {
      invariant(transaction.categoryId === null, `${path} is an internal transfer carrying a category`);
      invariant(transaction.counterpartyKey === null, `${path} is an internal transfer carrying a counterparty`);
    }

    // A reference that does not resolve is not a user-facing state: it makes
    // the snapshot invalid and it is refused before analysis (r003 §6.8).
    if (transaction.isReversal) {
      invariant(
        transaction.reversalOfTransactionKey !== null,
        `${path} is a reversal without the transaction it reverses`,
      );
    }
    if (transaction.reversalOfTransactionKey !== null) {
      invariant(
        transaction.reversalOfTransactionKey !== transaction.transactionKey,
        `${path} reverses itself`,
      );
      invariant(
        transactionKeys.has(transaction.reversalOfTransactionKey),
        `${path} reverses a transaction that is not in this snapshot`,
      );
    }
  }

  const txByKey = new Map(snapshot.transactions.map(tx => [tx.transactionKey, tx] as const));
  const recordByKey = new Map(snapshot.expectationRecords.map(record => [record.recordKey, record] as const));

  for (const record of snapshot.expectationRecords) {
    const path = `expectationRecords[${record.recordKey}]`;
    if (record.accountKey !== null) invariant(accountKeys.has(record.accountKey), `${path} references unknown account`);
    if (record.categoryId !== null) invariant(categoryKeys.has(record.categoryId), `${path} references unknown category`);
    if (record.counterpartyKey !== null) {
      invariant(counterpartyKeys.has(record.counterpartyKey), `${path} references unknown counterparty`);
    }
    assertMoney(record.amount, currencies, `${path}.amount`);
  }

  for (const occurrence of snapshot.expectedOccurrences) {
    const path = `expectedOccurrences[${occurrence.occurrenceKey}]`;
    const record = recordByKey.get(occurrence.recordKey);
    invariant(record, `${path} references unknown record`);
    assertDate(occurrence.expectedDate, `${path}.expectedDate`);
    assertMoney(occurrence.amount, currencies, `${path}.amount`);
    if (occurrence.state === 'matched') {
      invariant(occurrence.match !== null, `${path} is matched and carries no match`);
      const transaction = txByKey.get(occurrence.match.transactionKey);
      invariant(transaction, `${path} references unknown matched transaction`);
      if (record.accountKey !== null) {
        invariant(transaction.accountKey === record.accountKey, `${path} matched a transaction on another account`);
      }
    }
  }

  assertDate(snapshot.meta.coverage.reliabilityBoundary, 'meta.coverage.reliabilityBoundary');
  malformed(
    Array.isArray(snapshot.meta.coverage.reliabilityBoundaryBasis),
    'meta.coverage.reliabilityBoundaryBasis must be an array',
  );
  for (const accountKey of snapshot.meta.coverage.reliabilityBoundaryBasis) {
    invariant(accountKeys.has(accountKey), `reliabilityBoundaryBasis references unknown account ${accountKey}`);
    const account = snapshot.accounts.find(x => x.accountKey === accountKey)!;
    invariant(
      account.countsTowardAvailableFunds,
      `reliability boundary basis account ${accountKey} does not count toward available funds`,
    );
    invariant(
      account.statementCoverage.lastStatementDate === snapshot.meta.coverage.reliabilityBoundary,
      `reliability boundary basis account ${accountKey} does not sit on the boundary`,
    );
  }

  invariant(snapshot.forecast.kind === 'canonical_ayq_forecast', 'forecast must be canonical_ayq_forecast');
  malformed(Array.isArray(snapshot.forecast.series), 'forecast.series must be an array');
  malformed(Array.isArray(snapshot.forecast.basisAccountKeys), 'forecast.basisAccountKeys must be an array');
  for (const accountKey of snapshot.forecast.basisAccountKeys) {
    invariant(accountKeys.has(accountKey), `forecast references unknown basis account ${accountKey}`);
  }
  assertMoney(snapshot.forecast.openingPosition, currencies, 'forecast.openingPosition');
  for (const [index, point] of snapshot.forecast.series.entries()) {
    assertDate(point.date, `forecast.series[${index}].date`);
    assertMoney(point.projectedPosition, currencies, `forecast.series[${index}].projectedPosition`);
  }

  return snapshot;
}

/** Parses and validates, returning the bounded reason rather than raw detail. */
export function parseAndValidateSnapshot(
  text: string,
): { ok: true; snapshot: AyqAnalyticalSnapshot } | { ok: false; reason: SnapshotInvalidReason; detail: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { ok: false, reason: 'malformed', detail: error instanceof Error ? error.message : String(error) };
  }
  try {
    return { ok: true, snapshot: validateSnapshot(parsed) };
  } catch (error) {
    if (error instanceof SnapshotValidationError) {
      return { ok: false, reason: error.reason, detail: error.message };
    }
    return { ok: false, reason: 'unknown', detail: error instanceof Error ? error.message : String(error) };
  }
}
