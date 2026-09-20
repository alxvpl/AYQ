// AYQ Analyses — A1.
//
// Contract types for the frozen r003 synthetic-input baseline, plus the
// structured A1 analysis result. Nothing here describes A2, A3 or A4.

export type Currency = string;

/** An inclusive calendar date, `YYYY-MM-DD`. */
export type IsoDate = string;

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
  reliabilityBoundary: IsoDate;
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

/**
 * The frozen r003 baseline defines two reconciliation states and no other.
 * An unknown token is a validation failure (007 §6), not a third A1 sentence.
 */
export type ReconciliationStateToken = 'agrees' | 'differs';

export interface ReconciliationState {
  state: ReconciliationStateToken;
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
  openingDate: IsoDate;
  openingBalance: Money;
  ledgerBalance: Money;
  statementCoverage: {
    lastStatementDate: IsoDate;
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

export type CategorisationSource = 'manual' | 'rule' | 'none';

export interface Categorisation {
  source: string;
  ruleKey?: string | null;
  [key: string]: unknown;
}

export type TransactionClass =
  | 'credit_transfer'
  | 'direct_debit'
  | 'card_payment'
  | 'bank_fee'
  | 'cash_withdrawal'
  | 'other';

export interface Transaction {
  transactionKey: string;
  accountKey: string;
  bookingDate: IsoDate;
  valueDate: IsoDate | null;
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
  kind: string;
  name: string;
  categoryId: string | null;
  counterpartyKey: string | null;
  amount: Money;
  recurrence: { type: string; [key: string]: unknown };
  state: string;
  stateSince: string;
}

export interface ExpectedOccurrence {
  occurrenceKey: string;
  recordKey: string;
  expectedDate: IsoDate;
  amount: Money;
  state: string;
  match: null | { transactionKey: string; source: string; matchedOn: string };
}

export interface ForecastPoint {
  date: IsoDate;
  projectedPosition: Money;
}

export interface CanonicalForecast {
  kind: string;
  asOfDate: IsoDate;
  horizonMonths: number;
  horizonEnd: IsoDate;
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

// ---------------------------------------------------------------------------
// A1 analytical context
// ---------------------------------------------------------------------------

export type ComparisonMode = 'none' | 'previous' | 'sameLastYear';

/** `null` is the explicit Uncategorised entry of the category selection. */
export type CategorySelectionEntry = string | null;

/**
 * The whole A1 analytical context. Metric is fixed to money-out and dimension
 * to canonical counterparty, so neither is a parameter (007 §5). There is no
 * search, transaction-class, amount-threshold or include-uncategorised input:
 * they are removed, not hidden.
 */
export interface AnalysisContext {
  fromDate: IsoDate;
  toDate: IsoDate;
  comparison: ComparisonMode;
  accountKeys: readonly string[];
  categoryKeys: readonly CategorySelectionEntry[];
}

// ---------------------------------------------------------------------------
// A1 structured result
// ---------------------------------------------------------------------------

export type ExclusionClass = 'notApplicable' | 'notIdentified';

export type ContributionSubject =
  | { kind: 'counterparty'; counterpartyKey: string }
  | { kind: 'excluded'; exclusion: ExclusionClass };

/** Why a resolved reversal original is not part of the current population. */
export type OriginalOutsideReason =
  | 'period'
  | 'accounts'
  | 'filter'
  | 'selection';

/** One transaction's contribution to A1 money-out. The single source of truth. */
export interface Contribution {
  transactionKey: string;
  /** Signed minor units: positive for money-out, negative for a reversal. */
  amountMinor: number;
  currency: Currency;
  subject: ContributionSubject;
  transaction: Transaction;
  /** Human facts the interface shows, resolved once by the engine. */
  accountName: string;
  categoryName: string | null;
  /** Present when this contribution comes from a reversal. */
  original: {
    transaction: Transaction;
    counterpartyName: string | null;
    outsideReason: OriginalOutsideReason | null;
  } | null;
}

export interface CounterpartyRow {
  counterpartyKey: string;
  displayName: string;
  transactionCount: number;
  moneyOutMinor: number;
  currency: Currency;
  previousMinor: number | null;
  changeMinor: number | null;
  contributions: Contribution[];
}

export interface ExclusionGroup {
  exclusion: ExclusionClass;
  transactionCount: number;
  /** `null` when the population is not single-currency. */
  amountMinor: number | null;
  currency: Currency | null;
  contributions: Contribution[];
}

export interface AccountCoverageInterval {
  accountKey: string;
  name: string;
  displayIdentifier: string | null;
  openingDate: IsoDate;
  lastStatementDate: IsoDate;
}

export type CoverageStatus = 'full' | 'limited' | 'insufficient';

export interface CoverageLimit {
  date: IsoDate;
  /** Every account tied at this limit, in deterministic order. */
  accountKeys: string[];
}

export interface CoverageFacts {
  fromDate: IsoDate;
  toDate: IsoDate;
  accounts: AccountCoverageInterval[];
  status: CoverageStatus;
  /** Present only when the requested period begins before the covered start. */
  startLimit: CoverageLimit | null;
  /** Present only when the requested period ends after the covered end. */
  endLimit: CoverageLimit | null;
  /** The covered end of the selected scope; `null` when no account covers anything. */
  coveredThrough: IsoDate | null;
}

export interface ReconciliationFact {
  accountKey: string;
  name: string;
  displayIdentifier: string | null;
  state: ReconciliationStateToken;
  differenceMinor: number;
  currency: Currency;
}

export type ComparisonUnavailableReason = 'coverage' | 'noData' | 'currency';

export interface ComparisonFacts {
  mode: ComparisonMode;
  fromDate: IsoDate;
  toDate: IsoDate;
  /** Set when `sameLastYear` clamped 29 February. */
  clamped: { requestedDate: IsoDate; clampedDate: IsoDate; year: number } | null;
  coverage: CoverageFacts;
  /** `null` when the comparison is unavailable. */
  totalMinor: number | null;
  currency: Currency | null;
  unavailable: ComparisonUnavailableReason | null;
  /** Currencies found in the comparison population, for the currency reason. */
  currencies: Currency[];
}

export type ResultState =
  | 'result'
  | 'coverageLimited'
  | 'empty'
  | 'insufficient'
  | 'unsupported';

export interface AnalysisResult {
  context: AnalysisContext;
  generatedAt: string;
  state: ResultState;
  coverage: CoverageFacts;
  reconciliation: ReconciliationFact[];
  /** `null` for insufficient, empty and unsupported. */
  totalMinor: number | null;
  currency: Currency | null;
  /** Every currency present in the current contributing population. */
  currencies: Currency[];
  rows: CounterpartyRow[];
  exclusions: ExclusionGroup[];
  comparison: ComparisonFacts | null;
  /** Delta = current supported total − comparison supported total. */
  deltaMinor: number | null;
  /** Every contribution of the current population, rows and exclusions alike. */
  contributions: Contribution[];
}
