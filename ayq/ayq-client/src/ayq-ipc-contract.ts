// The typed boundary between the AYQ renderer and the AYQ Electron host.
//
// This file is the contract, and it is the reason the renderer can stay
// ignorant of Actual. It declares types and one channel name. It imports
// nothing — not `@actual-app/api`, not `loot-core`, not `electron`, not even
// `node:` — and `ayq-client` as a whole holds to the same rule, enforced by a
// test rather than by discipline.
//
// The shape follows the one Actual's shipped desktop app already uses: a single
// generic channel carrying correlated request/response messages, rather than a
// channel per feature. Adding a capability means adding a member to the request
// union and a line to the result map, not a new channel and a new preload entry.
//
// Everything crossing the boundary is structured-clone safe. Amounts are
// integer cents, as the engine stores them; formatting is the renderer's job.

/** The single IPC channel. One channel, like Actual's own `message`. */
export const AYQ_IPC_CHANNEL = 'ayq:request';

/** An account as the renderer sees it. */
export type AyqAccountSummary = {
  id: string;
  name: string;
  /** Signed integer cents, computed by the engine, not by the renderer. */
  balanceCents: number;
  /** Transactions the budget holds for it. */
  transactionCount: number;
  /**
   * Whether this account's balance forms available funds (03 §7.6).
   *
   * AYQ's own flag, not Actual's on/off-budget distinction: that one also
   * decides what Actual counts in a budget month, which the Plan reads.
   */
  countsTowardFunds: boolean;
};

/** Proof of life from the engine, computed from a real budget. */
export type AyqEngineStatus = {
  /** The version of `@actual-app/api` the host actually loaded. */
  apiVersion: string;
  /** The engine process kind that answered: how the host forked it. */
  engineHost: string;
  /** Whether the budget existed already or was created on this launch. */
  budgetCreated: boolean;
  budgetId: string;
  budgetName: string;
  /** Where the budget and the AYQ store live. */
  dataDir: string;
  /** The AYQ store's schema version, so an upgrade can be reasoned about. */
  storeVersion: number;
  /**
   * Actual's budget type, as the open budget actually has it.
   *
   * `tracking`, always, and read back rather than assumed: it is what makes a
   * category's monthly plan mean 03 §7.8 rather than envelope arithmetic, and
   * a budget quietly left on the other one would be wrong in a way no figure
   * on the screen would show.
   */
  budgetType: string;
  /**
   * The name of a store AYQ could not read and had to set aside, if there is
   * one. Rules and provenance from before it are gone; the file is not.
   */
  storeDamaged: string | null;
  answeredAt: string;
};

/**
 * One row of the ledger, as the screen needs it.
 *
 * `payee` is the canonical counterparty — the point of the whole CAMT exercise
 * — and not the bank's raw string. The engine reads these from the budget; the
 * renderer formats them and nothing more.
 */
/**
 * Who decided a transaction's category.
 *
 * `manual` is a person's own choice and outranks everything: no rule may
 * overwrite it. `rule` is a standing decision about a counterparty, and a rule
 * may revise its own earlier work. `null` means nothing has decided yet.
 */
export type AyqCategorySource = 'manual' | 'rule' | null;

export type AyqLedgerRow = {
  id: string;
  /** YYYY-MM-DD, the booking date the import chose. */
  date: string;
  /** The canonical counterparty, null only when the budget has no payee. */
  payee: string | null;
  /** Signed integer cents, as the engine stores them. */
  amountCents: number;
  account: string;
  accountId: string;
  category: string | null;
  categoryId: string | null;
  categorySource: AyqCategorySource;
  /** Booked rather than pending, as the statement said. */
  cleared: boolean;
};

/** What to show. Everything is optional; nothing means "the newest of all". */
export type AyqLedgerFilter = {
  /** Matched against the counterparty and what the bank said, case-blind. */
  search?: string;
  accountId?: string;
  /** Inclusive YYYY-MM-DD bounds. */
  from?: string;
  to?: string;
  /** Only transactions with no category. */
  uncategorised?: boolean;
  /** Only transactions in one category. */
  categoryId?: string;
  /** One canonical counterparty, by its grouping key. */
  counterpartyKey?: string;
  limit?: number;
};

/**
 * One counterparty nobody has filed yet, and what it comes to.
 *
 * The backlog on day one is not a list of transactions — it is a list of shops.
 * Twelve thousand rows across six years is perhaps thirty counterparties, and
 * one decision about each files all of them, so the work is ordered by what it
 * is worth rather than by date.
 */
export type AyqUnfiled = {
  /** The canonical counterparty key a rule would be written against. */
  key: string;
  name: string;
  /** Spending, positive, over the period asked about. */
  cents: number;
  transactions: number;
  firstDate: string;
  lastDate: string;
};

/** Which period, and which account, the spending question is being asked of. */
export type AyqSpendingFilter = {
  /** Inclusive YYYY-MM-DD bounds; both absent means everything there is. */
  from?: string;
  to?: string;
  accountId?: string;
};

export type AyqLedger = {
  /** Newest first. */
  rows: AyqLedgerRow[];
  /** Transactions matching the filter, counted by the engine. */
  total: number;
  /** How many of them this answer carries. */
  shown: number;
};

/**
 * What the bank said and what AYQ made of it, for one transaction.
 *
 * Actual's schema has nowhere for a bank transaction code, a counterparty IBAN
 * or a SEPA mandate, so they are kept beside the budget and joined back here.
 */
export type AyqProvenance = {
  importId: string;
  /**
   * The counterparty key the automatic resolver decided, at import time.
   *
   * This is evidence, and it is never rewritten. An alias is a later and
   * separate decision about which canonical counterparty this key belongs to,
   * and it is applied when the ledger is read rather than by editing what the
   * bank sent.
   */
  counterpartyKey: string | null;
  /**
   * The name the automatic resolver pronounced, before canonicalisation.
   *
   * This is the imported name variant an alias is written against — 'TESTFUEL
   * 22' rather than the whole string the terminal printed, which is kept in
   * the description field. Absent on records written by AYQ store version 1.
   */
  counterpartyName?: string | null;
  /** The layer of the resolver that pronounced the name. */
  resolvedBy: string;
  /** The payment kind read off BkTxCd. */
  kind: string;
  counterpartyIban: string | null;
  intermediary: string | null;
  mandateId: string | null;
  endToEndId: string | null;
  bankTransactionCode: string | null;
  valueDate: string | null;
  /** What the bank actually wrote, verbatim. */
  description: string | null;
  file: string | null;
};

/**
 * What filing one transaction by hand changed, and what it makes possible.
 *
 * The count is the honest basis for the offer that follows: "the other four
 * from this shop", and no offer at all when there is no other.
 */
export type AyqCategorised = {
  row: AyqLedgerRow;
  counterpartyKey: string | null;
  counterpartyName: string | null;
  /** Transactions from the same counterparty a rule could still file. */
  pendingForCounterparty: number;
};

export type AyqTransactionDetail = {
  row: AyqLedgerRow;
  /** The variant the bank printed, before the canonical name replaced it. */
  importedPayee: string | null;
  notes: string | null;
  importedId: string | null;
  provenance: AyqProvenance | null;
};

export type AyqCategory = {
  id: string;
  name: string;
  groupId: string;
  groupName: string;
  isIncome: boolean;
};

/** A standing decision: this counterparty belongs in that category. */
export type AyqCategoryRule = {
  id: string;
  counterpartyKey: string;
  /** Kept by name: a category id is a budget's, a rule outlives one. */
  categoryName: string;
  createdAt: string;
};

export type AyqRecurring = {
  /** The canonical counterparty key. */
  key: string;
  name: string;
  occurrences: number;
  /** weekly | monthly | quarterly | yearly | irregular. */
  cadence: string;
  /** Whether every charge was the same, within a quarter. */
  amountVaries: boolean;
  averageAmountCents: number;
  lastAmountCents: number;
  firstDate: string;
  lastDate: string;
  /** Last date plus the median interval. Null when the cadence is irregular. */
  nextExpectedDate: string | null;
  /** A SEPA mandate makes it a subscription rather than a habit. */
  mandateId: string | null;
};

/* ---------------------------------------------------- counterparties, aliases

   A counterparty is who the money went to, as a thing a person can look at and
   manage — not a string on a row. It is identified by its canonical key, and
   everything about it below is counted by the engine.

   An alias is one explicit decision: this imported name variant is that
   counterparty. It is not a guess, not a similarity score and not a merchant
   AYQ was taught in advance. It is also not a category rule: an alias answers
   "who is this?", a rule answers "where does it belong?", and the two never
   speak for each other.                                                      */

/** A counterparty as the workspace lists it. Every figure is the engine's. */
export type AyqCounterparty = {
  /** The canonical key, aliases applied. Rules and filters use this. */
  key: string;
  /** What to call it: the payee the newest of its transactions carries. */
  name: string;
  transactions: number;
  /** Spending, stated positive, over everything the budget holds. */
  outgoingCents: number;
  firstDate: string;
  lastDate: string;
  /** The category its rule files it under, when it has one. */
  categoryName: string | null;
  /** Whether the recurring view currently finds a rhythm here. */
  recurring: boolean;
  /** Imported name variants a person has explicitly assigned to it. */
  aliases: number;
};

export type AyqCounterpartyFilter = {
  /** Matched against the name and the key, case-blind. */
  search?: string;
  limit?: number;
};

export type AyqCounterpartyList = {
  /** Biggest spend first. */
  rows: AyqCounterparty[];
  total: number;
  shown: number;
};

/**
 * One imported name variant AYQ has actually seen under a counterparty.
 *
 * `key` is what an alias matches on, and it is the key the automatic resolver
 * decided for these transactions. `names` are the strings the bank printed that
 * normalised to it — evidence, not identity.
 */
export type AyqCounterpartyVariant = {
  key: string;
  /** Newest first, and capped: a list, not a transcript. */
  names: string[];
  transactions: number;
  firstDate: string;
  lastDate: string;
  /** True when this variant is under this counterparty because a person said so. */
  aliased: boolean;
};

export type AyqCounterpartyDetail = {
  counterparty: AyqCounterparty;
  variants: AyqCounterpartyVariant[];
  /** The rhythm, when the recurring view finds one. */
  recurring: AyqRecurring | null;
  /** The newest transactions of this counterparty. */
  recent: AyqLedgerRow[];
};

/**
 * An explicit decision that one imported name variant is one counterparty.
 *
 * `variantKey` is what it matches on and is derived from the variant by the
 * same normalisation the importer uses, so matching is exact rather than
 * approximate. `variant` is the name the person was looking at when they
 * decided, kept so the decision can be read back and explained.
 */
export type AyqAliasRecord = {
  id: string;
  variant: string;
  variantKey: string;
  counterpartyKey: string;
  counterpartyName: string;
  createdAt: string;
};

/** What creating or removing an alias did. */
export type AyqAliasApplied = {
  aliases: AyqAliasRecord[];
  /** Transactions whose payee the engine changed as a result. */
  moved: number;
  /** The counterparty they now belong to. */
  counterpartyKey: string;
  counterpartyName: string;
};

export type AyqImportRecord = {
  id: string;
  /** ISO timestamp. */
  at: string;
  /** What was picked: one name, or how many were. */
  file: string;
  files: number;
  records: number;
  prepared: number;
  imported: number;
  duplicates: number;
  skipped: number;
  failed: number;
  accountId: string;
  accountName: string;
  /** Categories the rules assigned during this import. */
  categorised: number;
  /**
   * What was chosen and could not be used, said plainly.
   *
   * A file that would not open, an archive that would not unpack, a document
   * that is not CAMT: each is named once with a reason, so the person can see
   * which of the eight files they picked was the problem instead of being told
   * only that a number failed.
   */
  problems: AyqImportProblem[];
};

/** One chosen thing AYQ could not use, and why. */
export type AyqImportProblem = {
  /** The base name of what was chosen; the path stays on the machine. */
  name: string;
  reason: string;
};

/**
 * What a CAMT import did.
 *
 * Counts and identifiers only. No descriptions, no counterparty names, no
 * amounts, no IBAN: this crosses into the interface and from there into
 * screenshots and CI logs, and bank statements are not for either. The account
 * name is masked at the engine before it ever reaches here.
 */
export type AyqImportSummary = AyqImportRecord & {
  budgetId: string;
  budgetName: string;
  /** Counted by the engine after the import. */
  transactionCountAfter: number;
};

export type AyqSummary = {
  accounts: AyqAccountSummary[];
  totalBalanceCents: number;
  /** The part of it that counts toward available funds (03 §7.6). */
  availableFundsCents: number;
  /** The month the ledger's newest transaction falls in, YYYY-MM. */
  month: string | null;
  monthIncomeCents: number;
  monthExpenseCents: number;
  transactionCount: number;
  uncategorisedCount: number;
  counterpartyCount: number;
  lastImportAt: string | null;
};

/**
 * What one category took over a period.
 *
 * Amounts are spending, stated positive: a person asking what a year cost does
 * not want to read it as a negative number. Income is left out entirely rather
 * than netted off, because a category's total is a question about outgoings and
 * a refund inside it is already subtracted.
 */
export type AyqSpendingRow = {
  /** Null for the transactions nobody has filed yet. */
  categoryId: string | null;
  categoryName: string;
  cents: number;
  transactions: number;
  /** Of the period's total spending, 0 to 1. */
  share: number;
};

/**
 * Spending by category, over the period asked for.
 *
 * `uncategorisedCents` is also present as a row, and deliberately so: a total
 * that quietly omits what has not been filed is a total that lies, and the
 * honest answer to "what did the year cost" includes the part AYQ cannot yet
 * account for.
 */
export type AyqSpending = {
  /** The bounds actually used, so the screen can say what it is showing. */
  from: string | null;
  to: string | null;
  rows: AyqSpendingRow[];
  totalCents: number;
  uncategorisedCents: number;
  incomeCents: number;
  /**
   * Transactions left out because they moved money between two accounts AYQ
   * holds (03 §7.6). Reported rather than silently dropped: a total that is
   * quietly smaller than the ledger is a total nobody can check.
   */
  transferCount: number;
  /** Every month the budget holds a transaction in, newest first. */
  months: string[];
  /** Every year the budget holds a transaction in, newest first. */
  years: string[];
};

/**
 * The files the host's picker returned; empty when the person cancelled.
 *
 * Paths, not contents: the renderer never reads them, and never could — it has
 * no filesystem. It hands them back to the host, which is the side that opened
 * the dialog in the first place. Several, because a bank exports a statement
 * per day and nobody wants to import two hundred of them one at a time.
 */
export type AyqPickedFile = { paths: string[] };

/* ------------------------------------------------------- plan and forecast

   What is expected to happen, as against what has happened. A planned or
   recurring record is one canonical thing — Plan reads it as a monthly frame
   and Upcoming reads it as a series of dates, and they are the same records
   (04 A9). None of this is Actual's: its schedules carry no category and it
   links imported transactions to them by itself, with no provenance, which is
   the one thing AYQ's records exist to keep.                                */

export type AyqPlanKind = 'expense' | 'income';

export type AyqPlanFrequency =
  | 'once'
  | 'weekly'
  | 'fortnightly'
  | 'monthly'
  | 'quarterly'
  | 'half-yearly'
  | 'yearly';

export type AyqPlanRecurrence = {
  frequency: AyqPlanFrequency;
  /** Periods between occurrences. 1 unless a person asked for every other one. */
  interval: number;
};

/**
 * The record's own state (03 §7.7).
 *
 * `suggested` is what the recurring detection produces and nothing else: a
 * rhythm AYQ noticed is an offer, never a decision. `confirmed` is a person's.
 */
export type AyqPlanState = 'suggested' | 'confirmed' | 'dismissed';

/** Who put the record there. A person, or the detection. */
export type AyqPlanProvenance = 'manual' | 'detected';

/**
 * One planned or recurring thing.
 *
 * The category is kept by **name**, not by id, for the reason a rule is
 * (03 §4.2): a category id belongs to one budget and a plan outlives one.
 * `amountCents` is positive and `kind` carries the sign, so a record cannot be
 * an income of minus forty euro.
 */
export type AyqPlannedRecord = {
  id: string;
  name: string;
  kind: AyqPlanKind;
  amountCents: number;
  categoryName: string | null;
  /** The canonical counterparty key, when the record came from one. */
  counterpartyKey: string | null;
  accountId: string | null;
  /** YYYY-MM-DD: the first occurrence, or the only one. */
  startDate: string;
  recurrence: AyqPlanRecurrence;
  /** Inclusive last date the series may reach; null is open-ended. */
  endDate: string | null;
  state: AyqPlanState;
  provenance: AyqPlanProvenance;
  /** A SEPA mandate makes a series a standing arrangement rather than a habit. */
  mandateId: string | null;
  createdAt: string;
  updatedAt: string;
};

/** A record as the screen submits it. Without an id it creates one. */
export type AyqPlanDraft = {
  id?: string;
  name: string;
  kind: AyqPlanKind;
  amountCents: number;
  categoryName: string | null;
  counterpartyKey?: string | null;
  accountId?: string | null;
  startDate: string;
  recurrence: AyqPlanRecurrence;
  endDate?: string | null;
  mandateId?: string | null;
};

/**
 * What a record is on one date.
 *
 * Four of these are derived rather than stored, so they cannot disagree with
 * the facts they come from: `matched` is a transaction id being present,
 * `overdue` is a date having passed unmatched, `rescheduled` is a moved date,
 * and `dismissed` is either the record's state or this occurrence's own.
 */
export type AyqPlanOccurrenceState =
  | 'expected'
  | 'matched'
  | 'overdue'
  | 'rescheduled'
  | 'dismissed';

export type AyqPlanOccurrence = {
  recordId: string;
  name: string;
  kind: AyqPlanKind;
  /** Positive cents; `kind` carries the sign. */
  amountCents: number;
  categoryName: string | null;
  /** The date the recurrence generated. With the record id, this identifies it. */
  dueDate: string;
  /** Where it actually falls: the rescheduled date, or the due date. */
  effectiveDate: string;
  state: AyqPlanOccurrenceState;
  /** True while the record itself is still only an offer. */
  suggested: boolean;
  matchedTransactionId: string | null;
  matchProvenance: 'manual' | 'automatic' | null;
};

export type AyqPlan = {
  records: AyqPlannedRecord[];
  /** From the overdue window to the horizon, soonest first. */
  occurrences: AyqPlanOccurrence[];
  /** The date the engine treated as today, so a screen never has to guess. */
  today: string;
  /** The last date the occurrences reach. */
  horizon: string;
};

/* ------------------------------------------------------------- monthly plan

   The per-category monthly amount. Actual's, not AYQ's: in a tracking budget
   its `budgeted` and `spent` for a month mean exactly what 03 §7.8 says, with
   no carry-over into the next month, and 02 §5.1 says AYQ uses a capability the
   engine already has rather than keeping a second table to disagree with it. */

export type AyqBudgetCategory = {
  categoryId: string;
  categoryName: string;
  groupName: string;
  isIncome: boolean;
  /** The plan for this month, positive cents. Zero is no plan. */
  planCents: number;
  /**
   * What actually happened, in the direction the category means: spending for
   * an expense category, money received for an income one. Negative only when a
   * refund was bigger than the month's spending, which is true and stays true.
   */
  actualCents: number;
  /** Plan minus actual, never below zero (03 §7.8). */
  remainingCents: number;
  /** Actual minus plan, never below zero. The overspend, said out loud. */
  overspentCents: number;
};

export type AyqBudgetMonth = {
  /** YYYY-MM. */
  month: string;
  categories: AyqBudgetCategory[];
  /** Expense categories only; income is not a plan to spend against. */
  totalPlanCents: number;
  totalActualCents: number;
  totalRemainingCents: number;
};

/** What turning the detected rhythms into offers came to. */
export type AyqPlanSuggested = {
  plan: AyqPlan;
  /** Records created by this call; rhythms already offered are not repeated. */
  added: number;
};

/** What the engine answers to each request kind. */
export type AyqResults = {
  'engine.status': AyqEngineStatus;
  'accounts.list': AyqAccountSummary[];
  'accounts.setFlag': AyqAccountSummary[];
  'transactions.list': AyqLedger;
  'transaction.detail': AyqTransactionDetail;
  'transaction.categorise': AyqCategorised;
  'transaction.categoriseCounterparty': { categorised: number };
  'categories.list': AyqCategory[];
  'categories.create': AyqCategory[];
  'categories.rename': AyqCategory[];
  'rules.list': AyqCategoryRule[];
  'rules.remove': AyqCategoryRule[];
  'rules.apply': { categorised: number };
  'recurring.list': AyqRecurring[];
  'counterparties.list': AyqCounterpartyList;
  'counterparty.detail': AyqCounterpartyDetail;
  'aliases.list': AyqAliasRecord[];
  'alias.create': AyqAliasApplied;
  'alias.remove': AyqAliasApplied;
  'imports.list': AyqImportRecord[];
  summary: AyqSummary;
  spending: AyqSpending;
  'counterparties.unfiled': AyqUnfiled[];
  'import.pick': AyqPickedFile;
  'import.camt': AyqImportSummary;
  'plan.list': AyqPlan;
  'plan.save': AyqPlan;
  'plan.setState': AyqPlan;
  'plan.remove': AyqPlan;
  'plan.reschedule': AyqPlan;
  'plan.dismissOccurrence': AyqPlan;
  'plan.suggest': AyqPlanSuggested;
  'budget.month': AyqBudgetMonth;
  'budget.setPlan': AyqBudgetMonth;
};

/**
 * A request without its correlation id — what the renderer writes.
 *
 * Adding a capability means adding a member here and a line to AyqResults, not
 * a new IPC channel: there is one channel, and the host relays it.
 */
export type AyqRequestBody =
  | { kind: 'engine.status' }
  | { kind: 'accounts.list' }
  | {
      /**
       * Says whether one account's balance counts toward available funds.
       *
       * The one thing 03 §7.6 actually guarantees a person: the default is
       * AYQ's, and the decision is theirs, per account.
       */
      kind: 'accounts.setFlag';
      accountId: string;
      countsTowardFunds: boolean;
    }
  | { kind: 'transactions.list'; filter?: AyqLedgerFilter }
  | { kind: 'transaction.detail'; transactionId: string }
  | {
      kind: 'transaction.categorise';
      transactionId: string;
      /** null clears the category. */
      categoryId: string | null;
      /** Also remember it for this counterparty, from now on. */
      createRule?: boolean;
    }
  | {
      /**
       * Files every transaction from one counterparty, and remembers it.
       *
       * The offer a person gets after categorising one row by hand: the same
       * shop, the same category, the rest of the ledger.
       */
      kind: 'transaction.categoriseCounterparty';
      counterpartyKey: string;
      categoryId: string;
    }
  | { kind: 'categories.list' }
  | { kind: 'categories.create'; name: string; groupId: string }
  | { kind: 'categories.rename'; categoryId: string; name: string }
  | { kind: 'rules.list' }
  | { kind: 'rules.remove'; ruleId: string }
  | { kind: 'rules.apply' }
  | { kind: 'recurring.list' }
  | { kind: 'counterparties.list'; filter?: AyqCounterpartyFilter }
  | { kind: 'counterparty.detail'; key: string }
  | { kind: 'aliases.list' }
  | {
      /**
       * Says that one imported name variant is one counterparty, and applies it.
       *
       * `variantKey` is the match; `variant` is the name the person saw when
       * they decided. Existing transactions the provenance proves were imported
       * under that key move to the chosen counterparty; nothing else does.
       */
      kind: 'alias.create';
      variantKey: string;
      variant: string;
      counterpartyKey: string;
    }
  | { kind: 'alias.remove'; aliasId: string }
  | { kind: 'imports.list' }
  | { kind: 'summary' }
  | { kind: 'spending'; filter?: AyqSpendingFilter }
  | { kind: 'counterparties.unfiled'; filter?: AyqSpendingFilter }
  | { kind: 'import.pick' }
  | { kind: 'import.camt'; paths: string[] }
  | {
      /**
       * Every planned and recurring record, with what they come to by date.
       *
       * `today` overrides the engine's own idea of the current date. It exists
       * so the acceptance run can ask what a screen shows on a stated day
       * rather than on whatever day the runner happens to be having.
       */
      kind: 'plan.list';
      today?: string;
    }
  | { kind: 'plan.save'; record: AyqPlanDraft; today?: string }
  | {
      /** suggested → confirmed is accepting an offer; dismissed puts it away. */
      kind: 'plan.setState';
      recordId: string;
      state: AyqPlanState;
      today?: string;
    }
  | { kind: 'plan.remove'; recordId: string; today?: string }
  | {
      /**
       * Moves one occurrence, and only that one.
       *
       * The series keeps its rhythm: a rent payment taken four days late this
       * month is not a rent payment that has moved for ever.
       */
      kind: 'plan.reschedule';
      recordId: string;
      dueDate: string;
      to: string;
      today?: string;
    }
  | {
      kind: 'plan.dismissOccurrence';
      recordId: string;
      dueDate: string;
      dismissed: boolean;
      today?: string;
    }
  | { kind: 'plan.suggest'; today?: string }
  | {
      /** The plan, the actual and what is left, for one month. YYYY-MM. */
      kind: 'budget.month';
      month: string;
    }
  | {
      /** Sets one category's plan for one month. Zero clears it. */
      kind: 'budget.setPlan';
      month: string;
      categoryId: string;
      cents: number;
    };

/** Correlation id; the host echoes it back untouched. */
export type AyqRequest = AyqRequestBody & { id: string };

export type AyqResponse =
  | {
      [K in keyof AyqResults]: {
        id: string;
        ok: true;
        kind: K;
        result: AyqResults[K];
      };
    }[keyof AyqResults]
  | { id: string; ok: false; kind: 'error'; message: string };

/**
 * What the preload exposes on `window.ayq`.
 *
 * The renderer may hold this and nothing else. There is no second way through:
 * `contextIsolation` is on and `nodeIntegration` is off, so the renderer has no
 * `require`, no `process` and no path to the engine except this one call.
 */
export type AyqBridge = {
  request(request: AyqRequest): Promise<AyqResponse>;
};
