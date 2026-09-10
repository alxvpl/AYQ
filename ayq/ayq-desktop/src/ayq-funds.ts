// Available funds, and the money that only looks like it went somewhere.
//
// 03 §7.6: every account carries a flag saying whether its balance forms
// available funds, only flagged accounts form them, and a transfer between a
// flagged and an unflagged account is a movement of money — never income and
// never an expense.
//
// The flag is AYQ's own rather than Actual's `offbudget`. `offbudget` was
// measured to be changeable after creation, so it *could* hold this, and it is
// still the wrong place: it also decides what Actual counts in a budget month,
// which the Plan screen reads. A statement about the forecast would then
// silently change the plan, and a figure that is wrong for a reason nobody can
// see is worse than one that is simply missing.

import type {
  AyqAccountSummary,
  AyqProvenance,
} from '../../ayq-client/src/ayq-ipc-contract.ts';

import { ayqMaskIban } from './ayq-mask.ts';
import { ayqReadStore, ayqWriteStore, type AyqStore } from './ayq-store.ts';

/**
 * What an account counts as until somebody says otherwise. PROVISIONAL.
 *
 * 03 §7.6 states the default per account type — current accounts yes, savings
 * accounts no — and neither Actual's account model nor the CAMT record carries
 * an account type, so there is nothing to read it from. Every account AYQ has
 * today came from a CAMT.053 export of a current account, so yes is the answer
 * that is right for the accounts that exist; a savings account is one switch
 * away, per account, and the switch is what 03 §7.6 actually guarantees.
 */
export const AYQ_DEFAULT_COUNTS_TOWARD_FUNDS = true;

export function ayqCountsTowardFunds(store: AyqStore, accountId: string): boolean {
  const flags = store.accountFlags[accountId];
  return flags === undefined
    ? AYQ_DEFAULT_COUNTS_TOWARD_FUNDS
    : flags.countsTowardFunds;
}

export function ayqSetAccountFlag(
  dataDir: string,
  accountId: string,
  countsTowardFunds: boolean,
): void {
  const store = ayqReadStore(dataDir);
  store.accountFlags[accountId] = { countsTowardFunds };
  ayqWriteStore(dataDir, store);
}

/** Only the flagged accounts. 03 §7.6. */
export function ayqAvailableFunds(accounts: AyqAccountSummary[]): number {
  return accounts
    .filter(account => account.countsTowardFunds)
    .reduce((total, account) => total + account.balanceCents, 0);
}

/**
 * The names of the accounts AYQ itself holds.
 *
 * The comparison is against the masked name because that is the only form of
 * the account's IBAN AYQ keeps: the mask is applied at import and the full
 * number never reaches the budget (03 §6.2). Two different IBANs would have to
 * share a country and their last four digits to collide, which is the same
 * assumption account identity already rests on.
 */
export function ayqOwnAccountNames(accounts: AyqAccountSummary[]): Set<string> {
  return new Set(accounts.map(account => account.name));
}

/**
 * Whether a transaction moved money between two accounts AYQ holds.
 *
 * Read from the counterparty IBAN the bank stated, which is evidence rather
 * than a guess: the money went to an account that is also in this budget, so it
 * did not leave. Actual's own `transfer_id` is not used, because AYQ never asks
 * it to link transfers — each side arrives as its own imported statement line,
 * and linking them would be a decision with no provenance.
 */
export function ayqIsInternalTransfer(
  ownNames: Set<string>,
  provenance: AyqProvenance | undefined,
): boolean {
  const masked = ayqMaskIban(provenance?.counterpartyIban ?? null);
  return masked !== null && ownNames.has(masked);
}
