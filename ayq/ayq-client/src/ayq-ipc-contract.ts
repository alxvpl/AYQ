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

export type AyqRequest = {
  /** Correlation id; the host echoes it back untouched. */
  id: string;
  kind: 'engine.status';
};

export type AyqResponse =
  | { id: string; ok: true; kind: 'engine.status'; result: AyqEngineStatus }
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
