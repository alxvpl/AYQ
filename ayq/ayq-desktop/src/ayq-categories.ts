// Categories, on Actual's own model.
//
// Actual already has categories and category groups, and they are what the
// budget is built out of. AYQ does not keep a second set beside them: it seeds
// a small, practical list into Actual's own groups when it creates a budget,
// and after that reads and writes Actual's categories like any other client.
//
// The list AYQ provisions and the rules for provisioning it live in
// `ayq-taxonomy.ts`; this file is the ordinary reading and writing of Actual's
// categories that every screen goes through.

import api from '@actual-app/api';

import type { AyqCategory } from '../../ayq-client/src/ayq-ipc-contract.ts';

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
