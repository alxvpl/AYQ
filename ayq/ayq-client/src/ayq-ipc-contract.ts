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
// union, not a new channel and a new preload entry.
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
  accounts: AyqAccountSummary[];
  /** Counted by the engine's own query language, not by the renderer. */
  transactionCount: number;
  answeredAt: string;
};

/**
 * The file the host's picker returned, or null when the person cancelled.
 *
 * A path, not contents: the renderer never reads it, and never could — it has
 * no filesystem. It hands the path back to the host, which is the side that
 * opened the dialog in the first place.
 */
export type AyqPickedFile = { path: string | null };

/**
 * What a CAMT import did.
 *
 * Counts and identifiers only. No descriptions, no counterparty names, no
 * amounts, no IBAN: this crosses into the interface and from there into
 * screenshots and CI logs, and bank statements are not for either. The account
 * name is masked at the engine before it ever reaches here.
 */
export type AyqImportSummary = {
  /** The base name of what was picked. Never a full path. */
  file: string;
  /** CAMT documents read — a ZIP usually holds several. */
  files: number;
  /** Records the parser produced across those documents. */
  records: number;
  /** Rows sent to the engine — records that mapped, repeats collapsed. */
  prepared: number;
  /** Records with no usable date or amount, so nothing was sent. */
  skipped: number;
  /** Transactions the engine actually added. */
  imported: number;
  /**
   * Records that did not become a new transaction: rows the budget already
   * had, and repeats within the file itself, both matched on the import key.
   */
  duplicates: number;
  /** Documents the parser could not read, plus rows the engine rejected. */
  failed: number;
  budgetId: string;
  budgetName: string;
  accountId: string;
  /** Masked: a country code and the last four, never the account number. */
  accountName: string;
  /** Counted by the engine after the import, through its own query language. */
  transactionCountAfter: number;
};

/**
 * A request without its correlation id — what the renderer writes.
 *
 * Adding a capability means adding a member here, not a new IPC channel: there
 * is one channel, and the host relays it.
 */
/**
 * One row of the ledger, as the screen needs it.
 *
 * `payee` is the resolved counterparty — the point of the whole CAMT exercise —
 * and not the bank's raw string. The engine reads these from the budget; the
 * renderer formats them and nothing more.
 */
export type AyqLedgerRow = {
  id: string;
  /** YYYY-MM-DD, the booking date the import chose. */
  date: string;
  /** The normalised counterparty, null only when the budget has no payee. */
  payee: string | null;
  /** Signed integer cents, as the engine stores them. */
  amountCents: number;
  account: string;
  accountId: string;
  category: string | null;
  /** Booked rather than pending, as the statement said. */
  cleared: boolean;
};

export type AyqLedger = {
  /** Newest first. */
  rows: AyqLedgerRow[];
  /** Every transaction in the budget, counted by the engine. */
  total: number;
  /** How many of them this answer carries. */
  shown: number;
};

export type AyqRequestBody =
  | { kind: 'engine.status' }
  | { kind: 'import.pick' }
  | { kind: 'import.camt'; path: string }
  | { kind: 'transactions.list'; limit?: number };

/** Correlation id; the host echoes it back untouched. */
export type AyqRequest = AyqRequestBody & { id: string };

export type AyqResponse =
  | { id: string; ok: true; kind: 'engine.status'; result: AyqEngineStatus }
  | { id: string; ok: true; kind: 'import.pick'; result: AyqPickedFile }
  | { id: string; ok: true; kind: 'import.camt'; result: AyqImportSummary }
  | { id: string; ok: true; kind: 'transactions.list'; result: AyqLedger }
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
