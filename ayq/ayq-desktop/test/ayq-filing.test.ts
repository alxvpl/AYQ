// What AYQ files on its own, and — more to the point — what it refuses to.
//
// 03 §11.10–§11.14. Every test here is about a rule the owner's money depends
// on: a wrong category is a correction, but a category invented where the
// evidence carried none is AYQ claiming to know something it does not.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ayqFilingCategories,
  ayqProposedCategory,
  type AyqFilingEvidence,
} from '../src/ayq-filing.ts';

/** A card payment to a named counterparty, which is the ordinary case. */
function spending(
  counterpartyName: string | null,
  over: Partial<AyqFilingEvidence> = {},
): AyqFilingEvidence {
  return {
    kind: 'card-terminal',
    counterpartyName,
    amountCents: -1234,
    reversal: false,
    transfer: false,
    startingBalance: false,
    ...over,
  };
}

test('a counterparty the table knows is filed', () => {
  assert.equal(
    ayqProposedCategory(spending('ALBERT HEIJN 1234'))?.categoryName,
    'Groceries',
  );
  assert.equal(
    ayqProposedCategory(spending('Odido Netherlands B.V.'))?.categoryName,
    'Phone & Internet',
  );
  assert.equal(
    ayqProposedCategory(spending('Vattenfall Klantenservice'))?.categoryName,
    'Utilities',
  );
  assert.equal(
    ayqProposedCategory(spending('NS GROEP IZ NS REIZIGERS'))?.categoryName,
    'Public transport',
  );
});

test('the reason is recorded, because §11.11 asks for verifiable', () => {
  const filed = ayqProposedCategory(spending('Albert Heijn 1234 Amsterdam'));
  assert.equal(filed?.categoryName, 'Groceries');
  assert.deepEqual(filed?.reason, {
    code: 'counterparty',
    counterparty: 'ALBERT HEIJN',
  });
});

test('a counterparty the table does not know stays unfiled', () => {
  // §11.13. Not `Other` — `Other` is a category the owner may choose, and
  // filing to it to empty Review would overstate what AYQ knows.
  assert.equal(ayqProposedCategory(spending('Onbekende Winkel BV')), null);
  assert.equal(ayqProposedCategory(spending('J. de Vries')), null);
  assert.equal(ayqProposedCategory(spending('Stichting Buurthuis')), null);
  assert.equal(ayqProposedCategory(spending(null)), null);
  assert.ok(!ayqFilingCategories().includes('Other'));
});

test('the three exclusions are never filed', () => {
  // §11.6 and §7.6: money between the owner's own accounts is not spending.
  assert.equal(
    ayqProposedCategory(spending('Albert Heijn', { transfer: true })),
    null,
  );
  // §9: a reversal reduces the expense it reverses; it is not its own filing.
  assert.equal(
    ayqProposedCategory(spending('Albert Heijn', { reversal: true })),
    null,
  );
  assert.equal(
    ayqProposedCategory(spending('Albert Heijn', { kind: 'reversal' })),
    null,
  );
  // §11.8: Actual's technical object is not an ordinary filing target.
  assert.equal(
    ayqProposedCategory(spending('Albert Heijn', { startingBalance: true })),
    null,
  );
});

test('money coming in is left alone', () => {
  // A credit could be salary, an unflagged refund, a transfer from an account
  // AYQ has not been shown, or a friend paying back dinner. The difference
  // decides the whole income side of the forecast (03 §7.7) and no evidence
  // here separates them, so nothing is claimed.
  assert.equal(ayqProposedCategory(spending('Albert Heijn', { amountCents: 500 })), null);
  assert.equal(ayqProposedCategory(spending('Some Employer BV', { amountCents: 250000 })), null);
  // Nought is not spending either.
  assert.equal(ayqProposedCategory(spending('Albert Heijn', { amountCents: 0 })), null);
});

test("the bank's own charge needs no table", () => {
  // 03 §3.2 makes the bank itself the counterparty for a fee, so the payment
  // class settles it without anything being looked up.
  assert.equal(
    ayqProposedCategory(spending(null, { kind: 'bank-fee' }))?.categoryName,
    'Bank fees',
  );
  assert.equal(
    ayqProposedCategory(spending(null, { kind: 'interest' }))?.categoryName,
    'Bank fees',
  );
});

test('cash out of a machine is not filed', () => {
  // What the cash was then spent on is not in the statement, and 03 §3.2
  // leaves whether a withdrawal has a counterparty at all OPEN.
  assert.equal(
    ayqProposedCategory(spending('GEA Geldautomaat', { kind: 'card-withdrawal' })),
    null,
  );
});

test('a short pattern cannot hide inside a longer word', () => {
  // The match is on whole words. `BP` must not file a transfer to `BPOST`, and
  // `RDW` must not file one to `RDWORTH BV`.
  assert.equal(ayqProposedCategory(spending('BPOST BELGIE')), null);
  assert.equal(ayqProposedCategory(spending('RDWORTH BV')), null);
  assert.equal(ayqProposedCategory(spending('BP Amsterdam'))?.categoryName, 'Car & fuel');
});

test('every category it can propose is one the starter taxonomy has', () => {
  // 03 §11.7 fixes the taxonomy; a classification that proposed a category the
  // budget does not have would file nothing and report that it had.
  const taxonomy = new Set([
    'Salary', 'Other income',
    'Housing', 'Utilities', 'Insurance', 'Phone & Internet', 'Subscriptions',
    'Groceries', 'Eating out', 'Household',
    'Public transport', 'Car & fuel', 'Parking & road tax',
    'Health & pharmacy', 'Personal care',
    'Shopping', 'Entertainment', 'Travel', 'Gifts & donations',
    'Taxes & government', 'Bank fees',
    'Other',
  ]);
  for (const name of ayqFilingCategories()) {
    assert.ok(taxonomy.has(name), `${name} is not in the starter taxonomy`);
  }
});

test('the amount never decides a category', () => {
  // The size of a payment is not evidence of what it was for. Two spends at one
  // counterparty, four orders of magnitude apart, file the same.
  const small = ayqProposedCategory(spending('Albert Heijn', { amountCents: -99 }));
  const large = ayqProposedCategory(spending('Albert Heijn', { amountCents: -990000 }));
  assert.deepEqual(small, large);
});
