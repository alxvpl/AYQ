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

import type {
  AyqCategory,
  AyqCategoryDestination,
  AyqCategoryImpact,
  AyqCategoryRemoved,
} from '../../ayq-client/src/ayq-ipc-contract.ts';

import { ayqReadStore, ayqWriteStore } from './ayq-store.ts';
import { AyqEngineError } from './ayq-error.ts';

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
  if (trimmed === '') throw new AyqEngineError('category-needs-name', 'a category needs a name');

  const groups = await api.getCategoryGroups();
  if (!groups.some(group => group.id === groupId)) {
    throw new AyqEngineError('category-group-not-found', 'no such category group');
  }

  const existing = await ayqCategories();
  if (
    existing.some(
      category =>
        category.groupId === groupId &&
        category.name.toLowerCase() === trimmed.toLowerCase(),
    )
  ) {
    throw new AyqEngineError('category-exists', `that group already has a category called ${trimmed}`, { name: trimmed });
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
  if (trimmed === '') throw new AyqEngineError('category-needs-name', 'a category needs a name');

  const before = (await ayqCategories()).find(
    category => category.id === categoryId,
  );
  if (!before) throw new AyqEngineError('category-not-found', 'no such category');

  await api.updateCategory(categoryId, { name: trimmed });
  return { categories: await ayqCategories(), was: before.name };
}

/**
 * Moves a category to another group (04 A35).
 *
 * Only to a group of the same kind: Actual keeps income and expense apart, and
 * a category that changed sides would change what every total says about the
 * transactions in it. The accepted category order is Actual's own and is not
 * touched by this.
 */
export async function ayqMoveCategory(
  categoryId: string,
  groupId: string,
): Promise<AyqCategory[]> {
  const category = (await ayqCategories()).find(one => one.id === categoryId);
  if (!category) throw new AyqEngineError('category-not-found', 'no such category');
  const group = (await api.getCategoryGroups()).find(one => one.id === groupId);
  if (!group) throw new AyqEngineError('category-group-not-found', 'no such category group');
  if ((group.is_income === true) !== category.isIncome) {
    throw new AyqEngineError(
      'category-wrong-kind',
      'a category moves only within its own kind: money in stays with money ' +
        'in, money out with money out',
    );
  }
  if (category.groupId !== groupId) {
    // The name travels with the update: Actual's handler reads it whatever
    // else changes, and an update without it fails before it reaches the group.
    await api.updateCategory(categoryId, {
      name: category.name,
      group_id: groupId,
    });
  }
  return ayqCategories();
}

/**
 * What still uses a category, counted now (04 A35).
 *
 * Read from the budget and the store at the moment of asking, never
 * remembered: the screen states these numbers before offering to remove
 * anything, and a number that was true a minute ago is not a statement about
 * what the removal will do.
 */
export async function ayqCategoryImpact(
  dataDir: string,
  categoryId: string,
): Promise<AyqCategoryImpact> {
  const category = (await ayqCategories()).find(one => one.id === categoryId);
  if (!category) throw new AyqEngineError('category-not-found', 'no such category');

  const counted = (await api.aqlQuery(
    api
      .q('transactions')
      .filter({ category: categoryId, starting_balance_flag: false })
      .calculate({ $count: 'id' }),
  )) as { data?: number };

  const store = ayqReadStore(dataDir);
  const name = category.name.toLowerCase();
  const rules = store.rules.filter(
    rule => rule.categoryName.toLowerCase() === name,
  ).length;
  const planned = store.planned.filter(
    record => (record.categoryName ?? '').toLowerCase() === name,
  ).length;

  let plannedMonths = 0;
  for (const month of (await api.getBudgetMonths()) as unknown as string[]) {
    const answer = (await api.getBudgetMonth(month)) as unknown as {
      categoryGroups?: Array<{
        categories?: Array<{ id: string; budgeted?: number }>;
      }>;
    };
    for (const group of answer.categoryGroups ?? []) {
      for (const one of group.categories ?? []) {
        if (one.id === categoryId && Number(one.budgeted ?? 0) !== 0) {
          plannedMonths += 1;
        }
      }
    }
  }

  const transactions = Number(counted.data ?? 0);
  return {
    categoryId,
    name: category.name,
    isIncome: category.isIncome,
    transactions,
    rules,
    planned,
    plannedMonths,
    unused: transactions === 0 && rules === 0 && planned === 0 && plannedMonths === 0,
  };
}

/**
 * Removes a category, and nothing else in silence (04 A35, 03 §4.5, §7.23).
 *
 * A category still in use needs a stated destination, or the engine refuses.
 * Into another category of the same kind: Actual moves the transactions and
 * the plan amounts, and the store moves the rules and the planned records by
 * name. Into `Uncategorised`: the transactions and the planned records
 * survive without a category, which is a valid state, and the rules — which
 * cannot file into nothing — are removed, as the impact said they would be.
 * The decisions history is left as it was: it records what was decided when.
 */
export async function ayqRemoveCategory(
  dataDir: string,
  categoryId: string,
  destination?: AyqCategoryDestination,
): Promise<AyqCategoryRemoved> {
  const impact = await ayqCategoryImpact(dataDir, categoryId);
  if (!impact.unused && destination === undefined) {
    throw new AyqEngineError(
      'category-in-use',
      `${impact.name} is still in use; say where what used it should go before it is removed`,
      { name: impact.name },
    );
  }

  let target: AyqCategory | null = null;
  if (destination?.kind === 'category') {
    target =
      (await ayqCategories()).find(one => one.id === destination.categoryId) ??
      null;
    if (!target) throw new AyqEngineError('category-not-found', 'no such destination category');
    if (target.id === categoryId) {
      throw new AyqEngineError('category-own-destination', 'a category cannot be its own destination');
    }
    if (target.isIncome !== impact.isIncome) {
      throw new AyqEngineError(
        'category-wrong-kind',
        'what used a category moves only within its own kind: money in to ' +
          'money in, money out to money out',
      );
    }
  }

  // The store first, by name, so that a rule never points at a category that
  // has just ceased to exist even for a moment.
  const store = ayqReadStore(dataDir);
  const name = impact.name.toLowerCase();
  let rulesMoved = 0;
  let rulesRemoved = 0;
  if (target) {
    const hasTargetRule = new Set(
      store.rules
        .filter(rule => rule.categoryName.toLowerCase() === target!.name.toLowerCase())
        .map(rule => rule.counterpartyKey),
    );
    store.rules = store.rules.flatMap(rule => {
      if (rule.categoryName.toLowerCase() !== name) return [rule];
      // One rule per counterparty: where the destination already has one for
      // this counterparty, the destination's stands and this one goes.
      if (hasTargetRule.has(rule.counterpartyKey)) {
        rulesRemoved += 1;
        return [];
      }
      rulesMoved += 1;
      return [{ ...rule, categoryName: target!.name }];
    });
  } else {
    rulesRemoved = store.rules.filter(
      rule => rule.categoryName.toLowerCase() === name,
    ).length;
    store.rules = store.rules.filter(
      rule => rule.categoryName.toLowerCase() !== name,
    );
  }
  let planned = 0;
  for (const record of store.planned) {
    if ((record.categoryName ?? '').toLowerCase() === name) {
      record.categoryName = target ? target.name : null;
      planned += 1;
    }
  }
  ayqWriteStore(dataDir, store);

  // Then the budget: Actual forwards the transactions and moves the plan
  // amounts to the destination, or leaves the transactions uncategorised.
  await api.deleteCategory(categoryId, target?.id);

  return {
    categories: await ayqCategories(),
    removed: impact.name,
    movedTo: target?.name ?? null,
    transactions: impact.transactions,
    rulesMoved,
    rulesRemoved,
    planned,
  };
}
