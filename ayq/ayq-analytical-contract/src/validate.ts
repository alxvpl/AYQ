// The one runtime validator of the analytical snapshot contract 1.0.
//
// Every rule of 016 §5–§7 as corrected by 017 PC1–PC3 is a check here, with a
// stable machine-readable issue code and path. There is no second schema: a
// JSON Schema, if one is ever wanted, is generated from this or proven
// equivalent, never maintained beside it (016 §8).
//
// What this validator can and cannot prove about minimisation (016 §5.6): it
// refuses every forbidden raw-identifier field name anywhere in the object,
// including under unknown additive fields of a later 1.x, and it refuses an
// evidence text that carries an obvious full IBAN. It cannot prove that an
// arbitrary string is free of every excluded identifier; that remains the
// producer's provenance obligation under 03 §13.8.

import type {
  AbsoluteBalance,
  Account,
  AnalyticalSnapshotV1,
  CanonicalForecast,
  Category,
  CategoryGroup,
  CategoryPlan,
  CategorySource,
  Counterparty,
  ExpectationCategory,
  ExpectationRecord,
  ExpectedOccurrence,
  ForecastPoint,
  IsoDate,
  Money,
  Reconciliation,
  Schedule,
  SnapshotMeta,
  Transaction,
  TransactionCategory,
  TransactionCounterparty,
} from './types.js';

export const CONTRACT_MAJOR = 1;
export const CONTRACT_MINOR = 0;

/** One violation: where, which rule, and a sentence for a log — never for a screen. */
export interface ContractIssue {
  path: string;
  code: string;
  message: string;
}

export class ContractValidationError extends Error {
  readonly issues: readonly ContractIssue[];
  constructor(issues: ContractIssue[]) {
    const first = issues[0];
    super(first ? `${first.code} at ${first.path}: ${first.message}` : 'invalid snapshot');
    this.name = 'ContractValidationError';
    this.issues = issues;
  }
}

/**
 * Field names that must not appear anywhere in a snapshot, at any depth,
 * compared case-insensitively (016 §7; 03 §13.8). Full bank identifiers,
 * raw bank text, Actual internal storage and the legacy transfer/descriptor
 * fields of the r003 shape.
 */
export const FORBIDDEN_KEYS: readonly string[] = [
  'iban',
  'counterpartyiban',
  'ownerIban',
  'mandate',
  'mandateid',
  'mndtid',
  'endtoendid',
  'acctsvcrref',
  'accountservicerreference',
  'bic',
  'bktxcd',
  'banktransactioncode',
  'description',
  'rawdescription',
  'bankdescription',
  'importedpayee',
  'imported_payee',
  'importedid',
  'imported_id',
  'actualid',
  'actual_id',
  'payeeid',
  'payee_id',
  'transferid',
  'transfer_id',
  'notes',
  'sortorder',
  'sort_order',
  'startingbalanceflag',
  'starting_balance_flag',
  'knowndescriptors',
  'istransfer',
  'transferpairkey',
  'provenance',
  'store',
].map(key => key.toLowerCase());

const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const RFC3339_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|\+00:00)$/;
const CURRENCY = /^[A-Z]{3}$/;
const VERSION = /^(\d+)\.(\d+)$/;
/** Country code, the ellipsis, the final four: `NL…0708`. */
const MASKED_IDENTIFIER = /^[A-Z]{2}…[A-Z0-9]{4}$/;
/** An obvious full IBAN, spaces removed: two letters, two digits, 11–30 more. */
const IBAN_LIKE = /[A-Z]{2}\d{2}[A-Z0-9]{11,30}/;
const EVIDENCE_MAX_CODE_POINTS = 256;
const UNAVAILABLE_REASON_MAX = 128;
const MATCH_SOURCE_MAX = 64;

const TRANSACTION_CLASSES = new Set(['credit_transfer', 'direct_debit', 'card_payment', 'bank_fee', 'cash_withdrawal', 'other']);
const ACCOUNT_TYPES = new Set(['current', 'savings', 'unknown', 'other']);
const CATEGORY_SOURCES = new Set(['manual', 'learned_rule', 'automatic']);
const OCCURRENCE_STATES = new Set(['expected', 'matched', 'overdue', 'dismissed']);
const FREQUENCIES = new Set(['weekly', 'monthly', 'yearly']);

type Rec = Record<string, unknown>;

function isRecord(value: unknown): value is Rec {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

class Checker {
  readonly issues: ContractIssue[] = [];

  fail(path: string, code: string, message: string): void {
    this.issues.push({ path, code, message });
  }

  record(value: unknown, path: string): Rec | null {
    if (isRecord(value)) return value;
    this.fail(path, 'not_object', 'expected an object');
    return null;
  }

  array(value: unknown, path: string): unknown[] | null {
    if (Array.isArray(value)) return value;
    this.fail(path, 'not_array', 'expected an array');
    return null;
  }

  string(value: unknown, path: string, nonEmpty = true): string | null {
    if (typeof value !== 'string') {
      this.fail(path, 'not_string', 'expected a string');
      return null;
    }
    if (nonEmpty && value.trim() === '') {
      this.fail(path, 'empty_string', 'must not be empty');
      return null;
    }
    return value;
  }

  boolean(value: unknown, path: string): boolean | null {
    if (typeof value !== 'boolean') {
      this.fail(path, 'not_boolean', 'expected a boolean');
      return null;
    }
    return value;
  }

  date(value: unknown, path: string): IsoDate | null {
    const text = this.string(value, path);
    if (text === null) return null;
    if (!DATE.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`)) || new Date(`${text}T00:00:00Z`).toISOString().slice(0, 10) !== text) {
      this.fail(path, 'not_date', 'expected a calendar date YYYY-MM-DD');
      return null;
    }
    return text;
  }

  month(value: unknown, path: string): string | null {
    const text = this.string(value, path);
    if (text === null) return null;
    if (!MONTH.test(text)) {
      this.fail(path, 'not_month', 'expected a month YYYY-MM');
      return null;
    }
    return text;
  }

  oneOf<T extends string>(value: unknown, path: string, allowed: Set<string>): T | null {
    const text = this.string(value, path);
    if (text === null) return null;
    if (!allowed.has(text)) {
      this.fail(path, 'not_allowed', `expected one of ${[...allowed].join(', ')}`);
      return null;
    }
    return text as T;
  }

  money(value: unknown, path: string, currency?: string): Money | null {
    const rec = this.record(value, path);
    if (rec === null) return null;
    let ok = true;
    if (typeof rec.amount !== 'number' || !Number.isSafeInteger(rec.amount)) {
      this.fail(`${path}.amount`, 'not_safe_integer', 'amount must be a safe integer of minor units');
      ok = false;
    }
    if (typeof rec.currency !== 'string' || !CURRENCY.test(rec.currency)) {
      this.fail(`${path}.currency`, 'not_currency', 'currency must be ISO 4217 alpha-3, upper case');
      ok = false;
    } else if (currency !== undefined && rec.currency !== currency) {
      this.fail(`${path}.currency`, 'currency_mismatch', `expected ${currency}`);
      ok = false;
    }
    return ok ? { amount: rec.amount as number, currency: rec.currency as string } : null;
  }
}

// ---- the recursive forbidden-key scan --------------------------------------------

function scanForbiddenKeys(value: unknown, path: string, checker: Checker, depth = 0): void {
  if (depth > 64) return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanForbiddenKeys(item, `${path}[${index}]`, checker, depth + 1));
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.includes(key.toLowerCase())) {
      checker.fail(`${path}.${key}`, 'forbidden_key', 'a field this contract excludes (03 §13.8)');
    }
    scanForbiddenKeys(child, `${path}.${key}`, checker, depth + 1);
  }
}

// ---- version -----------------------------------------------------------------------

export function parseContractVersion(text: unknown): { major: number; minor: number } | null {
  if (typeof text !== 'string') return null;
  const match = VERSION.exec(text);
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]) };
}

// ---- sections --------------------------------------------------------------------

function validateMeta(raw: unknown, c: Checker): SnapshotMeta | null {
  const meta = c.record(raw, 'meta');
  if (meta === null) return null;
  const contractVersion = c.string(meta.contractVersion, 'meta.contractVersion');
  const snapshotId = c.string(meta.snapshotId, 'meta.snapshotId');
  const generatedAt = c.string(meta.generatedAt, 'meta.generatedAt');
  if (generatedAt !== null && (!RFC3339_UTC.test(generatedAt) || Number.isNaN(Date.parse(generatedAt)))) {
    c.fail('meta.generatedAt', 'not_rfc3339_utc', 'expected an RFC 3339 UTC timestamp');
  }
  const budgetKey = c.string(meta.budgetKey, 'meta.budgetKey');
  const producer = c.record(meta.producer, 'meta.producer');
  let producerInfo = null;
  if (producer !== null) {
    const productVersion = c.string(producer.productVersion, 'meta.producer.productVersion');
    const commitSha = c.string(producer.commitSha, 'meta.producer.commitSha');
    if (typeof producer.buildNumber !== 'number' || !Number.isSafeInteger(producer.buildNumber) || producer.buildNumber < 0) {
      c.fail('meta.producer.buildNumber', 'not_integer', 'expected a non-negative integer');
    } else if (productVersion !== null && commitSha !== null) {
      producerInfo = { productVersion, buildNumber: producer.buildNumber, commitSha };
    }
  }
  const currencies = c.array(meta.currencies, 'meta.currencies');
  const currencyList: string[] = [];
  if (currencies !== null) {
    currencies.forEach((entry, index) => {
      if (typeof entry !== 'string' || !CURRENCY.test(entry)) {
        c.fail(`meta.currencies[${index}]`, 'not_currency', 'expected ISO 4217 alpha-3');
      } else if (currencyList.includes(entry)) {
        c.fail(`meta.currencies[${index}]`, 'duplicate', 'currencies must be unique');
      } else currencyList.push(entry);
    });
  }
  const coverage = c.record(meta.coverage, 'meta.coverage');
  let coverageMeta = null;
  if (coverage !== null) {
    const basis = c.array(coverage.reliabilityBoundaryBasis, 'meta.coverage.reliabilityBoundaryBasis');
    const basisKeys: string[] = [];
    basis?.forEach((key, index) => {
      const text = c.string(key, `meta.coverage.reliabilityBoundaryBasis[${index}]`);
      if (text !== null) basisKeys.push(text);
    });
    let boundary: string | undefined;
    if (coverage.reliabilityBoundary !== undefined) {
      boundary = c.date(coverage.reliabilityBoundary, 'meta.coverage.reliabilityBoundary') ?? undefined;
    }
    coverageMeta = { ...(boundary !== undefined ? { reliabilityBoundary: boundary } : {}), reliabilityBoundaryBasis: basisKeys };
  }
  const counts = c.record(meta.counts, 'meta.counts');
  const countValues: Record<string, number> = {};
  const countNames = [
    'accounts',
    'transactions',
    'counterparties',
    'categories',
    'expectedOccurrences',
    'uncategorisedTransactions',
    'unresolvedCounterparties',
    'counterpartyNotApplicable',
  ];
  if (counts !== null) {
    for (const name of countNames) {
      const value = counts[name];
      if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
        c.fail(`meta.counts.${name}`, 'not_integer', 'expected a non-negative integer');
      } else countValues[name] = value;
    }
  }
  if (
    contractVersion === null ||
    snapshotId === null ||
    generatedAt === null ||
    budgetKey === null ||
    producerInfo === null ||
    coverageMeta === null ||
    Object.keys(countValues).length !== countNames.length
  ) {
    return null;
  }
  return {
    contractVersion,
    snapshotId,
    generatedAt,
    budgetKey,
    producer: producerInfo,
    currencies: currencyList,
    coverage: coverageMeta,
    counts: countValues as unknown as SnapshotMeta['counts'],
  };
}

function validateAccount(raw: unknown, path: string, c: Checker): Account | null {
  const rec = c.record(raw, path);
  if (rec === null) return null;
  const accountKey = c.string(rec.accountKey, `${path}.accountKey`);
  const name = c.string(rec.name, `${path}.name`);
  const type = c.oneOf<Account['type']>(rec.type, `${path}.type`, ACCOUNT_TYPES);
  const displayIdentifier = c.string(rec.displayIdentifier, `${path}.displayIdentifier`);
  if (displayIdentifier !== null && !MASKED_IDENTIFIER.test(displayIdentifier)) {
    c.fail(`${path}.displayIdentifier`, 'not_masked', 'expected the country code, an ellipsis and the final four only');
  }
  const counts = c.boolean(rec.countsTowardAvailableFunds, `${path}.countsTowardAvailableFunds`);
  const currency = c.string(rec.currency, `${path}.currency`);
  if (currency !== null && !CURRENCY.test(currency)) c.fail(`${path}.currency`, 'not_currency', 'ISO 4217 alpha-3');
  const money = (value: unknown, sub: string): Money | null => c.money(value, `${path}.${sub}`, currency ?? undefined);

  const coverage = c.record(rec.statementCoverage, `${path}.statementCoverage`);
  let statementCoverage: Account['statementCoverage'] | null = null;
  if (coverage !== null) {
    const lastStatementDate = c.date(coverage.lastStatementDate, `${path}.statementCoverage.lastStatementDate`);
    let coverageStartDate: string | undefined;
    if (coverage.coverageStartDate !== undefined) {
      coverageStartDate = c.date(coverage.coverageStartDate, `${path}.statementCoverage.coverageStartDate`) ?? undefined;
      if (coverageStartDate !== undefined && lastStatementDate !== null && coverageStartDate > lastStatementDate) {
        c.fail(`${path}.statementCoverage.coverageStartDate`, 'start_after_end', 'coverageStartDate must not be after lastStatementDate');
      }
    }
    let bankClosingBalance: Money | undefined;
    if (coverage.bankClosingBalance !== undefined) {
      bankClosingBalance = money(coverage.bankClosingBalance, 'statementCoverage.bankClosingBalance') ?? undefined;
    }
    if (lastStatementDate !== null) {
      statementCoverage = {
        ...(coverageStartDate !== undefined ? { coverageStartDate } : {}),
        lastStatementDate,
        ...(bankClosingBalance !== undefined ? { bankClosingBalance } : {}),
      };
    }
  }

  const balance = c.record(rec.absoluteBalance, `${path}.absoluteBalance`);
  let absoluteBalance: AbsoluteBalance | null = null;
  if (balance !== null) {
    if (balance.state === 'known') {
      const amount = money(balance.amount, 'absoluteBalance.amount');
      if (amount !== null) absoluteBalance = { state: 'known', amount };
    } else if (balance.state === 'unknown') {
      if (balance.amount !== undefined) c.fail(`${path}.absoluteBalance.amount`, 'unexpected', 'an unknown balance carries no amount');
      absoluteBalance = { state: 'unknown' };
    } else c.fail(`${path}.absoluteBalance.state`, 'not_allowed', 'expected known or unknown');
  }

  const recon = c.record(rec.reconciliation, `${path}.reconciliation`);
  let reconciliation: Reconciliation | null = null;
  if (recon !== null) {
    if (recon.state === 'unavailable') {
      reconciliation = { state: 'unavailable' };
      if (statementCoverage?.bankClosingBalance !== undefined) {
        c.fail(`${path}.statementCoverage.bankClosingBalance`, 'closing_with_unavailable', 'bankClosingBalance is absent exactly when reconciliation is unavailable');
      }
    } else if (recon.state === 'agrees' || recon.state === 'differs') {
      const ledger = money(recon.ledgerBalanceAtCoverageDate, 'reconciliation.ledgerBalanceAtCoverageDate');
      const difference = money(recon.difference, 'reconciliation.difference');
      const closing = statementCoverage?.bankClosingBalance;
      if (closing === undefined) {
        c.fail(`${path}.statementCoverage.bankClosingBalance`, 'closing_missing', `${recon.state} requires bankClosingBalance`);
      } else if (ledger !== null && difference !== null) {
        if (closing.amount - ledger.amount !== difference.amount) {
          c.fail(`${path}.reconciliation.difference`, 'difference_wrong', 'difference must equal bankClosingBalance − ledgerBalanceAtCoverageDate');
        }
        if (recon.state === 'agrees' && difference.amount !== 0) c.fail(`${path}.reconciliation.difference`, 'agrees_nonzero', 'agrees requires a zero difference');
        if (recon.state === 'differs' && difference.amount === 0) c.fail(`${path}.reconciliation.difference`, 'differs_zero', 'differs requires a non-zero difference');
        reconciliation = { state: recon.state, ledgerBalanceAtCoverageDate: ledger, difference };
      }
    } else c.fail(`${path}.reconciliation.state`, 'not_allowed', 'expected unavailable, agrees or differs');
  }

  for (const legacy of ['openingDate', 'openingBalance', 'ledgerBalance']) {
    if (rec[legacy] !== undefined) c.fail(`${path}.${legacy}`, 'not_in_contract', `${legacy} is not a 1.0 field`);
  }

  if (
    accountKey === null || name === null || type === null || displayIdentifier === null || counts === null ||
    currency === null || statementCoverage === null || absoluteBalance === null || reconciliation === null
  ) return null;
  return { accountKey, name, type, displayIdentifier, countsTowardAvailableFunds: counts, currency, statementCoverage, absoluteBalance, reconciliation };
}

function validateEvidenceText(value: unknown, path: string, c: Checker): string | null {
  const text = c.string(value, path, false);
  if (text === null) return null;
  if (/[\r\n]/.test(text)) c.fail(path, 'line_break', 'evidenceText must not contain a line break');
  if ([...text].length > EVIDENCE_MAX_CODE_POINTS) c.fail(path, 'too_long', `evidenceText exceeds ${EVIDENCE_MAX_CODE_POINTS} code points`);
  if (IBAN_LIKE.test(text.replace(/\s+/g, '').toUpperCase())) c.fail(path, 'iban_leak', 'evidenceText carries an obvious full IBAN');
  return text;
}

function validateTransaction(
  raw: unknown,
  path: string,
  c: Checker,
  accounts: Map<string, Account>,
  counterparties: Set<string>,
  categories: Set<string>,
): Transaction | null {
  const rec = c.record(raw, path);
  if (rec === null) return null;
  const transactionKey = c.string(rec.transactionKey, `${path}.transactionKey`);
  const accountKey = c.string(rec.accountKey, `${path}.accountKey`);
  const account = accountKey !== null ? accounts.get(accountKey) : undefined;
  if (accountKey !== null && account === undefined) c.fail(`${path}.accountKey`, 'unresolved_reference', 'accountKey does not resolve');
  const bookingDate = c.date(rec.bookingDate, `${path}.bookingDate`);
  const amount = c.money(rec.amount, `${path}.amount`, account?.currency);
  const transactionClass = c.oneOf<Transaction['transactionClass']>(rec.transactionClass, `${path}.transactionClass`, TRANSACTION_CLASSES);

  const cp = c.record(rec.counterparty, `${path}.counterparty`);
  let counterparty: TransactionCounterparty | null = null;
  if (cp !== null) {
    if (cp.state === 'identified') {
      const key = c.string(cp.counterpartyKey, `${path}.counterparty.counterpartyKey`);
      if (key !== null && !counterparties.has(key)) c.fail(`${path}.counterparty.counterpartyKey`, 'unresolved_reference', 'counterpartyKey does not resolve');
      if (key !== null) counterparty = { state: 'identified', counterpartyKey: key };
    } else if (cp.state === 'not_applicable' || cp.state === 'unresolved') {
      if (cp.counterpartyKey !== undefined) c.fail(`${path}.counterparty.counterpartyKey`, 'unexpected', `${cp.state} carries no counterpartyKey`);
      counterparty = { state: cp.state };
    } else c.fail(`${path}.counterparty.state`, 'not_allowed', 'expected identified, not_applicable or unresolved');
  }
  if (transactionClass === 'cash_withdrawal' && counterparty !== null && counterparty.state !== 'not_applicable') {
    c.fail(`${path}.counterparty.state`, 'cash_withdrawal_counterparty', 'a cash withdrawal has no counterparty by nature (03 §3.2)');
  }

  const cat = c.record(rec.category, `${path}.category`);
  let category: TransactionCategory | null = null;
  if (cat !== null) {
    if (cat.state === 'categorised') {
      const categoryId = c.string(cat.categoryId, `${path}.category.categoryId`);
      if (categoryId !== null && !categories.has(categoryId)) c.fail(`${path}.category.categoryId`, 'unresolved_reference', 'categoryId does not resolve');
      const source = c.oneOf<CategorySource>(cat.source, `${path}.category.source`, CATEGORY_SOURCES);
      let ruleKey: string | undefined;
      if (source === 'learned_rule') {
        ruleKey = c.string(cat.ruleKey, `${path}.category.ruleKey`) ?? undefined;
      } else if (cat.ruleKey !== undefined) {
        c.fail(`${path}.category.ruleKey`, 'unexpected', 'only a learned rule names a ruleKey');
      }
      if (categoryId !== null && source !== null && (source !== 'learned_rule' || ruleKey !== undefined)) {
        category = { state: 'categorised', categoryId, source, ...(ruleKey !== undefined ? { ruleKey } : {}) };
      }
    } else if (cat.state === 'uncategorised' || cat.state === 'not_applicable') {
      for (const extra of ['categoryId', 'source', 'ruleKey']) {
        if (cat[extra] !== undefined) c.fail(`${path}.category.${extra}`, 'unexpected', `${cat.state} carries no ${extra}`);
      }
      category = { state: cat.state };
    } else c.fail(`${path}.category.state`, 'not_allowed', 'expected categorised, uncategorised or not_applicable');
  }

  let internalTransfer: Transaction['internalTransfer'];
  if (rec.internalTransfer !== undefined) {
    const it = c.record(rec.internalTransfer, `${path}.internalTransfer`);
    if (it !== null) {
      const pairKey = c.string(it.pairKey, `${path}.internalTransfer.pairKey`);
      const counterAccountKey = c.string(it.counterAccountKey, `${path}.internalTransfer.counterAccountKey`);
      if (counterAccountKey !== null && !accounts.has(counterAccountKey)) c.fail(`${path}.internalTransfer.counterAccountKey`, 'unresolved_reference', 'counterAccountKey does not resolve');
      if (counterAccountKey !== null && counterAccountKey === accountKey) c.fail(`${path}.internalTransfer.counterAccountKey`, 'same_account', 'a transfer moves money to a different account');
      if (pairKey !== null && counterAccountKey !== null) internalTransfer = { pairKey, counterAccountKey };
    }
    if (category !== null && category.state !== 'not_applicable') c.fail(`${path}.category.state`, 'transfer_categorised', 'an internal transfer carries no ordinary spending category');
  } else if (category !== null && category.state === 'not_applicable') {
    c.fail(`${path}.category.state`, 'not_applicable_without_transfer', 'category not_applicable is reserved for internal transfers');
  }

  let reversal: Transaction['reversal'];
  if (rec.reversal !== undefined) {
    const rv = c.record(rec.reversal, `${path}.reversal`);
    if (rv !== null) {
      const original = c.string(rv.originalTransactionKey, `${path}.reversal.originalTransactionKey`);
      if (original !== null) reversal = { originalTransactionKey: original };
    }
  }

  for (const legacy of ['valueDate', 'evidenceClass', 'counterpartyKey', 'categoryId', 'categorisation', 'isInternalTransfer', 'internalTransferPairKey', 'counterAccountKey', 'isReversal', 'reversalOfTransactionKey']) {
    if (rec[legacy] !== undefined) c.fail(`${path}.${legacy}`, 'not_in_contract', `${legacy} is not a 1.0 field`);
  }

  const evidenceText = validateEvidenceText(rec.evidenceText, `${path}.evidenceText`, c);

  if (transactionKey === null || accountKey === null || bookingDate === null || amount === null || transactionClass === null || counterparty === null || category === null || evidenceText === null) return null;
  return {
    transactionKey,
    accountKey,
    bookingDate,
    amount,
    transactionClass,
    counterparty,
    category,
    ...(internalTransfer !== undefined ? { internalTransfer } : {}),
    ...(reversal !== undefined ? { reversal } : {}),
    evidenceText,
  };
}

function validateExpectationCategory(raw: unknown, path: string, c: Checker, categories: Set<string>): ExpectationCategory | null {
  const rec = c.record(raw, path);
  if (rec === null) return null;
  if (rec.state === 'categorised') {
    const categoryId = c.string(rec.categoryId, `${path}.categoryId`);
    if (categoryId !== null && !categories.has(categoryId)) c.fail(`${path}.categoryId`, 'unresolved_reference', 'categoryId does not resolve');
    return categoryId === null ? null : { state: 'categorised', categoryId };
  }
  if (rec.state === 'uncategorised') {
    if (rec.categoryId !== undefined) c.fail(`${path}.categoryId`, 'unexpected', 'uncategorised carries no categoryId');
    return { state: 'uncategorised' };
  }
  c.fail(`${path}.state`, 'not_allowed', 'expected categorised or uncategorised');
  return null;
}

function validateSchedule(raw: unknown, path: string, c: Checker): Schedule | null {
  const rec = c.record(raw, path);
  if (rec === null) return null;
  if (rec.type === 'one_time') {
    const date = c.date(rec.date, `${path}.date`);
    for (const extra of ['frequency', 'interval', 'anchorDate']) {
      if (rec[extra] !== undefined) c.fail(`${path}.${extra}`, 'unexpected', 'a one-time payment has a date, not a recurrence');
    }
    return date === null ? null : { type: 'one_time', date };
  }
  if (rec.type === 'recurring') {
    const frequency = c.oneOf<'weekly' | 'monthly' | 'yearly'>(rec.frequency, `${path}.frequency`, FREQUENCIES);
    const anchorDate = c.date(rec.anchorDate, `${path}.anchorDate`);
    if (typeof rec.interval !== 'number' || !Number.isSafeInteger(rec.interval) || rec.interval < 1) {
      c.fail(`${path}.interval`, 'not_positive_integer', 'interval must be a positive integer');
      return null;
    }
    if (rec.date !== undefined) c.fail(`${path}.date`, 'unexpected', 'a recurring series has an anchorDate, not a date');
    return frequency === null || anchorDate === null ? null : { type: 'recurring', frequency, interval: rec.interval, anchorDate };
  }
  c.fail(`${path}.type`, 'not_allowed', 'expected one_time or recurring');
  return null;
}

function validateForecast(raw: unknown, c: Checker, accounts: Map<string, Account>): CanonicalForecast | null {
  const rec = c.record(raw, 'forecast');
  if (rec === null) return null;
  if (rec.kind !== 'canonical_ayq_forecast') c.fail('forecast.kind', 'not_allowed', 'expected canonical_ayq_forecast');
  const asOfDate = c.date(rec.asOfDate, 'forecast.asOfDate');
  const horizonEnd = c.date(rec.horizonEnd, 'forecast.horizonEnd');
  if (rec.horizonMonths !== 12) c.fail('forecast.horizonMonths', 'not_allowed', 'horizonMonths is 12 in 1.0');
  const basis = c.array(rec.basisAccountKeys, 'forecast.basisAccountKeys');
  const basisAccountKeys: string[] = [];
  basis?.forEach((key, index) => {
    const text = c.string(key, `forecast.basisAccountKeys[${index}]`);
    if (text === null) return;
    if (!accounts.has(text)) c.fail(`forecast.basisAccountKeys[${index}]`, 'unresolved_reference', 'basis account does not resolve');
    basisAccountKeys.push(text);
  });
  if (asOfDate !== null && horizonEnd !== null && horizonEnd < asOfDate) c.fail('forecast.horizonEnd', 'horizon_before_start', 'horizonEnd must not precede asOfDate');

  if (rec.state === 'available') {
    const currency = c.string(rec.currency, 'forecast.currency');
    if (currency !== null && !CURRENCY.test(currency)) c.fail('forecast.currency', 'not_currency', 'ISO 4217 alpha-3');
    const openingPosition = c.money(rec.openingPosition, 'forecast.openingPosition', currency ?? undefined);
    const series = c.array(rec.series, 'forecast.series');
    const points: ForecastPoint[] = [];
    let previous: string | null = null;
    series?.forEach((point, index) => {
      const p = c.record(point, `forecast.series[${index}]`);
      if (p === null) return;
      const date = c.date(p.date, `forecast.series[${index}].date`);
      const projectedPosition = c.money(p.projectedPosition, `forecast.series[${index}].projectedPosition`, currency ?? undefined);
      if (date === null || projectedPosition === null) return;
      if (previous !== null && date <= previous) c.fail(`forecast.series[${index}].date`, 'not_ordered', 'series dates must strictly increase');
      if (asOfDate !== null && date < asOfDate) c.fail(`forecast.series[${index}].date`, 'before_as_of', 'series point precedes asOfDate');
      if (horizonEnd !== null && date > horizonEnd) c.fail(`forecast.series[${index}].date`, 'after_horizon', 'series point exceeds horizonEnd');
      previous = date;
      points.push({ date, projectedPosition });
    });
    if (rec.unavailableReason !== undefined) c.fail('forecast.unavailableReason', 'unexpected', 'an available forecast carries no reason');
    if (asOfDate === null || horizonEnd === null || currency === null || openingPosition === null) return null;
    return { state: 'available', kind: 'canonical_ayq_forecast', asOfDate, horizonMonths: 12, horizonEnd, currency, basisAccountKeys, openingPosition, series: points };
  }
  if (rec.state === 'unavailable') {
    const reason = c.string(rec.unavailableReason, 'forecast.unavailableReason');
    if (reason !== null && reason.length > UNAVAILABLE_REASON_MAX) c.fail('forecast.unavailableReason', 'too_long', `at most ${UNAVAILABLE_REASON_MAX} characters`);
    for (const extra of ['series', 'openingPosition', 'currency']) {
      if (rec[extra] !== undefined) c.fail(`forecast.${extra}`, 'unexpected', 'an unavailable forecast carries no result');
    }
    if (asOfDate === null || horizonEnd === null || reason === null) return null;
    return { state: 'unavailable', kind: 'canonical_ayq_forecast', asOfDate, horizonMonths: 12, horizonEnd, basisAccountKeys, unavailableReason: reason };
  }
  c.fail('forecast.state', 'not_allowed', 'expected available or unavailable');
  return null;
}

// ---- the whole ---------------------------------------------------------------------

/**
 * Validates an unknown value as a contract 1.x snapshot and returns the typed
 * 1.0 result, or throws ContractValidationError with every issue found.
 */
export function validateAnalyticalSnapshot(input: unknown): AnalyticalSnapshotV1 {
  const c = new Checker();
  const root = c.record(input, '$');
  if (root === null) throw new ContractValidationError(c.issues);

  // Version first: a snapshot this reader cannot read is refused before its
  // content is interpreted (016 §6).
  const meta = isRecord(root.meta) ? root.meta : null;
  const version = parseContractVersion(meta?.contractVersion);
  if (version === null) {
    c.fail('meta.contractVersion', 'not_version', 'expected major.minor');
    throw new ContractValidationError(c.issues);
  }
  if (version.major !== CONTRACT_MAJOR) {
    c.fail('meta.contractVersion', version.major > CONTRACT_MAJOR ? 'major_too_new' : 'major_too_old', `this reader understands major ${CONTRACT_MAJOR}`);
    throw new ContractValidationError(c.issues);
  }

  // The recursive minimisation gate runs over the raw input, so a later minor
  // cannot smuggle an excluded identifier through an unknown field (016 §6–§7).
  scanForbiddenKeys(root, '$', c);

  const snapshotMeta = validateMeta(root.meta, c);

  const accountList = c.array(root.accounts, 'accounts') ?? [];
  const accounts = new Map<string, Account>();
  accountList.forEach((raw, index) => {
    const account = validateAccount(raw, `accounts[${index}]`, c);
    if (account === null) return;
    if (accounts.has(account.accountKey)) c.fail(`accounts[${index}].accountKey`, 'duplicate', 'accountKey must be unique');
    else accounts.set(account.accountKey, account);
  });

  const counterpartyList = c.array(root.counterparties, 'counterparties') ?? [];
  const counterparties = new Map<string, Counterparty>();
  counterpartyList.forEach((raw, index) => {
    const rec = c.record(raw, `counterparties[${index}]`);
    if (rec === null) return;
    const counterpartyKey = c.string(rec.counterpartyKey, `counterparties[${index}].counterpartyKey`);
    const displayName = c.string(rec.displayName, `counterparties[${index}].displayName`);
    if (rec.evidenceClass !== undefined) c.fail(`counterparties[${index}].evidenceClass`, 'not_in_contract', 'evidenceClass is not a 1.0 field');
    if (counterpartyKey === null || displayName === null) return;
    if (counterparties.has(counterpartyKey)) c.fail(`counterparties[${index}].counterpartyKey`, 'duplicate', 'counterpartyKey must be unique');
    else counterparties.set(counterpartyKey, { counterpartyKey, displayName });
  });

  const groupList = c.array(root.categoryGroups, 'categoryGroups') ?? [];
  const groups = new Map<string, CategoryGroup>();
  groupList.forEach((raw, index) => {
    const rec = c.record(raw, `categoryGroups[${index}]`);
    if (rec === null) return;
    const categoryGroupId = c.string(rec.categoryGroupId, `categoryGroups[${index}].categoryGroupId`);
    const name = c.string(rec.name, `categoryGroups[${index}].name`);
    if (categoryGroupId === null || name === null) return;
    if (groups.has(categoryGroupId)) c.fail(`categoryGroups[${index}].categoryGroupId`, 'duplicate', 'categoryGroupId must be unique');
    else groups.set(categoryGroupId, { categoryGroupId, name });
  });

  const categoryList = c.array(root.categories, 'categories') ?? [];
  const categories = new Map<string, Category>();
  categoryList.forEach((raw, index) => {
    const rec = c.record(raw, `categories[${index}]`);
    if (rec === null) return;
    const categoryId = c.string(rec.categoryId, `categories[${index}].categoryId`);
    const name = c.string(rec.name, `categories[${index}].name`);
    const categoryGroupId = c.string(rec.categoryGroupId, `categories[${index}].categoryGroupId`);
    if (categoryGroupId !== null && !groups.has(categoryGroupId)) c.fail(`categories[${index}].categoryGroupId`, 'unresolved_reference', 'categoryGroupId does not resolve');
    if (categoryId === null || name === null || categoryGroupId === null) return;
    if (categories.has(categoryId)) c.fail(`categories[${index}].categoryId`, 'duplicate', 'categoryId must be unique');
    else categories.set(categoryId, { categoryId, name, categoryGroupId });
  });

  const counterpartyKeys = new Set(counterparties.keys());
  const categoryIds = new Set(categories.keys());
  const transactionList = c.array(root.transactions, 'transactions') ?? [];
  const transactions = new Map<string, Transaction>();
  const transactionOrder: Transaction[] = [];
  transactionList.forEach((raw, index) => {
    const transaction = validateTransaction(raw, `transactions[${index}]`, c, accounts, counterpartyKeys, categoryIds);
    if (transaction === null) return;
    if (transactions.has(transaction.transactionKey)) c.fail(`transactions[${index}].transactionKey`, 'duplicate', 'transactionKey must be unique');
    else {
      transactions.set(transaction.transactionKey, transaction);
      transactionOrder.push(transaction);
    }
  });
  // Cross-transaction rules: reversal originals and transfer pairs.
  const pairs = new Map<string, Transaction[]>();
  for (const transaction of transactionOrder) {
    const index = transactionOrder.indexOf(transaction);
    if (transaction.reversal !== undefined) {
      const original = transactions.get(transaction.reversal.originalTransactionKey);
      if (original === undefined) c.fail(`transactions[${index}].reversal.originalTransactionKey`, 'unresolved_reference', 'originalTransactionKey does not resolve');
      else if (original === transaction) c.fail(`transactions[${index}].reversal.originalTransactionKey`, 'self_reference', 'a transaction cannot reverse itself');
    }
    if (transaction.internalTransfer !== undefined) {
      const members = pairs.get(transaction.internalTransfer.pairKey) ?? [];
      members.push(transaction);
      pairs.set(transaction.internalTransfer.pairKey, members);
    }
  }
  for (const [pairKey, members] of pairs) {
    if (members.length > 2) {
      c.fail(`transactions[${transactionOrder.indexOf(members[2])}].internalTransfer.pairKey`, 'pair_too_many', `pairKey ${pairKey} is shared by more than two transactions`);
      continue;
    }
    if (members.length === 2) {
      const [a, b] = members;
      const consistent =
        a.accountKey !== b.accountKey &&
        a.internalTransfer!.counterAccountKey === b.accountKey &&
        b.internalTransfer!.counterAccountKey === a.accountKey &&
        Math.sign(a.amount.amount) !== Math.sign(b.amount.amount);
      if (!consistent) c.fail(`transactions[${transactionOrder.indexOf(b)}].internalTransfer`, 'pair_inconsistent', 'the two sides of a transfer must reference each other with opposite signs');
    }
  }

  const planList = c.array(root.categoryPlans, 'categoryPlans') ?? [];
  const categoryPlans: CategoryPlan[] = [];
  planList.forEach((raw, index) => {
    const rec = c.record(raw, `categoryPlans[${index}]`);
    if (rec === null) return;
    const categoryId = c.string(rec.categoryId, `categoryPlans[${index}].categoryId`);
    if (categoryId !== null && !categoryIds.has(categoryId)) c.fail(`categoryPlans[${index}].categoryId`, 'unresolved_reference', 'categoryId does not resolve');
    const month = c.month(rec.month, `categoryPlans[${index}].month`);
    const plannedAmount = c.money(rec.plannedAmount, `categoryPlans[${index}].plannedAmount`);
    if (categoryId === null || month === null || plannedAmount === null) return;
    categoryPlans.push({ categoryId, month, plannedAmount });
  });

  const recordList = c.array(root.expectationRecords, 'expectationRecords') ?? [];
  const records = new Map<string, ExpectationRecord>();
  recordList.forEach((raw, index) => {
    const path = `expectationRecords[${index}]`;
    const rec = c.record(raw, path);
    if (rec === null) return;
    if (rec.accountKey !== undefined) c.fail(`${path}.accountKey`, 'not_in_contract', 'no accountKey exists on an expectation record in 1.0');
    const recordKey = c.string(rec.recordKey, `${path}.recordKey`);
    const kind = c.oneOf<ExpectationRecord['kind']>(rec.kind, `${path}.kind`, new Set(['income', 'expense']));
    const name = c.string(rec.name, `${path}.name`);
    let counterpartyKey: string | undefined;
    if (rec.counterpartyKey !== undefined) {
      counterpartyKey = c.string(rec.counterpartyKey, `${path}.counterpartyKey`) ?? undefined;
      if (counterpartyKey !== undefined && !counterpartyKeys.has(counterpartyKey)) c.fail(`${path}.counterpartyKey`, 'unresolved_reference', 'counterpartyKey does not resolve');
    }
    const category = validateExpectationCategory(rec.category, `${path}.category`, c, categoryIds);
    const amount = c.money(rec.amount, `${path}.amount`);
    const schedule = validateSchedule(rec.schedule, `${path}.schedule`, c);
    const state = c.oneOf<ExpectationRecord['state']>(rec.state, `${path}.state`, new Set(['confirmed', 'suggested']));
    const stateSince = c.date(rec.stateSince, `${path}.stateSince`);
    if (recordKey === null || kind === null || name === null || category === null || amount === null || schedule === null || state === null || stateSince === null) return;
    if (records.has(recordKey)) c.fail(`${path}.recordKey`, 'duplicate', 'recordKey must be unique');
    else records.set(recordKey, { recordKey, kind, name, ...(counterpartyKey !== undefined ? { counterpartyKey } : {}), category, amount, schedule, state, stateSince });
  });

  const generatedDate = snapshotMeta?.generatedAt.slice(0, 10) ?? null;
  const occurrenceList = c.array(root.expectedOccurrences, 'expectedOccurrences') ?? [];
  const occurrences = new Map<string, ExpectedOccurrence>();
  occurrenceList.forEach((raw, index) => {
    const path = `expectedOccurrences[${index}]`;
    const rec = c.record(raw, path);
    if (rec === null) return;
    if (rec.accountKey !== undefined) c.fail(`${path}.accountKey`, 'not_in_contract', 'an occurrence carries no account field in 1.0');
    const occurrenceKey = c.string(rec.occurrenceKey, `${path}.occurrenceKey`);
    const recordKey = c.string(rec.recordKey, `${path}.recordKey`);
    const record = recordKey !== null ? records.get(recordKey) : undefined;
    if (recordKey !== null && record === undefined) c.fail(`${path}.recordKey`, 'unresolved_reference', 'recordKey does not resolve');
    const expectedDate = c.date(rec.expectedDate, `${path}.expectedDate`);
    if (expectedDate !== null && record !== undefined && expectedDate < record.stateSince) {
      c.fail(`${path}.expectedDate`, 'before_state_since', 'an occurrence dated before the record\'s stateSince is history, not an expectation (03 §7.14)');
    }
    const amount = c.money(rec.amount, `${path}.amount`);
    let categoryOverride: ExpectationCategory | undefined;
    if (rec.categoryOverride !== undefined) categoryOverride = validateExpectationCategory(rec.categoryOverride, `${path}.categoryOverride`, c, categoryIds) ?? undefined;
    const state = c.oneOf<ExpectedOccurrence['state']>(rec.state, `${path}.state`, OCCURRENCE_STATES);
    // 03 §7.26 as 017 PC3 asks it to be enforced: day-based. An occurrence
    // dated on the snapshot's own day, or later, is never overdue.
    if (state === 'overdue' && expectedDate !== null && generatedDate !== null && expectedDate >= generatedDate) {
      c.fail(`${path}.state`, 'overdue_not_past', 'overdue begins only after the expected calendar date has passed (03 §7.26)');
    }
    let match: ExpectedOccurrence['match'];
    if (rec.match !== undefined) {
      if (state !== 'matched') c.fail(`${path}.match`, 'match_without_matched', 'match exists exactly when state is matched');
      const m = c.record(rec.match, `${path}.match`);
      if (m !== null) {
        const transactionKey = c.string(m.transactionKey, `${path}.match.transactionKey`);
        if (transactionKey !== null && !transactions.has(transactionKey)) c.fail(`${path}.match.transactionKey`, 'unresolved_reference', 'matched transactionKey does not resolve');
        const source = c.string(m.source, `${path}.match.source`);
        if (source !== null && source.length > MATCH_SOURCE_MAX) c.fail(`${path}.match.source`, 'too_long', `at most ${MATCH_SOURCE_MAX} characters`);
        const matchedOn = c.date(m.matchedOn, `${path}.match.matchedOn`);
        if (transactionKey !== null && source !== null && matchedOn !== null) match = { transactionKey, source, matchedOn };
      }
    } else if (state === 'matched') {
      c.fail(`${path}.match`, 'matched_without_match', 'a matched occurrence names its transaction');
    }
    if (occurrenceKey === null || recordKey === null || expectedDate === null || amount === null || state === null) return;
    if (occurrences.has(occurrenceKey)) c.fail(`${path}.occurrenceKey`, 'duplicate', 'occurrenceKey must be unique');
    else occurrences.set(occurrenceKey, { occurrenceKey, recordKey, expectedDate, amount, ...(categoryOverride !== undefined ? { categoryOverride } : {}), state, ...(match !== undefined ? { match } : {}) });
  });

  const forecast = validateForecast(root.forecast, c, accounts);

  // Snapshot-wide invariants: currencies, the reliability boundary and the counts.
  if (snapshotMeta !== null) {
    const accountCurrencies = new Set([...accounts.values()].map(a => a.currency));
    const declared = new Set(snapshotMeta.currencies);
    if (accountCurrencies.size !== declared.size || [...accountCurrencies].some(cur => !declared.has(cur))) {
      c.fail('meta.currencies', 'currencies_mismatch', 'currencies must be exactly the unique currencies of the accounts');
    }
    const funded = [...accounts.values()].filter(a => a.countsTowardAvailableFunds);
    if (funded.length === 0) {
      if (snapshotMeta.coverage.reliabilityBoundary !== undefined) c.fail('meta.coverage.reliabilityBoundary', 'boundary_without_funds', 'no account counts toward available funds');
      if (snapshotMeta.coverage.reliabilityBoundaryBasis.length !== 0) c.fail('meta.coverage.reliabilityBoundaryBasis', 'basis_without_funds', 'expected an empty basis');
    } else {
      const minimum = funded.map(a => a.statementCoverage.lastStatementDate).sort()[0];
      const onMinimum = funded.filter(a => a.statementCoverage.lastStatementDate === minimum).map(a => a.accountKey).sort();
      if (snapshotMeta.coverage.reliabilityBoundary !== minimum) c.fail('meta.coverage.reliabilityBoundary', 'boundary_wrong', `expected ${minimum}`);
      const basis = [...snapshotMeta.coverage.reliabilityBoundaryBasis].sort();
      if (basis.length !== onMinimum.length || basis.some((key, i) => key !== onMinimum[i])) c.fail('meta.coverage.reliabilityBoundaryBasis', 'basis_wrong', `expected ${onMinimum.join(', ')}`);
    }
    const nonTransfer = transactionOrder.filter(t => t.internalTransfer === undefined);
    const expected = {
      accounts: accounts.size,
      transactions: transactions.size,
      counterparties: counterparties.size,
      categories: categories.size,
      expectedOccurrences: occurrences.size,
      uncategorisedTransactions: transactionOrder.filter(t => t.category.state === 'uncategorised').length,
      unresolvedCounterparties: nonTransfer.filter(t => t.counterparty.state === 'unresolved').length,
      counterpartyNotApplicable: nonTransfer.filter(t => t.counterparty.state === 'not_applicable').length,
    };
    for (const [name, value] of Object.entries(expected)) {
      if (snapshotMeta.counts[name as keyof typeof expected] !== value) c.fail(`meta.counts.${name}`, 'count_wrong', `expected ${value}`);
    }
  }

  if (c.issues.length > 0 || snapshotMeta === null || forecast === null) throw new ContractValidationError(c.issues);
  return {
    meta: snapshotMeta,
    accounts: [...accounts.values()],
    counterparties: [...counterparties.values()],
    categoryGroups: [...groups.values()],
    categories: [...categories.values()],
    transactions: transactionOrder,
    categoryPlans,
    expectationRecords: [...records.values()],
    expectedOccurrences: [...occurrences.values()],
    forecast,
  };
}
