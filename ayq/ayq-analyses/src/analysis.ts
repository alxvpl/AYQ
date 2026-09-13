import type {
  AnalysisContext,
  AyqAnalyticalSnapshot,
  Dimension,
  ExploreResult,
  FixedCostResult,
  ForecastBacktestPoint,
  GroupRow,
  Metric,
  OccurrenceClassification,
  Transaction,
} from './types.js';

const MONTH_RE = /^\d{4}-\d{2}$/;

export function monthOf(date: string): string {
  return date.slice(0, 7);
}

function shiftMonth(month: string, delta: number): string {
  if (!MONTH_RE.test(month)) throw new Error(`invalid month ${month}`);
  const [year, monthNumber] = month.split('-').map(Number);
  const index = year * 12 + (monthNumber - 1) + delta;
  const y = Math.floor(index / 12);
  const m = (index % 12 + 12) % 12 + 1;
  return `${y}-${String(m).padStart(2, '0')}`;
}

export function latestCompleteMonth(snapshot: AyqAnalyticalSnapshot): string {
  const generated = new Date(snapshot.meta.generatedAt);
  const year = generated.getUTCFullYear();
  const monthIndex = generated.getUTCMonth();
  const day = generated.getUTCDate();
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const current = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
  return day === lastDay ? current : shiftMonth(current, -1);
}

function inMonthRange(date: string, fromMonth: string, toMonth: string): boolean {
  const month = monthOf(date);
  return month >= fromMonth && month <= toMonth;
}

function selectedAccounts(context: AnalysisContext): Set<string> | null {
  return context.accountKeys.length ? new Set(context.accountKeys) : null;
}

function selectedClasses(context: AnalysisContext): Set<string> | null {
  return context.transactionClasses.length ? new Set(context.transactionClasses) : null;
}

function matchesSearch(snapshot: AyqAnalyticalSnapshot, transaction: Transaction, query: string): boolean {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return true;
  const counterparty = snapshot.counterparties.find(x => x.counterpartyKey === transaction.counterpartyKey)?.displayName ?? '';
  const category = snapshot.categories.find(x => x.categoryId === transaction.categoryId)?.name ?? '';
  const account = snapshot.accounts.find(x => x.accountKey === transaction.accountKey)?.name ?? '';
  const haystack = [counterparty, category, account, transaction.evidenceText ?? '', transaction.transactionClass]
    .join('\n')
    .toLocaleLowerCase();
  return haystack.includes(normalized);
}

function transactionPasses(snapshot: AyqAnalyticalSnapshot, transaction: Transaction, context: AnalysisContext, fromMonth: string, toMonth: string): boolean {
  if (!inMonthRange(transaction.bookingDate, fromMonth, toMonth)) return false;
  const accounts = selectedAccounts(context);
  if (accounts && !accounts.has(transaction.accountKey)) return false;
  const classes = selectedClasses(context);
  if (classes && !classes.has(transaction.transactionClass)) return false;
  if (!context.includeUncategorised && transaction.categoryId === null) return false;
  if (Math.abs(transaction.amount.amount) < context.minimumAbsoluteAmount) return false;
  if (!matchesSearch(snapshot, transaction, context.search)) return false;
  return true;
}

/**
 * Canonical money-out contribution in minor units.
 * Ordinary expenses are positive contributions. A positive reversal of an
 * expense contributes negatively, so it reduces spending rather than becoming income.
 * Internal transfers never count as spending.
 */
export function moneyOutContribution(snapshot: AyqAnalyticalSnapshot, transaction: Transaction): number {
  if (transaction.isInternalTransfer) return 0;
  if (transaction.amount.amount < 0) return -transaction.amount.amount;
  if (transaction.isReversal && transaction.reversalOfTransactionKey) {
    const original = snapshot.transactions.find(x => x.transactionKey === transaction.reversalOfTransactionKey);
    if (original && original.amount.amount < 0) return -transaction.amount.amount;
  }
  return 0;
}

export function moneyInContribution(snapshot: AyqAnalyticalSnapshot, transaction: Transaction): number {
  if (transaction.isInternalTransfer) return 0;
  if (transaction.isReversal) return 0;
  return transaction.amount.amount > 0 ? transaction.amount.amount : 0;
}

export function metricContribution(snapshot: AyqAnalyticalSnapshot, transaction: Transaction, metric: Metric): number {
  switch (metric) {
    case 'money-out':
      return moneyOutContribution(snapshot, transaction);
    case 'money-in':
      return moneyInContribution(snapshot, transaction);
    case 'net':
      return transaction.isInternalTransfer ? 0 : transaction.amount.amount;
    case 'count':
      return transaction.isInternalTransfer ? 0 : 1;
  }
}

function metricPopulation(snapshot: AyqAnalyticalSnapshot, transactions: Transaction[], metric: Metric): Transaction[] {
  if (metric === 'money-out') return transactions.filter(tx => moneyOutContribution(snapshot, tx) !== 0);
  if (metric === 'money-in') return transactions.filter(tx => moneyInContribution(snapshot, tx) !== 0);
  return transactions.filter(tx => !tx.isInternalTransfer);
}

function labelFor(snapshot: AyqAnalyticalSnapshot, dimension: Dimension, key: string): string {
  if (key === '__none__') return '(none)';
  switch (dimension) {
    case 'categoryId':
      return snapshot.categories.find(x => x.categoryId === key)?.name ?? key;
    case 'counterpartyKey':
      return snapshot.counterparties.find(x => x.counterpartyKey === key)?.displayName ?? key;
    case 'accountKey':
      return snapshot.accounts.find(x => x.accountKey === key)?.name ?? key;
    case 'transactionClass':
      return key.replaceAll('_', ' ');
    case 'month':
      return key;
  }
}

export function dimensionKey(transaction: Transaction, dimension: Dimension): string {
  if (dimension === 'month') return monthOf(transaction.bookingDate);
  const value = transaction[dimension];
  return typeof value === 'string' ? value : '__none__';
}

function aggregateRows(snapshot: AyqAnalyticalSnapshot, transactions: Transaction[], metric: Metric, dimension: Dimension): GroupRow[] {
  const grouped = new Map<string, { value: number; transactionCount: number }>();
  for (const transaction of metricPopulation(snapshot, transactions, metric)) {
    const key = dimensionKey(transaction, dimension);
    const current = grouped.get(key) ?? { value: 0, transactionCount: 0 };
    current.value += metricContribution(snapshot, transaction, metric);
    current.transactionCount += 1;
    grouped.set(key, current);
  }
  return [...grouped.entries()]
    .map(([key, value]) => ({ key, label: labelFor(snapshot, dimension, key), ...value }))
    .filter(row => row.value !== 0 || metric === 'count')
    .sort((a, b) => dimension === 'month' ? a.key.localeCompare(b.key) : Math.abs(b.value) - Math.abs(a.value));
}

export function transactionsForContext(snapshot: AyqAnalyticalSnapshot, context: AnalysisContext, fromMonth = context.fromMonth, toMonth = context.toMonth): Transaction[] {
  const matching = snapshot.transactions.filter(tx => transactionPasses(snapshot, tx, context, fromMonth, toMonth));
  return metricPopulation(snapshot, matching, context.metric);
}

function sumMetric(snapshot: AyqAnalyticalSnapshot, transactions: Transaction[], metric: Metric): number {
  return metricPopulation(snapshot, transactions, metric)
    .reduce((total, transaction) => total + metricContribution(snapshot, transaction, metric), 0);
}

export function comparisonPeriod(context: AnalysisContext): [string, string] | null {
  if (context.compare === 'none') return null;
  if (context.compare === 'year-over-year') return [shiftMonth(context.fromMonth, -12), shiftMonth(context.toMonth, -12)];
  const [fromYear, fromMonth] = context.fromMonth.split('-').map(Number);
  const [toYear, toMonth] = context.toMonth.split('-').map(Number);
  const span = (toYear - fromYear) * 12 + (toMonth - fromMonth) + 1;
  return [shiftMonth(context.fromMonth, -span), shiftMonth(context.toMonth, -span)];
}

export function analyse(snapshot: AyqAnalyticalSnapshot, context: AnalysisContext): ExploreResult {
  const current = transactionsForContext(snapshot, context);
  const rows = aggregateRows(snapshot, current, context.metric, context.dimension);
  const value = sumMetric(snapshot, current, context.metric);
  const comparison = comparisonPeriod(context);
  let comparisonValue: number | null = null;
  if (comparison) {
    const previous = transactionsForContext(snapshot, context, comparison[0], comparison[1]);
    comparisonValue = sumMetric(snapshot, previous, context.metric);
  }
  const reliabilityMonth = monthOf(snapshot.meta.coverage.reliabilityBoundary);
  const reliabilityLimitation = context.toMonth > reliabilityMonth
    ? `The selected period extends past the reliability boundary (${snapshot.meta.coverage.reliabilityBoundary}).`
    : null;
  return {
    value,
    transactionCount: metricPopulation(snapshot, current, context.metric).length,
    comparisonValue,
    delta: comparisonValue === null ? null : value - comparisonValue,
    rows,
    reliabilityLimitation,
  };
}

export function summarizeCounterparty(snapshot: AyqAnalyticalSnapshot, counterpartyKey: string) {
  const transactions = snapshot.transactions.filter(tx => tx.counterpartyKey === counterpartyKey && moneyOutContribution(snapshot, tx) !== 0);
  const total = transactions.reduce((sum, tx) => sum + moneyOutContribution(snapshot, tx), 0);
  const evidenceTexts = new Set(transactions.map(tx => tx.evidenceText).filter((x): x is string => Boolean(x)));
  return { total, transactionCount: transactions.length, evidenceTexts: [...evidenceTexts].sort(), transactions };
}

export function summarizeMonthChange(snapshot: AyqAnalyticalSnapshot, currentMonth: string, previousMonth = shiftMonth(currentMonth, -1)) {
  const baseContext: AnalysisContext = {
    fromMonth: currentMonth,
    toMonth: currentMonth,
    compare: 'none',
    metric: 'money-out',
    dimension: 'categoryId',
    accountKeys: [],
    transactionClasses: [],
    includeUncategorised: true,
    minimumAbsoluteAmount: 0,
    search: '',
  };
  const current = analyse(snapshot, baseContext);
  const previous = analyse(snapshot, { ...baseContext, fromMonth: previousMonth, toMonth: previousMonth });
  const previousByKey = new Map(previous.rows.map(row => [row.key, row.value] as const));
  const currentByKey = new Map(current.rows.map(row => [row.key, row.value] as const));
  const keys = new Set([...previousByKey.keys(), ...currentByKey.keys()]);
  const contributors = [...keys].map(key => ({
    key,
    label: labelFor(snapshot, 'categoryId', key),
    delta: (currentByKey.get(key) ?? 0) - (previousByKey.get(key) ?? 0),
  })).filter(x => x.delta !== 0).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return {
    currentMonth,
    previousMonth,
    currentSpending: current.value,
    previousSpending: previous.value,
    delta: current.value - previous.value,
    contributors,
  };
}

export function fixedCosts(snapshot: AyqAnalyticalSnapshot): { items: FixedCostResult[]; committedMonthly: number } {
  const txByKey = new Map(snapshot.transactions.map(tx => [tx.transactionKey, tx] as const));
  const occurrencesByRecord = new Map<string, typeof snapshot.expectedOccurrences>();
  for (const occurrence of snapshot.expectedOccurrences) {
    const list = occurrencesByRecord.get(occurrence.recordKey) ?? [];
    list.push(occurrence);
    occurrencesByRecord.set(occurrence.recordKey, list);
  }

  const items: FixedCostResult[] = [];
  let committedMonthly = 0;

  for (const record of snapshot.expectationRecords.filter(record => record.kind === 'expense')) {
    const matched = (occurrencesByRecord.get(record.recordKey) ?? [])
      .filter(occurrence => occurrence.state === 'matched' && occurrence.match)
      .sort((a, b) => a.expectedDate.localeCompare(b.expectedDate));

    const history: FixedCostResult['paidHistory'] = [];
    let lastAmount: number | null = null;
    let lastCurrency = record.amount.currency;
    for (const occurrence of matched) {
      const transaction = txByKey.get(occurrence.match!.transactionKey);
      if (!transaction) continue;
      const amount = Math.abs(transaction.amount.amount);
      lastCurrency = transaction.amount.currency;
      if (lastAmount !== amount) {
        history.push({ effectiveDate: occurrence.expectedDate, amount, currency: transaction.amount.currency });
        lastAmount = amount;
      }
    }

    let monthlyCommittedAmount: number | null = null;
    if (record.state === 'confirmed') {
      const amount = Math.abs(record.amount.amount);
      if (record.recurrence.type === 'monthly') monthlyCommittedAmount = amount;
      if (record.recurrence.type === 'yearly') monthlyCommittedAmount = amount / 12;
      if (monthlyCommittedAmount !== null) committedMonthly += monthlyCommittedAmount;
    }

    items.push({
      recordKey: record.recordKey,
      name: record.name,
      recurrenceType: record.recurrence.type,
      state: record.state,
      evidenceStatus: record.state === 'confirmed' ? 'proven' : 'insufficient',
      currentExpected: { ...record.amount, amount: Math.abs(record.amount.amount) },
      paidHistory: history,
      latestPaid: lastAmount === null ? null : { amount: lastAmount, currency: lastCurrency },
      monthlyCommittedAmount,
    });
  }

  return { items, committedMonthly };
}

export function classifyUnmatchedOccurrences(snapshot: AyqAnalyticalSnapshot): OccurrenceClassification[] {
  const recordByKey = new Map(snapshot.expectationRecords.map(record => [record.recordKey, record] as const));
  const accountByKey = new Map(snapshot.accounts.map(account => [account.accountKey, account] as const));
  const asOfDate = snapshot.meta.generatedAt.slice(0, 10);
  const result: OccurrenceClassification[] = [];

  for (const occurrence of snapshot.expectedOccurrences) {
    if (occurrence.state === 'matched' || occurrence.expectedDate > asOfDate) continue;
    const record = recordByKey.get(occurrence.recordKey);
    if (!record) continue;
    if (record.accountKey === null) {
      result.push({ occurrence, record, kind: 'undecidable', reason: 'AYQ did not identify the expected account.' });
      continue;
    }
    const account = accountByKey.get(record.accountKey);
    if (!account) continue;
    if (occurrence.expectedDate <= account.statementCoverage.lastStatementDate) {
      result.push({ occurrence, record, kind: 'missing', reason: `The account statement covers ${occurrence.expectedDate}, but no matched transaction exists.` });
    } else {
      result.push({ occurrence, record, kind: 'not-yet-imported', reason: `The account statement currently ends at ${account.statementCoverage.lastStatementDate}.` });
    }
  }
  return result;
}

export function accountBalanceAtDate(snapshot: AyqAnalyticalSnapshot, accountKey: string, date: string): number | null {
  const account = snapshot.accounts.find(x => x.accountKey === accountKey);
  if (!account || date < account.openingDate) return null;
  return account.openingBalance.amount + snapshot.transactions
    .filter(tx => tx.accountKey === accountKey && tx.bookingDate <= date)
    .reduce((sum, tx) => sum + tx.amount.amount, 0);
}

export function forecastBacktest(archive: AyqAnalyticalSnapshot[]): ForecastBacktestPoint[] {
  if (archive.length < 2) return [];
  const sorted = [...archive].sort((a, b) => a.meta.generatedAt.localeCompare(b.meta.generatedAt));
  const latest = sorted.at(-1)!;
  const latestTransactionDate = latest.transactions.reduce((max, tx) => tx.bookingDate > max ? tx.bookingDate : max, '0000-00-00');
  const results: ForecastBacktestPoint[] = [];

  for (const source of sorted.slice(0, -1)) {
    if (source.forecast.unavailableReason) continue;
    for (const point of source.forecast.series) {
      if (point.date > latestTransactionDate) continue;
      const actualParts = source.forecast.basisAccountKeys.map(accountKey => accountBalanceAtDate(latest, accountKey, point.date));
      if (actualParts.some(value => value === null)) continue;
      const actual = (actualParts as number[]).reduce((sum, value) => sum + value, 0);
      results.push({
        forecastSnapshotId: source.meta.snapshotId,
        forecastAsOfDate: source.forecast.asOfDate,
        targetDate: point.date,
        forecastAmount: point.projectedPosition.amount,
        actualAmount: actual,
        error: point.projectedPosition.amount - actual,
        currency: point.projectedPosition.currency,
      });
    }
  }
  return results.sort((a, b) => a.targetDate.localeCompare(b.targetDate));
}

export function reliabilitySummary(snapshot: AyqAnalyticalSnapshot) {
  return {
    generatedAt: snapshot.meta.generatedAt,
    reliabilityBoundary: snapshot.meta.coverage.reliabilityBoundary,
    boundaryBasis: snapshot.meta.coverage.reliabilityBoundaryBasis.map(key => snapshot.accounts.find(x => x.accountKey === key)?.name ?? key),
    accounts: snapshot.accounts.map(account => ({
      accountKey: account.accountKey,
      name: account.name,
      lastStatementDate: account.statementCoverage.lastStatementDate,
      reconciliationState: account.reconciliation.state,
      reconciliationDifference: account.reconciliation.difference,
      countsTowardAvailableFunds: account.countsTowardAvailableFunds,
    })),
  };
}
