// Needs attention (010 with the corrections of 013; 036 §4).
//
// "What needs my attention now?" — answered from state AYQ already holds, and
// from nothing else. Each group is a condition that holds right now; when the
// condition stops holding the group is simply not there any more. Nothing here
// is stored, nothing is dismissed, and no new financial meaning is made: an
// overdue payment is overdue because 03 §7.13 says so, a balance is unknown
// because 03 §10.5 says so, and this module only gathers what those rules have
// already decided.
//
// The renderer receives the groups and draws them. It does not know how any of
// them is decided (010 §8.1).
//
// Not here, on purpose (010 §4): no staleness threshold (03 §8.6 is OPEN), no
// low-balance prediction or other analytical alert, no Windows notification.

import type {
  AyqAttention,
  AyqAttentionGroup,
  AyqImportRecord,
} from '../../ayq-client/src/ayq-ipc-contract.ts';

import { ayqBackupOverview } from './ayq-backup.ts';
import { ayqAccountsView } from './ayq-coverage.ts';
import { AyqEngineError } from './ayq-error.ts';
import { ayqUnfiled } from './ayq-ledger.ts';
import { ayqForecast, ayqPlan } from './ayq-plan.ts';
import { ayqReadStore, ayqWriteStore } from './ayq-store.ts';
import type { AyqStore } from './ayq-store.ts';

/**
 * The files imports could not use that still need the owner (013 §1).
 *
 * A file stops needing them when (a) a later import read a file of that name —
 * the coverage evidence records the base name of every statement an import
 * actually read, with the import it came from — or (b) the owner marked it as
 * dealt with in Import history.
 */
export function ayqOpenImportFailures(
  store: AyqStore,
): NonNullable<AyqAttentionGroup['files']> {
  const readBy = new Map<string, Set<string>>();
  for (const one of store.evidence) {
    if (one.file === null) continue;
    const names = readBy.get(one.importId) ?? new Set<string>();
    names.add(one.file);
    readBy.set(one.importId, names);
  }

  const open: NonNullable<AyqAttentionGroup['files']> = [];
  for (const record of store.imports) {
    for (const problem of record.problems ?? []) {
      if (typeof problem.handledAt === 'string') continue;
      const readSince = store.imports.some(
        later =>
          later.at > record.at &&
          readBy.get(later.id)?.has(problem.name) === true,
      );
      if (readSince) continue;
      open.push({
        importId: record.id,
        at: record.at,
        name: problem.name,
        code: problem.code,
      });
    }
  }
  return open;
}

/** Every condition that holds, in the order Today shows them. */
export async function ayqAttention(
  dataDir: string,
  today: string,
): Promise<AyqAttention> {
  const groups: AyqAttentionGroup[] = [];

  // Upcoming (010 §3A). Due today is an expected occurrence dated today and
  // not matched (03 §7.26); overdue is the forecast's own flag (§7.13), the
  // same one Today's waiting list counts, so the two can never disagree.
  const plan = ayqPlan(dataDir, today);
  const dueToday = plan.occurrences.filter(
    one =>
      one.state === 'expected' &&
      one.effectiveDate === today &&
      one.matchedTransactionId === null,
  ).length;
  if (dueToday > 0) {
    groups.push({ key: 'due-today', kind: 'due-today', count: dueToday });
  }
  const forecast = await ayqForecast(dataDir, today);
  const overdue = forecast.events.filter(event => event.flagged).length;
  if (overdue > 0) {
    groups.push({ key: 'overdue', kind: 'overdue', count: overdue });
  }

  // Accounts (010 §3C). A difference is only ever stated where the bank stated
  // a balance (03 §8.2); an unknown balance is an account with no anchor
  // (§10.5), and its route is the one Set account balance path (013 §4).
  const view = await ayqAccountsView(dataDir);
  const differing = view.accounts.filter(
    one =>
      one.reconciliation !== null && one.reconciliation.differenceCents !== 0,
  );
  if (differing.length > 0) {
    groups.push({
      key: `reconciliation-difference:${differing.map(one => one.id).join(',')}`,
      kind: 'reconciliation-difference',
      count: differing.length,
      accounts: differing.map(one => ({
        accountId: one.id,
        accountName: one.name,
      })),
    });
  }
  const unknown = view.accounts.filter(one => one.anchor === null);
  if (unknown.length > 0) {
    groups.push({
      key: `balance-unknown:${unknown.map(one => one.id).join(',')}`,
      kind: 'balance-unknown',
      count: unknown.length,
      accounts: unknown.map(one => ({
        accountId: one.id,
        accountName: one.name,
      })),
    });
  }

  // Import (010 §3D, 013 §1).
  const files = ayqOpenImportFailures(ayqReadStore(dataDir));
  if (files.length > 0) {
    groups.push({
      key: `import-failed:${files.map(one => `${one.importId}/${one.name}`).join(',')}`,
      kind: 'import-failed',
      count: files.length,
      files,
    });
  }

  // Backup (010 §3E): the last attempt, of any kind, failed. A later success
  // replaces it as the last attempt, and the group is gone.
  const last = ayqBackupOverview(dataDir).lastAttempt;
  if (last !== null && last.outcome === 'failed') {
    groups.push({
      key: `backup-failed:${last.at}`,
      kind: 'backup-failed',
      count: 1,
      backup: { at: last.at, failure: last.failure },
    });
  }

  // Review (010 §3B): one summary for the backlog, whatever its size.
  const review = (await ayqUnfiled(dataDir)).length;
  if (review > 0) {
    groups.push({ key: 'review', kind: 'review', count: review });
  }

  return { groups };
}

/**
 * Marks a file an import could not use as dealt with (013 §1b).
 *
 * Import history state, not attention state: the attention group clears
 * because this file no longer meets its condition. Marking is recorded once;
 * marking again leaves the first moment in place.
 */
export function ayqMarkImportProblemHandled(
  dataDir: string,
  importId: string,
  name: string,
  at: string,
): AyqImportRecord[] {
  const store = ayqReadStore(dataDir);
  const record = store.imports.find(one => one.id === importId);
  const problems = (record?.problems ?? []).filter(one => one.name === name);
  if (problems.length === 0) {
    throw new AyqEngineError(
      'import-problem-not-found',
      `no problem with ${name} in import ${importId}`,
    );
  }
  for (const problem of problems) {
    problem.handledAt ??= at;
  }
  ayqWriteStore(dataDir, store);
  // Newest first, as Import history reads it (`ayqImports`).
  return [...store.imports].reverse();
}
