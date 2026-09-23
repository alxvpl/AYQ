// What build 006 fixes, proved on real budgets.
//
// Both of these were found by the owner running build 005 against his own
// statements, which is the only place either could have been found: the unit
// tests of the day all passed, and went on passing, because each held the rule
// it was written for and neither held the rule the product needed.
//
//   1. one counterparty, two names on the screen (03 §3.9, §3.13)
//   2. a provisioned taxonomy and five hundred and sixty-seven transactions
//      nobody had filed (03 §11.10–§11.14, 04 A6)
//
// Its own file for the reason `ayq-build-005.test.ts` is: each test here makes
// a real Actual budget, and on the Windows runner that is disk rather than
// processor.
//
// Every account, counterparty, amount and date below is invented.

import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';

import { ayqLegacyNormaliseKey } from '../../ayq-camt/src/counterparty/ayq-description.ts';

import { ask, budget, here, restart } from './ayq-engine-harness.ts';

const filing = join(
  here,
  '..',
  '..',
  'ayq-camt',
  'test',
  'fixtures',
  'ayq-filing.xml',
);

async function storeOf(dataDir: string): Promise<{
  version: number;
  decisions: Record<
    string,
    Array<{ source: string; categoryName: string; reason?: { code: string } }>
  >;
}> {
  return JSON.parse(
    await readFile(join(dataDir, 'ayq-store.json'), 'utf8'),
  ) as never;
}

test('a bank reference does not make one shop two (03 §3.9, §3.13)', async () => {
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [filing] });

  const ledger = await ask(dataDir, { kind: 'transactions.list' });
  const names = ledger.rows
    .filter(row => row.payee !== null && /testhoek/i.test(row.payee))
    .map(row => row.payee);

  // The bank printed "TESTHOEK 13" on one line and "TESTHOEK - 990311 Testref" on the
  // next. Build 005 drew both, because the fallback was the row's own payee.
  assert.equal(names.length, 2, 'both payments to the shop are in the ledger');
  assert.equal(
    new Set(names).size,
    1,
    `one counterparty, two names on the screen: ${JSON.stringify(names)}`,
  );
  assert.equal(names[0], 'Testhoek');

  // And it is one counterparty underneath, not two that happen to be drawn
  // alike: the counterparties workspace counts it once.
  const counterparties = await ask(dataDir, {
    kind: 'counterparties.list',
    filter: { search: 'Testhoek' },
  });
  assert.equal(counterparties.rows.length, 1, 'two keys survived the fold');
  assert.equal(counterparties.rows[0].name, 'Testhoek');
  assert.equal(counterparties.rows[0].transactions, 2);
});

test('an import files what the evidence carries (03 §11.10, §11.12)', async () => {
  const dataDir = await budget();
  const imported = await ask(dataDir, { kind: 'import.camt', paths: [filing] });

  // The count is reported separately from what the owner's rules did, because
  // a rule is his decision and this is AYQ reading the evidence.
  assert.equal(imported.categorised, 0, 'there are no rules yet');
  assert.ok(imported.filed > 0, 'nothing was filed automatically');

  const ledger = await ask(dataDir, { kind: 'transactions.list' });
  const filed = new Map(
    ledger.rows.map(row => [row.payee ?? '', row.category ?? null]),
  );

  assert.equal(filed.get('Albert Heijn'), 'Groceries');
  assert.equal(filed.get('Odido Netherlands B.V.'), 'Phone & Internet');

  // The bank's own charge needs no table: 03 §3.2 makes the bank the
  // counterparty, so the payment class settles it.
  const fee = ledger.rows.find(row => row.amountCents === -415);
  assert.equal(fee?.category, 'Bank fees');

  // Every automatic filing says so, and says why (§11.11).
  for (const row of ledger.rows) {
    if (row.category === null) continue;
    assert.equal(row.categorySource, 'auto', `${row.payee} claims another source`);
  }
  const store = await storeOf(dataDir);
  assert.ok(store.version >= 10);
  const reasons = Object.values(store.decisions)
    .map(history => history.at(-1))
    .filter(one => one?.source === 'auto');
  assert.ok(reasons.length > 0);
  for (const decision of reasons) {
    assert.ok(
      ['bank-charge', 'bank-interest', 'counterparty'].includes(
        decision?.reason?.code ?? '',
      ),
      'an automatic filing recorded no reason code',
    );
  }
});

test('what the evidence does not carry stays unfiled (03 §11.13)', async () => {
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [filing] });

  const ledger = await ask(dataDir, { kind: 'transactions.list' });

  // A shop nothing knows about. Not `Other` — `Other` is a category the owner
  // may choose, not a bin for what AYQ could not decide.
  const unknown = ledger.rows.find(row => /ONBEKENDE/i.test(row.payee ?? ''));
  assert.ok(unknown, 'the unknown shop is not in the ledger');
  assert.equal(unknown?.category, null);
  assert.equal(unknown?.categorySource, null);

  // Money coming in. It could be salary, an unflagged refund, or a friend
  // paying back dinner, and nothing in the statement separates them.
  const credit = ledger.rows.find(row => row.amountCents > 0);
  assert.ok(credit, 'the credit is not in the ledger');
  assert.equal(credit?.category, null);

  // No category outside the starter taxonomy was invented to hold anything.
  const known = await ask(dataDir, { kind: 'categories.list' });
  const names = new Set(known.map(one => one.name));
  for (const row of ledger.rows) {
    if (row.category === null) continue;
    assert.ok(names.has(row.category), `${row.category} is not a real category`);
  }
});

test('a rule outranks the classification, and a person outranks both', async () => {
  // 03 §11.11 is the whole safety of filing without being asked, so it is
  // proved end to end rather than only in the pure test.
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [filing] });

  const before = await ask(dataDir, { kind: 'transactions.list' });
  const groceries = before.rows.find(row => row.payee === 'Albert Heijn');
  assert.ok(groceries);
  assert.equal(groceries?.category, 'Groceries');
  assert.equal(groceries?.categorySource, 'auto');

  // The owner says this shop is Household, and asks AYQ to remember it. The
  // rule revises what the classification concluded — for every transaction of
  // that counterparty, not only the one in front of him.
  const categories = await ask(dataDir, { kind: 'categories.list' });
  const household = categories.find(one => one.name === 'Household');
  assert.ok(household, 'the starter taxonomy has no Household');
  await ask(dataDir, {
    kind: 'transaction.categorise',
    transactionId: groceries.id,
    categoryId: household.id,
    createRule: true,
  });

  const afterRule = await ask(dataDir, { kind: 'transactions.list' });
  for (const row of afterRule.rows.filter(one => one.payee === 'Albert Heijn')) {
    assert.equal(row.category, 'Household', 'the rule did not reach every row');
  }

  // Launching again re-runs the classification over everything held. It must
  // not put the shop back into Groceries.
  await restart(dataDir);
  const afterRestart = await ask(dataDir, { kind: 'transactions.list' });
  for (const row of afterRestart.rows.filter(one => one.payee === 'Albert Heijn')) {
    assert.equal(
      row.category,
      'Household',
      'the classification overwrote the owner’s rule on the next launch',
    );
  }
});

test('running it twice files nothing twice (03 §11.12)', async () => {
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [filing] });

  const first = await ask(dataDir, { kind: 'transactions.list' });
  const filedFirst = first.rows.filter(row => row.category !== null).length;

  // The launch pass runs on every open. A store already up to date has nothing
  // left for it to do, and the categories do not move.
  await restart(dataDir);
  await restart(dataDir);

  const second = await ask(dataDir, { kind: 'transactions.list' });
  assert.equal(
    second.rows.filter(row => row.category !== null).length,
    filedFirst,
  );

  const store = await storeOf(dataDir);
  for (const history of Object.values(store.decisions)) {
    // A history of one: the same conclusion reached again is not a new
    // decision, and a log of AYQ agreeing with itself is not a record.
    assert.equal(history.length, 1, JSON.stringify(history));
  }
});

test('a store written under the older folding rule still opens', async () => {
  // The defect build 006 shipped, and the owner found on his own budget within
  // minutes: "the counterparty names did not reach the budget within 1.5s", a
  // red banner, and a Today that said `Reading…` and never stopped.
  //
  // `wantedPayees` decided a row was right by comparing its payee with the
  // *key* recorded for it. That holds only while a name and a key are folded by
  // the same rule, and 03 §3.9 widened the name's. A counterparty the bank had
  // printed with a reference then wanted the payee `Testhoek 13` while its recorded
  // key was still `TESTHOEK 990311 TESTREF`, the row could never satisfy the test,
  // and the pass asked sixty times and threw — out of the launch.
  //
  // Reproduced by putting the store back the way build 005 wrote it: the key
  // the old rule produced, and the fold marker unset so the pass runs.
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [filing] });

  const path = join(dataDir, 'ayq-store.json');
  const store = JSON.parse(await readFile(path, 'utf8')) as {
    counterpartyFoldVersion: number;
    provenance: Record<string, { counterpartyKey: string | null; counterpartyName?: string | null }>;
  };

  let putBack = 0;
  for (const entry of Object.values(store.provenance)) {
    const legacy = ayqLegacyNormaliseKey(entry.counterpartyName ?? null);
    if (legacy === null || legacy === entry.counterpartyKey) continue;
    entry.counterpartyKey = legacy;
    putBack += 1;
  }
  assert.ok(putBack > 0, 'the fixture no longer holds a name the rules fold differently');
  store.counterpartyFoldVersion = 0;
  await writeFile(path, JSON.stringify(store, null, 2));

  // The launch that used to throw.
  await restart(dataDir);

  const ledger = await ask(dataDir, { kind: 'transactions.list' });
  const names = ledger.rows
    .filter(row => row.payee !== null && /testhoek/i.test(row.payee))
    .map(row => row.payee);
  assert.equal(names.length, 2);
  assert.equal(new Set(names).size, 1, JSON.stringify(names));
  assert.equal(names[0], 'Testhoek');

  // And the pass says it is done, so the next launch does not pay for it again.
  const after = JSON.parse(await readFile(path, 'utf8')) as {
    counterpartyFoldVersion: number;
  };
  assert.ok(after.counterpartyFoldVersion >= 1, 'the fold left itself unmarked');
});
