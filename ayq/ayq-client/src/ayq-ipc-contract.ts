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

/**
 * A balance AYQ was given, and the day it is true on.
 *
 * Either the bank stated it or the owner did. There is no third way to know
 * what an account holds: a statement is a list of movements, and movements
 * added to an assumed nought are not a balance.
 */
export type AyqBalanceAnchorView = {
  /** Signed integer cents. */
  amountCents: number;
  /** YYYY-MM-DD: the day the figure is true on. */
  coverageDate: string;
  source: 'bank' | 'manual';
  createdAt: string;
};

/**
 * What AYQ and the bank each say one account held, and the difference.
 *
 * Only ever present where the bank actually stated a closing balance. Without
 * one there is nothing to reconcile against, and AYQ says so rather than
 * comparing its own arithmetic with itself.
 */
export type AyqReconciliation = {
  /** The day both figures are about. */
  asOf: string;
  statementBalanceCents: number;
  /**
   * What the movements AYQ holds account for on that day.
   *
   * The bank's own earlier reading plus every movement AYQ holds since — not
   * the balance on the screen. The balance on the screen is the anchor, and
   * the anchor is the bank's figure, so comparing the two would be comparing a
   * number with itself. This asks the question that can still come out wrong:
   * do the statements AYQ has been given explain how the account got here?
   */
  ledgerBalanceCents: number;
  /** What the bank said minus what AYQ accounts for. Zero means they agree. */
  differenceCents: number;
  agrees: boolean;
  /** The statement it came from: base name only. */
  file: string | null;
  readAt: string;
};

/** An account as the renderer sees it. */
export type AyqAccountSummary = {
  id: string;
  name: string;
  /**
   * The absolute balance, or **null** when AYQ does not know it.
   *
   * Null is a real state and is drawn as `Unknown`. It is never nought: a
   * statement without a bank balance tells AYQ what moved and not what is
   * there, and presenting the net of imported movements as an account balance
   * is the defect this field exists to make impossible.
   */
  balanceCents: number | null;
  /** Transactions the budget holds for it. */
  transactionCount: number;
  /**
   * Whether this account's balance forms available funds (03 §7.6).
   *
   * AYQ's own flag, not Actual's on/off-budget distinction: that one also
   * decides what Actual counts in a budget month, which the Plan reads.
   */
  countsTowardFunds: boolean;
  /** The anchor the balance rests on, or null when there is none. */
  anchor: AyqBalanceAnchorView | null;
  /** Every anchor this account has ever had, newest decision first. */
  anchorHistory: AyqBalanceAnchorView[];
  /** When an import last succeeded for this account. Not the same as below. */
  lastImportAt: string | null;
  /** How far the bank's own movements reach. Not the same as above. */
  bankDataThrough: string | null;
  /** Only where the bank stated a closing balance. */
  reconciliation: AyqReconciliation | null;
};

/**
 * What the owner has chosen about the interface itself (04 A23).
 *
 * It crosses the boundary because it outlives the window: the renderer has no
 * disk, so what a person chose is kept beside the budget like everything else
 * AYQ keeps, and asked for on the next launch.
 */
export type AyqGround = 'light' | 'dark' | 'system';

export type AyqSettings = {
  ground: AyqGround;
};

/**
 * How far one account's statements reach, and whether AYQ agrees with them
 * (03 §8).
 *
 * Every field here is read, not decided. Reconciliation is derived from the
 * statements held and the ledger, recomputed each time it is asked for, and it
 * is never stored as a decision and carries no provenance of its own (§8.5).
 */
export type AyqAccountCoverage = {
  accountId: string;
  /** The date the last imported statement reaches to. Null: none imported. */
  toDate: string | null;
  /** The closing balance that statement stated. */
  statementBalanceCents: number | null;
  /** The balance AYQ holds for the account; null when it is unknown. */
  ledgerBalanceCents: number | null;
  /**
   * What the statement says minus what AYQ holds.
   *
   * Zero means they agree. A difference means the two disagree — not that a
   * particular statement is missing, and AYQ never invents the movements that
   * would close it (§8.2). Null when there is no statement to compare with.
   */
  differenceCents: number | null;
  /** Null when nothing has been imported for this account. */
  agrees: boolean | null;
  /** The statement the closing balance came from, so the screen can say. */
  file: string | null;
  /** When AYQ read it. */
  readAt: string | null;
};

/** The Accounts screen's whole answer. */
export type AyqAccountsView = {
  accounts: AyqAccountSummary[];
  coverage: AyqAccountCoverage[];
  /**
   * Only the accounts flagged as counting (03 §7.6) — or **null**.
   *
   * Null when any counted account's balance is unknown. The known subset is
   * deliberately not summed and labelled: a figure that silently leaves out an
   * account is worse than no figure, because nothing on the screen says which
   * account it left out.
   */
  availableFundsCents: number | null;
  /** Every account, counted or not. Null when any of them is unknown. */
  totalBalanceCents: number | null;
  /** How many counted accounts have no anchor, and so no known balance. */
  countedWithoutAnchor: number;
  /**
   * The reliability boundary of everything computed from these accounts
   * (03 §8.4): the *earliest* coverage date among the accounts that count,
   * never the latest. Null when a counted account has no statement at all,
   * because then nothing about the position can be relied on to any date.
   */
  reliableTo: string | null;
  /** How many counted accounts have no statement at all. */
  countedWithoutCoverage: number;
};

/**
 * What is waiting on a person, counted from current state (04 A21, A5).
 *
 * Every one of these is counted when it is asked for and written nowhere. A
 * queue length that is stored is a queue length that can be wrong, and the one
 * thing a screen of pending decisions must not do is be wrong about how many
 * there are.
 */
export type AyqWaiting = {
  /** Expected payments past their date and unmatched (03 §7.13). */
  overdue: number;
  /** What they come to, positive. */
  overdueCents: number;
  /** Matches AYQ will not make on its own (03 §7.16). */
  matches: number;
  /** Transactions nobody has filed (03 §4.5). */
  uncategorised: number;
  /** Rhythms AYQ found and will not act on until they are confirmed. */
  suggestions: number;
  /** Counterparties that have been resolved but never filed. */
  counterparties: number;
  total: number;
};

/** Today (04 A21): what you have, how long it lasts, what is waiting on you. */
export type AyqToday = {
  /** The day the answer is about. */
  today: string;
  /** Available funds, the accounts beside them, and the boundary (03 §8.4). */
  accounts: AyqAccountsView;
  /** The worst the position gets over the forecast, and when. */
  lowest: { date: string; balanceCents: number } | null;
  /** Where this month ends. Null when the position is unknown (§5). */
  monthEnd: { month: string; closingCents: number } | null;
  waiting: AyqWaiting;
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
export type AyqCategorySource = 'manual' | 'rule' | 'auto' | null;

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
  /**
   * Inclusive bounds on the size of the amount, in cents, ignoring direction.
   *
   * On the size rather than on the signed value, because the question a person
   * asks of a register is "what were the large ones", and a large payment in
   * and a large payment out are both large.
   */
  minCents?: number;
  maxCents?: number;
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

/**
 * What filing a whole counterparty came to.
 *
 * `keptByHand` is the number of its transactions somebody had already filed
 * themselves, into something else, and which were left exactly as they were —
 * 03 §4.4 in the one direction the rule does not spell out. Filing a
 * counterparty is a decision about the ones nobody has decided; it is not a
 * licence to overwrite decisions that were made one at a time.
 */
export type AyqCounterpartyFiled = {
  categorised: number;
  keptByHand: number;
  /** Whether a rule was written, which is a different statement (03 §4.1). */
  ruleWritten: boolean;
};

/**
 * The bounded set of existing transactions a bulk correction is about.
 *
 * 03 §4.7 gives a manual correction an explicit scope, and §4.8 names the two
 * forms it may take: the rows a person picked, one by one, or a clearly stated
 * existing-record scope. The second is the Register's own filter — every row it
 * admits, not only the page that happens to be on the screen. Amount alone is
 * never such a scope (§4.8): a filter that says nothing but "between ten and
 * twenty euros" is refused by the engine, and the screen does not offer it.
 *
 * Either way it is a decision about records that already exist. No rule is
 * written and no automation is widened by it (04 A36).
 */
export type AyqBulkScope =
  | { kind: 'selected'; transactionIds: string[] }
  | { kind: 'filter'; filter: AyqLedgerFilter };

/**
 * What a bulk correction would touch, stated before it is executed (04 A36).
 *
 * `transactions` is the size of the scope itself. A counterparty correction
 * reaches further than that: it is an identity decision about the names the
 * bank printed (03 §3.11), so every transaction under those names moves, not
 * only the ones in the scope. `variants` lists those names, each with the
 * number of transactions in the whole budget that carry it, so the screen can
 * say how far the decision reaches before anyone makes it.
 */
export type AyqBulkScopeReport = {
  transactions: number;
  /**
   * How many of them already carry a decision made by hand. A bulk correction
   * keeps those unless it is told otherwise (03 §4.9), so the screen says how
   * many there are before the decision is made, not after.
   */
  byHand: number;
  variants: Array<{
    variantKey: string;
    variant: string;
    /** Every transaction in the budget imported under this name. */
    transactions: number;
  }>;
  /** The sum over `variants` — what a counterparty correction would move. */
  variantTransactions: number;
};

/** What filing a scope by hand came to. */
export type AyqBulkCategorised = {
  /** How many the scope held when the decision was executed. */
  scoped: number;
  categorised: number;
  /**
   * Already filed by hand into something else, and left exactly as they were
   * because `includeByHand` was not set: a bulk correction never overwrites
   * an earlier manual decision silently (03 §4.9). Counted so the screen can
   * say so.
   */
  keptByHand: number;
};

/** What recording the names behind a scope as one counterparty came to. */
export type AyqBulkCounterparty = {
  /** How many bank names were recorded as the counterparty. */
  variants: number;
  /** Every transaction that now carries it, in or out of the scope. */
  moved: number;
  counterpartyKey: string;
  counterpartyName: string;
};

/**
 * What still uses a category, said before it is removed (04 A35).
 *
 * Removal never destroys or reclassifies data in silence: the owner is shown
 * these counts and chooses where what used the category goes. Every count is
 * read from the budget and the store at the moment of asking.
 */
export type AyqCategoryImpact = {
  categoryId: string;
  name: string;
  isIncome: boolean;
  /** Transactions filed in it, however they were filed. */
  transactions: number;
  /** Learned rules that file into it, by name (03 §4.2). */
  rules: number;
  /** Planned and recurring records that carry it (03 §7.23). */
  planned: number;
  /** Months of the Plan with an amount set for it. */
  plannedMonths: number;
  /** True when none of the above is non-zero: one confirmed action removes it. */
  unused: boolean;
};

/**
 * Where what used a removed category goes.
 *
 * A category of the same kind, into which the transactions, the plan amounts,
 * the rules and the planned records move; or the explicit `Uncategorised`
 * state (03 §4.5, §7.23), in which the transactions and planned records
 * survive without a category, and the rules — which cannot file into nothing
 * — are removed, said in advance.
 */
export type AyqCategoryDestination =
  | { kind: 'category'; categoryId: string }
  | { kind: 'uncategorised' };

/** What removing a category came to. */
export type AyqCategoryRemoved = {
  categories: AyqCategory[];
  removed: string;
  /** The destination's name, or null for Uncategorised. */
  movedTo: string | null;
  transactions: number;
  rulesMoved: number;
  rulesRemoved: number;
  planned: number;
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
  /**
   * What the filtered set comes to — all of it, not the page.
   *
   * Computed by the engine over every matching transaction, so a screen
   * showing the newest five hundred of fifty thousand still states the truth
   * about the fifty thousand. Uncategorised transactions are in these totals
   * (03 §4.5): a total that quietly drops them is a total that is wrong.
   */
  incomeCents: number;
  expenseCents: number;
  netCents: number;
  /** How many of the matching transactions have no category. */
  uncategorised: number;
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

/**
 * One decision about where a transaction belongs, and who made it.
 *
 * 03 §4.3: a decision made by hand and one derived by a rule are different
 * kinds of fact, and the difference decides what may overwrite what. Kept as a
 * history rather than as a single current value, because "it is in Groceries
 * because a rule put it there, after you had put it in Housekeeping" is the
 * thing a person needs to see when a category looks wrong.
 */
export type AyqDecision = {
  /**
   * Who decided, and therefore what may revise it. 03 §4.3, §11.11.
   *
   * `manual` is a person and is never overwritten by anything. `rule` is the
   * owner's own standing generalisation about a counterparty. `auto` is AYQ's
   * classification of the evidence it holds, which both of the others outrank
   * and which may only ever revise its own earlier work.
   */
  source: 'manual' | 'rule' | 'auto';
  /** Empty when a person deliberately cleared the category. */
  categoryName: string;
  at: string;
  /**
   * For `auto`, the evidence the classification matched on (§11.11), as a
   * code the renderer words (04 A24). Absent on a decision of any other kind,
   * and on `auto` decisions written before the reason was recorded.
   */
  reason?: AyqFilingReason;
};

/**
 * Why AYQ's own classification filed a transaction where it did (03 §11.11).
 *
 * A code and its parameters, never a sentence: the words are the catalogue's
 * (04 A24). `counterparty` is the line of AYQ's merchant table that matched —
 * data, not prose.
 *
 * `legacy` is a reason a version-9 store held in words this AYQ does not
 * recognise. It is kept as the evidence it is and never shown as it stands;
 * the renderer says, in its own words, that an earlier AYQ recorded it.
 */
export type AyqFilingReason =
  | { code: 'bank-charge' }
  | { code: 'bank-interest' }
  | { code: 'counterparty'; counterparty: string }
  | { code: 'legacy'; legacyText: string };

/** What an expected payment this transaction was matched to is (03 §7.16). */
export type AyqTransactionMatch = {
  recordId: string;
  name: string;
  /** The occurrence's own date, which is not always the transaction's. */
  dueDate: string;
  /** A person's match, or one the engine made. */
  provenance: 'manual' | 'automatic';
  matchedAt: string | null;
};

export type AyqTransactionDetail = {
  row: AyqLedgerRow;
  /** The variant the bank printed, before the canonical name replaced it. */
  importedPayee: string | null;
  notes: string | null;
  importedId: string | null;
  provenance: AyqProvenance | null;
  /** The canonical counterparty key, aliases applied. */
  counterpartyKey: string | null;
  /** Oldest first; the last one is the one that stands. */
  decisions: AyqDecision[];
  /** The standing rule for this counterparty, if there is one (04 A7). */
  rule: AyqCategoryRule | null;
  /** The expected payment this turned out to be, if it was matched. */
  match: AyqTransactionMatch | null;
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

/**
 * What a rule has done, counted now (04 A7, 03 §4.4).
 *
 * Stated wherever the rule is seen, before correction or removal is offered:
 * a person deciding about a rule is deciding about these transactions too, and
 * about the ones the rule may not touch.
 */
export type AyqRuleImpact = {
  rule: AyqCategoryRule;
  /** Transactions the rule filed and that still stand as it filed them. */
  filed: number;
  /** Transactions of this counterparty filed by hand — outside its reach. */
  byHand: number;
  /** False when the budget lacks the category: the rule files nothing. */
  categoryExists: boolean;
};

/** What correcting a rule came to. */
export type AyqRuleCorrected = {
  rules: AyqCategoryRule[];
  rule: AyqCategoryRule;
  /** Transactions that now stand as the corrected rule files them. */
  filed: number;
  byHand: number;
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
  /** The identity decision that put it here, when one did — what undoes it. */
  aliasId: string | null;
};

export type AyqCounterpartyDetail = {
  counterparty: AyqCounterparty;
  variants: AyqCounterpartyVariant[];
  /** The rhythm, when the recurring view finds one. */
  recurring: AyqRecurring | null;
  /** The newest transactions of this counterparty. */
  recent: AyqLedgerRow[];
  /** The learned rules keyed on it (03 §4.1). */
  rules: AyqCategoryRule[];
  /** True when `counterparty.name` is the owner's; the statement's stays in variants. */
  ownerNamed: boolean;
};

/** What merging one counterparty into another came to (04 A37). */
export type AyqCounterpartyMerged = {
  /** The survivor. */
  counterpartyKey: string;
  counterpartyName: string;
  /** Identity decisions written: one per statement variant of the merged one. */
  variants: number;
  /** Transactions whose payee moved. */
  moved: number;
  rulesMoved: number;
  rulesRemoved: number;
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
   * How many this import's own classification filed (03 §11.10).
   *
   * Kept apart from `categorised`, which counts what the owner's own rules did.
   * A rule is his decision; this is AYQ reading the evidence, and a screen that
   * presented the second as the first would be overstating what he had said.
   */
  filed: number;
  /** Expected payments this import turned out to be, matched automatically. */
  matched: number;
  /** Matches AYQ found but is not confident enough to apply on its own. */
  matchesWaiting: number;
  /**
   * What was chosen and could not be used, said plainly.
   *
   * A file that would not open, an archive that would not unpack, a document
   * that is not CAMT: each is named once with a reason, so the person can see
   * which of the eight files they picked was the problem instead of being told
   * only that a number failed.
   */
  problems: AyqImportProblem[];
  /**
   * Whether the owner still has to say what this account holds (§4.4).
   *
   * True when the import succeeded and left the account with no anchor at all:
   * the files carried no bank balance and none was ever set by hand, so the
   * balance is Unknown and **Set account balance** is offered. False once an
   * anchor exists — a later import never asks again.
   */
  balanceWanted: boolean;
  /** The day the anchor that now stands is true on, if one stands. */
  anchoredAt: string | null;
  /** Whether this import is what first gave the account an anchor. */
  anchorEstablished: boolean;
};

/* ------------------------------------------------------------ needs attention

   010 with the five corrections of 013: what needs the owner now, derived by
   the engine from state AYQ already holds, and shown on Today. Nothing here is
   stored: a group exists while its condition holds and is gone when it does
   not. The renderer displays groups; it never decides whether one applies.  */

/**
 *   due-today                  expected payments dated today, unmatched (03 §7.26)
 *   overdue                    expected payments past their date, unmatched (§7.13)
 *   reconciliation-difference  the bank's balance and AYQ's differ (03 §8.2)
 *   balance-unknown            no balance anchor, so the balance is unknown (§10.5)
 *   import-failed              a chosen file an import could not use, not yet
 *                              imported since and not marked handled (013 §1)
 *   backup-failed              the last backup attempt failed (A38)
 *   review                     counterparties to review (A29)
 */
export type AyqAttentionKind =
  | 'due-today'
  | 'overdue'
  | 'reconciliation-difference'
  | 'balance-unknown'
  | 'import-failed'
  | 'backup-failed'
  | 'review';

/** One condition that holds, and what it is about. Counted as one group (013 §5). */
export type AyqAttentionGroup = {
  /** Stable while the condition holds: the kind, and what it is about. */
  key: string;
  kind: AyqAttentionKind;
  /** How many records share the condition — payments, accounts, files, counterparties. */
  count: number;
  /** For the account kinds: which accounts, so each can be opened. */
  accounts?: Array<{ accountId: string; accountName: string }>;
  /** For `import-failed`: which files, from which import, and why. */
  files?: Array<{ importId: string; at: string; name: string; code: AyqImportProblemCode }>;
  /** For `backup-failed`: when, and why. */
  backup?: { at: string; failure: AyqBackupFailure | null };
};

export type AyqAttention = {
  /** In the order Today shows them. */
  groups: AyqAttentionGroup[];
};

/** One chosen thing AYQ could not use, and why. */
export type AyqImportProblem = {
  /** The base name of what was chosen; the path stays on the machine. */
  name: string;
  /** Why, as a code the renderer words (04 A24). */
  code: AyqImportProblemCode;
  /**
   * Only on `legacy`: what a version-9 store recorded in words this AYQ does
   * not recognise. Kept as evidence, never shown.
   */
  legacyText?: string;
  /**
   * When the owner marked this file as dealt with in Import history (013
   * §1b), since store version 11. Absent means not marked.
   */
  handledAt?: string;
};

/**
 *   gone         it is no longer where it was chosen
 *   not-allowed  AYQ may not read it
 *   folder       a folder was chosen where a file was expected
 *   unreadable   it could not be read, for any other reason
 *   no-entries   it is XML, and holds no CAMT.053 entries
 *   not-camt     it is not a CAMT.053 document
 *   legacy       recorded by an earlier AYQ in words not recognised
 */
export type AyqImportProblemCode =
  | 'gone'
  | 'not-allowed'
  | 'folder'
  | 'unreadable'
  | 'no-entries'
  | 'not-camt'
  | 'legacy';

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
  /** Null when any account's balance is unknown (§5). */
  totalBalanceCents: number | null;
  /** The part of it that counts toward available funds (03 §7.6). Null: unknown. */
  availableFundsCents: number | null;
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
 * than netted off, because a category's total is a question about outgoings.
 *
 * A confirmed reversal is already subtracted here (03 §9.1): it is the money
 * that came back, and the category kept none of it. A credit AYQ holds no
 * reversal evidence for is income and is not subtracted, however exactly it
 * matches an expense in the same category (§9.5).
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
 *
 * `retired` is AYQ withdrawing an offer of its own that no longer meets the
 * rule it was made under (9 §9.2). It is deliberately not `dismissed`, which
 * means *a person said this will not happen* — writing one as the other would
 * put words in the owner's mouth. A retired record stops appearing in Upcoming
 * and stops counting in the forecast, and it stays in the store with its whole
 * history, its matches and its rejections intact. Only a record AYQ itself
 * suggested and nobody has acted on can ever reach this state.
 */
export type AyqPlanState =
  | 'suggested'
  | 'confirmed'
  | 'dismissed'
  | 'retired';

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
  /**
   * The day the owner confirmed this record, and the day AYQ suggested it.
   *
   * 03 §7.14: a record produces expected occurrences only from the date it was
   * confirmed, and a suggestion only from the date it was suggested. Anything
   * the rhythm falls on before that is history, not an expectation — which is
   * what stops a rhythm detected from two years of statements arriving as two
   * years of overdue bills.
   *
   * A record a person types is both at once, so both carry its creation date.
   * Null is a record that has not reached that state. Both are YYYY-MM-DD: the
   * day, not the instant, because they are compared against occurrence dates.
   */
  confirmedAt: string | null;
  suggestedAt: string | null;
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

/* ----------------------------------------------------------------- matching

   03 §7.3: matching an actual transaction to an expected payment is a core part
   of the model, not a convenience. A matched payment leaves the forecast and
   the transaction stays where it was. Who made the match is recorded, and a
   person's match is never overwritten by automation (03 §4.3–§4.4).         */

/** A transaction the matcher may consider, as it needs to see one. */
export type AyqMatchCandidate = {
  transactionId: string;
  date: string;
  /** Signed cents, as the ledger holds them. */
  amountCents: number;
  payee: string | null;
  counterpartyKey: string | null;
  mandateId: string | null;
};

/** One expected payment and one transaction that might be it. */
export type AyqMatchProposal = {
  recordId: string;
  dueDate: string;
  recordName: string;
  expectedDate: string;
  /** Positive cents. */
  expectedAmountCents: number;
  transactionId: string;
  transactionDate: string;
  transactionPayee: string | null;
  /** Signed cents, as the ledger holds it. */
  transactionAmountCents: number;
  daysApart: number;
  /**
   * What they have in common, so agreeing to it is informed — as codes the
   * renderer words (04 A24). How many days apart they are is `daysApart`.
   */
  evidence: AyqMatchEvidence[];
  /**
   * Clear enough to apply without asking: the counterparty or the mandate
   * agrees, the amount is exact, and the date is within a week. Anything less
   * is offered and waits for a person (03 §7.5).
   */
  confident: boolean;
};

export type AyqMatches = {
  /** Matches this pass applied by itself, with automatic provenance. */
  applied: number;
  /** What is waiting for a person to decide. */
  proposals: AyqMatchProposal[];
  plan: AyqPlan;
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
   * an expense category, money received for an income one.
   *
   * An expense category's figure is AYQ's own reading of the ledger under
   * 03 §9, the same one Reports states (§9.3) — not the engine's netting of
   * every credit filed in the category. Negative only when the reversals were
   * bigger than the month's spending, which is true and stays true.
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
  /**
   * Whether a plan can be set in this month.
   *
   * Actual keeps budget months for a range around today and refuses the rest,
   * so the far end of the forecast horizon is readable and not plannable. The
   * screen is told rather than left to discover it by being refused.
   */
  editable: boolean;
  categories: AyqBudgetCategory[];
  /** Expense categories only; income is not a plan to spend against. */
  totalPlanCents: number;
  totalActualCents: number;
  totalRemainingCents: number;
};

/* ----------------------------------------------------------------- forecast

   Available funds, and how that position develops forward over twelve months
   (03 §7.9). Computed, never stored: a stored forecast is one that can be stale
   while still looking authoritative.                                        */

/** What one category is planned to take in one month, as the forecast reads it. */
export type AyqForecastPlanRow = {
  month: string;
  categoryName: string;
  planCents: number;
  /** Plan minus what has already been spent, never below zero (03 §7.8). */
  remainingCents: number;
};

/** One thing the forecast expects to happen, and where it leaves the position. */
export type AyqForecastEvent = {
  date: string;
  kind: AyqPlanKind;
  label: string;
  /** Positive cents; `kind` carries the sign. */
  amountCents: number;
  /**
   * `record` is a planned or recurring payment. `plan` is the part of a
   * category's monthly plan that no record accounts for — the two are never
   * counted twice, and which of them is larger decides.
   */
  source: 'record' | 'plan';
  recordId: string | null;
  /** The occurrence this came from, for a `record`; null for a `plan` row. */
  dueDate: string | null;
  categoryName: string | null;
  /** The record behind it is still only an offer (03 §7.7). */
  suggested: boolean;
  /** Past its date and unmatched: it still counts, and it needs attention. */
  flagged: boolean;
  /**
   * The projected position immediately after this — or null (§5).
   *
   * Null when available funds are unknown. The event itself, its date and its
   * amount are all still true; where it leaves the balance is not knowable
   * without a starting position, and is not guessed at.
   */
  balanceCents: number | null;
};

export type AyqForecastMonth = {
  month: string;
  /** What the month is expected to take in and pay out: relative, so always known. */
  expectedIncomeCents: number;
  expectedExpenseCents: number;
  /** Where the position stands at the end of this month; null when unknown. */
  closingCents: number | null;
};

export type AyqForecast = {
  today: string;
  horizon: string;
  /** Where it starts: the flagged accounts' balances, today (03 §7.6). Null: unknown. */
  availableFundsCents: number | null;
  events: AyqForecastEvent[];
  months: AyqForecastMonth[];
  /**
   * The worst it gets, and when — the question a forecast is really for.
   *
   * Null when available funds are unknown. A lowest balance projected from a
   * starting point AYQ does not have would be the most confident-looking wrong
   * number in the product (§5).
   */
  lowest: { date: string; balanceCents: number } | null;
  /** Where the twelve months end; null when unknown. */
  closingCents: number | null;
};

/* --------------------------------------------------------------- the sheet

   Categories down, one month across: what was planned, what happened, what is
   left of it, and what AYQ still expects before the month ends. A worksheet —
   not envelope budgeting (04 A8), and not a dashboard of cards (04 A3).     */

/**
 * What one category normally costs, and what that is based on (10 §10.2).
 *
 * `suggestedCents` is null when there is no usable basis: nought complete
 * months behind the Plan month. Null is not nought — a category AYQ cannot
 * suggest for is a different thing from one it suggests nothing for — and the
 * screen says so rather than offering a plan of zero.
 *
 * `monthsUsed` is the divisor, and it is carried across the boundary so the
 * screen can say "based on 7 complete months" rather than implying twelve. A
 * suggestion with no stated basis is a number a person cannot check.
 *
 * Derived on every read and stored nowhere.
 */
export type AyqPlanSuggestion = {
  categoryId: string;
  categoryName: string;
  /** Arithmetic mean over the included months, positive cents. Null: no basis. */
  suggestedCents: number | null;
  /** How many complete, reliably covered months the mean is over. */
  monthsUsed: number;
  /** The oldest and newest month included, YYYY-MM. Null when none were. */
  fromMonth: string | null;
  toMonth: string | null;
  /** What the category took over exactly those months, positive cents. */
  totalCents: number;
};

export type AyqPlanSheetRow = AyqBudgetCategory & {
  /**
   * What this category is still expected to take before the month is out.
   *
   * The forecast's own figure for the month, so the sheet and Upcoming cannot
   * disagree: the larger of what is left of the plan and the expected records
   * in the category, never their sum.
   */
  expectedCents: number;
};

export type AyqPlanSheet = {
  month: string;
  /** Whether a plan can be set in this month; see AyqBudgetMonth. */
  editable: boolean;
  today: string;
  /** Every month the budget can be asked about, oldest first. */
  months: string[];
  rows: AyqPlanSheetRow[];
  totalPlanCents: number;
  totalActualCents: number;
  totalRemainingCents: number;
  totalExpectedCents: number;
  /**
   * What history suggests for each row, and the basis (10 §10.3).
   *
   * Beside the plan, never in it. A suggestion never becomes a planned value on
   * its own: the row's `Planned` figure is whatever the owner set, and
   * `plan.useSuggestion` is the explicit act that changes it.
   */
  suggestions: AyqPlanSuggestion[];
};

/** What turning the detected rhythms into offers came to. */
export type AyqPlanSuggested = {
  plan: AyqPlan;
  /** Records created by this call; rhythms already offered are not repeated. */
  added: number;
};

/**
 * What this build of AYQ is (12 §12.1).
 *
 * Every field is read rather than written: the revision from git, the date from
 * the clock at build time, the engine version from the API that is actually
 * loaded. `development` is true for a build that had no git to ask, and a
 * build that says so is one nobody will mistake for a release.
 */
export type AyqAbout = {
  productName: string;
  tagline: string;
  author: string;
  copyright: string;
  productVersion: string;
  buildNumber: string;
  /** ISO 8601 UTC, or `unbuilt` for a run that never went through the build. */
  buildDate: string;
  architecture: string;
  /** The commit, or null when this build cannot prove which one it is. */
  revision: string | null;
  engine: string;
  actualBaseline: string;
  electronVersion: string | null;
  nodeVersion: string;
  development: boolean;
  /**
   * Only links that really exist. Never invented. The kind, not a label: what
   * a link is called is a word on the screen, and words live in the catalogue
   * (04 A24), as do the licence and local-first notes About states.
   */
  links: Array<{ kind: 'repository'; url: string }>;
  /**
   * Exactly what **Copy technical information** puts on the clipboard.
   *
   * Composed by the engine, not the renderer, so that the privacy contract in
   * 12 §12.4 is one function with one test over it. It carries facts about the
   * application and nothing about the money: no budget name, no path, no
   * account id or IBAN fragment, no machine or user identifier, no transaction,
   * no balance, no counterparty, no category and no rule.
   */
  technicalInformation: string;
};

/**
 * Why a backup exists (03 §12.2).
 *
 * `before-restore` is the state a restore replaced, kept so that choosing the
 * wrong backup is itself something a person can undo.
 */
export type AyqBackupTrigger = 'manual' | 'automatic' | 'before-restore';

/**
 * One backup: the Actual budget and AYQ's own records, captured together at one
 * moment (02 §5.9, 03 §12.1).
 *
 * There is deliberately no field naming either half on its own. The interface
 * restores a backup, never a budget from one and a store from another (04 A38),
 * and a type that carried the halves separately would be an invitation to.
 */
export type AyqBackupEntry = {
  /**
   * Opaque. The renderer hands it back to restore and never reads meaning into
   * it: it is not a path, and the engine refuses anything that is not one of
   * its own identifiers.
   */
  backupId: string;
  /** ISO 8601 UTC. */
  createdAt: string;
  trigger: AyqBackupTrigger;
  /** The AYQ that wrote it. */
  productVersion: string;
  buildNumber: string;
  /** The whole set, in bytes. */
  bytes: number;
  /**
   * False when reading the set's description already shows this AYQ cannot
   * restore it — written by a newer AYQ, say. True is not a promise: the
   * whole set is checked again, byte for byte, when a restore is asked for.
   */
  restorable: boolean;
};

/** Why a backup could not be made. Words for each live in the catalogue (04 A24). */
export type AyqBackupFailure = 'no-budget' | 'store-unreadable' | 'write-failed';

/**
 * The outcome of one attempt to make a backup, kept as state (030 §2).
 *
 * Operational evidence and not financial truth (03 §12.3): it says when AYQ
 * tried and whether it managed, and nothing about the money.
 */
export type AyqBackupAttempt = {
  /** ISO 8601 UTC. */
  at: string;
  trigger: AyqBackupTrigger;
  outcome: 'succeeded' | 'failed';
  /** The backup made, when one was. */
  backupId: string | null;
  failure: AyqBackupFailure | null;
};

/** Settings → Data & Backup (04 A38): what exists, and how the last tries went. */
export type AyqBackupOverview = {
  /** Newest first. */
  backups: AyqBackupEntry[];
  latestBackupId: string | null;
  /** The last attempt of any kind. */
  lastAttempt: AyqBackupAttempt | null;
  /** The last automatic attempt, which nobody was watching. */
  lastAutomaticAttempt: AyqBackupAttempt | null;
  /** How automatic backups behave, as this build does it. */
  automatic: { everyHours: number; kept: number };
};

export type AyqBackupCreated =
  | { outcome: 'created'; backupId: string; overview: AyqBackupOverview }
  | { outcome: 'failed'; failure: AyqBackupFailure; overview: AyqBackupOverview };

/**
 * Why a backup was not restored, decided before anything was replaced.
 *
 *   unknown-backup  no backup by that identifier
 *   incomplete      a part is missing, or something is there that is not part
 *   mismatch        a part is not the part that was captured — altered, or
 *                   taken from another backup
 *   newer-format    a newer AYQ packed it in a way this one cannot read
 *   newer-store     a newer AYQ wrote its records (06 §6.2: refused, not repaired)
 *   unreadable      the description or a part cannot be read at all
 *   conflict        restoring it would overwrite a budget that is not the current one
 */
export type AyqRestoreRefusal =
  | 'unknown-backup'
  | 'incomplete'
  | 'mismatch'
  | 'newer-format'
  | 'newer-store'
  | 'unreadable'
  | 'conflict';

/**
 * Why a restore that had begun did not finish. In every case the state from
 * before the restore is what AYQ holds afterwards (03 §12.4).
 */
export type AyqRestoreFailure =
  | 'safety-backup-failed'
  | 'replace-failed'
  | 'open-failed';

export type AyqRestored =
  | {
      outcome: 'restored';
      backupId: string;
      /** The backup of what the restore replaced. */
      keptBackupId: string;
      overview: AyqBackupOverview;
    }
  | { outcome: 'refused'; refusal: AyqRestoreRefusal; overview: AyqBackupOverview }
  | { outcome: 'failed'; failure: AyqRestoreFailure; overview: AyqBackupOverview };

/** What the engine answers to each request kind. */
export type AyqResults = {
  'engine.status': AyqEngineStatus;
  'settings.get': AyqSettings;
  'settings.set': AyqSettings;
  'accounts.list': AyqAccountSummary[];
  'accounts.view': AyqAccountsView;
  today: AyqToday;
  'accounts.setFlag': AyqAccountSummary[];
  'accounts.setBalance': AyqAccountsView;
  'accounts.reanchor': AyqAccountsView;
  'counterparty.setName': AyqCounterpartyDetail;
  'plan.useSuggestion': AyqPlanSheet;
  'plan.useAllSuggestions': AyqPlanSheet;
  about: AyqAbout;
  'transactions.list': AyqLedger;
  'transaction.detail': AyqTransactionDetail;
  'transaction.categorise': AyqCategorised;
  'transaction.categoriseCounterparty': AyqCounterpartyFiled;
  'transactions.scope': AyqBulkScopeReport;
  'transactions.categoriseMany': AyqBulkCategorised;
  'transactions.correctCounterparty': AyqBulkCounterparty;
  'categories.list': AyqCategory[];
  'categories.create': AyqCategory[];
  'categories.rename': AyqCategory[];
  'categories.move': AyqCategory[];
  'categories.impact': AyqCategoryImpact;
  'categories.remove': AyqCategoryRemoved;
  'rules.list': AyqCategoryRule[];
  'rules.impact': AyqRuleImpact;
  'rules.correct': AyqRuleCorrected;
  'rules.remove': AyqCategoryRule[];
  'rules.apply': { categorised: number };
  'recurring.list': AyqRecurring[];
  'counterparties.list': AyqCounterpartyList;
  'counterparty.detail': AyqCounterpartyDetail;
  'counterparty.merge': AyqCounterpartyMerged;
  'aliases.list': AyqAliasRecord[];
  'alias.create': AyqAliasApplied;
  'alias.remove': AyqAliasApplied;
  'imports.list': AyqImportRecord[];
  summary: AyqSummary;
  spending: AyqSpending;
  'counterparties.unfiled': AyqUnfiled[];
  'import.pick': AyqPickedFile;
  'window.ground': { applied: boolean };
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
  forecast: AyqForecast;
  'plan.month': AyqPlanSheet;
  'match.propose': AyqMatches;
  'match.apply': AyqMatches;
  'match.reject': AyqMatches;
  'match.unmatch': AyqMatches;
  'backup.overview': AyqBackupOverview;
  'backup.create': AyqBackupCreated;
  'backup.restore': AyqRestored;
  attention: AyqAttention;
  'imports.markHandled': AyqImportRecord[];
};

/**
 * A request without its correlation id — what the renderer writes.
 *
 * Adding a capability means adding a member here and a line to AyqResults, not
 * a new IPC channel: there is one channel, and the host relays it.
 */
export type AyqRequestBody =
  | { kind: 'engine.status' }
  | { kind: 'settings.get' }
  | { kind: 'settings.set'; settings: AyqSettings }
  | { kind: 'accounts.list' }
  | { kind: 'accounts.view' }
  | { kind: 'today'; today?: string }
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
  | {
      /**
       * Says what one account actually holds, on a stated day (§4.4).
       *
       * The three fields are all required and all explicit. The amount is
       * integer cents; the account is named rather than guessed at by the
       * engine; and the coverage date is stated rather than defaulted to
       * today, because the balance a person reads off their bank is the
       * balance on the day the statement they are looking at ends.
       *
       * `importId` binds it to the import that prompted it when there was one,
       * so the anchor's provenance says where it came from.
       */
      kind: 'accounts.setBalance';
      accountId: string;
      amountCents: number;
      coverageDate: string;
      importId?: string | null;
    }
  | {
      /**
       * Corrects an account's balance (§4.5).
       *
       * The same act as above and a different one in meaning: this is the
       * recovery action, reached from the account's own detail rather than from
       * an import, and it is offered when an anchor already exists. It adds a
       * new manual anchor and leaves every earlier one in place.
       */
      kind: 'accounts.reanchor';
      accountId: string;
      amountCents: number;
      coverageDate: string;
    }
  | {
      /**
       * Says what the owner calls one counterparty (8 §8.3).
       *
       * The canonical key does not change, no rule moves and no transaction is
       * rewritten. An empty name clears the decision and puts the automatic
       * name back.
       */
      kind: 'counterparty.setName';
      counterpartyKey: string;
      displayName: string;
    }
  | {
      /** Accepts one historical suggestion as this month's plan (10 §10.3). */
      kind: 'plan.useSuggestion';
      month: string;
      categoryId: string;
    }
  | {
      /**
       * Accepts every suggestion that would fill an empty row, and no others.
       *
       * Never a row that already carries a plan: a bulk action is a person
       * agreeing to a page they have not read line by line, and overwriting a
       * figure they typed would be the product deciding they did not mean it.
       */
      kind: 'plan.useAllSuggestions';
      month: string;
    }
  | { kind: 'about' }
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
       * Files every transaction from one counterparty — and, if asked, learns it.
       *
       * The offer a person gets after categorising one row by hand: the same
       * shop, the same category, the rest of the ledger.
       *
       * `createRule` is required, and required because 03 §4.1 keeps the two
       * apart: filing what is there is a statement about these transactions, and
       * learning a rule is a statement about every one that arrives from now on.
       * A caller that did not have to say which would be choosing for the person.
       */
      kind: 'transaction.categoriseCounterparty';
      counterpartyKey: string;
      categoryId: string;
      createRule: boolean;
    }
  | {
      /** What a bulk correction over this scope would touch, before it is made. */
      kind: 'transactions.scope';
      scope: AyqBulkScope;
    }
  | {
      /**
       * Files every transaction in the scope, by hand, and learns nothing.
       *
       * A manual decision about each of them (03 §4.7), recorded as such, so no
       * rule may overwrite it afterwards. One already filed by hand into
       * something else is kept and counted (§4.9). No rule is written: that is a
       * separate statement, and this request cannot make it.
       */
      kind: 'transactions.categoriseMany';
      scope: AyqBulkScope;
      /** null clears the category. */
      categoryId: string | null;
      /**
       * Also change the rows already filed by hand into something else.
       *
       * Off, they are kept and counted (03 §4.9): a bulk correction does not
       * overwrite an earlier manual decision silently. On, the person has been
       * told how many there are and has said so — a newer decision by hand over
       * an older one, which is theirs to make (§4.4).
       */
      includeByHand?: boolean;
    }
  | {
      /**
       * Records every bank name behind the scope as this counterparty.
       *
       * An identity decision (03 §3.11, §3.14), made once per name the bank
       * printed rather than once per transaction, which is why it reaches every
       * transaction under those names and not only the scope. The report from
       * `transactions.scope` says how far that is.
       */
      kind: 'transactions.correctCounterparty';
      scope: AyqBulkScope;
      counterpartyKey: string;
    }
  | { kind: 'categories.list' }
  | { kind: 'categories.create'; name: string; groupId: string }
  | { kind: 'categories.rename'; categoryId: string; name: string }
  | {
      /** Moves a category to another group of the same kind (04 A35). */
      kind: 'categories.move';
      categoryId: string;
      groupId: string;
    }
  | {
      /** What still uses this category — asked before any removal is offered. */
      kind: 'categories.impact';
      categoryId: string;
    }
  | {
      /**
       * Removes a category, with an explicit destination for what used it.
       *
       * A category in use cannot be removed without one: the engine refuses.
       * An unused one needs none. Nothing is destroyed or reclassified in
       * silence (04 A35); the answer says what moved where.
       */
      kind: 'categories.remove';
      categoryId: string;
      destination?: AyqCategoryDestination;
    }
  | { kind: 'rules.list' }
  | {
      /** What a rule has filed, and what it may not touch, counted now. */
      kind: 'rules.impact';
      ruleId: string;
    }
  | {
      /**
       * Changes where a rule files, and re-files what the rule itself filed
       * (03 §4.4). Never a transaction filed by hand: a manual decision
       * outranks the rule, before and after the correction.
       */
      kind: 'rules.correct';
      ruleId: string;
      categoryId: string;
    }
  | {
      /**
       * Removes a rule. It stops applying to later imports; what it already
       * filed stays where it is, and nothing is re-filed (04 A7).
       */
      kind: 'rules.remove';
      ruleId: string;
    }
  | { kind: 'rules.apply' }
  | { kind: 'recurring.list' }
  | { kind: 'counterparties.list'; filter?: AyqCounterpartyFilter }
  | { kind: 'counterparty.detail'; key: string }
  | {
      /**
       * Says that one counterparty is really another (04 A37; 03 §3.6).
       *
       * One alias per statement variant of `counterpartyKey`, into `intoKey`;
       * every transaction moves and every record is kept. Reversible only by
       * removing those aliases, one at a time, from the survivor.
       */
      kind: 'counterparty.merge';
      counterpartyKey: string;
      intoKey: string;
    }
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
  | {
      /**
       * The ground the window resolved to, told to the host so the native
       * title-bar controls are painted to match (04 A26). Answered by the
       * host, not the engine: it is about this window, not the budget.
       */
      kind: 'window.ground';
      resolved: 'light' | 'dark';
    }
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
    }
  | {
      /**
       * The worksheet for one month. Without a month, the one today is in.
       */
      kind: 'plan.month';
      month?: string;
      today?: string;
    }
  | { kind: 'forecast'; today?: string }
  | {
      /**
       * Looks for matches, applies the clear ones and offers the rest.
       *
       * Run after every import, and available on its own so a person can ask
       * again after correcting a counterparty or an amount.
       */
      kind: 'match.propose';
      today?: string;
    }
  | {
      /** A person saying these two are the same payment. */
      kind: 'match.apply';
      recordId: string;
      dueDate: string;
      transactionId: string;
      today?: string;
    }
  | {
      /**
       * A person saying they are not.
       *
       * Remembered against that occurrence, so the same pairing is not offered
       * again on the next import.
       */
      kind: 'match.reject';
      recordId: string;
      dueDate: string;
      transactionId: string;
      today?: string;
    }
  | {
      /** Undoing a match, whoever made it. */
      kind: 'match.unmatch';
      recordId: string;
      dueDate: string;
      today?: string;
    }
  | AyqBackupRequest
  | AyqAttentionRequest;

/**
 * Backup and restore (02 §5.8): three requests and no more.
 *
 * The renderer names a backup by its opaque id and nothing else. No member
 * here carries a path, a file or a directory, and `ayq-boundary.test.ts`
 * holds that: the capture, the check and the replacement are all the engine's.
 */
export type AyqBackupRequest =
  | { kind: 'backup.overview' }
  | { kind: 'backup.create' }
  | { kind: 'backup.restore'; backupId: string };

/** Needs attention (010, 013): the groups that hold, and the one owner action. */
export type AyqAttentionRequest =
  | { kind: 'attention'; today?: string }
  | {
      /**
       * The owner has dealt with a file an import could not use (013 §1b).
       * It changes the import history, not the attention item: the item
       * clears because its condition no longer holds.
       */
      kind: 'imports.markHandled';
      importId: string;
      name: string;
    };

/** One thing an actual transaction and an expected payment agree on (03 §7.16). */
export type AyqMatchEvidence =
  | 'same-counterparty'
  | 'same-mandate'
  | 'same-amount'
  | 'amount-within-tenth';

/**
 * Why a request failed, as a code the renderer words (04 A24).
 *
 * `unexpected` is everything without a code of its own — a fault inside
 * Actual, or a request that should never have been sent. The renderer says so
 * in its own words; the engine's English stays in `detail`, for a developer.
 */
export type AyqErrorCode =
  | 'unexpected'
  | 'engine-stopped'
  | 'engine-timeout'
  | 'engine-not-running'
  | 'engine-native-binding'
  | 'picker-failed'
  | 'store-newer'
  | 'store-copy-failed'
  | 'budget-slow'
  | 'import-no-file'
  | 'import-nothing-readable'
  | 'category-needs-name'
  | 'category-exists'
  | 'category-not-found'
  | 'category-group-not-found'
  | 'category-wrong-kind'
  | 'category-in-use'
  | 'category-own-destination'
  | 'counterparty-not-found'
  | 'counterparty-self'
  | 'merge-nothing'
  | 'transaction-not-found'
  | 'bulk-needs-scope'
  | 'rule-not-found'
  | 'plan-needs-name'
  | 'plan-needs-amount'
  | 'plan-needs-start'
  | 'plan-bad-end'
  | 'plan-end-before-start'
  | 'plan-bad-interval'
  | 'plan-not-found'
  | 'plan-not-on-date'
  | 'plan-bad-date'
  | 'plan-already-matched'
  | 'month-invalid'
  | 'month-not-kept'
  | 'plan-amount-invalid'
  | 'anchor-disagrees'
  | 'import-problem-not-found';

/** Bounded values a code's sentence may name: a file, a month, a version. */
export type AyqErrorParams = Readonly<Record<string, string | number>>;

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
  | {
      id: string;
      ok: false;
      kind: 'error';
      code: AyqErrorCode;
      params?: AyqErrorParams;
      /** For `import-nothing-readable`: each file, and why. */
      problems?: AyqImportProblem[];
      /**
       * The engine's own account of it, in English, for a developer reading a
       * log. Never shown: the renderer words the code (04 A24).
       */
      detail: string;
    };

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
