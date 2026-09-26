// What kind of account one is, and what follows from it (CL_002 D8–D12,
// PF-006 F2).
//
// An account is described by five properties — whose money, money or debt,
// when it can be spent, exact or market value, and currency — not by a closed
// list of types. A template is a set of those properties filled in for the
// owner, so that the one question AYQ asks about a new account can offer a few
// plain choices and still leave a complete description behind.
//
// The kind is never guessed from a bank file (CL_001 D3). A CAMT.053 statement
// says which IBAN it reports on and in which currency; it does not say whether
// the account is a deposit, and the standard carries no element for the end of
// a term. So an import that meets an account AYQ does not know creates it with
// the question waiting, and the owner's answer is what fills the rest.

import type {
  AyqAccountKind,
  AyqAccountTemplate,
} from '../../ayq-client/src/ayq-ipc-contract.ts';

import {
  ayqReadStore,
  ayqWriteStore,
  type AyqAccountProfile,
  type AyqStore,
} from './ayq-store.ts';

/** The three templates the owner uses now, and the one for "decide later". */
const TEMPLATES: Record<
  AyqAccountTemplate,
  Omit<AyqAccountKind, 'template' | 'lockedUntil' | 'currency'>
> = {
  payment: { ownership: 'own', nature: 'money', access: 'now', value: 'exact' },
  savings: {
    ownership: 'own',
    nature: 'money',
    access: 'after-transfer',
    value: 'exact',
  },
  'term-deposit': {
    ownership: 'own',
    nature: 'money',
    access: 'locked',
    value: 'exact',
  },
  // The money is in the owner's own bank export, so it is held; when it can be
  // spent is exactly what has not been said, and it stays unsaid.
  other: { ownership: 'own', nature: 'money', access: null, value: 'exact' },
};

/** Whether a word is one of the templates AYQ knows. */
export function ayqIsAccountTemplate(value: unknown): value is AyqAccountTemplate {
  return typeof value === 'string' && Object.hasOwn(TEMPLATES, value);
}

/**
 * The profile an import writes for an account it has just created.
 *
 * The question is waiting: `template` is null and so is `decidedAt`. What the
 * statement does say — the currency — is kept.
 */
export function ayqNewAccountProfile(
  currency: string | null,
  at: string,
): AyqAccountProfile {
  return {
    template: null,
    ownership: 'own',
    nature: 'money',
    access: null,
    lockedUntil: null,
    value: 'exact',
    currency,
    createdAt: at,
    decidedAt: null,
  };
}

/**
 * Records the owner's answer about one account.
 *
 * The kind is the newer decision, so an earlier "counts toward available funds"
 * switch for the same account gives way to what the kind implies. The switch
 * stays available afterwards and outranks the kind again once used (03 §7.6).
 */
export function ayqSetAccountKind(
  dataDir: string,
  accountId: string,
  template: AyqAccountTemplate,
  lockedUntil: string | null,
  at: string,
): void {
  const store = ayqReadStore(dataDir);
  const held = store.accountProfiles[accountId];
  store.accountProfiles[accountId] = {
    template,
    ...TEMPLATES[template],
    lockedUntil: template === 'term-deposit' ? lockedUntil : null,
    currency: held?.currency ?? null,
    createdAt: held?.createdAt ?? at,
    decidedAt: at,
  };
  delete store.accountFlags[accountId];
  ayqWriteStore(dataDir, store);
}

/** The kind as the renderer sees it, or null for an account never asked about. */
export function ayqAccountKind(
  store: AyqStore,
  accountId: string,
): AyqAccountKind | null {
  const held = store.accountProfiles[accountId];
  if (held === undefined) return null;
  return {
    template: held.template,
    ownership: held.ownership,
    nature: held.nature,
    access: held.access,
    lockedUntil: held.lockedUntil,
    value: held.value,
    currency: held.currency,
  };
}

/** Whether an import created this account and the owner has not answered yet. */
export function ayqKindWanted(store: AyqStore, accountId: string): boolean {
  const held = store.accountProfiles[accountId];
  return held !== undefined && held.template === null;
}

/**
 * What the kind says about available funds (CL_002 D10), or undefined when the
 * kind says nothing yet.
 *
 * Own money, not debt, that can be spent now or after a transfer. A question
 * still waiting says nothing, and the account keeps the default an account of
 * unknown type has always had (03 §7.15). "Other — decide later" is an answer,
 * and it counts nothing until the owner decides.
 */
export function ayqKindCountsTowardFunds(
  store: AyqStore,
  accountId: string,
): boolean | undefined {
  const held = store.accountProfiles[accountId];
  if (held === undefined || held.template === null) return undefined;
  return (
    held.ownership === 'own' &&
    held.nature === 'money' &&
    (held.access === 'now' || held.access === 'after-transfer')
  );
}

/**
 * Whether an account's balance is the owner's own money (PF-006 F5).
 *
 * An account nobody has described is held as own money, as it always was: it
 * came out of the owner's bank export. Money that belongs to someone else, and
 * money owed, are not held.
 */
export function ayqHoldsOwnMoney(kind: AyqAccountKind | null): boolean {
  if (kind === null) return true;
  return (
    kind.ownership !== 'others' &&
    kind.ownership !== 'shared' &&
    kind.nature !== 'debt'
  );
}
