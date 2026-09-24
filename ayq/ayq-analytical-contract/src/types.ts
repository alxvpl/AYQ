// @ayq/analytical-contract — the executable 1.1 shape of the AYQ → AYQ Analyses
// analytical snapshot: the 1.0 shape plus the four additive expectation facts
// of AYQ_ANALYSES_A2_SPECIFICATION r001 §5.
//
// This module is the system of record for exact field names, structure,
// cardinality and nullability (A2 exchange 016 §4, as corrected by 017). It is
// subordinate to current AYQ Canon: 02 §7 owns the egress architecture, 03 §13
// owns the snapshot's financial content and semantics, and 03 §3, §4, §7, §8,
// §9, §10 and §11 own the domain meanings that cross. The types encode those
// rules; they do not reinterpret or extend them.
//
// The 1.1 fields are optional in the types because a valid 1.0 snapshot has
// none of them; the validator requires them wherever the snapshot declares
// minor ≥ 1, and returns none of them for a 1.0 snapshot.

/** ISO 4217 alpha-3, upper case. */
export type Currency = string;

/** An inclusive calendar date, `YYYY-MM-DD`. */
export type IsoDate = string;

/** A calendar month, `YYYY-MM`. */
export type IsoMonth = string;

/**
 * Exact integer minor units plus an explicit currency (03 §13.5). A JSON
 * amount that is not a safe integer is refused at ingestion, never rounded.
 */
export interface Money {
  amount: number;
  currency: Currency;
}

// ---- meta -------------------------------------------------------------------

export interface ProducerInfo {
  productVersion: string;
  buildNumber: number;
  commitSha: string;
}

export interface CoverageMeta {
  /**
   * The minimum `lastStatementDate` over the accounts that count toward
   * available funds (03 §8.4); absent when no account counts.
   */
  reliabilityBoundary?: IsoDate;
  /** Exactly the funds-counting accounts on that minimum; `[]` when none. */
  reliabilityBoundaryBasis: string[];
}

/**
 * Snapshot-wide integrity metadata, checked against the content by the
 * validator. These are never a filtered result's counts: a consumer that shows
 * an exclusion or uncategorised count for a scoped result computes it from the
 * transactions it selected (017 §3).
 */
export interface SnapshotCounts {
  accounts: number;
  transactions: number;
  counterparties: number;
  categories: number;
  expectedOccurrences: number;
  /** Transactions whose `category.state` is `uncategorised`. */
  uncategorisedTransactions: number;
  /** Non-internal-transfer transactions whose `counterparty.state` is `unresolved`. */
  unresolvedCounterparties: number;
  /** Non-internal-transfer transactions whose `counterparty.state` is `not_applicable`. */
  counterpartyNotApplicable: number;
}

export interface SnapshotMeta {
  /** `major.minor`; the first accepted producer version is `1.0`. */
  contractVersion: string;
  snapshotId: string;
  /** RFC 3339, UTC (`Z` or `+00:00`). */
  generatedAt: string;
  /**
   * 1.1 (required for minor ≥ 1): the one AYQ calendar date against which the
   * expectation state in this snapshot is judged — the same "today" AYQ built
   * its plan and occurrence state with. Not later than the UTC calendar date
   * of `generatedAt`, which stays the production timestamp and is never a
   * substitute. A consumer never derives it from its own clock.
   */
  expectationsAsOfDate?: IsoDate;
  budgetKey: string;
  producer: ProducerInfo;
  /** The unique currency inventory of the accounts. */
  currencies: Currency[];
  coverage: CoverageMeta;
  counts: SnapshotCounts;
}

// ---- accounts -----------------------------------------------------------------

export type AccountType = 'current' | 'savings' | 'unknown' | 'other';

export interface StatementCoverage {
  /**
   * The proven bank-data coverage start (03 §8.7, §13.13): present only when
   * AYQ can establish continuous completeness from that date. Absent means
   * the beginning of coverage is not established (UNKNOWN_START) and must not
   * be replaced by the earliest transaction or any inferred date.
   */
  coverageStartDate?: IsoDate;
  lastStatementDate: IsoDate;
  /** Present exactly when reconciliation is not `unavailable`. */
  bankClosingBalance?: Money;
}

export type AbsoluteBalance = { state: 'known'; amount: Money } | { state: 'unknown' };

export type Reconciliation =
  | { state: 'unavailable' }
  | { state: 'agrees'; ledgerBalanceAtCoverageDate: Money; difference: Money }
  | { state: 'differs'; ledgerBalanceAtCoverageDate: Money; difference: Money };

export interface Account {
  accountKey: string;
  name: string;
  type: AccountType;
  /** Masked: the country code and the final four characters only, e.g. `NL…0708`. */
  displayIdentifier: string;
  countsTowardAvailableFunds: boolean;
  currency: Currency;
  statementCoverage: StatementCoverage;
  absoluteBalance: AbsoluteBalance;
  reconciliation: Reconciliation;
}

// ---- counterparties and categories ------------------------------------------------

export interface Counterparty {
  counterpartyKey: string;
  displayName: string;
}

export interface CategoryGroup {
  categoryGroupId: string;
  name: string;
}

export interface Category {
  categoryId: string;
  name: string;
  categoryGroupId: string;
}

// ---- transactions -----------------------------------------------------------------

export type TransactionClass =
  | 'credit_transfer'
  | 'direct_debit'
  | 'card_payment'
  | 'bank_fee'
  | 'cash_withdrawal'
  | 'other';

/**
 * The three counterparty states of 03 §13.14: identified; no counterparty by
 * nature (a positive classification of the operation — a cash withdrawal
 * always); or expected but unresolved.
 */
export type TransactionCounterparty =
  | { state: 'identified'; counterpartyKey: string }
  | { state: 'not_applicable' }
  | { state: 'unresolved' };

/**
 * Categorisation provenance (03 §4.3, §11.11): a person, the owner's own
 * learned rule (which names itself), or AYQ's automatic classification.
 */
export type CategorySource = 'manual' | 'learned_rule' | 'automatic';

export type TransactionCategory =
  | { state: 'categorised'; categoryId: string; source: CategorySource; ruleKey?: string }
  | { state: 'uncategorised' }
  | { state: 'not_applicable' };

export interface InternalTransfer {
  /** Shared by the two sides of one movement between the owner's own accounts. */
  pairKey: string;
  counterAccountKey: string;
}

export interface Reversal {
  /** The transaction this one reverses; resolves within the same snapshot. */
  originalTransactionKey: string;
}

export interface Transaction {
  /** Opaque and stable while the same AYQ budget identity persists (03 §13.6). */
  transactionKey: string;
  accountKey: string;
  bookingDate: IsoDate;
  amount: Money;
  transactionClass: TransactionClass;
  counterparty: TransactionCounterparty;
  category: TransactionCategory;
  /** Present exactly when `category.state` is `not_applicable`. */
  internalTransfer?: InternalTransfer;
  reversal?: Reversal;
  /**
   * Bounded text for the owner's recognition of the transaction (03 §13.8):
   * at most 256 Unicode code points, no line breaks, no excluded identifier.
   */
  evidenceText: string;
}

// ---- plans and expectations ------------------------------------------------------

export interface CategoryPlan {
  categoryId: string;
  month: IsoMonth;
  plannedAmount: Money;
}

export type ExpectationKind = 'income' | 'expense';

export type ExpectationCategory = { state: 'categorised'; categoryId: string } | { state: 'uncategorised' };

export type Schedule =
  | { type: 'one_time'; date: IsoDate }
  | { type: 'recurring'; frequency: 'weekly' | 'monthly' | 'yearly'; interval: number; anchorDate: IsoDate };

export type ExpectationState = 'confirmed' | 'suggested';

/**
 * No `accountKey` exists on a record (DQ1 deferred, 016 §5.8; still refused in
 * 1.1). The 1.1 account association is `expectedAccountKey`, deliberately
 * spelled differently so that the 1.0 reader keeps accepting a 1.1 snapshot.
 */
export interface ExpectationRecord {
  recordKey: string;
  kind: ExpectationKind;
  name: string;
  counterpartyKey?: string;
  category: ExpectationCategory;
  amount: Money;
  schedule: Schedule;
  state: ExpectationState;
  stateSince: IsoDate;
  /**
   * 1.1, optional: the included account on which AYQ canonically expects the
   * record to occur. Present only when AYQ's own record names an account and
   * that account is in `accounts[]`; resolves to `accounts[].accountKey`.
   * Absent otherwise — never inferred from a counterparty, an amount or
   * history.
   */
  expectedAccountKey?: string;
}

export type OccurrenceState = 'expected' | 'matched' | 'overdue' | 'dismissed';

export interface OccurrenceMatch {
  transactionKey: string;
  /** A bounded provenance token; never a recipe for AYQ's matching. */
  source: string;
  matchedOn: IsoDate;
}

export interface ExpectedOccurrence {
  occurrenceKey: string;
  recordKey: string;
  expectedDate: IsoDate;
  amount: Money;
  categoryOverride?: ExpectationCategory;
  state: OccurrenceState;
  /** Present exactly when `state` is `matched`. */
  match?: OccurrenceMatch;
  /**
   * 1.1 (required on every occurrence for minor ≥ 1, matched and dismissed
   * included): the last transaction date still inside AYQ's canonical
   * automatic matching date window for this occurrence; never before
   * `expectedDate`. It bounds automatic matching only — it does not say a
   * later match by hand is impossible. The window's width is AYQ's; this
   * contract carries the date, never the duration.
   */
  automaticMatchThroughDate?: IsoDate;
  /**
   * 1.1, present exactly when the occurrence's record carries
   * `expectedAccountKey`: whether AYQ proves that its imported bank-movement
   * coverage of that account is continuous over every day of the full
   * automatic matching window. False on trailing uncovered time, on an
   * internal gap of any length, and when the start of coverage is not proven.
   * Never derivable from `lastStatementDate` alone.
   */
  automaticMatchWindowCovered?: boolean;
}

// ---- forecast -----------------------------------------------------------------

export interface ForecastPoint {
  date: IsoDate;
  projectedPosition: Money;
}

/** The canonical AYQ Forecast, sealed (03 §13.7): a result, never a recipe. */
export type CanonicalForecast =
  | {
      state: 'available';
      kind: 'canonical_ayq_forecast';
      asOfDate: IsoDate;
      horizonMonths: 12;
      horizonEnd: IsoDate;
      currency: Currency;
      basisAccountKeys: string[];
      openingPosition: Money;
      series: ForecastPoint[];
    }
  | {
      state: 'unavailable';
      kind: 'canonical_ayq_forecast';
      asOfDate: IsoDate;
      horizonMonths: 12;
      horizonEnd: IsoDate;
      basisAccountKeys: string[];
      /** At most 128 characters; AYQ result provenance, not a recipe. */
      unavailableReason: string;
    };

// ---- the snapshot ---------------------------------------------------------------

export interface AnalyticalSnapshotV1 {
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
