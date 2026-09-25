// AYQ Analyses — types.
//
// The snapshot is the executable contract 1.0 (ayq/ayq-analytical-contract):
// its types are re-exported here unchanged, so the consumer's model of the
// input is the producer's model, not a second description of it. What follows
// the re-exports is the structured A1 analysis result. Nothing here describes
// A2, A3 or A4.

export type {
  Account,
  AccountType,
  AbsoluteBalance,
  AnalyticalSnapshotV1,
  CanonicalForecast,
  Category,
  CategoryGroup,
  CategoryPlan,
  CategorySource,
  Counterparty,
  CoverageMeta,
  Currency,
  ExpectationRecord,
  ExpectedOccurrence,
  ForecastPoint,
  InternalTransfer,
  IsoDate,
  Money,
  ProducerInfo,
  Reconciliation,
  Reversal,
  SnapshotCounts,
  SnapshotMeta,
  StatementCoverage,
  Transaction,
  TransactionCategory,
  TransactionClass,
  TransactionCounterparty,
} from '../../ayq-analytical-contract/src/types.ts';

import type { AnalyticalSnapshotV1, Currency, IsoDate, Reconciliation, Transaction } from '../../ayq-analytical-contract/src/types.ts';

/** The snapshot, under the name the consumer has always used for it. */
export type AyqAnalyticalSnapshot = AnalyticalSnapshotV1;

export type ReconciliationStateToken = Reconciliation['state'];

/**
 * The provenance the evidence view states for a contribution (03 §4.3,
 * §11.11): the three sources of a set category, or none when no category is
 * set. A transfer's `not_applicable` never reaches the evidence view, because
 * a transfer contributes nothing (r004 §8.4 step 1).
 */
export type CategorisationSource = 'manual' | 'learned_rule' | 'automatic' | 'none';

export function categorisationSourceOf(transaction: Transaction): CategorisationSource {
  return transaction.category.state === 'categorised' ? transaction.category.source : 'none';
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

/**
 * One transaction's contribution to A1 money-out. The single source of truth.
 *
 * Every financial value from here on is a bigint. A snapshot amount is a safe
 * JSON integer on its own, but the sum of two can exceed what a Number holds
 * exactly, so the contribution boundary is where money becomes exact
 * arithmetic and stays that way through every row, total and delta (r004 §6.3).
 */
export interface Contribution {
  transactionKey: string;
  /** Signed minor units: positive for money-out, negative for a reversal. */
  amountMinor: bigint;
  currency: Currency;
  subject: ContributionSubject;
  transaction: Transaction;
  /** Human facts the interface shows, resolved once by the engine. */
  accountName: string;
  categoryName: string | null;
  /** Present when this contribution comes from a reversal. */
  original: {
    transaction: Transaction;
    /**
     * The original's own A1 money-out contribution — positive for the payment
     * a reversal reverses — from the same contribution function as every
     * other figure, so the evidence view speaks one sign convention without
     * reading a raw amount's sign for itself (r05 §9, PC3).
     */
    moneyOutMinor: bigint;
    counterpartyName: string | null;
    outsideReason: OriginalOutsideReason | null;
  } | null;
}

export interface CounterpartyRow {
  counterpartyKey: string;
  displayName: string;
  transactionCount: number;
  moneyOutMinor: bigint;
  currency: Currency;
  previousMinor: bigint | null;
  changeMinor: bigint | null;
  contributions: Contribution[];
}

export interface ExclusionGroup {
  exclusion: ExclusionClass;
  transactionCount: number;
  /** `null` when the population is not single-currency. */
  amountMinor: bigint | null;
  currency: Currency | null;
  contributions: Contribution[];
}

export interface AccountCoverageInterval {
  accountKey: string;
  name: string;
  displayIdentifier: string;
  /**
   * The proven coverage start, or `null` for UNKNOWN_START (03 §8.7; 010 §2):
   * the end of this account's coverage is known, the beginning is not
   * established. Never replaced by the earliest transaction.
   */
  coverageStartDate: IsoDate | null;
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
  /**
   * The selected accounts whose coverage start is not established, in the
   * same deterministic order as `accounts`. Non-empty qualifies a Result and
   * replaces the empty sentence (010 §3); it is not a coverage limit.
   */
  unknownStartAccountKeys: string[];
}

export type ReconciliationFact = {
  accountKey: string;
  name: string;
  displayIdentifier: string;
} & (
  | {
      /** The bank stated no closing balance at the coverage date (03 §13.3). */
      state: 'unavailable';
    }
  | {
      state: 'agrees' | 'differs';
      /** The exact signed difference the snapshot supplied, kept as supplied. */
      differenceMinor: bigint;
      /**
       * Its magnitude, taken in exact integer arithmetic here rather than in a
       * component: the flyout sentence states how far the statement and the
       * ledger differ and deliberately not which is higher (r05 §6, PC4).
       */
      differenceMagnitudeMinor: bigint;
      currency: Currency;
    }
);

export type ComparisonUnavailableReason = 'coverage' | 'noData' | 'currency' | 'unknownStart';

export interface ComparisonFacts {
  mode: ComparisonMode;
  fromDate: IsoDate;
  toDate: IsoDate;
  /** Set when `sameLastYear` clamped 29 February. */
  clamped: { requestedDate: IsoDate; clampedDate: IsoDate; year: number } | null;
  coverage: CoverageFacts;
  /** `null` when the comparison is unavailable. */
  totalMinor: bigint | null;
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
  totalMinor: bigint | null;
  currency: Currency | null;
  /** Every currency present in the current contributing population. */
  currencies: Currency[];
  rows: CounterpartyRow[];
  exclusions: ExclusionGroup[];
  comparison: ComparisonFacts | null;
  /** Delta = current supported total − comparison supported total. */
  deltaMinor: bigint | null;
  /** Every contribution of the current population, rows and exclusions alike. */
  contributions: Contribution[];
}
