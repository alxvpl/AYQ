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
  counterpartyKey: string | null;
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
 * The files the host's picker returned; empty when the person cancelled.
 *
 * Paths, not contents: the renderer never reads them, and never could — it has
 * no filesystem. It hands them back to the host, which is the side that opened
 * the dialog in the first place. Several, because a bank exports a statement
 * per day and nobody wants to import two hundred of them one at a time.
 */
export type AyqPickedFile = { paths: string[] };

/** What the engine answers to each request kind. */
export type AyqResults = {
  'engine.status': AyqEngineStatus;
  'accounts.list': AyqAccountSummary[];
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
  'imports.list': AyqImportRecord[];
  summary: AyqSummary;
  'import.pick': AyqPickedFile;
  'import.camt': AyqImportSummary;
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
  | { kind: 'imports.list' }
  | { kind: 'summary' }
  | { kind: 'import.pick' }
  | { kind: 'import.camt'; paths: string[] };

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
