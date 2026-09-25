// AYQ Analyses — the single A1 engine.
//
// One execution produces one structured result and one contribution set, and
// the headline, the rows, the chart, the exclusions, the drill-down and the
// comparison are all projections of it. The interface may format and select
// from this result; it may not recalculate financial meaning (r003 §8.8).

import { compareDates, comparisonPeriod, type Period } from './dates.js';
import type {
  AccountCoverageInterval,
  Account,
  AnalysisContext,
  AnalysisResult,
  AyqAnalyticalSnapshot,
  ComparisonFacts,
  Contribution,
  ContributionSubject,
  CounterpartyRow,
  CoverageFacts,
  CoverageLimit,
  Currency,
  ExclusionClass,
  ExclusionGroup,
  IsoDate,
  Money,
  OriginalOutsideReason,
  ReconciliationFact,
  ResultState,
  Transaction,
} from './types.js';

/** Deterministic and locale-independent: analytical order is never collation. */
export function compareKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

const UNCATEGORISED = Symbol.for('ayq.analyses.uncategorised');
/** A transfer's category state. Never part of a selection (017 PC2). */
const NOT_APPLICABLE = Symbol.for('ayq.analyses.category-not-applicable');

type CategoryToken = string | typeof UNCATEGORISED | typeof NOT_APPLICABLE;

function selectionToken(categoryId: string | null): CategoryToken {
  return categoryId === null ? UNCATEGORISED : categoryId;
}

/**
 * The category filter tests the transaction's own category state (017 PC2):
 * Uncategorised selects exactly `uncategorised`; `not_applicable` — an
 * internal transfer — is selected by nothing, and contributes nothing anyway.
 */
function categoryToken(transaction: Transaction): CategoryToken {
  const category = transaction.category;
  if (category.state === 'categorised') return category.categoryId;
  return category.state === 'uncategorised' ? UNCATEGORISED : NOT_APPLICABLE;
}

function categoryIdOf(transaction: Transaction): string | null {
  return transaction.category.state === 'categorised' ? transaction.category.categoryId : null;
}

function originalKeyOf(transaction: Transaction): string | null {
  return transaction.reversal === undefined ? null : transaction.reversal.originalTransactionKey;
}

/**
 * A validated snapshot amount, made exact. The validator admits only safe JSON
 * integers, and this is the one place a Number becomes money the engine adds:
 * from here on every sum, difference and comparison is bigint (r004 §6.3).
 */
function exactMinor(money: Money): bigint {
  return BigInt(money.amount);
}

function absolute(value: bigint): bigint {
  return value < 0n ? -value : value;
}

/**
 * The single A1 money-out contribution function (r003 §8.4). Every total, row
 * value, exclusion amount, comparison value and drill-down figure derives from
 * it, and no component reads an amount's sign for itself.
 */
export function moneyOutContribution(
  transaction: Transaction,
  original: Transaction | null,
): bigint {
  // 1. an internal transfer is a movement of the owner's own money.
  if (transaction.internalTransfer !== undefined) return 0n;

  const amount = exactMinor(transaction.amount);

  if (transaction.reversal !== undefined) {
    if (original === null) return 0n;
    // 5. a reversal of something that was not money-out is not money-out.
    if (original.internalTransfer !== undefined || exactMinor(original.amount) >= 0n) return 0n;
    // 4. a reversal of money-out reduces that counterparty's spend.
    return -absolute(amount);
  }

  // 2. and 3. an ordinary transaction contributes only what left the account.
  return amount < 0n ? absolute(amount) : 0n;
}

/**
 * A contributing transaction with no canonical counterparty is classified
 * rather than shown as a `(none)` row (r003 §7). The class is the snapshot's
 * own counterparty state (03 §13.14): no counterparty by nature, or expected
 * and unresolved. Nothing here re-derives it from the transaction class.
 */
export function subjectOf(transaction: Transaction): ContributionSubject {
  const counterparty = transaction.counterparty;
  if (counterparty.state === 'identified') {
    return { kind: 'counterparty', counterpartyKey: counterparty.counterpartyKey };
  }
  const exclusion: ExclusionClass = counterparty.state === 'not_applicable' ? 'notApplicable' : 'notIdentified';
  return { kind: 'excluded', exclusion };
}

interface PopulationInput {
  snapshot: AyqAnalyticalSnapshot;
  accountKeys: ReadonlySet<string>;
  categories: ReadonlySet<CategoryToken>;
  period: Period;
}

function buildContributions(input: PopulationInput): Contribution[] {
  const { snapshot, accountKeys, categories, period } = input;
  const byKey = new Map(snapshot.transactions.map(tx => [tx.transactionKey, tx] as const));
  const accountNames = new Map(snapshot.accounts.map(x => [x.accountKey, x.name] as const));
  const categoryNames = new Map(snapshot.categories.map(x => [x.categoryId, x.name] as const));
  const counterpartyNames = new Map(snapshot.counterparties.map(x => [x.counterpartyKey, x.displayName] as const));
  const nameOfAccount = (key: string): string => accountNames.get(key) ?? key;
  const nameOfCategory = (id: string | null): string | null => (id === null ? null : categoryNames.get(id) ?? null);

  const inPeriod = (date: IsoDate): boolean =>
    compareDates(date, period.fromDate) >= 0 && compareDates(date, period.toDate) <= 0;
  const inAccounts = (transaction: Transaction): boolean => accountKeys.has(transaction.accountKey);
  const inCategories = (transaction: Transaction): boolean => categories.has(categoryToken(transaction));

  const contributions: Contribution[] = [];

  for (const transaction of snapshot.transactions) {
    // The filtering order is fixed: references resolve against the full
    // snapshot first, then the requested date, accounts and category filter
    // apply to the transaction being filtered, then the contribution function.
    const originalKey = originalKeyOf(transaction);
    const original = originalKey === null ? null : byKey.get(originalKey) ?? null;

    if (!inPeriod(transaction.bookingDate)) continue;
    if (!inAccounts(transaction)) continue;
    if (!inCategories(transaction)) continue;

    const amountMinor = moneyOutContribution(transaction, original);
    if (amountMinor === 0n) continue;

    // A reversal is attributed to the counterparty of the transaction it
    // reverses, however that original is filtered; where the original has no
    // canonical counterparty, the reversal inherits its classification.
    const subject = original !== null ? subjectOf(original) : subjectOf(transaction);

    let outsideReason: OriginalOutsideReason | null = null;
    if (original !== null) {
      const reasons: OriginalOutsideReason[] = [];
      if (!inPeriod(original.bookingDate)) reasons.push('period');
      if (!inAccounts(original)) reasons.push('accounts');
      if (!inCategories(original)) reasons.push('filter');
      outsideReason = reasons.length === 0 ? null : reasons.length === 1 ? reasons[0] : 'selection';
    }

    contributions.push({
      transactionKey: transaction.transactionKey,
      amountMinor,
      currency: transaction.amount.currency,
      subject,
      transaction,
      accountName: nameOfAccount(transaction.accountKey),
      categoryName: nameOfCategory(categoryIdOf(transaction)),
      original:
        original !== null
          ? {
              transaction: original,
              moneyOutMinor: moneyOutContribution(
                original,
                originalKeyOf(original) === null ? null : byKey.get(originalKeyOf(original)!) ?? null,
              ),
              counterpartyName:
                original.counterparty.state === 'identified'
                  ? counterpartyNames.get(original.counterparty.counterpartyKey) ?? null
                  : null,
              outsideReason,
            }
          : null,
    });
  }

  return contributions;
}

function populationCurrencies(contributions: readonly Contribution[]): Currency[] {
  const currencies = new Set<Currency>();
  for (const contribution of contributions) currencies.add(contribution.currency);
  return [...currencies].sort(compareKeys);
}

/**
 * Coverage is an interval derived from the selected analytical scope. The
 * global Forecast reliability boundary is never used for this (r003 §6.4).
 *
 * An account without a proven coverage start (UNKNOWN_START, 03 §8.7) has an
 * end and no beginning. It names no start limit, and Insufficient is concluded
 * from the end side only: the requested period lies entirely after every
 * selected account's last statement date, where no data can exist whatever
 * the start is (010 §3). A period that merely reaches back before an unproven
 * start is a Result or an empty population, qualified by `unknownStartAccountKeys`.
 */
export function coverageFor(accounts: readonly Account[], period: Period): CoverageFacts {
  const intervals: AccountCoverageInterval[] = accounts
    .map(account => ({
      accountKey: account.accountKey,
      name: account.name,
      displayIdentifier: account.displayIdentifier,
      coverageStartDate: account.statementCoverage.coverageStartDate ?? null,
      lastStatementDate: account.statementCoverage.lastStatementDate,
    }))
    .sort((a, b) => compareKeys(a.name, b.name) || compareKeys(a.accountKey, b.accountKey));
  const unknownStartAccountKeys = intervals.filter(x => x.coverageStartDate === null).map(x => x.accountKey);

  if (intervals.length === 0) {
    return {
      fromDate: period.fromDate,
      toDate: period.toDate,
      accounts: intervals,
      status: 'insufficient',
      startLimit: null,
      endLimit: null,
      coveredThrough: null,
      unknownStartAccountKeys,
    };
  }

  const coveredEnd = intervals.reduce(
    (earliest, x) => (x.lastStatementDate < earliest ? x.lastStatementDate : earliest),
    intervals[0].lastStatementDate,
  );

  const reachesAny = intervals.some(x => compareDates(x.lastStatementDate, period.fromDate) >= 0);

  if (!reachesAny) {
    return {
      fromDate: period.fromDate,
      toDate: period.toDate,
      accounts: intervals,
      status: 'insufficient',
      startLimit: null,
      endLimit: null,
      coveredThrough: coveredEnd,
      unknownStartAccountKeys,
    };
  }

  // The covered start is the latest proven start among the accounts that
  // have one; an account without one has no start to set a limit with.
  const provenStarts = intervals.map(x => x.coverageStartDate).filter((x): x is IsoDate => x !== null);
  const coveredStart = provenStarts.length === 0 ? null : provenStarts.reduce((latest, x) => (x > latest ? x : latest));

  const startLimited = coveredStart !== null && compareDates(coveredStart, period.fromDate) > 0;
  const endLimited = compareDates(coveredEnd, period.toDate) < 0;

  const limitAt = (date: IsoDate, pick: (x: AccountCoverageInterval) => IsoDate | null): CoverageLimit => ({
    date,
    accountKeys: intervals.filter(x => pick(x) === date).map(x => x.accountKey),
  });

  return {
    fromDate: period.fromDate,
    toDate: period.toDate,
    accounts: intervals,
    status: startLimited || endLimited ? 'limited' : 'full',
    startLimit: startLimited ? limitAt(coveredStart, x => x.coverageStartDate) : null,
    endLimit: endLimited ? limitAt(coveredEnd, x => x.lastStatementDate) : null,
    coveredThrough: coveredEnd,
    unknownStartAccountKeys,
  };
}

function counterpartyTotal(contributions: readonly Contribution[]): bigint {
  let total = 0n;
  for (const contribution of contributions) {
    if (contribution.subject.kind === 'counterparty') total += contribution.amountMinor;
  }
  return total;
}

function buildRows(
  snapshot: AyqAnalyticalSnapshot,
  contributions: readonly Contribution[],
  previousByCounterparty: ReadonlyMap<string, bigint> | null,
  currency: Currency,
): CounterpartyRow[] {
  const displayNames = new Map(snapshot.counterparties.map(x => [x.counterpartyKey, x.displayName] as const));
  const grouped = new Map<string, Contribution[]>();

  for (const contribution of contributions) {
    if (contribution.subject.kind !== 'counterparty') continue;
    const key = contribution.subject.counterpartyKey;
    const bucket = grouped.get(key);
    if (bucket) bucket.push(contribution);
    else grouped.set(key, [contribution]);
  }

  const rows: CounterpartyRow[] = [];
  for (const [counterpartyKey, bucket] of grouped) {
    const moneyOutMinor = bucket.reduce((sum, x) => sum + x.amountMinor, 0n);
    const previousMinor = previousByCounterparty ? previousByCounterparty.get(counterpartyKey) ?? 0n : null;
    rows.push({
      counterpartyKey,
      displayName: displayNames.get(counterpartyKey) ?? counterpartyKey,
      transactionCount: bucket.length,
      moneyOutMinor,
      currency,
      previousMinor,
      changeMinor: previousMinor === null ? null : moneyOutMinor - previousMinor,
      contributions: [...bucket].sort(
        (a, b) =>
          compareDates(b.transaction.bookingDate, a.transaction.bookingDate) ||
          compareKeys(a.transactionKey, b.transactionKey),
      ),
    });
  }

  return rows;
}

function buildExclusions(
  contributions: readonly Contribution[],
  currency: Currency | null,
): ExclusionGroup[] {
  const groups: ExclusionGroup[] = [];
  for (const exclusion of ['notApplicable', 'notIdentified'] as const) {
    const bucket = contributions.filter(x => x.subject.kind === 'excluded' && x.subject.exclusion === exclusion);
    if (bucket.length === 0) continue;
    groups.push({
      exclusion,
      transactionCount: bucket.length,
      amountMinor: currency === null ? null : bucket.reduce((sum, x) => sum + x.amountMinor, 0n),
      currency,
      contributions: [...bucket].sort(
        (a, b) =>
          compareDates(b.transaction.bookingDate, a.transaction.bookingDate) ||
          compareKeys(a.transactionKey, b.transactionKey),
      ),
    });
  }
  return groups;
}

function reconciliationFacts(accounts: readonly Account[]): ReconciliationFact[] {
  return accounts.map(account => {
    const reconciliation = account.reconciliation;
    const identity = { accountKey: account.accountKey, name: account.name, displayIdentifier: account.displayIdentifier };
    // Unavailable is a real state (03 §13.3): the bank stated no closing
    // balance at the coverage date, so there is nothing to compare with. It is
    // never rendered as agreement, and never as a difference of nought.
    if (reconciliation.state === 'unavailable') return { ...identity, state: 'unavailable' };
    return {
      ...identity,
      state: reconciliation.state,
      differenceMinor: exactMinor(reconciliation.difference),
      differenceMagnitudeMinor: absolute(exactMinor(reconciliation.difference)),
      currency: reconciliation.difference.currency,
    };
  });
}

export function analyse(snapshot: AyqAnalyticalSnapshot, context: AnalysisContext): AnalysisResult {
  const selectedKeys = new Set(context.accountKeys);
  const accounts = snapshot.accounts
    .filter(account => selectedKeys.has(account.accountKey))
    .sort((a, b) => compareKeys(a.name, b.name) || compareKeys(a.accountKey, b.accountKey));
  const accountKeys = new Set(accounts.map(account => account.accountKey));
  const categories = new Set<CategoryToken>(context.categoryKeys.map(selectionToken));

  const period: Period = { fromDate: context.fromDate, toDate: context.toDate };
  const coverage = coverageFor(accounts, period);
  const contributions = buildContributions({ snapshot, accountKeys, categories, period });
  const currencies = populationCurrencies(contributions);

  const supportedCurrency = currencies.length === 1 ? currencies[0] : null;
  const unsupported = currencies.length > 1;

  let state: ResultState;
  if (coverage.status === 'insufficient') state = 'insufficient';
  else if (unsupported) state = 'unsupported';
  else if (contributions.length === 0) state = 'empty';
  else if (coverage.status === 'limited') state = 'coverageLimited';
  else state = 'result';

  const hasFigure = state === 'result' || state === 'coverageLimited';
  const currency = hasFigure ? supportedCurrency : null;

  // The comparison is evaluated independently of the current result, against
  // its own period and its own coverage.
  let comparison: ComparisonFacts | null = null;
  let deltaMinor: bigint | null = null;
  let previousByCounterparty: Map<string, bigint> | null = null;

  if (context.comparison !== 'none') {
    const resolved = comparisonPeriod(period, context.comparison);
    const comparisonCoverage = coverageFor(accounts, resolved);
    const comparisonContributions = buildContributions({
      snapshot,
      accountKeys,
      categories,
      period: { fromDate: resolved.fromDate, toDate: resolved.toDate },
    });
    const comparisonCurrencies = populationCurrencies(comparisonContributions);

    // A change figure over a period whose earlier part may be absent is not
    // approximate but wrong (010 §3): one selected account without a proven
    // start refuses the comparison, before any coverage or currency test.
    let unavailable: ComparisonFacts['unavailable'] = null;
    if (comparisonCoverage.status === 'insufficient') unavailable = 'noData';
    else if (comparisonCoverage.unknownStartAccountKeys.length > 0) unavailable = 'unknownStart';
    else if (comparisonCoverage.status === 'limited') unavailable = 'coverage';
    else if (comparisonCurrencies.length > 1) unavailable = 'currency';
    else if (comparisonCurrencies.length === 1 && currency !== null && comparisonCurrencies[0] !== currency) {
      unavailable = 'currency';
    }

    const comparable = unavailable === null && hasFigure && currency !== null;
    const totalMinor = comparable ? counterpartyTotal(comparisonContributions) : null;

    comparison = {
      mode: context.comparison,
      fromDate: resolved.fromDate,
      toDate: resolved.toDate,
      clamped: resolved.clamped,
      coverage: comparisonCoverage,
      totalMinor,
      currency: comparable ? currency : null,
      unavailable,
      currencies: comparisonCurrencies,
    };

    if (comparable) {
      previousByCounterparty = new Map<string, bigint>();
      for (const contribution of comparisonContributions) {
        if (contribution.subject.kind !== 'counterparty') continue;
        const key = contribution.subject.counterpartyKey;
        previousByCounterparty.set(key, (previousByCounterparty.get(key) ?? 0n) + contribution.amountMinor);
      }
    }
  }

  const rows = hasFigure && currency !== null ? buildRows(snapshot, contributions, previousByCounterparty, currency) : [];
  const totalMinor = hasFigure ? counterpartyTotal(contributions) : null;

  if (comparison !== null && comparison.totalMinor !== null && totalMinor !== null) {
    deltaMinor = totalMinor - comparison.totalMinor;
  }

  const exclusions =
    state === 'insufficient' ? [] : buildExclusions(contributions, unsupported ? null : supportedCurrency);

  return {
    context,
    generatedAt: snapshot.meta.generatedAt,
    state,
    coverage,
    reconciliation: reconciliationFacts(accounts),
    totalMinor,
    currency,
    currencies,
    rows,
    exclusions,
    comparison,
    deltaMinor,
    contributions,
  };
}
