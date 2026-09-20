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

type CategoryToken = string | typeof UNCATEGORISED;

function categoryToken(categoryId: string | null): CategoryToken {
  return categoryId === null ? UNCATEGORISED : categoryId;
}

/**
 * The single A1 money-out contribution function (r003 §8.4). Every total, row
 * value, exclusion amount, comparison value and drill-down figure derives from
 * it, and no component reads an amount's sign for itself.
 */
export function moneyOutContribution(
  transaction: Transaction,
  original: Transaction | null,
): number {
  // 1. an internal transfer is a movement of the owner's own money.
  if (transaction.isInternalTransfer) return 0;

  if (transaction.isReversal) {
    if (original === null) return 0;
    // 5. a reversal of something that was not money-out is not money-out.
    if (original.isInternalTransfer || original.amount.amount >= 0) return 0;
    // 4. a reversal of money-out reduces that counterparty's spend.
    return -Math.abs(transaction.amount.amount);
  }

  // 2. and 3. an ordinary transaction contributes only what left the account.
  return transaction.amount.amount < 0 ? Math.abs(transaction.amount.amount) : 0;
}

/**
 * A contributing transaction with no canonical counterparty is classified
 * rather than shown as a `(none)` row (r003 §7).
 */
export function subjectOf(transaction: Transaction): ContributionSubject {
  if (transaction.counterpartyKey !== null) {
    return { kind: 'counterparty', counterpartyKey: transaction.counterpartyKey };
  }
  const exclusion: ExclusionClass =
    transaction.transactionClass === 'cash_withdrawal' ? 'notApplicable' : 'notIdentified';
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
  const inCategories = (transaction: Transaction): boolean => categories.has(categoryToken(transaction.categoryId));

  const contributions: Contribution[] = [];

  for (const transaction of snapshot.transactions) {
    // The filtering order is fixed: references resolve against the full
    // snapshot first, then the requested date, accounts and category filter
    // apply to the transaction being filtered, then the contribution function.
    const original =
      transaction.reversalOfTransactionKey === null
        ? null
        : byKey.get(transaction.reversalOfTransactionKey) ?? null;

    if (!inPeriod(transaction.bookingDate)) continue;
    if (!inAccounts(transaction)) continue;
    if (!inCategories(transaction)) continue;

    const amountMinor = moneyOutContribution(transaction, original);
    if (amountMinor === 0) continue;

    // A reversal is attributed to the counterparty of the transaction it
    // reverses, however that original is filtered; where the original has no
    // canonical counterparty, the reversal inherits its classification.
    const subject = transaction.isReversal && original !== null ? subjectOf(original) : subjectOf(transaction);

    let outsideReason: OriginalOutsideReason | null = null;
    if (transaction.isReversal && original !== null) {
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
      categoryName: nameOfCategory(transaction.categoryId),
      original:
        transaction.isReversal && original !== null
          ? {
              transaction: original,
              counterpartyName:
                original.counterpartyKey === null ? null : counterpartyNames.get(original.counterpartyKey) ?? null,
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
 */
export function coverageFor(accounts: readonly Account[], period: Period): CoverageFacts {
  const intervals: AccountCoverageInterval[] = accounts
    .map(account => ({
      accountKey: account.accountKey,
      name: account.name,
      displayIdentifier: account.displayIdentifier,
      openingDate: account.openingDate,
      lastStatementDate: account.statementCoverage.lastStatementDate,
    }))
    .sort((a, b) => compareKeys(a.name, b.name) || compareKeys(a.accountKey, b.accountKey));

  if (intervals.length === 0) {
    return {
      fromDate: period.fromDate,
      toDate: period.toDate,
      accounts: intervals,
      status: 'insufficient',
      startLimit: null,
      endLimit: null,
      coveredThrough: null,
    };
  }

  const coveredStart = intervals.reduce((latest, x) => (x.openingDate > latest ? x.openingDate : latest), intervals[0].openingDate);
  const coveredEnd = intervals.reduce(
    (earliest, x) => (x.lastStatementDate < earliest ? x.lastStatementDate : earliest),
    intervals[0].lastStatementDate,
  );

  const intersectsAny = intervals.some(
    x => compareDates(x.openingDate, period.toDate) <= 0 && compareDates(x.lastStatementDate, period.fromDate) >= 0,
  );

  if (!intersectsAny) {
    return {
      fromDate: period.fromDate,
      toDate: period.toDate,
      accounts: intervals,
      status: 'insufficient',
      startLimit: null,
      endLimit: null,
      coveredThrough: coveredEnd,
    };
  }

  const startLimited = compareDates(coveredStart, period.fromDate) > 0;
  const endLimited = compareDates(coveredEnd, period.toDate) < 0;

  const limitAt = (date: IsoDate, pick: (x: AccountCoverageInterval) => IsoDate): CoverageLimit => ({
    date,
    accountKeys: intervals.filter(x => pick(x) === date).map(x => x.accountKey),
  });

  return {
    fromDate: period.fromDate,
    toDate: period.toDate,
    accounts: intervals,
    status: startLimited || endLimited ? 'limited' : 'full',
    startLimit: startLimited ? limitAt(coveredStart, x => x.openingDate) : null,
    endLimit: endLimited ? limitAt(coveredEnd, x => x.lastStatementDate) : null,
    coveredThrough: coveredEnd,
  };
}

function counterpartyTotal(contributions: readonly Contribution[]): number {
  let total = 0;
  for (const contribution of contributions) {
    if (contribution.subject.kind === 'counterparty') total += contribution.amountMinor;
  }
  return total;
}

function buildRows(
  snapshot: AyqAnalyticalSnapshot,
  contributions: readonly Contribution[],
  previousByCounterparty: ReadonlyMap<string, number> | null,
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
    const moneyOutMinor = bucket.reduce((sum, x) => sum + x.amountMinor, 0);
    const previousMinor = previousByCounterparty ? previousByCounterparty.get(counterpartyKey) ?? 0 : null;
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
      amountMinor: currency === null ? null : bucket.reduce((sum, x) => sum + x.amountMinor, 0),
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
  return accounts.map(account => ({
    accountKey: account.accountKey,
    name: account.name,
    displayIdentifier: account.displayIdentifier,
    state: account.reconciliation.state,
    differenceMinor: account.reconciliation.difference.amount,
    currency: account.reconciliation.difference.currency,
  }));
}

export function analyse(snapshot: AyqAnalyticalSnapshot, context: AnalysisContext): AnalysisResult {
  const selectedKeys = new Set(context.accountKeys);
  const accounts = snapshot.accounts
    .filter(account => selectedKeys.has(account.accountKey))
    .sort((a, b) => compareKeys(a.name, b.name) || compareKeys(a.accountKey, b.accountKey));
  const accountKeys = new Set(accounts.map(account => account.accountKey));
  const categories = new Set<CategoryToken>(context.categoryKeys.map(categoryToken));

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
  let deltaMinor: number | null = null;
  let previousByCounterparty: Map<string, number> | null = null;

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

    let unavailable: ComparisonFacts['unavailable'] = null;
    if (comparisonCoverage.status === 'insufficient') unavailable = 'noData';
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
      previousByCounterparty = new Map<string, number>();
      for (const contribution of comparisonContributions) {
        if (contribution.subject.kind !== 'counterparty') continue;
        const key = contribution.subject.counterpartyKey;
        previousByCounterparty.set(key, (previousByCounterparty.get(key) ?? 0) + contribution.amountMinor);
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
