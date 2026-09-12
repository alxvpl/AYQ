// Standing decisions about counterparties.
//
// A rule says: this counterparty belongs in that category. It is keyed by the
// canonical counterparty key — the same key that makes every visit to one shop
// one counterparty — and never by a substring of what the bank happened to
// print, which changes with the terminal, the date and the card.
//
// Two things a rule may not do. It may not touch a transaction a person filed
// themselves: a manual choice is the last word, and automation that overwrites
// it is worse than no automation. And it may not invent: a counterparty with no
// rule stays uncategorised, which is a perfectly good answer.
//
// Rules are stored by category *name* rather than by id. An id belongs to one
// budget; a rule is a person's decision and should survive a budget being
// recreated from the same statements. Renaming a category moves its rules with
// it.

import api from '@actual-app/api';

import type { AyqCategoryRule } from '../../ayq-client/src/ayq-ipc-contract.ts';

import { ayqCanonicalKey } from './ayq-aliases.ts';
import { ayqSetCategories } from './ayq-batch.ts';
import { ayqCategories } from './ayq-categories.ts';
import { ayqSettle } from './ayq-settle.ts';
import {
  ayqAddDecision,
  ayqId,
  ayqReadStore,
  ayqRowKey,
  ayqStandingDecision,
  ayqWriteStore,
  type AyqStore,
} from './ayq-store.ts';

export function ayqRules(dataDir: string): AyqCategoryRule[] {
  return ayqReadStore(dataDir).rules;
}

/** Adds or replaces the rule for a counterparty. One key, one category. */
export function ayqRememberRule(
  dataDir: string,
  counterpartyKey: string,
  categoryName: string,
): AyqCategoryRule[] {
  const store = ayqReadStore(dataDir);
  store.rules = store.rules.filter(
    rule => rule.counterpartyKey !== counterpartyKey,
  );
  store.rules.push({
    id: ayqId('rule'),
    counterpartyKey,
    categoryName,
    createdAt: new Date().toISOString(),
  });
  store.rules.sort((left, right) =>
    left.counterpartyKey.localeCompare(right.counterpartyKey),
  );
  ayqWriteStore(dataDir, store);
  return store.rules;
}

export function ayqForgetRule(
  dataDir: string,
  ruleId: string,
): AyqCategoryRule[] {
  const store = ayqReadStore(dataDir);
  store.rules = store.rules.filter(rule => rule.id !== ruleId);
  ayqWriteStore(dataDir, store);
  return store.rules;
}

/** Records who decided a transaction's category, and what they decided. */
export function ayqRecordDecision(
  dataDir: string,
  key: string,
  source: 'manual' | 'rule',
  categoryName: string,
): void {
  const store = ayqReadStore(dataDir);
  ayqAddDecision(store, key, {
    source,
    categoryName,
    at: new Date().toISOString(),
  });
  ayqWriteStore(dataDir, store);
}

type AyqCategorisableRow = {
  id: string;
  imported_id: string | null;
  categoryId: string | null;
};

async function rowsToConsider(): Promise<AyqCategorisableRow[]> {
  const answer = (await api.aqlQuery(
    api
      .q('transactions')
      .filter({ starting_balance_flag: false })
      .select(['id', 'imported_id', { categoryId: 'category.id' }]),
  )) as { data?: AyqCategorisableRow[] };
  return answer.data ?? [];
}

/** How many transactions nobody has filed. Counted, never remembered. */
export async function ayqUncategorisedCount(): Promise<number> {
  const answer = (await api.aqlQuery(
    api
      .q('transactions')
      // An opening balance has no category and never needs one; counting it as
      // unfiled would mean a budget could never reach zero left to do.
      .filter({ category: null, starting_balance_flag: false })
      .calculate({ $count: 'id' }),
  )) as { data?: number };
  return Number(answer.data ?? 0);
}

/** What each rule wants, resolved against the categories this budget has. */
async function wanted(
  store: AyqStore,
): Promise<Map<string, { id: string; name: string }>> {
  const categories = await ayqCategories();
  const byName = new Map(
    categories.map(category => [category.name.toLowerCase(), category]),
  );

  const map = new Map<string, { id: string; name: string }>();
  for (const rule of store.rules) {
    const category = byName.get(rule.categoryName.toLowerCase());
    if (category)
      map.set(rule.counterpartyKey, { id: category.id, name: category.name });
  }
  return map;
}

/**
 * Applies every rule to every transaction that a rule is allowed to touch.
 *
 * Allowed means: nothing filed by hand, and either nothing filed at all or
 * something this automation filed itself and has since changed its mind about
 * — which is what makes changing a rule re-file the transactions it already
 * decided, rather than leaving the old answer behind.
 */
export async function ayqApplyRules(
  dataDir: string,
): Promise<{ categorised: number }> {
  const store = ayqReadStore(dataDir);
  if (store.rules.length === 0) return { categorised: 0 };

  const targets = await wanted(store);
  if (targets.size === 0) return { categorised: 0 };

  const rows = await rowsToConsider();
  const before = rows.filter(row => !row.categoryId).length;

  let categorised = 0;
  let filled = 0;
  const updates: Array<{ id: string; category: string | null }> = [];

  for (const row of rows) {
    const key = ayqRowKey(row);
    const decision = ayqStandingDecision(store, key);
    if (decision?.source === 'manual') continue;

    // The canonical counterparty, so a rule written for one shop also files
    // the variants a person has said are that shop.
    const counterpartyKey = ayqCanonicalKey(
      store,
      store.provenance[key]?.counterpartyKey,
    );
    if (!counterpartyKey) continue;

    const target = targets.get(counterpartyKey);
    if (!target) continue;
    if (row.categoryId === target.id) continue;
    // Anything already categorised without this automation's fingerprint on it
    // arrived some other way, and is left alone.
    if (row.categoryId && decision?.source !== 'rule') continue;

    updates.push({ id: row.id, category: target.id });
    ayqAddDecision(store, key, {
      source: 'rule',
      categoryName: target.name,
      at: new Date().toISOString(),
    });
    categorised += 1;
    if (!row.categoryId) filled += 1;
  }

  if (categorised > 0) {
    // One pass, then the writes. Filing every row of a counterparty is one
    // decision a person made, and it should cost about what one decision costs.
    await ayqSetCategories(updates);
    ayqWriteStore(dataDir, store);
    // The writes land after the calls that queued them return, so the next
    // read is only trusted once it shows them.
    await ayqSettle(
      ayqUncategorisedCount,
      remaining => remaining <= before - filled,
      'the categories',
    );
  }

  return { categorised };
}

/** The counterparty key a transaction was imported under, when it has one. */
export function ayqKeyOfTransaction(
  dataDir: string,
  importedId: string | null,
): string | null {
  if (!importedId) return null;
  const store = ayqReadStore(dataDir);
  return ayqCanonicalKey(store, store.provenance[importedId]?.counterpartyKey);
}

/**
 * How many transactions a rule for this counterparty would still file.
 *
 * Used to make the offer after a manual choice truthful: "the other four",
 * not "the rest", and nothing at all when there is no other.
 */
export async function ayqPendingForCounterparty(
  dataDir: string,
  counterpartyKey: string,
): Promise<number> {
  const store = ayqReadStore(dataDir);
  const rows = await rowsToConsider();

  return rows.filter(row => {
    const key = ayqRowKey(row);
    if (ayqStandingDecision(store, key)?.source === 'manual') return false;
    if (row.categoryId) return false;
    return (
      ayqCanonicalKey(store, store.provenance[key]?.counterpartyKey) ===
      counterpartyKey
    );
  }).length;
}
