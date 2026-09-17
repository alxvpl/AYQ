// What build 008 fixes: a budget imported before build 006 existed.
//
// Build 006 made both of the things the owner asked for depend on
// `provenance.counterpartyName` — folding a stored key again under the widened
// §3.9 rule, and filing from the counterparty the resolver pronounced (§11.10).
// Every test for both was written against a budget the same build had just
// imported, where that field is always present.
//
// It is absent from every record written before build 006. On the owner's own
// budget — 567 transactions, imported by build 005 — build 007 opened, folded
// nothing, and filed nothing but the thirteen bank charges, which are decided
// from the payment class and need no name. Both features silently did nothing
// and no test was capable of saying so.
//
// So this file does the one thing the suite could not: it puts a budget back
// the way an older build left it, and opens it.
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

/**
 * A budget as a build before 006 left it.
 *
 * Imported normally, then put back: every category cleared, every decision
 * dropped, every counterparty name removed from provenance, every key folded by
 * the rule that stood then — and the fold marker set, because a store that has
 * already been through build 007's pass believes the work is done.
 */
async function asOlderBuildLeftIt(dataDir: string): Promise<void> {
  const ledger = await ask(dataDir, { kind: 'transactions.list' });
  for (const row of ledger.rows) {
    if (row.category === null) continue;
    await ask(dataDir, {
      kind: 'transaction.categorise',
      transactionId: row.id,
      categoryId: null,
    });
  }

  const path = join(dataDir, 'ayq-store.json');
  const store = JSON.parse(await readFile(path, 'utf8')) as {
    decisions: Record<string, unknown>;
    counterpartyFoldVersion: number;
    provenance: Record<
      string,
      { counterpartyKey: string | null; counterpartyName?: string | null }
    >;
  };

  let stripped = 0;
  for (const entry of Object.values(store.provenance)) {
    const legacy = ayqLegacyNormaliseKey(entry.counterpartyName ?? null);
    if (legacy !== null) entry.counterpartyKey = legacy;
    delete entry.counterpartyName;
    stripped += 1;
  }
  assert.ok(stripped > 0, 'the fixture wrote no provenance to put back');

  store.decisions = {};
  store.counterpartyFoldVersion = 1;
  await writeFile(path, JSON.stringify(store, null, 2));
}

test('a budget imported before build 006 is folded and filed on the next launch', async () => {
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [filing] });
  await asOlderBuildLeftIt(dataDir);

  // Nothing is categorised, and no counterparty name is left anywhere: this is
  // the state the owner's budget was actually in.
  const before = await ask(dataDir, { kind: 'transactions.list' });
  assert.equal(
    before.rows.filter(row => row.category !== null).length,
    0,
    'the budget was not put back to uncategorised',
  );

  await restart(dataDir);

  const after = await ask(dataDir, { kind: 'transactions.list' });

  // 03 §3.13 — one counterparty, one name. The bank printed "Maas" on one line
  // and "TESTHOEK - 990311 Testref" on the next; only the description still holds
  // the dash the widened rule needs, because the stored key lost it.
  const names = after.rows
    .filter(row => row.payee !== null && /testhoek/i.test(row.payee))
    .map(row => row.payee);
  assert.equal(names.length, 2, 'both payments to the shop are in the ledger');
  assert.equal(
    new Set(names).size,
    1,
    `one counterparty, two names on the screen: ${JSON.stringify(names)}`,
  );

  // 03 §11.12 — a store filed before automatic categorisation existed catches
  // up, without the owner refiling anything by hand.
  const filed = new Map(
    after.rows.map(row => [row.payee ?? '', row.category ?? null]),
  );
  assert.equal(filed.get('Albert Heijn'), 'Groceries');
  assert.equal(filed.get('Odido Netherlands B.V.'), 'Phone & Internet');
  assert.equal(
    after.rows.find(row => row.amountCents === -415)?.category,
    'Bank fees',
  );

  // And what the evidence does not carry is still left alone (§11.13).
  assert.equal(
    after.rows.find(row => /ONBEKENDE/i.test(row.payee ?? ''))?.category,
    null,
  );
  assert.equal(after.rows.find(row => row.amountCents > 0)?.category, null);
});

test('a record whose name was never in the description still files, from its key', async () => {
  // Two thirds of the owner's budget is in this case: the resolver read the
  // name from a structured XML field, so the description never held it and it
  // cannot be recovered. The key is that same name folded, and the
  // classification folds what it is given anyway — so it files from the key.
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [filing] });
  await asOlderBuildLeftIt(dataDir);

  const path = join(dataDir, 'ayq-store.json');
  const store = JSON.parse(await readFile(path, 'utf8')) as {
    provenance: Record<string, { description: string | null }>;
  };
  // Take the descriptions away as well. Now nothing but the key is left.
  for (const entry of Object.values(store.provenance)) entry.description = null;
  await writeFile(path, JSON.stringify(store, null, 2));

  await restart(dataDir);

  const after = await ask(dataDir, { kind: 'transactions.list' });
  const filed = new Map(
    after.rows.map(row => [row.payee ?? '', row.category ?? null]),
  );
  assert.equal(filed.get('Albert Heijn'), 'Groceries');
  assert.equal(filed.get('Odido Netherlands B.V.'), 'Phone & Internet');
});

test('the pass does not run again once it has nothing left to do', async () => {
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [filing] });
  await asOlderBuildLeftIt(dataDir);

  await restart(dataDir);
  const once = await ask(dataDir, { kind: 'transactions.list' });
  const filed = once.rows.filter(row => row.category !== null).length;

  await restart(dataDir);
  const twice = await ask(dataDir, { kind: 'transactions.list' });
  assert.equal(twice.rows.filter(row => row.category !== null).length, filed);

  const store = JSON.parse(
    await readFile(join(dataDir, 'ayq-store.json'), 'utf8'),
  ) as { counterpartyFoldVersion: number; decisions: Record<string, unknown[]> };
  assert.ok(store.counterpartyFoldVersion >= 2, 'the fold left itself unmarked');
  for (const history of Object.values(store.decisions)) {
    assert.equal(history.length, 1, JSON.stringify(history));
  }
});
