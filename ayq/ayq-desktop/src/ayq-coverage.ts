// Statement coverage, and whether AYQ agrees with the bank (03 §8).
//
// Everything here is derived. Nothing is stored as a decision, nothing carries
// provenance, and nothing is written into the ledger: a difference between what
// a statement says and what AYQ holds is stated and left standing (§8.3). The
// way to close one is to import what is missing.
//
// AYQ asserts nothing beyond the comparison. A difference means the two
// disagree — not that a particular statement is missing, and never a licence to
// invent the movements that would close it (§8.2).

import type {
  AyqAccountCoverage,
  AyqAccountsView,
} from '../../ayq-client/src/ayq-ipc-contract.ts';

import { ayqAccounts } from './ayq-ledger.ts';
import { ayqReadStore } from './ayq-store.ts';

export async function ayqAccountsView(
  dataDir: string,
): Promise<AyqAccountsView> {
  const accounts = await ayqAccounts(dataDir);
  const store = ayqReadStore(dataDir);

  const coverage: AyqAccountCoverage[] = accounts.map(account => {
    const held = store.coverage[account.id];
    if (!held) {
      return {
        accountId: account.id,
        toDate: null,
        statementBalanceCents: null,
        ledgerBalanceCents: account.balanceCents,
        differenceCents: null,
        agrees: null,
        file: null,
        readAt: null,
      };
    }
    const difference = held.closingBalanceCents - account.balanceCents;
    return {
      accountId: account.id,
      toDate: held.toDate,
      statementBalanceCents: held.closingBalanceCents,
      ledgerBalanceCents: account.balanceCents,
      differenceCents: difference,
      agrees: difference === 0,
      file: held.file,
      readAt: held.readAt,
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
    availableFundsCents: counted.reduce(
      (sum, account) => sum + account.balanceCents,
      0,
    ),
    totalBalanceCents: accounts.reduce(
      (sum, account) => sum + account.balanceCents,
      0,
    ),
    reliableTo,
    countedWithoutCoverage,
  };
}
