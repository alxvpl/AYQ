// A learned rule is correctable where it is seen, through the real engine
// (04 A7; 03 §4.4).
//
// Three promises. The impact of a rule is counted now: what it filed and what
// it may not touch. Correcting it re-files what it filed and never what a
// person filed by hand — a manual correction outranks the rule, before and
// after. Removing it stops it for later imports and re-files nothing.
//
// The fixture is invented: six visits to Testmarkt.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ask, budget, fixture } from './ayq-engine-harness.ts';

async function withRule() {
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [fixture] });
  const categories = await ask(dataDir, { kind: 'categories.list' });
  const by = (name: string) => {
    const found = categories.find(one => one.name === name);
    assert.ok(found, `the starter taxonomy has ${name}`);
    return found;
  };
  const shopping = by('Shopping');
  const groceries = by('Groceries');
  await ask(dataDir, {
    kind: 'transaction.categoriseCounterparty',
    counterpartyKey: 'TESTMARKT',
    categoryId: shopping.id,
    createRule: true,
  });
  const rules = await ask(dataDir, { kind: 'rules.list' });
  assert.equal(rules.length, 1);
  return { dataDir, shopping, groceries, rule: rules[0] };
}

async function testmarkt(dataDir: string) {
  return (
    await ask(dataDir, {
      kind: 'transactions.list',
      filter: { counterpartyKey: 'TESTMARKT' },
    })
  ).rows;
}

test('the impact says what a rule filed, and leaves out what was filed by hand', async () => {
  const { dataDir, rule, groceries } = await withRule();
  const before = await ask(dataDir, { kind: 'rules.impact', ruleId: rule.id });
  assert.equal(before.filed, 6, 'the rule filed every visit');
  assert.equal(before.byHand, 0);
  assert.equal(before.categoryExists, true);

  // One visit filed by hand: the rule no longer speaks for it.
  const [one] = await testmarkt(dataDir);
  await ask(dataDir, {
    kind: 'transaction.categorise',
    transactionId: one.id,
    categoryId: groceries.id,
  });
  const after = await ask(dataDir, { kind: 'rules.impact', ruleId: rule.id });
  assert.equal(after.filed, 5);
  assert.equal(after.byHand, 1);
});

test('correcting a rule re-files what it filed, and never what a person filed', async () => {
  const { dataDir, rule, shopping, groceries } = await withRule();
  const [byHand] = await testmarkt(dataDir);
  // Filed by hand into the very category the rule will be corrected away
  // from: the rule still may not touch it.
  await ask(dataDir, {
    kind: 'transaction.categorise',
    transactionId: byHand.id,
    categoryId: shopping.id,
  });

  const corrected = await ask(dataDir, {
    kind: 'rules.correct',
    ruleId: rule.id,
    categoryId: groceries.id,
  });
  assert.equal(corrected.rule.id, rule.id, 'the same rule, corrected');
  assert.equal(corrected.rule.categoryName, 'Groceries');
  assert.equal(corrected.filed, 5);
  assert.equal(corrected.byHand, 1);
  assert.deepEqual(
    corrected.rules.map(one => [one.counterpartyKey, one.categoryName]),
    [['TESTMARKT', 'Groceries']],
  );

  const rows = await testmarkt(dataDir);
  const manual = rows.find(row => row.id === byHand.id);
  assert.equal(
    manual?.categoryId,
    shopping.id,
    'the manual decision outranks the corrected rule',
  );
  assert.equal(
    rows.filter(row => row.categoryId === groceries.id).length,
    5,
    'the five the rule filed followed it',
  );
});

test('removing a rule stops it, and re-files nothing', async () => {
  const { dataDir, rule, shopping } = await withRule();
  const remaining = await ask(dataDir, {
    kind: 'rules.remove',
    ruleId: rule.id,
  });
  assert.deepEqual(remaining, []);
  const rows = await testmarkt(dataDir);
  assert.equal(rows.length, 6);
  assert.ok(
    rows.every(row => row.categoryId === shopping.id),
    'what the rule filed stays where it is (04 A7)',
  );
  // And a later application of the rules has nothing to say about it.
  const applied = await ask(dataDir, { kind: 'rules.apply' });
  assert.equal(applied.categorised, 0);
});
