// Bulk corrections, driven through the real engine (03 §4.7–§4.9, 04 A36).
//
// What is being checked is the two promises T3 makes. That the scope a person
// is shown is the scope that changes: the count the engine states before a
// correction is the count it changes when the correction is made, for a picked
// selection and for the whole of a filter alike, with the page limit playing
// no part. And that nothing learns: no rule is written by any of it, a row
// filed by hand is kept rather than overwritten, and a counterparty correction
// reaches every transaction under the bank names it is about — and says so
// first.
//
// The fixture is invented: six visits to Testmarkt, four to Testfuel, two
// coffees, one energy bill and one salary.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ask, budget, fixture, send } from './ayq-engine-harness.ts';

async function opened(): Promise<{
  dataDir: string;
  groceries: { id: string; name: string };
  shopping: { id: string; name: string };
}> {
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [fixture] });
  const categories = await ask(dataDir, { kind: 'categories.list' });
  const groceries = categories.find(one => one.name === 'Groceries');
  const shopping = categories.find(one => one.name === 'Shopping');
  assert.ok(groceries && shopping, 'the starter taxonomy was provisioned');
  return { dataDir, groceries, shopping };
}

test('the scope report counts the selection, and how far its bank names reach', async () => {
  const { dataDir } = await opened();
  const ledger = await ask(dataDir, { kind: 'transactions.list' });
  const shop = ledger.rows.filter(row => row.payee === 'Testmarkt');
  const fuel = ledger.rows.filter(row => row.payee === 'Testfuel');
  assert.equal(shop.length, 6);
  assert.equal(fuel.length, 4);

  const report = await ask(dataDir, {
    kind: 'transactions.scope',
    scope: {
      kind: 'selected',
      transactionIds: [shop[0].id, shop[1].id, shop[2].id, fuel[0].id],
    },
  });
  assert.equal(report.transactions, 4, 'the scope is the four rows picked');
  assert.equal(report.byHand, 0, 'none of them has been decided by hand');
  assert.deepEqual(
    report.variants.map(one => `${one.variantKey} ${one.transactions}`).sort(),
    ['TESTFUEL 4', 'TESTMARKT 6'],
    'each bank name behind the selection, with everything it carries',
  );
  assert.equal(
    report.variantTransactions,
    10,
    'a counterparty correction would reach ten',
  );
});

test('a selection is filed by hand, row by row, and no rule is written', async () => {
  const { dataDir, groceries } = await opened();
  const before = await ask(dataDir, { kind: 'transactions.list' });
  const shop = before.rows.filter(row => row.payee === 'Testmarkt');
  const picked = shop.slice(0, 3).map(row => row.id);

  const filed = await ask(dataDir, {
    kind: 'transactions.categoriseMany',
    scope: { kind: 'selected', transactionIds: picked },
    categoryId: groceries.id,
  });
  assert.deepEqual(filed, { scoped: 3, categorised: 3, keptByHand: 0 });

  const after = await ask(dataDir, {
    kind: 'transactions.list',
    filter: { search: 'testmarkt' },
  });
  const changed = after.rows.filter(row => picked.includes(row.id));
  assert.equal(changed.length, 3);
  assert.ok(
    changed.every(
      row => row.categoryId === groceries.id && row.categorySource === 'manual',
    ),
    'each of the three is filed, and recorded as a decision made by hand',
  );
  assert.equal(
    after.rows.filter(row => row.categoryId === null).length,
    3,
    'the three visits that were not picked are exactly as they were',
  );
  assert.deepEqual(
    await ask(dataDir, { kind: 'rules.list' }),
    [],
    'filing what is there is not learning a rule (03 §4.7)',
  );

  // Filed by hand means a rule may not overwrite it later (03 §4.4).
  await ask(dataDir, {
    kind: 'transaction.categoriseCounterparty',
    counterpartyKey: 'TESTMARKT',
    categoryId: (await ask(dataDir, { kind: 'categories.list' })).find(
      one => one.name === 'Shopping',
    )!.id,
    createRule: true,
  });
  const ruled = await ask(dataDir, {
    kind: 'transactions.list',
    filter: { search: 'testmarkt' },
  });
  assert.equal(
    ruled.rows.filter(row => row.categoryId === groceries.id).length,
    3,
    'the three filed by hand stand against the rule',
  );
});

test('a row already filed by hand into something else is kept, and counted', async () => {
  const { dataDir, groceries, shopping } = await opened();
  const ledger = await ask(dataDir, { kind: 'transactions.list' });
  const shop = ledger.rows.filter(row => row.payee === 'Testmarkt');

  await ask(dataDir, {
    kind: 'transaction.categorise',
    transactionId: shop[0].id,
    categoryId: shopping.id,
  });

  const report = await ask(dataDir, {
    kind: 'transactions.scope',
    scope: {
      kind: 'selected',
      transactionIds: [shop[0].id, shop[1].id, shop[2].id],
    },
  });
  assert.equal(report.byHand, 1, 'said before the decision, not after');

  const filed = await ask(dataDir, {
    kind: 'transactions.categoriseMany',
    scope: {
      kind: 'selected',
      transactionIds: [shop[0].id, shop[1].id, shop[2].id],
    },
    categoryId: groceries.id,
  });
  assert.deepEqual(
    filed,
    { scoped: 3, categorised: 2, keptByHand: 1 },
    '03 §4.9: the earlier decision is kept and the screen is told',
  );

  const detail = await ask(dataDir, {
    kind: 'transaction.detail',
    transactionId: shop[0].id,
  });
  assert.equal(detail.row.categoryId, shopping.id, 'the exception stands');

  // Told there is one, and saying so: the newer decision by hand wins (§4.4).
  const overruled = await ask(dataDir, {
    kind: 'transactions.categoriseMany',
    scope: { kind: 'selected', transactionIds: [shop[0].id] },
    categoryId: groceries.id,
    includeByHand: true,
  });
  assert.deepEqual(overruled, { scoped: 1, categorised: 1, keptByHand: 0 });
  const revised = await ask(dataDir, {
    kind: 'transaction.detail',
    transactionId: shop[0].id,
  });
  assert.equal(revised.row.categoryId, groceries.id);
  assert.equal(revised.row.categorySource, 'manual');
});

test('the whole of a filter is a scope, and the page limit is no part of it', async () => {
  const { dataDir, groceries } = await opened();

  // The Register would show a page of two; the scope is what the filter admits.
  const page = await ask(dataDir, {
    kind: 'transactions.list',
    filter: { search: 'testmarkt', limit: 2 },
  });
  assert.equal(page.shown, 2);
  assert.equal(page.total, 6);

  const report = await ask(dataDir, {
    kind: 'transactions.scope',
    scope: { kind: 'filter', filter: { search: 'testmarkt', limit: 2 } },
  });
  assert.equal(
    report.transactions,
    page.total,
    'what is stated before is the total the Register states',
  );

  const filed = await ask(dataDir, {
    kind: 'transactions.categoriseMany',
    scope: { kind: 'filter', filter: { search: 'testmarkt', limit: 2 } },
    categoryId: groceries.id,
  });
  assert.equal(filed.scoped, 6, 'what changed is what was stated');
  assert.equal(filed.categorised, 6);

  const after = await ask(dataDir, {
    kind: 'transactions.list',
    filter: { search: 'testmarkt' },
  });
  assert.ok(after.rows.every(row => row.categoryId === groceries.id));
  const others = await ask(dataDir, {
    kind: 'transactions.list',
    filter: { uncategorised: true },
  });
  assert.ok(
    others.rows.every(row => row.payee !== 'Testmarkt'),
    'and nothing outside the filter was touched',
  );
});

test('a counterparty filter is a scope, read the way the Register reads it', async () => {
  const { dataDir, groceries } = await opened();
  const filed = await ask(dataDir, {
    kind: 'transactions.categoriseMany',
    scope: { kind: 'filter', filter: { counterpartyKey: 'TESTFUEL' } },
    categoryId: groceries.id,
  });
  assert.deepEqual(filed, { scoped: 4, categorised: 4, keptByHand: 0 });
});

test('the amount alone is not a scope, and neither is no filter at all', async () => {
  const { dataDir, groceries } = await opened();

  for (const filter of [
    {},
    { minCents: 100 },
    { minCents: 100, maxCents: 5000 },
  ]) {
    const refused = await send(
      {
        id: `refused-${JSON.stringify(filter)}`,
        kind: 'transactions.categoriseMany',
        scope: { kind: 'filter', filter },
        categoryId: groceries.id,
      },
      dataDir,
    );
    assert.equal(refused.ok, false, `refused: ${JSON.stringify(filter)}`);
    assert.match(
      refused.ok ? '' : refused.detail,
      /03 §4\.8/,
      'and says which rule refused it',
    );
  }

  const untouched = await ask(dataDir, {
    kind: 'transactions.list',
    filter: { uncategorised: true },
  });
  assert.equal(untouched.total, 14, 'nothing was filed');
});

test('clearing a category over a scope is a decision too, and is kept as one', async () => {
  const { dataDir, groceries } = await opened();
  const ledger = await ask(dataDir, { kind: 'transactions.list' });
  const fuel = ledger.rows
    .filter(row => row.payee === 'Testfuel')
    .map(row => row.id);

  await ask(dataDir, {
    kind: 'transactions.categoriseMany',
    scope: { kind: 'selected', transactionIds: fuel },
    categoryId: groceries.id,
  });
  // Filed by hand is filed by hand, however many at once: clearing them
  // without saying so keeps them (03 §4.9)...
  const kept = await ask(dataDir, {
    kind: 'transactions.categoriseMany',
    scope: { kind: 'selected', transactionIds: fuel },
    categoryId: null,
  });
  assert.deepEqual(kept, { scoped: 4, categorised: 0, keptByHand: 4 });

  // ...and saying so clears them, recorded as the decision it is.
  const cleared = await ask(dataDir, {
    kind: 'transactions.categoriseMany',
    scope: { kind: 'selected', transactionIds: fuel },
    categoryId: null,
    includeByHand: true,
  });
  assert.deepEqual(cleared, { scoped: 4, categorised: 4, keptByHand: 0 });
  const after = await ask(dataDir, {
    kind: 'transactions.list',
    filter: { counterpartyKey: 'TESTFUEL' },
  });
  assert.ok(after.rows.every(row => row.categoryId === null));
  // An uncategorised row carries no source in the ledger — nothing is filed —
  // but the decision to clear it is in its history, as the person's own.
  const detail = await ask(dataDir, {
    kind: 'transaction.detail',
    transactionId: fuel[0],
  });
  assert.deepEqual(
    detail.decisions.at(-1) && [
      detail.decisions.at(-1)!.source,
      detail.decisions.at(-1)!.categoryName,
    ],
    ['manual', ''],
    'uncategorised by decision rather than by default',
  );
});

test('a counterparty correction reaches every transaction under the names it is about', async () => {
  const { dataDir } = await opened();
  const ledger = await ask(dataDir, { kind: 'transactions.list' });
  const fuel = ledger.rows.filter(row => row.payee === 'Testfuel');

  // One fuel stop is picked. The correction is about the name the bank printed
  // for it, and that name is on four transactions.
  const report = await ask(dataDir, {
    kind: 'transactions.scope',
    scope: { kind: 'selected', transactionIds: [fuel[0].id] },
  });
  assert.equal(report.transactions, 1);
  assert.equal(report.variantTransactions, 4, 'stated before anything moves');

  const moved = await ask(dataDir, {
    kind: 'transactions.correctCounterparty',
    scope: { kind: 'selected', transactionIds: [fuel[0].id] },
    counterpartyKey: 'TESTMARKT',
  });
  assert.equal(moved.variants, 1);
  assert.equal(moved.moved, 4, 'what moved is what was stated');
  assert.equal(moved.counterpartyName, 'Testmarkt');

  const after = await ask(dataDir, {
    kind: 'transactions.list',
    filter: { counterpartyKey: 'TESTMARKT' },
  });
  assert.equal(
    after.total,
    10,
    'six visits and four fuel stops are one counterparty',
  );
  assert.deepEqual(
    await ask(dataDir, { kind: 'rules.list' }),
    [],
    'no rule was written',
  );

  const again = await ask(dataDir, {
    kind: 'transactions.correctCounterparty',
    scope: { kind: 'selected', transactionIds: [fuel[1].id] },
    counterpartyKey: 'TESTMARKT',
  });
  assert.deepEqual(
    [again.variants, again.moved],
    [0, 0],
    'a name that already is the counterparty needs no alias, and changes nothing',
  );
});
