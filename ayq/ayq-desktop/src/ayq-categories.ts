// Categories, on Actual's own model.
//
// Actual already has categories and category groups, and they are what the
// budget is built out of. AYQ does not keep a second set beside them: it seeds
// a small, practical list into Actual's own groups when it creates a budget,
// and after that reads and writes Actual's categories like any other client.
//
// The seed is deliberately short. A taxonomy nobody can hold in their head is
// a taxonomy nobody files anything into, and every one of these can be renamed
// or added to from the interface.

import api from '@actual-app/api';

import type { AyqCategory } from '../../ayq-client/src/ayq-ipc-contract.ts';

/**
 * What a fresh AYQ starts with.
 *
 * Actual seeds "Food", "General", "Bills", "Bills (Flexible)" — placeholders
 * for a budget it knows nothing about. On a bank statement they answer no
 * question: "General" is where a transaction goes to be forgotten. These are
 * the categories a Dutch current account actually produces, and they are
 * replaced rather than added to, so the list stays short.
 */
const STARTER: Array<{ group: string; names: string[] }> = [
  {
    group: 'Usual Expenses',
    names: [
      'Groceries',
      'Eating out',
      'Transport',
      'Housing',
      'Utilities',
      'Insurance',
      'Health',
      'Shopping',
      'Subscriptions',
    ],
  },
];

/** Actual's own placeholders, removed when AYQ seeds its own. */
const REPLACED = new Set(['Food', 'General', 'Bills', 'Bills (Flexible)']);

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

/**
 * Puts AYQ's starting categories in place.
 *
 * Only ever called on a budget AYQ has just created, so nothing can be
 * referencing the placeholders it removes. Adding is by name: running it twice
 * changes nothing.
 */
export async function ayqSeedCategories(): Promise<void> {
  const groups = await api.getCategoryGroups();
  const existing = await api.getCategories();
  const byName = new Map(existing.map(category => [category.name, category]));

  for (const { group, names } of STARTER) {
    const target = groups.find(candidate => candidate.name === group);
    const groupId = target ? target.id : await api.createCategoryGroup({ name: group });

    for (const name of names) {
      if (byName.has(name)) continue;
      await api.createCategory({ name, group_id: groupId });
    }
  }

  for (const category of existing) {
    if (category.is_income === true) continue;
    if (!REPLACED.has(category.name)) continue;
    await api.deleteCategory(category.id);
  }
}

/** A new category, in a group that already exists. */
export async function ayqCreateCategory(
  name: string,
  groupId: string,
): Promise<AyqCategory[]> {
  const trimmed = name.trim();
  if (trimmed === '') throw new Error('a category needs a name');

  const groups = await api.getCategoryGroups();
  if (!groups.some(group => group.id === groupId)) {
    throw new Error('no such category group');
  }

  const existing = await ayqCategories();
  if (
    existing.some(
      category =>
        category.groupId === groupId &&
        category.name.toLowerCase() === trimmed.toLowerCase(),
    )
  ) {
    throw new Error(`that group already has a category called ${trimmed}`);
  }

  await api.createCategory({ name: trimmed, group_id: groupId });
  return ayqCategories();
}

/**
 * Renames a category.
 *
 * The rules keep a category by name rather than by id, so they are moved with
 * it — otherwise renaming "Groceries" would silently stop every rule that
 * filed anything into it.
 */
export async function ayqRenameCategory(
  categoryId: string,
  name: string,
): Promise<{ categories: AyqCategory[]; was: string }> {
  const trimmed = name.trim();
  if (trimmed === '') throw new Error('a category needs a name');

  const before = (await ayqCategories()).find(
    category => category.id === categoryId,
  );
  if (!before) throw new Error('no such category');

  await api.updateCategory(categoryId, { name: trimmed });
  return { categories: await ayqCategories(), was: before.name };
}
