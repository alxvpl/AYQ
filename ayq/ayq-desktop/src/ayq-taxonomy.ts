// The categories AYQ starts a person off with, and how they get there.
//
// Actual seeds Food, General, Bills, Bills (Flexible) and Savings — placeholders
// for a budget it knows nothing about. Against a Dutch current account they
// answer no question: "General" is where a transaction goes to be forgotten.
//
// Version 1 of the taxonomy is the accepted list below. It is short on purpose:
// a taxonomy nobody can hold in their head is a taxonomy nobody files anything
// into, and every name here can be renamed, added to or deleted from the
// interface afterwards.
//
// ## Two paths, and they are not the same act
//
// On a **budget AYQ creates**, the list is provisioned in full and Actual's own
// untouched placeholders are removed, because nothing of the owner's can be
// referencing them yet.
//
// On a **budget that already exists**, provisioning is one-time and strictly
// additive. It creates the names that are missing and stops. It does not move a
// same-name category into the group the taxonomy would have put it in, does not
// delete Food or Savings, does not rename anything, does not merge anything,
// does not reclassify a single transaction and does not touch a rule. Somebody
// has been filing receipts into those categories for years; a tidier layout is
// not worth one of them moving.
//
// The marker is written **after** every create has succeeded, and only then. An
// interrupted run leaves the marker where it was, so the next launch finishes
// the job — and because every create is guarded by name, finishing it twice
// produces nothing the first attempt already made. Once the marker reads 1 the
// list is never provisioned again, which is what stops a category the owner
// deleted last week from reappearing on Monday.

import api from '@actual-app/api';

import {
  AYQ_STARTER_TAXONOMY_VERSION,
  ayqReadStore,
  ayqWriteStore,
} from './ayq-store.ts';

/** One group of the accepted taxonomy, in the order it is written. */
export type AyqStarterGroup = {
  group: string;
  /**
   * Whether these are Actual's income categories rather than expense ones.
   *
   * It matters beyond a label: an income category is excluded from spending
   * totals, from the Plan's expense arithmetic and from the Plan suggestions,
   * and a salary filed as an expense would be a four-figure grocery bill.
   */
  income?: boolean;
  names: string[];
};

/** 11 §11.1, exactly and in order. */
export const AYQ_STARTER_TAXONOMY: readonly AyqStarterGroup[] = [
  { group: 'Income', income: true, names: ['Salary', 'Other income'] },
  {
    group: 'Home & bills',
    names: [
      'Housing',
      'Utilities',
      'Insurance',
      'Phone & Internet',
      'Subscriptions',
    ],
  },
  { group: 'Daily living', names: ['Groceries', 'Eating out', 'Household'] },
  {
    group: 'Transport',
    names: ['Public transport', 'Car & fuel', 'Parking & road tax'],
  },
  { group: 'Personal', names: ['Health & pharmacy', 'Personal care'] },
  {
    group: 'Shopping & leisure',
    names: ['Shopping', 'Entertainment', 'Travel', 'Gifts & donations'],
  },
  { group: 'Finance & government', names: ['Taxes & government', 'Bank fees'] },
  { group: 'Other', names: ['Other'] },
];

/**
 * Actual's own placeholders, removed on a budget AYQ has just created.
 *
 * `Starting Balances` is deliberately absent: it is Actual's technical account
 * for an opening balance, not a category a person files anything into, and
 * removing it would break the one mechanism §4.2 rests on.
 */
const PLACEHOLDER_CATEGORIES = new Set([
  'food',
  'general',
  'bills',
  'bills (flexible)',
  'savings',
  'income',
]);

/** And the groups they came in, once they are empty. */
const PLACEHOLDER_GROUPS = new Set(['usual expenses', 'investments and savings']);

function fold(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * The group the taxonomy's income categories go in.
 *
 * Actual ships one group flagged `is_income` and refuses to make a second:
 * `createCategoryGroup({ is_income: true })` was measured and comes back with
 * the flag off. So AYQ uses the one Actual has rather than creating a group
 * that would look right and behave like an expense group.
 */
async function incomeGroupId(): Promise<string> {
  const groups = await api.getCategoryGroups();
  const built = groups.find(group => group.is_income === true);
  if (built) return built.id;
  // A budget with no income group at all is not something Actual produces, but
  // a created group is better than filing a salary as an expense.
  return api.createCategoryGroup({ name: 'Income' });
}

/**
 * Provisions the accepted taxonomy, additively, and marks it done.
 *
 * `fresh` says whether this is a budget AYQ has just created, which is the only
 * state in which removing Actual's placeholders is safe.
 *
 * Returns what it actually did, so the caller can say so and a test can assert
 * that a second run did nothing.
 */
export async function ayqProvisionTaxonomy(
  dataDir: string,
  options: { fresh: boolean },
): Promise<{ groupsCreated: number; categoriesCreated: number; marked: boolean }> {
  const store = ayqReadStore(dataDir);
  if (store.starterTaxonomyVersion >= AYQ_STARTER_TAXONOMY_VERSION) {
    return { groupsCreated: 0, categoriesCreated: 0, marked: false };
  }

  let groupsCreated = 0;
  let categoriesCreated = 0;

  // Read once per group rather than once: Actual's reads lag its writes, and a
  // map built before the first create would not know about the second.
  for (const wanted of AYQ_STARTER_TAXONOMY) {
    const groups = await api.getCategoryGroups();

    const groupId = wanted.income
      ? await incomeGroupId()
      : (groups.find(group => fold(group.name) === fold(wanted.group))?.id ??
        (await (async () => {
          groupsCreated += 1;
          return api.createCategoryGroup({ name: wanted.group });
        })()));

    // Duplicate prevention is by name and case-blind, across the **whole**
    // budget and not just this group: §11.3 says a same-name category that
    // already exists is reused where it already is, and a second "Groceries" in
    // a different group is exactly what that forbids.
    const existing = await api.getCategories();
    const held = new Set(existing.map(category => fold(category.name)));

    // Created back to front, because Actual puts a new category at the *top* of
    // its group: creating Housing then Utilities leaves Utilities above
    // Housing. Measured on 26.9.0 rather than assumed, and pinned by the test
    // that reads the order back off the budget — so if the engine ever changes
    // its mind, the test says so instead of the order quietly inverting.
    for (const name of [...wanted.names].reverse()) {
      if (held.has(fold(name))) continue;
      await api.createCategory({
        name,
        group_id: groupId,
        is_income: wanted.income === true,
      });
      held.add(fold(name));
      categoriesCreated += 1;
    }
  }

  if (options.fresh) await removePlaceholders();

  // Only now, and only because everything above returned. An interrupted run
  // leaves the marker alone and the next launch repeats the work, which every
  // guard above makes a no-op for whatever already landed.
  const after = ayqReadStore(dataDir);
  after.starterTaxonomyVersion = AYQ_STARTER_TAXONOMY_VERSION;
  ayqWriteStore(dataDir, after);

  return { groupsCreated, categoriesCreated, marked: true };
}

/**
 * Actual's untouched placeholders, on a budget nothing can be referencing yet.
 *
 * Only ever reached from the fresh-budget path. A category that is somehow
 * already carrying transactions is left alone even here: the cost of a stray
 * "General" in the list is nothing beside the cost of a deleted category that
 * had a person's money filed under it.
 */
async function removePlaceholders(): Promise<void> {
  const categories = await api.getCategories();
  const taxonomy = new Set(
    AYQ_STARTER_TAXONOMY.flatMap(group => group.names.map(fold)),
  );

  for (const category of categories) {
    const name = fold(category.name);
    if (!PLACEHOLDER_CATEGORIES.has(name)) continue;
    // A placeholder whose name the taxonomy also wants is not a placeholder any
    // more; it is the category the taxonomy asked for.
    if (taxonomy.has(name)) continue;
    await api.deleteCategory(category.id);
  }

  const groups = await api.getCategoryGroups();
  const remaining = await api.getCategories();
  for (const group of groups) {
    if (group.is_income === true) continue;
    if (!PLACEHOLDER_GROUPS.has(fold(group.name))) continue;
    if (remaining.some(category => category.group_id === group.id)) continue;
    await api.deleteCategoryGroup(group.id);
  }
}
