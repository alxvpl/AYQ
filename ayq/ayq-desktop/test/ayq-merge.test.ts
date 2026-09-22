// Merging one counterparty into another, through the real engine (04 A37;
// 03 §3.6).
//
// Two promises. A merge keeps every record: the transactions move to the
// survivor under one explicit identity decision per statement variant, and
// nothing is deleted. And it is reversible only by a further identity
// correction: removing that alias from the survivor puts the transactions
// back under their own key.
//
// The fixture is invented: six visits to Testmarkt, four to Testfuel.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ask, budget, fixture, send } from './ayq-engine-harness.ts';

async function imported() {
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [fixture] });
  const total = (await ask(dataDir, { kind: 'transactions.list' })).total;
  return { dataDir, total };
}

const count = async (dataDir: string, counterpartyKey: string) =>
  (
    await ask(dataDir, {
      kind: 'transactions.list',
      filter: { counterpartyKey },
    })
  ).total;

test('a merge moves every transaction and keeps every record', async () => {
  const { dataDir, total } = await imported();
  assert.equal(await count(dataDir, 'TESTFUEL'), 4);
  assert.equal(await count(dataDir, 'TESTMARKT'), 6);

  const merged = await ask(dataDir, {
    kind: 'counterparty.merge',
    counterpartyKey: 'TESTFUEL',
    intoKey: 'TESTMARKT',
  });
  assert.equal(merged.counterpartyKey, 'TESTMARKT');
  assert.equal(merged.variants, 1, 'one statement variant, one decision');
  assert.equal(merged.moved, 4);

  assert.equal(await count(dataDir, 'TESTMARKT'), 10);
  assert.equal(await count(dataDir, 'TESTFUEL'), 0);
  assert.equal(
    (await ask(dataDir, { kind: 'transactions.list' })).total,
    total,
    'nothing was deleted',
  );

  const survivor = await ask(dataDir, {
    kind: 'counterparty.detail',
    key: 'TESTMARKT',
  });
  const moved = survivor.variants.find(one => one.key === 'TESTFUEL');
  assert.ok(moved, 'the merged variant is kept as evidence under the survivor');
  assert.equal(moved.aliased, true);
  assert.ok(moved.aliasId, 'and names the decision that put it there');
  assert.equal(moved.transactions, 4);
});

test('a merge is undone by removing the identity decision, and by nothing less', async () => {
  const { dataDir } = await imported();
  await ask(dataDir, {
    kind: 'counterparty.merge',
    counterpartyKey: 'TESTFUEL',
    intoKey: 'TESTMARKT',
  });
  const survivor = await ask(dataDir, {
    kind: 'counterparty.detail',
    key: 'TESTMARKT',
  });
  const moved = survivor.variants.find(one => one.key === 'TESTFUEL');
  assert.ok(moved?.aliasId);

  // Renaming the survivor, or looking at it, changes nothing about identity.
  await ask(dataDir, {
    kind: 'counterparty.setName',
    counterpartyKey: 'TESTMARKT',
    displayName: 'The shop',
  });
  assert.equal(await count(dataDir, 'TESTMARKT'), 10);

  const undone = await ask(dataDir, {
    kind: 'alias.remove',
    aliasId: moved.aliasId,
  });
  assert.equal(undone.moved, 4);
  assert.equal(await count(dataDir, 'TESTFUEL'), 4);
  assert.equal(await count(dataDir, 'TESTMARKT'), 6);
});

test('a merge carries a rule to a survivor that has none, and says so', async () => {
  const { dataDir } = await imported();
  const categories = await ask(dataDir, { kind: 'categories.list' });
  const shopping = categories.find(one => one.name === 'Shopping');
  assert.ok(shopping);
  await ask(dataDir, {
    kind: 'transaction.categoriseCounterparty',
    counterpartyKey: 'TESTFUEL',
    categoryId: shopping.id,
    createRule: true,
  });

  const merged = await ask(dataDir, {
    kind: 'counterparty.merge',
    counterpartyKey: 'TESTFUEL',
    intoKey: 'TESTMARKT',
  });
  assert.deepEqual([merged.rulesMoved, merged.rulesRemoved], [1, 0]);
  const rules = await ask(dataDir, { kind: 'rules.list' });
  assert.deepEqual(
    rules.map(rule => [rule.counterpartyKey, rule.categoryName]),
    [['TESTMARKT', 'Shopping']],
  );
  const survivor = await ask(dataDir, {
    kind: 'counterparty.detail',
    key: 'TESTMARKT',
  });
  assert.equal(
    survivor.rules.length,
    1,
    'the page shows the rule that mentions it',
  );
});

test('a merge into nothing, or into itself, is refused', async () => {
  const { dataDir } = await imported();
  const nowhere = await send(
    {
      id: 'merge-nowhere',
      kind: 'counterparty.merge',
      counterpartyKey: 'TESTFUEL',
      intoKey: 'NOBODY',
    },
    dataDir,
  );
  assert.equal(nowhere.ok, false);
  const itself = await send(
    {
      id: 'merge-itself',
      kind: 'counterparty.merge',
      counterpartyKey: 'TESTFUEL',
      intoKey: 'TESTFUEL',
    },
    dataDir,
  );
  assert.equal(itself.ok, false);
  assert.equal(await count(dataDir, 'TESTFUEL'), 4, 'and nothing moved');
});
