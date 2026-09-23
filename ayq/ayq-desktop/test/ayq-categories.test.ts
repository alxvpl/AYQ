// Settings → Categories, driven through the real engine (04 A35, A31; 03 §4.2,
// §4.5, §7.23).
//
// Three promises. A category moves only within its own kind, and moving it
// changes nothing but its group. Removal says first what still uses the
// category — transactions, rules, planned records, months with a plan amount —
// and refuses to proceed while something does unless told where it should go.
// And when it does proceed, nothing is destroyed or reclassified in silence:
// into another category everything moves and the rules follow by name; into
// Uncategorised the records survive without a category, and the rules go
// because a rule cannot file into nothing — which the impact said.
//
// The fixture is invented: six visits to Testmarkt, four to Testfuel.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ask, budget, fixture, send } from './ayq-engine-harness.ts';

async function opened() {
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [fixture] });
  const categories = await ask(dataDir, { kind: 'categories.list' });
  const by = (name: string) => {
    const found = categories.find(one => one.name === name);
    assert.ok(found, `the starter taxonomy has ${name}`);
    return found;
  };
  return {
    dataDir,
    categories,
    groceries: by('Groceries'),
    shopping: by('Shopping'),
    salary: by('Salary'),
  };
}

test('a category moves to another group of its kind, and only its group changes', async () => {
  const { dataDir, categories, groceries } = await opened();
  const other = categories.find(
    one => !one.isIncome && one.groupId !== groceries.groupId,
  );
  assert.ok(other, 'a second expense group exists to move into');

  const moved = await ask(dataDir, {
    kind: 'categories.move',
    categoryId: groceries.id,
    groupId: other.groupId,
  });
  const after = moved.find(one => one.id === groceries.id);
  assert.equal(after?.groupId, other.groupId);
  assert.equal(after?.groupName, other.groupName);
  assert.equal(after?.name, 'Groceries', 'the name did not change');
  assert.equal(moved.length, categories.length, 'nothing was made or lost');

  const income = categories.find(one => one.isIncome);
  assert.ok(income);
  const refused = await send(
    {
      id: 'move-across-kinds',
      kind: 'categories.move',
      categoryId: groceries.id,
      groupId: income.groupId,
    },
    dataDir,
  );
  assert.equal(refused.ok, false, 'money out does not move in with money in');
});

test('the impact says what still uses a category, counted now', async () => {
  const { dataDir, groceries, shopping } = await opened();
  const before = await ask(dataDir, {
    kind: 'categories.impact',
    categoryId: shopping.id,
  });
  assert.deepEqual(
    [
      before.transactions,
      before.rules,
      before.planned,
      before.plannedMonths,
      before.unused,
    ],
    [0, 0, 0, 0, true],
    'an untouched starter category is unused',
  );

  // Put it to use in every way the impact counts.
  await ask(dataDir, {
    kind: 'transaction.categoriseCounterparty',
    counterpartyKey: 'TESTMARKT',
    categoryId: shopping.id,
    createRule: true,
  });
  await ask(dataDir, {
    kind: 'plan.save',
    today: '2026-06-15',
    record: {
      name: 'Club fee',
      kind: 'expense',
      amountCents: 9_600,
      categoryName: 'Shopping',
      startDate: '2026-07-01',
      recurrence: { frequency: 'yearly', interval: 1 },
    },
  });
  await ask(dataDir, {
    kind: 'budget.setPlan',
    month: '2026-06',
    categoryId: shopping.id,
    cents: 15_000,
  });

  const impact = await ask(dataDir, {
    kind: 'categories.impact',
    categoryId: shopping.id,
  });
  assert.equal(
    impact.transactions,
    6,
    'six visits were filed into it by the rule',
  );
  assert.equal(impact.rules, 1);
  assert.equal(impact.planned, 1);
  assert.equal(impact.plannedMonths, 1);
  assert.equal(impact.unused, false);
  assert.equal(
    (
      await ask(dataDir, {
        kind: 'categories.impact',
        categoryId: groceries.id,
      })
    ).unused,
    true,
    'and the neighbour is untouched',
  );
});

test('a category in use is not removed without a destination', async () => {
  const { dataDir, shopping } = await opened();
  await ask(dataDir, {
    kind: 'transaction.categoriseCounterparty',
    counterpartyKey: 'TESTMARKT',
    categoryId: shopping.id,
    createRule: false,
  });
  const refused = await send(
    { id: 'remove-in-use', kind: 'categories.remove', categoryId: shopping.id },
    dataDir,
  );
  assert.equal(refused.ok, false);
  assert.match(refused.ok ? '' : refused.message, /still in use/);
  assert.ok(
    (await ask(dataDir, { kind: 'categories.list' })).some(
      one => one.id === shopping.id,
    ),
    'and it is still there',
  );
});

test('an unused category is removed by one confirmed action', async () => {
  const { dataDir, shopping, categories } = await opened();
  const removed = await ask(dataDir, {
    kind: 'categories.remove',
    categoryId: shopping.id,
  });
  assert.equal(removed.removed, 'Shopping');
  assert.equal(removed.movedTo, null);
  assert.equal(removed.categories.length, categories.length - 1);
  assert.ok(!removed.categories.some(one => one.id === shopping.id));
});

test('removing into another category moves everything that used it, by name where the store keeps names', async () => {
  const { dataDir, groceries, shopping } = await opened();
  await ask(dataDir, {
    kind: 'transaction.categoriseCounterparty',
    counterpartyKey: 'TESTMARKT',
    categoryId: shopping.id,
    createRule: true,
  });
  await ask(dataDir, {
    kind: 'plan.save',
    today: '2026-06-15',
    record: {
      name: 'Club fee',
      kind: 'expense',
      amountCents: 9_600,
      categoryName: 'Shopping',
      startDate: '2026-07-01',
      recurrence: { frequency: 'yearly', interval: 1 },
    },
  });
  await ask(dataDir, {
    kind: 'budget.setPlan',
    month: '2026-06',
    categoryId: shopping.id,
    cents: 15_000,
  });

  const removed = await ask(dataDir, {
    kind: 'categories.remove',
    categoryId: shopping.id,
    destination: { kind: 'category', categoryId: groceries.id },
  });
  assert.equal(removed.movedTo, 'Groceries');
  assert.deepEqual(
    [
      removed.transactions,
      removed.rulesMoved,
      removed.rulesRemoved,
      removed.planned,
    ],
    [6, 1, 0, 1],
  );

  const ledger = await ask(dataDir, {
    kind: 'transactions.list',
    filter: { counterpartyKey: 'TESTMARKT' },
  });
  assert.ok(
    ledger.rows.every(row => row.categoryId === groceries.id),
    'every visit now reads Groceries — none was lost or unfiled',
  );
  const rules = await ask(dataDir, { kind: 'rules.list' });
  assert.deepEqual(
    rules.map(rule => [rule.counterpartyKey, rule.categoryName]),
    [['TESTMARKT', 'Groceries']],
    'the rule followed by name (03 §4.2)',
  );
  const planned = await ask(dataDir, {
    kind: 'plan.list',
    today: '2026-06-15',
  });
  assert.equal(
    planned.records.find(one => one.name === 'Club fee')?.categoryName,
    'Groceries',
  );
  const month = await ask(dataDir, { kind: 'budget.month', month: '2026-06' });
  assert.equal(
    month.categories.find(one => one.categoryId === groceries.id)?.planCents,
    15_000,
    'the plan amount moved with it',
  );
});

test('removing into Uncategorised keeps the records and drops the rules, as said', async () => {
  const { dataDir, shopping } = await opened();
  await ask(dataDir, {
    kind: 'transaction.categoriseCounterparty',
    counterpartyKey: 'TESTMARKT',
    categoryId: shopping.id,
    createRule: true,
  });
  await ask(dataDir, {
    kind: 'plan.save',
    today: '2026-06-15',
    record: {
      name: 'Club fee',
      kind: 'expense',
      amountCents: 9_600,
      categoryName: 'Shopping',
      startDate: '2026-07-01',
      recurrence: { frequency: 'yearly', interval: 1 },
    },
  });

  const removed = await ask(dataDir, {
    kind: 'categories.remove',
    categoryId: shopping.id,
    destination: { kind: 'uncategorised' },
  });
  assert.equal(removed.movedTo, null);
  assert.deepEqual(
    [removed.rulesMoved, removed.rulesRemoved, removed.planned],
    [0, 1, 1],
  );

  const ledger = await ask(dataDir, {
    kind: 'transactions.list',
    filter: { counterpartyKey: 'TESTMARKT' },
  });
  assert.equal(ledger.total, 6, 'every transaction survives');
  assert.ok(
    ledger.rows.every(row => row.categoryId === null),
    'uncategorised, a valid state (03 §4.5)',
  );
  assert.deepEqual(await ask(dataDir, { kind: 'rules.list' }), []);
  const planned = await ask(dataDir, {
    kind: 'plan.list',
    today: '2026-06-15',
  });
  const record = planned.records.find(one => one.name === 'Club fee');
  assert.ok(record, 'the planned record survives');
  assert.equal(
    record.categoryName,
    null,
    'explicitly Uncategorised (03 §7.23)',
  );
});
