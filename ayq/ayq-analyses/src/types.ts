export type Currency = string;

export interface Money {
  amount: number;
  currency: Currency;
}

export interface ProducerInfo {
  productVersion: string;
  buildNumber: number;
  commitSha: string;
}

export interface CoverageMeta {
  reliabilityBoundary: string;
  reliabilityBoundaryBasis: string[];
}

export interface SnapshotCounts {
  accounts: number;
  transactions: number;
  counterparties: number;
  categories: number;
  uncategorisedTransactions: number;
  unresolvedCounterparties: number;
  counterpartyNotApplicable: number;
  expectedOccurrences: number;
}

export interface SnapshotMeta {
  contractVersion: string;
  snapshotId: string;
  generatedAt: string;
  budgetKey: string;
  producer: ProducerInfo;
  currencies: Currency[];
  coverage: CoverageMeta;
  counts: SnapshotCounts;
}

export interface ReconciliationState {
  state: string;
  ledgerBalanceAtCoverageDate: Money;
  statementClosingBalance: Money;
  difference: Money;
}

export interface Account {
  accountKey: string;
  name: string;
  type: string;
  displayIdentifier: string | null;
  countsTowardAvailableFunds: boolean;
  currency: Currency;
  openingDate: string;
  openingBalance: Money;
  ledgerBalance: Money;
  statementCoverage: {
    lastStatementDate: string;
    closingBalance: Money;
  };
  reconciliation: ReconciliationState;
}

export interface Counterparty {
  counterpartyKey: string;
  displayName: string;
  evidenceClass?: string;
}

export interface CategoryGroup {
  categoryGroupId: string;
  name: string;
}

export interface Category {
  categoryId: string;
  name: string;
  categoryGroupId: string | null;
}

export interface Categorisation {
  source: string;
  ruleKey?: string | null;
  [key: string]: unknown;
}

export interface Transaction {
  transactionKey: string;
  accountKey: string;
  bookingDate: string;
  valueDate: string | null;
  amount: Money;
  transactionClass: string;
  counterpartyKey: string | null;
  categoryId: string | null;
  categorisation: Categorisation | null;
  isInternalTransfer: boolean;
  internalTransferPairKey: string | null;
  counterAccountKey: string | null;
  isReversal: boolean;
  reversalOfTransactionKey: string | null;
  evidenceText: string | null;
}

export interface CategoryPlan {
  categoryId: string;
  month: string;
  plannedAmount: Money;
}

export interface ExpectationRecord {
  recordKey: string;
  accountKey: string | null;
  kind: 'expense' | 'income' | string;
  name: string;
  categoryId: string | null;
  counterpartyKey: string | null;
  amount: Money;
  recurrence: {
    type: string;
    dayOfMonth?: number;
    month?: number;
    [key: string]: unknown;
  };
  state: string;
  stateSince: string;
}

export interface ExpectedOccurrence {
  occurrenceKey: string;
  recordKey: string;
  expectedDate: string;
  amount: Money;
  state: string;
  match: null | {
    transactionKey: string;
    source: string;
    matchedOn: string;
  };
}

export interface ForecastPoint {
  date: string;
  projectedPosition: Money;
}

export interface CanonicalForecast {
  kind: string;
  asOfDate: string;
  horizonMonths: number;
  horizonEnd: string;
  currency: Currency;
  basisAccountKeys: string[];
  openingPosition: Money;
  series: ForecastPoint[];
  unavailableReason: string | null;
}

export interface AyqAnalyticalSnapshot {
  meta: SnapshotMeta;
  accounts: Account[];
  counterparties: Counterparty[];
  categoryGroups: CategoryGroup[];
  categories: Category[];
  transactions: Transaction[];
  categoryPlans: CategoryPlan[];
  expectationRecords: ExpectationRecord[];
  expectedOccurrences: ExpectedOccurrence[];
  forecast: CanonicalForecast;
}

export type Metric = 'money-out' | 'money-in' | 'net' | 'count';
export type Dimension = 'categoryId' | 'counterpartyKey' | 'accountKey' | 'transactionClass' | 'month';

export interface AnalysisContext {
  fromMonth: string;
  toMonth: string;
  compare: 'previous' | 'year-over-year' | 'none';
  metric: Metric;
  dimension: Dimension;
  accountKeys: string[];
  transactionClasses: string[];
  includeUncategorised: boolean;
  minimumAbsoluteAmount: number;
  search: string;
}

export interface GroupRow {
  key: string;
  label: string;
  value: number;
  transactionCount: number;
}

export interface ExploreResult {
  value: number;
  transactionCount: number;
  comparisonValue: number | null;
  delta: number | null;
  rows: GroupRow[];
  reliabilityLimitation: string | null;
}

export interface FixedCostHistoryPoint {
  effectiveDate: string;
  amount: number;
  currency: Currency;
}

export interface FixedCostResult {
  recordKey: string;
  name: string;
  recurrenceType: string;
  state: string;
  evidenceStatus: 'proven' | 'insufficient';
  currentExpected: Money;
  paidHistory: FixedCostHistoryPoint[];
  latestPaid: Money | null;
  monthlyCommittedAmount: number | null;
}

export interface OccurrenceClassification {
  occurrence: ExpectedOccurrence;
  record: ExpectationRecord;
  kind: 'missing' | 'not-yet-imported' | 'undecidable';
  reason: string;
}

export interface ForecastBacktestPoint {
  forecastSnapshotId: string;
  forecastAsOfDate: string;
  targetDate: string;
  forecastAmount: number;
  actualAmount: number;
  error: number;
  currency: Currency;
}

export interface ArchivedSnapshotSummary {
  snapshotId: string;
  generatedAt: string;
  contractVersion: string;
  path: string;
}
