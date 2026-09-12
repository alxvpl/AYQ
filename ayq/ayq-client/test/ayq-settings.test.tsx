// Settings → Categories and Settings → Rules.
//
// Categories: one surface, because two would mean two answers to "what
// categories are there" (03 §1.2). What matters is that the two consequences a
// person cannot see are stated — renaming moves the rules, because a rule keeps a
// category by name so that it outlives a budget (§4.2), and AYQ does not archive
// or delete a category here, because Canon says nothing about what becomes of the
// transactions filed under one.
//
// Rules: 04 A7 asks for visible, verifiable, correctable and reversible, and each
// of those is a test below. A rule naming a category this budget does not have
// files nothing, and has to say so rather than looking as though it works.
//
// Every category, counterparty and date below is invented.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { AyqCategory, AyqCategoryRule } from '../src/ayq-ipc-contract.ts';
import { AyqSettingsCategories } from '../src/ayq-screens/ayq-settings-categories.tsx';
import { AyqSettingsRules } from '../src/ayq-screens/ayq-settings-rules.tsx';
import { ayqText } from '../src/ayq-strings.ts';
import { AyqGroundProvider } from '../src/ayq-ui/ayq-ground-provider.tsx';
import { ayqOpenWindow, ayqPress, ayqType } from './ayq-react.ts';

const CATEGORIES: AyqCategory[] = [
  { id: 'cat-1', name: 'Groceries', groupId: 'g-home', groupName: 'Home', isIncome: false },
  { id: 'cat-2', name: 'Housing', groupId: 'g-home', groupName: 'Home', isIncome: false },
  { id: 'cat-3', name: 'Salary', groupId: 'g-in', groupName: 'Income', isIncome: true },
];

const RULES: AyqCategoryRule[] = [
  {
    id: 'rule-1',
    counterpartyKey: 'TESTMARKT',
    categoryName: 'Groceries',
    createdAt: '2026-02-01T09:00:00Z',
  },
  {
    id: 'rule-2',
    counterpartyKey: 'TESTFUEL',
    // A category this budget does not have: the rule files nothing.
    categoryName: 'Motoring',
    createdAt: '2026-03-01T09:00:00Z',
  },
];

function engine(over: Record<string, unknown> = {}) {
  return (request: Record<string, unknown>): unknown => {
    if (request.kind === 'categories.list') return over.categories ?? CATEGORIES;
    if (request.kind === 'categories.create') return CATEGORIES;
    if (request.kind === 'categories.rename') return CATEGORIES;
    if (request.kind === 'rules.list') return over.rules ?? RULES;
    if (request.kind === 'rules.remove') return [RULES[0]];
    if (request.kind === 'rules.apply') return { categorised: 14 };
    return undefined;
  };
}

function categoriesScreen(
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

function rulesScreen() {
  return (
    <AyqGroundProvider>
      <AyqSettingsRules
        onFailure={message => {
          throw new Error(message);
        }}
        onChanged={() => {}}
      />
    </AyqGroundProvider>
  );
}

test('the categories are the budget’s own, listed with their groups', async () => {
  const window = await ayqOpenWindow(engine());
  await window.render(categoriesScreen());

  const drawn = [
    ...window.container.querySelectorAll('[data-ayq-table="categories"] tbody tr'),
  ].map(one => one.getAttribute('data-ayq-row'));
  assert.deepEqual(drawn, ['cat-1', 'cat-2', 'cat-3']);

  // The group and whether money comes in or goes out are facts about a category
  // and are stated, because a list of bare names is a list nobody can navigate.
  const rows = [
    ...window.container.querySelectorAll('[data-ayq-table="categories"] tbody tr'),
  ];
  assert.match(rows[0].textContent ?? '', /Home/);
  assert.match(rows[2].textContent ?? '', new RegExp(ayqText('categories.kind.income')));

  await window.close();
});

test('both consequences of this screen are stated on it', async () => {
  const window = await ayqOpenWindow(engine());
  await window.render(categoriesScreen());

  // 03 §4.2: a rule keeps a category by name, so renaming moves the rules.
  assert.match(
    window.container.querySelector('[data-ayq-category-consequence]')?.textContent ??
      '',
    /Renaming a category moves its rules with it/,
  );
  // And what AYQ does not do here, and why. Nothing on the screen offers it.
  assert.match(
    window.container.querySelector('[data-ayq-no-archive]')?.textContent ?? '',
    /does not archive or delete a category here/,
  );
  const said = window.container.textContent ?? '';
  for (const forbidden of ['Archive', 'Delete']) {
    assert.ok(
      !new RegExp(`${forbidden}(?! or delete)`).test(said),
      `the screen offers to ${forbidden.toLowerCase()} a category`,
    );
  }

  await window.close();
});

test('a category is made here, in a group that exists', async () => {
  const window = await ayqOpenWindow(engine());
  await window.render(categoriesScreen());

  // The groups offered are the ones the categories came in, in that order.
  const groups = [
    ...window.container.querySelectorAll('[data-ayq-new-group] option'),
  ].map(one => (one as HTMLOptionElement).value);
  assert.deepEqual(groups, ['g-home', 'g-in']);

  await ayqType(window.container.querySelector('[data-ayq-new-category]'), 'Water');
  await ayqType(window.container.querySelector('[data-ayq-new-group]'), 'g-in');
  await ayqPress(window.container.querySelector('[data-ayq-action="category-add"]'));

  const sent = window.asked.find(one => one.kind === 'categories.create');
  assert.ok(sent, 'nothing was sent');
  assert.equal(sent.name, 'Water');
  assert.equal(sent.groupId, 'g-in');
  assert.match(
    window.container.querySelector('[data-ayq-category-said]')?.textContent ?? '',
    /Water added/,
  );

  await window.close();
});

test('a category with no name is refused before the engine is asked', async () => {
  const refusals: string[] = [];
  const window = await ayqOpenWindow(engine());
  await window.render(categoriesScreen(message => refusals.push(message)));

  await ayqPress(window.container.querySelector('[data-ayq-action="category-add"]'));
  assert.deepEqual(refusals, [ayqText('categories.needsName')]);
  assert.equal(window.asked.filter(one => one.kind === 'categories.create').length, 0);

  await window.close();
});

test('renaming one category renames that one', async () => {
  const window = await ayqOpenWindow(engine());
  await window.render(categoriesScreen());

  await ayqPress(
    window.container.querySelector('[data-ayq-action="category-rename-cat-2"]'),
  );
  const field = window.container.querySelector('[data-ayq-category-name="cat-2"]');
  assert.ok(field, 'the row offers no name to change');
  assert.equal((field as HTMLInputElement).value, 'Housing');

  await ayqType(field, 'Rent and bills');
  await ayqPress(
    window.container.querySelector('[data-ayq-action="category-rename-save"]'),
  );

  const sent = window.asked.find(one => one.kind === 'categories.rename');
  assert.ok(sent);
  assert.equal(sent.categoryId, 'cat-2');
  assert.equal(sent.name, 'Rent and bills');
  assert.match(
    window.container.querySelector('[data-ayq-category-said]')?.textContent ?? '',
    /Housing is now Rent and bills/,
  );

  await window.close();
});

test('every rule is visible, by the counterparty it is keyed on (04 A7)', async () => {
  const window = await ayqOpenWindow(engine());
  await window.render(rulesScreen());

  const drawn = [
    ...window.container.querySelectorAll('[data-ayq-table="rules"] tbody tr'),
  ];
  assert.equal(drawn.length, 2);
  // 03 §4.1: keyed on the canonical counterparty, never on what the bank
  // printed — so that is what the screen shows.
  assert.match(drawn[0].textContent ?? '', /TESTMARKT/);
  assert.match(drawn[0].textContent ?? '', /Groceries/);
  assert.equal(
    window.container.querySelector('[data-ayq-rules]')?.getAttribute('data-ayq-rules'),
    '2',
  );

  await window.close();
});

test('a rule naming a category the budget lacks says it files nothing', async () => {
  const window = await ayqOpenWindow(engine());
  await window.render(rulesScreen());

  const rows = [
    ...window.container.querySelectorAll('[data-ayq-table="rules"] tbody tr'),
  ];
  // Verifiable (A7): the one that cannot work is marked, in the state colour
  // that means something is wrong.
  assert.equal(
    rows[0].querySelector('[data-ayq-cell="category"] [data-ayq-state]'),
    null,
    'a rule that works was marked as broken',
  );
  const broken = rows[1].querySelector('[data-ayq-cell="category"] [data-ayq-state]');
  assert.ok(broken, 'a rule that files nothing looks as though it works');
  assert.equal(broken.getAttribute('data-ayq-state'), 'overdue');
  assert.match(broken.textContent ?? '', /files nothing/);

  await window.close();
});

test('a rule can be taken away, and what it filed stays where it is', async () => {
  const window = await ayqOpenWindow(engine());
  await window.render(rulesScreen());

  await ayqPress(
    window.container.querySelector('[data-ayq-action="rule-forget-rule-2"]'),
  );

  const sent = window.asked.find(one => one.kind === 'rules.remove');
  assert.ok(sent);
  assert.equal(sent.ruleId, 'rule-2');
  // Reversible (A7), and the screen is honest about what removing does not do.
  assert.match(
    window.container.querySelector('[data-ayq-rules-said]')?.textContent ?? '',
    /What it filed stays where it is/,
  );

  await window.close();
});

test('the rules can be asked to act now, and say what that came to', async () => {
  const window = await ayqOpenWindow(engine());
  await window.render(rulesScreen());

  await ayqPress(window.container.querySelector('[data-ayq-action="rules-apply"]'));

  assert.ok(window.asked.some(one => one.kind === 'rules.apply'));
  assert.match(
    window.container.querySelector('[data-ayq-rules-said]')?.textContent ?? '',
    /14 transactions filed/,
  );

  await window.close();
});

test('no rules yet says where one comes from', async () => {
  const window = await ayqOpenWindow(engine({ rules: [] }));
  await window.render(rulesScreen());

  const said =
    window.container.querySelector('[data-ayq-table="rules"][data-ayq-empty]')
      ?.textContent ?? '';
  assert.match(said, /learned no rules yet/);
  assert.match(said, /remember a counterparty/);

  await window.close();
});
