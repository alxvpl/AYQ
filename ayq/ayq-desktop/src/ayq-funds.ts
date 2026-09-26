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
  AyqLockedMoney,
  AyqProvenance,
} from '../../ayq-client/src/ayq-ipc-contract.ts';

import { ayqHoldsOwnMoney, ayqKindCountsTowardFunds } from './ayq-account-kind.ts';
import { ayqMaskIban } from './ayq-mask.ts';
import { ayqReadStore, ayqWriteStore, type AyqStore } from './ayq-store.ts';

/**
 * What an account counts as until somebody says otherwise. 03 §7.15.
 *
 * §7.6 states the default per account type — current accounts yes, savings
 * accounts no — and neither Actual's account model nor the CAMT record carries
 * an account type, so there is nothing to read it from. §7.15 settles that
 * case: where the type is not known, the flag defaults to yes. A savings
 * account is one switch away, per account, and the switch is what §7.6
 * guarantees.
 */
export const AYQ_DEFAULT_COUNTS_TOWARD_FUNDS = true;

/**
 * Whether one account's balance forms available funds.
 *
 * In order: the owner's own switch for this account (03 §7.6), then what the
 * account's kind says (CL_002 D10), then the default for an account whose type
 * is not known (§7.15). Setting a kind clears an earlier switch, so the switch
 * only outranks the kind when it was used after it.
 */
export function ayqCountsTowardFunds(store: AyqStore, accountId: string): boolean {
  const flags = store.accountFlags[accountId];
  if (flags !== undefined) return flags.countsTowardFunds;
  return (
    ayqKindCountsTowardFunds(store, accountId) ?? AYQ_DEFAULT_COUNTS_TOWARD_FUNDS
  );
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

/**
 * Only the flagged accounts (03 §7.6) — or nothing at all (§5).
 *
 * Null when any counted account's balance is unknown. The known subset is
 * deliberately not summed and labelled "available funds": a person acting on a
 * figure that silently omits their current account is worse off than a person
 * told that AYQ does not know, because nothing on the screen would say which
 * account was left out.
 */
export function ayqAvailableFunds(
  accounts: AyqAccountSummary[],
): number | null {
  const counted = accounts.filter(account => account.countsTowardFunds);
  if (counted.some(account => account.balanceCents === null)) return null;
  return counted.reduce(
    (total, account) => total + (account.balanceCents ?? 0),
    0,
  );
}

/**
 * The same rule over every account of the owner's own money, counted or not:
 * held in total (§5, PF-006 F5). Money owed and money that is someone else's
 * are not held.
 */
export function ayqTotalHeld(accounts: AyqAccountSummary[]): number | null {
  const own = accounts.filter(account => ayqHoldsOwnMoney(account.kind));
  if (own.some(account => account.balanceCents === null)) return null;
  return own.reduce((total, account) => total + (account.balanceCents ?? 0), 0);
}

/**
 * Every locked account, each with its own line (PF-006 F5): a term deposit is
 * the owner's money and is not available funds, and when it unlocks is part of
 * what it is.
 */
export function ayqLockedMoney(accounts: AyqAccountSummary[]): AyqLockedMoney[] {
  return accounts
    .filter(account => account.kind?.access === 'locked')
    .map(account => ({
      accountId: account.id,
      accountName: account.name,
      balanceCents: account.balanceCents,
      lockedUntil: account.kind?.lockedUntil ?? null,
    }));
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
