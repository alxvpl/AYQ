// Recovering the counterparty name a store written before build 006 never kept.
//
// Every description below is invented, in the shapes Dutch banks print.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ayqNormaliseKey } from '../../ayq-camt/src/counterparty/ayq-description.ts';

import { ayqRecoverCounterpartyNames } from '../src/ayq-recover-names.ts';
import type { AyqStore } from '../src/ayq-store.ts';

/** A provenance record as build 005 wrote it: a key, a description, no name. */
function record(
  description: string | null,
  over: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    importId: 'import-1',
    counterpartyKey: 'SOMETHING',
    resolvedBy: 'description',
    kind: 'card-terminal',
    counterpartyIban: null,
    intermediary: null,
    mandateId: null,
    endToEndId: null,
    bankTransactionCode: null,
    valueDate: null,
    description,
    file: null,
    ...over,
  };
}

function storeOf(provenance: Record<string, unknown>): AyqStore {
  return { provenance } as unknown as AyqStore;
}

test('a card terminal’s merchant is recovered', () => {
  const store = storeOf({
    a: record(
      'BEA, Betaalpas   TESTMARKT 42,PAS118   NR:00T901, 03.04.26/17:12   SON',
    ),
  });
  assert.equal(ayqRecoverCounterpartyNames(store), 1);
  // The branch number stays in the name — it is what the bank printed — and the
  // folding rule is what drops it. Recovery restores evidence; it does not
  // pre-digest it.
  assert.equal(store.provenance.a.counterpartyName, 'TESTMARKT 42');
  assert.equal(ayqNormaliseKey(store.provenance.a.counterpartyName), 'TESTMARKT');
});

test('the reference the bank appended is kept, so §3.9 can fold it', () => {
  // This is the whole point. The key build 005 stored was folded by the old
  // rule and has lost the dash; only the description still carries it, and
  // without the dash the widened rule cannot tell a reference from a word.
  const store = storeOf({
    a: record(
      'BEA, Google Pay   TESTSHOP - 220722 Royal Fl,PAS766   NR:PTR09867, 03.08.26/20:39   Son',
      { counterpartyKey: 'TESTSHOP 220722 ROYAL FL' },
    ),
  });
  assert.equal(ayqRecoverCounterpartyNames(store), 1);
  assert.equal(store.provenance.a.counterpartyName, 'TESTSHOP - 220722 Royal Fl');
  // And that is what makes the two keys one counterparty again.
  assert.equal(ayqNormaliseKey(store.provenance.a.counterpartyName), 'TESTSHOP');
});

test('a transfer’s name comes from the free text', () => {
  const store = storeOf({
    a: record(
      'SEPA Overboeking   Naam: TESTENERGIE NEDERLAND B.V.   Omschrijving: april',
      { kind: 'credit-transfer' },
    ),
  });
  assert.equal(ayqRecoverCounterpartyNames(store), 1);
  assert.equal(store.provenance.a.counterpartyName, 'TESTENERGIE NEDERLAND B.V.');
});

test('behind an intermediary the merchant is the remittance, not the payer', () => {
  // The resolver's own rule, read from provenance rather than guessed at: the
  // name in the text is the payment provider's.
  const store = storeOf({
    a: record(
      'SEPA Incasso algemeen doorlopend   Naam: TESTPAY EUROPE S.A.R.L.   ' +
        'Omschrijving: TESTWINKEL BV   Machtiging: TEST-MANDATE-1',
      { kind: 'direct-debit', intermediary: 'TESTPAY' },
    ),
  });
  assert.equal(ayqRecoverCounterpartyNames(store), 1);
  assert.equal(store.provenance.a.counterpartyName, 'TESTWINKEL BV');
});

test('a name already recorded is never overwritten', () => {
  const store = storeOf({
    a: record('BEA, Betaalpas   TESTMARKT 42,PAS118   NR:00T901, 03.04.26/17:12   SON', {
      counterpartyName: 'What the owner’s resolver actually said',
    }),
  });
  assert.equal(ayqRecoverCounterpartyNames(store), 0);
  assert.equal(
    store.provenance.a.counterpartyName,
    'What the owner’s resolver actually said',
  );
});

test('a record the description cannot answer for keeps no name', () => {
  // Its name came from a structured XML field and was never in the text. The
  // key is what is left, and `ayqApplyFiling` reads that instead.
  const store = storeOf({
    a: record(null, { resolvedBy: 'structured' }),
    b: record('', { resolvedBy: 'structured' }),
  });
  assert.equal(ayqRecoverCounterpartyNames(store), 0);
  assert.equal(store.provenance.a.counterpartyName, undefined);
});

test('running it twice changes nothing the second time', () => {
  const store = storeOf({
    a: record('BEA, Betaalpas   TESTMARKT 42,PAS118   NR:00T901, 03.04.26/17:12   SON'),
  });
  assert.equal(ayqRecoverCounterpartyNames(store), 1);
  assert.equal(ayqRecoverCounterpartyNames(store), 0);
});
