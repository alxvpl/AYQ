// What each account holds, how far AYQ can see, and whether it agrees with the
// bank (03 §8).
//
// Three separate facts live here and none of them may be derived from another:
//
//   the balance        an anchor, or Unknown
//   bank data through  the furthest day any statement reached
//   reconciliation     only where the bank stated a closing balance
//
// Reconciliation is derived, recomputed every time it is asked for, stored
// nowhere and carrying no provenance of its own (§8.5). A difference between
// what a statement says and what AYQ holds is stated and left standing (§8.3);
// the way to close one is to import what is missing, never for AYQ to invent
// the movements that would close it (§8.2).

import type {
  AyqAccountCoverage,
  AyqAccountsView,
} from '../../ayq-client/src/ayq-ipc-contract.ts';

import { ayqAvailableFunds, ayqTotalHeld } from './ayq-funds.ts';
import { ayqAccounts } from './ayq-ledger.ts';
import { ayqReadStore } from './ayq-store.ts';
import { ayqBankDataThrough, ayqClosingEvidence } from './ayq-evidence.ts';

export async function ayqAccountsView(
  dataDir: string,
): Promise<AyqAccountsView> {
  const accounts = await ayqAccounts(dataDir);
  const store = ayqReadStore(dataDir);

  // A projection of what each account already carries, so that the Accounts
  // detail and Today cannot come to disagree about one account.
  const coverage: AyqAccountCoverage[] = accounts.map(account => {
    const closing = ayqClosingEvidence(store, account.id);
    const agreed = account.reconciliation;
    return {
      accountId: account.id,
      toDate: ayqBankDataThrough(store, account.id),
      statementBalanceCents: closing?.closingBalanceCents ?? null,
      // What AYQ can account for at the statement's own date, which is the
      // figure the difference below is against. Not the balance: the balance
      // is the anchor, and the anchor is the bank's own number.
      ledgerBalanceCents: agreed?.ledgerBalanceCents ?? account.balanceCents,
      differenceCents: agreed?.differenceCents ?? null,
      agrees: agreed === null ? null : agreed.agrees,
      file: closing?.file ?? null,
      readAt: closing?.readAt ?? null,
    };
  });

  const counted = accounts.filter(account => account.countsTowardFunds);
  const countedCoverage = coverage.filter(one =>
    counted.some(account => account.id === one.accountId),
  );

  // 03 §8.4: the earliest coverage date among the accounts that count, never
  // the latest. A counted account with no statement at all makes the boundary
  // unknown rather than making it somebody else's date.
  const countedWithoutCoverage = countedCoverage.filter(
    one => one.toDate === null,
  ).length;
  const reliableTo =
    counted.length === 0 || countedWithoutCoverage > 0
      ? null
      : countedCoverage.reduce<string | null>(
          (earliest, one) =>
            one.toDate !== null && (earliest === null || one.toDate < earliest)
              ? one.toDate
              : earliest,
          null,
        );

  return {
    accounts,
    coverage,
    availableFundsCents: ayqAvailableFunds(accounts),
    totalBalanceCents: ayqTotalHeld(accounts),
    countedWithoutAnchor: counted.filter(
      account => account.balanceCents === null,
    ).length,
    reliableTo,
    countedWithoutCoverage,
  };
}
