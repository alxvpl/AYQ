// Settings → Categories: Move and Remove (04 A35, A31; 03 §4.5, §7.23).
//
// What is being checked: moving a category asks the engine for that move and
// nothing else; removing one asks for the impact first and shows it; a
// category in use cannot be removed until a destination is chosen, and the
// consequence of the chosen destination is stated before the button; an unused
// one goes with one confirmed press; and the table keeps the order the engine
// gave it, since that order carries meaning (A31).
//
// Every category and count below is invented.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type {
  AyqCategory,
  AyqCategoryImpact,
} from '../src/ayq-ipc-contract.ts';
import { AyqSettingsCategories } from '../src/ayq-screens/ayq-settings-categories.tsx';
import { AyqGroundProvider } from '../src/ayq-ui/ayq-ground-provider.tsx';

import { ayqOpenWindow, ayqPress, ayqType } from './ayq-react.ts';
import type { AyqWindow } from './ayq-react.ts';

const CATEGORIES: AyqCategory[] = [
  {
    id: 'cat-1',
    name: 'Groceries',
    groupId: 'g-home',
    groupName: 'Home',
    isIncome: false,
  },
  {
    id: 'cat-2',
    name: 'Housing',
    groupId: 'g-home',
    groupName: 'Home',
    isIncome: false,
  },
  {
    id: 'cat-4',
    name: 'Fuel',
    groupId: 'g-out',
    groupName: 'Out and about',
    isIncome: false,
  },
  {
    id: 'cat-3',
    name: 'Salary',
    groupId: 'g-in',
    groupName: 'Income',
    isIncome: true,
  },
];

const IN_USE: AyqCategoryImpact = {
  categoryId: 'cat-2',
  name: 'Housing',
  isIncome: false,
  transactions: 12,
  rules: 1,
  planned: 2,
  plannedMonths: 3,
  unused: false,
};

const UNUSED: AyqCategoryImpact = {
  categoryId: 'cat-4',
  name: 'Fuel',
  isIncome: false,
  transactions: 0,
  rules: 0,
  planned: 0,
  plannedMonths: 0,
  unused: true,
};

function engine() {
  return (request: Record<string, unknown>): unknown => {
    switch (request.kind) {
      case 'categories.list':
        return CATEGORIES;
      case 'categories.move':
        return CATEGORIES.map(one =>
          one.id === request.categoryId
            ? {
                ...one,
                groupId: request.groupId as string,
                groupName: 'Out and about',
              }
            : one,
        );
      case 'categories.impact':
        return request.categoryId === 'cat-4' ? UNUSED : IN_USE;
      case 'categories.remove': {
        const destination = request.destination as
          | { kind: 'category'; categoryId: string }
          | { kind: 'uncategorised' }
          | undefined;
        return {
          categories: CATEGORIES.filter(one => one.id !== request.categoryId),
          removed: request.categoryId === 'cat-4' ? 'Fuel' : 'Housing',
          movedTo: destination?.kind === 'category' ? 'Groceries' : null,
          transactions: request.categoryId === 'cat-4' ? 0 : 12,
          rulesMoved: destination?.kind === 'category' ? 1 : 0,
          rulesRemoved: destination?.kind === 'uncategorised' ? 1 : 0,
          planned: request.categoryId === 'cat-4' ? 0 : 2,
        };
      }
      default:
        return undefined;
    }
  };
}

function screen(
  onFailure: (message: string) => void = message => {
    throw new Error(message);
  },
) {
  return (
    <AyqGroundProvider>
      <AyqSettingsCategories onFailure={onFailure} onChanged={() => {}} />
    </AyqGroundProvider>
  );
}

const find = (window: AyqWindow, selector: string): Element | null =>
  window.container.querySelector(selector);

test("the table keeps the engine's order, and every row offers Rename, Move and Remove", async () => {
  const window = await ayqOpenWindow(engine());
  await window.render(screen());
  const names = [
    ...window.container.querySelectorAll('[data-ayq-category]'),
  ].map(one => one.textContent);
  assert.deepEqual(
    names,
    ['Groceries', 'Housing', 'Fuel', 'Salary'],
    'not sorted (A31)',
  );
  for (const action of ['rename', 'move', 'remove']) {
    assert.ok(
      find(window, `[data-ayq-action="category-${action}-cat-2"]`),
      `no ${action}`,
    );
  }
  await window.close();
});

test('moving a category sends that move, and only that', async () => {
  const window = await ayqOpenWindow(engine());
  await window.render(screen());
  await ayqPress(find(window, '[data-ayq-action="category-move-cat-2"]'));
  const picker = find(window, '[data-ayq-move-group="cat-2"]');
  assert.ok(picker, 'moving offers no group to move to');
  await ayqType(picker, 'g-out');
  const sent = window.asked.filter(one => one.kind === 'categories.move');
  assert.deepEqual(
    sent.map(one => [one.categoryId, one.groupId]),
    [['cat-2', 'g-out']],
  );
  assert.ok(
    !window.asked.some(
      one =>
        one.kind === 'categories.rename' || one.kind === 'categories.remove',
    ),
  );
  assert.match(
    find(window, '[data-ayq-category-said]')?.textContent ?? '',
    /Housing is now in Out and about/,
  );
  await window.close();
});

test('removing asks what still uses the category, and shows it before anything else', async () => {
  const window = await ayqOpenWindow(engine());
  await window.render(screen());
  await ayqPress(find(window, '[data-ayq-action="category-remove-cat-2"]'));

  assert.deepEqual(
    window.asked
      .filter(one => one.kind === 'categories.impact')
      .map(one => one.categoryId),
    ['cat-2'],
    'the impact was asked of the engine, for this category',
  );
  const impact = find(window, '[data-ayq-remove-impact]');
  assert.ok(impact, 'what uses the category is not shown');
  assert.match(impact.textContent ?? '', /12 transactions/);
  assert.match(impact.textContent ?? '', /1 learned rules/);
  assert.match(impact.textContent ?? '', /2 planned or recurring records/);
  assert.match(impact.textContent ?? '', /3 months with a plan amount/);

  const confirm = find(
    window,
    '[data-ayq-action="category-remove-confirm"]',
  ) as HTMLButtonElement;
  assert.equal(
    confirm.disabled,
    true,
    'in use and no destination: not removable',
  );
  assert.equal(
    window.asked.filter(one => one.kind === 'categories.remove').length,
    0,
  );
  await window.close();
});

test('a destination is offered only among the same kind, its consequence is said, and the removal names it', async () => {
  const window = await ayqOpenWindow(engine());
  await window.render(screen());
  await ayqPress(find(window, '[data-ayq-action="category-remove-cat-2"]'));

  const picker = find(
    window,
    '[data-ayq-remove-destination]',
  ) as HTMLSelectElement;
  const offered = [...picker.options].map(one => one.value);
  assert.deepEqual(
    offered,
    ['', 'uncategorised', 'cat-1', 'cat-4'],
    'itself and Salary are not offered',
  );

  await ayqType(picker, 'cat-1');
  assert.match(
    find(window, '[data-ayq-remove-consequence]')?.textContent ?? '',
    /move to Groceries; the rules follow it by name/,
  );
  await ayqPress(find(window, '[data-ayq-action="category-remove-confirm"]'));
  const sent = window.asked.filter(one => one.kind === 'categories.remove');
  assert.deepEqual(
    sent.map(one => [one.categoryId, one.destination]),
    [['cat-2', { kind: 'category', categoryId: 'cat-1' }]],
  );
  assert.match(
    find(window, '[data-ayq-category-said]')?.textContent ?? '',
    /Housing removed; 12 transactions and 2 planned records moved to Groceries, 1 rules with them/,
  );
  assert.equal(
    find(window, '[data-ayq-category-remove]'),
    null,
    'the panel closed',
  );
  await window.close();
});

test('Uncategorised is an explicit destination, and says the rules will go', async () => {
  const window = await ayqOpenWindow(engine());
  await window.render(screen());
  await ayqPress(find(window, '[data-ayq-action="category-remove-cat-2"]'));
  await ayqType(find(window, '[data-ayq-remove-destination]'), 'uncategorised');
  assert.match(
    find(window, '[data-ayq-remove-consequence]')?.textContent ?? '',
    /The 1 learned rules are removed/,
  );
  await ayqPress(find(window, '[data-ayq-action="category-remove-confirm"]'));
  const sent = window.asked.filter(one => one.kind === 'categories.remove');
  assert.deepEqual(sent[0].destination, { kind: 'uncategorised' });
  assert.match(
    find(window, '[data-ayq-category-said]')?.textContent ?? '',
    /are now Uncategorised, and 1 rules were removed/,
  );
  await window.close();
});

test('an unused category is removed with one confirmed press and no destination', async () => {
  const window = await ayqOpenWindow(engine());
  await window.render(screen());
  await ayqPress(find(window, '[data-ayq-action="category-remove-cat-4"]'));
  assert.ok(
    find(window, '[data-ayq-remove-unused]'),
    'it does not say nothing uses it',
  );
  assert.equal(
    find(window, '[data-ayq-remove-destination]'),
    null,
    'no destination is asked for',
  );
  const confirm = find(
    window,
    '[data-ayq-action="category-remove-confirm"]',
  ) as HTMLButtonElement;
  assert.equal(confirm.disabled, false);
  await ayqPress(confirm);
  const sent = window.asked.filter(one => one.kind === 'categories.remove');
  assert.deepEqual(
    sent.map(one => [one.categoryId, one.destination]),
    [['cat-4', undefined]],
  );
  assert.match(
    find(window, '[data-ayq-category-said]')?.textContent ?? '',
    /Fuel removed\./,
  );
  await window.close();
});
