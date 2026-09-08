// Categories, and the standing decisions that fill them in.
//
// A rule says: this counterparty belongs in that category. It is keyed by the
// canonical counterparty key — the same key that makes every Albert Heijn one
// shop — so one decision covers every past and future visit to it, whatever the
// terminal printed that day.
//
// Rules are stored by category *name* rather than by id. An id belongs to one
// budget; a rule is a person's decision and should survive a budget being
// recreated from the same statements.

import api from '@actual-app/api';

import type {
  AyqCategory,
  AyqCategoryRule,
} from '../../ayq-client/src/ayq-ipc-contract.ts';
import { ayqSettle } from './ayq-settle.ts';
import { ayqId, ayqReadStore, ayqWriteStore } from './ayq-store.ts';

export async function ayqCategories(): Promise<AyqCategory[]> {
  const groups = await api.getCategoryGroups();
  const byGroup = new Map(groups.map(group => [group.id, group.name]));

  return (await api.getCategories()).map(category => ({
    id: category.id,
    name: category.name,
    groupId: category.group_id ?? '',
    groupName: byGroup.get(category.group_id ?? '') ?? '',
    isIncome: category.is_income === true,
  }));
}

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

/**
 * Applies every rule to every transaction that has no category yet.
 *
 * Only the uncategorised are touched: a rule is a default, not an override, and
 * a person who moved one transaction by hand did so on purpose.
 */
export async function ayqApplyRules(
  dataDir: string,
): Promise<{ categorised: number }> {
  const store = ayqReadStore(dataDir);
  if (store.rules.length === 0) return { categorised: 0 };

  const categories = await ayqCategories();
  const byName = new Map(
    categories.map(category => [category.name.toLowerCase(), category.id]),
  );

  const wanted = new Map<string, string>();
  for (const rule of store.rules) {
    const categoryId = byName.get(rule.categoryName.toLowerCase());
    if (categoryId) wanted.set(rule.counterpartyKey, categoryId);
  }
  if (wanted.size === 0) return { categorised: 0 };

  const answer = (await api.aqlQuery(
    api
      .q('transactions')
      .select(['id', 'imported_id', { categoryId: 'category.id' }]),
  )) as {
    data?: Array<{ id: string; imported_id: string | null; categoryId: string | null }>;
  };

  const rows = answer.data ?? [];
  const before = rows.filter(row => !row.categoryId).length;

  let categorised = 0;
  for (const row of rows) {
    if (row.categoryId) continue;
    const key = row.imported_id
      ? store.provenance[row.imported_id]?.counterpartyKey
      : null;
    if (!key) continue;
    const categoryId = wanted.get(key);
    if (!categoryId) continue;

    await api.updateTransaction(row.id, { category: categoryId });
    categorised += 1;
  }

  if (categorised > 0) {
    // The writes land after the calls that queued them return, so the next
    // read is only trusted once it shows them.
    await ayqSettle(
      uncategorisedCount,
      remaining => remaining <= before - categorised,
      'the categories',
    );
  }

  return { categorised };
}

async function uncategorisedCount(): Promise<number> {
  const answer = (await api.aqlQuery(
    api.q('transactions').filter({ category: null }).calculate({ $count: 'id' }),
  )) as { data?: number };
  return Number(answer.data ?? 0);
}

/** The counterparty key a transaction was imported under, when it has one. */
export function ayqKeyOfTransaction(
  dataDir: string,
  importedId: string | null,
): string | null {
  if (!importedId) return null;
  return ayqReadStore(dataDir).provenance[importedId]?.counterpartyKey ?? null;
}
