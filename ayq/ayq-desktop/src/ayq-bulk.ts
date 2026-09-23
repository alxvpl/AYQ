// Corrections over a bounded set of existing transactions (03 §4.7–§4.9, 04 A36).
//
// A person who has picked twelve rows, or asked for "everything from this shop
// in March", is making one decision about a set that already exists. Two things
// follow from that and both are held here.
//
// The set is stated before anything happens. `ayqBulkScope` answers "what would
// this touch?" from the same reading of the budget the correction itself will
// use, so the count on the screen and the count that changes cannot come apart.
// For a counterparty correction the answer is wider than the scope: an identity
// decision is about the names the bank printed (03 §3.11), so every transaction
// under those names moves, and the report says how many that is.
//
// And nothing here learns. Filing twelve rows is a statement about twelve rows;
// a rule is a statement about every transaction that arrives from now on, and
// 03 §4.7 keeps the two apart. No request in this file can write a rule, and a
// row somebody already filed by hand into something else is left as it was and
// counted (§4.9) rather than quietly replaced.

import type {
  AyqBulkCategorised,
  AyqBulkCounterparty,
  AyqBulkScope,
  AyqBulkScopeReport,
} from '../../ayq-client/src/ayq-ipc-contract.ts';

import {
  ayqApplyAliases,
  ayqCanonicalKey,
  ayqRememberAlias,
} from './ayq-aliases.ts';
import { ayqSetCategories } from './ayq-batch.ts';
import { ayqCategories } from './ayq-categories.ts';
import { ayqCounterpartyDetail } from './ayq-counterparties.ts';
import { ayqRowsInScope, type AyqScopedRow } from './ayq-ledger.ts';
import { ayqApplyRules, ayqUncategorisedCount } from './ayq-rules.ts';
import { ayqSettle } from './ayq-settle.ts';
import {
  ayqAddDecision,
  ayqReadStore,
  ayqRowKey,
  ayqStandingDecision,
  ayqWriteStore,
  type AyqStore,
} from './ayq-store.ts';

/** The bank name a row was imported under, when it was imported at all. */
function variantOf(
  store: AyqStore,
  row: AyqScopedRow,
): { variantKey: string; variant: string } | null {
  const provenance = store.provenance[ayqRowKey(row)];
  if (!provenance?.counterpartyKey) return null;
  return {
    variantKey: provenance.counterpartyKey,
    variant: provenance.counterpartyName ?? provenance.counterpartyKey,
  };
}

/** What a correction over this scope would reach, stated before it is made. */
export async function ayqBulkScope(
  dataDir: string,
  scope: AyqBulkScope,
): Promise<AyqBulkScopeReport> {
  const store = ayqReadStore(dataDir);
  const rows = await ayqRowsInScope(dataDir, scope);

  const variants = new Map<string, { variant: string; transactions: number }>();
  for (const row of rows) {
    const found = variantOf(store, row);
    if (found && !variants.has(found.variantKey)) {
      variants.set(found.variantKey, {
        variant: found.variant,
        transactions: 0,
      });
    }
  }

  // How far each name reaches: every transaction in the budget the resolver
  // recorded under it, not only the ones in the scope. Counted from provenance,
  // which is the evidence the alias would be written against.
  if (variants.size > 0) {
    for (const provenance of Object.values(store.provenance)) {
      const key = provenance.counterpartyKey;
      if (!key) continue;
      const counted = variants.get(key);
      if (counted) counted.transactions += 1;
    }
  }

  const listed = [...variants.entries()].map(([variantKey, one]) => ({
    variantKey,
    variant: one.variant,
    transactions: one.transactions,
  }));
  const byHand = rows.filter(
    row => ayqStandingDecision(store, ayqRowKey(row))?.source === 'manual',
  ).length;
  return {
    transactions: rows.length,
    byHand,
    variants: listed,
    variantTransactions: listed.reduce((sum, one) => sum + one.transactions, 0),
  };
}

/**
 * Files every transaction in the scope, by hand.
 *
 * Each one is recorded as a manual decision, exactly as filing it from the
 * detail pane would be, so a rule can never overwrite it afterwards (03 §4.4).
 * A row that already carries a manual decision is not one of the rows this
 * decision may change unless the caller said so — §4.9 — and is counted
 * instead. Saying so is the person's newer decision over their older one, made
 * after being told how many there are; that is §4.4 working in its own favour,
 * not an exception to it. A row already in the chosen category needs nothing
 * and is neither.
 */
export async function ayqCategoriseScope(
  dataDir: string,
  scope: AyqBulkScope,
  categoryId: string | null,
  includeByHand = false,
): Promise<AyqBulkCategorised> {
  const chosen =
    categoryId === null
      ? null
      : ((await ayqCategories()).find(one => one.id === categoryId) ?? null);
  if (categoryId !== null && chosen === null)
    throw new Error('no such category');

  const rows = await ayqRowsInScope(dataDir, scope);
  const store = ayqReadStore(dataDir);
  const before = await ayqUncategorisedCount();

  const updates: Array<{ id: string; category: string | null }> = [];
  let keptByHand = 0;
  let filled = 0;
  let emptied = 0;

  for (const row of rows) {
    if (row.categoryId === categoryId) continue;

    const key = ayqRowKey(row);
    const decision = ayqStandingDecision(store, key);
    if (decision?.source === 'manual' && !includeByHand) {
      keptByHand += 1;
      continue;
    }

    updates.push({ id: row.id, category: categoryId });
    ayqAddDecision(store, key, {
      source: 'manual',
      categoryName: chosen?.name ?? '',
      at: new Date().toISOString(),
    });
    if (row.categoryId === null && categoryId !== null) filled += 1;
    if (row.categoryId !== null && categoryId === null) emptied += 1;
  }

  if (updates.length > 0) {
    await ayqSetCategories(updates);
    ayqWriteStore(dataDir, store);
    // The batch lands after the call that queued it returns; the answer is
    // trusted once the count of the unfiled shows every write.
    await ayqSettle(
      ayqUncategorisedCount,
      remaining => remaining === before - filled + emptied,
      'the categories',
    );
  }

  return { scoped: rows.length, categorised: updates.length, keptByHand };
}

/**
 * Records every bank name behind the scope as one counterparty.
 *
 * One alias per name, written through the same path a single correction takes,
 * so the table stays flat and a rule the target already has still wins. The
 * names are then applied once and the rules once — a person who picked forty
 * rows made one decision and it should cost about what one costs.
 *
 * A name already resolving to the target needs no alias and gets none; a scope
 * whose every name already does is a decision that changes nothing, and says
 * so with zeros rather than an error.
 */
export async function ayqCorrectScopeCounterparty(
  dataDir: string,
  scope: AyqBulkScope,
  counterpartyKey: string,
): Promise<AyqBulkCounterparty> {
  const target = await ayqCounterpartyDetail(dataDir, counterpartyKey);
  if (target.counterparty.transactions === 0) {
    throw new Error(
      'no counterparty in this budget has that key; an alias points at one ' +
        'that exists',
    );
  }

  const rows = await ayqRowsInScope(dataDir, scope);
  let store = ayqReadStore(dataDir);

  const names = new Map<string, string>();
  for (const row of rows) {
    const found = variantOf(store, row);
    if (!found || names.has(found.variantKey)) continue;
    if (found.variantKey === counterpartyKey) continue;
    if (
      ayqCanonicalKey(store, found.variantKey, found.variant) ===
      counterpartyKey
    ) {
      continue;
    }
    names.set(found.variantKey, found.variant);
  }

  for (const [variantKey, variant] of names) {
    ayqRememberAlias(dataDir, {
      variantKey,
      variant,
      counterpartyKey,
      counterpartyName: target.counterparty.name,
    });
    store = ayqReadStore(dataDir);
  }

  if (names.size === 0) {
    return {
      variants: 0,
      moved: 0,
      counterpartyKey,
      counterpartyName: target.counterparty.name,
    };
  }

  const { moved } = await ayqApplyAliases(dataDir);
  // The transactions that have just joined the counterparty were never filed
  // under its rule, if it has one. Applying the rules is the existing mechanism
  // and keeps the existing limit: nothing filed by hand is touched.
  await ayqApplyRules(dataDir);

  return {
    variants: names.size,
    moved,
    counterpartyKey,
    counterpartyName: target.counterparty.name,
  };
}
