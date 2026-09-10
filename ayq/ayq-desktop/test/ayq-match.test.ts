// What counts as the same payment, on invented data.
//
// The rule for applying a match without asking is narrow on purpose (03 §7.5):
// the counterparty or the mandate has to agree, the amount has to be exact and
// the date has to be close. These tests are where that narrowness is held to,
// because a matcher that quietly marks the wrong bill paid is worse than one
// that asks.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type {
  AyqMatchCandidate,
  AyqPlanOccurrence,
} from '../../ayq-client/src/ayq-ipc-contract.ts';
import { ayqProposeMatches, type AyqMatchInput } from '../src/ayq-match.ts';

function expected(
  over: Partial<AyqPlanOccurrence> = {},
): AyqPlanOccurrence {
  return {
    recordId: over.recordId ?? 'plan-1',
    name: over.name ?? 'Energy',
    kind: over.kind ?? 'expense',
    amountCents: over.amountCents ?? 6_190,
    categoryName: over.categoryName ?? 'Utilities',
    dueDate: over.dueDate ?? '2026-06-30',
    effectiveDate: over.effectiveDate ?? over.dueDate ?? '2026-06-30',
    state: over.state ?? 'expected',
    suggested: over.suggested ?? false,
    matchedTransactionId: null,
    matchProvenance: null,
  };
}

function actual(over: Partial<AyqMatchCandidate> = {}): AyqMatchCandidate {
  return {
    transactionId: over.transactionId ?? 'txn-1',
    date: over.date ?? '2026-06-30',
    amountCents: over.amountCents ?? -6_190,
    payee: over.payee ?? 'Testenergie',
    counterpartyKey: over.counterpartyKey ?? null,
    mandateId: over.mandateId ?? null,
  };
}

function propose(
  occurrences: AyqPlanOccurrence[],
  candidates: AyqMatchCandidate[],
  over: Partial<AyqMatchInput> = {},
) {
  return ayqProposeMatches({
    occurrences,
    candidates,
    recordKeys: over.recordKeys ?? new Map(),
    taken: over.taken ?? new Set(),
    refused: over.refused ?? new Map(),
  });
}

test('the counterparty, an exact amount and a near date is applied without asking', () => {
  const found = propose(
    [expected()],
    [actual({ counterpartyKey: 'TESTENERGIE' })],
    {
      recordKeys: new Map([
        ['plan-1', { key: 'TESTENERGIE', mandateId: null }],
      ]),
    },
  );
  assert.equal(found.length, 1);
  assert.equal(found[0].confident, true);
  assert.deepEqual(found[0].evidence, [
    'the same counterparty',
    'the same amount',
    'the same day',
  ]);
});

test('a SEPA mandate identifies it just as well as the counterparty', () => {
  const found = propose(
    [expected()],
    [actual({ mandateId: 'MANDAAT-1' })],
    { recordKeys: new Map([['plan-1', { key: null, mandateId: 'MANDAAT-1' }]]) },
  );
  assert.equal(found[0].confident, true);
  assert.ok(found[0].evidence.includes('the same SEPA mandate'));
});

test('an exact amount on the right day is offered, and not applied', () => {
  // The case a person creates by typing a planned payment: nothing identifies
  // the counterparty yet, so the amount and the date are all there is. That is
  // enough to put to somebody and not enough to act on.
  const found = propose([expected()], [actual()]);
  assert.equal(found.length, 1);
  assert.equal(found[0].confident, false);
  assert.deepEqual(found[0].evidence, ['the same amount', 'the same day']);
});

test('a week is close enough to apply; two weeks is only close enough to offer', () => {
  const near = propose(
    [expected()],
    [actual({ date: '2026-07-06', counterpartyKey: 'TESTENERGIE' })],
    { recordKeys: new Map([['plan-1', { key: 'TESTENERGIE', mandateId: null }]]) },
  );
  assert.equal(near[0].daysApart, 6);
  assert.equal(near[0].confident, true);

  const far = propose(
    [expected()],
    [actual({ date: '2026-07-10', counterpartyKey: 'TESTENERGIE' })],
    { recordKeys: new Map([['plan-1', { key: 'TESTENERGIE', mandateId: null }]]) },
  );
  assert.equal(far[0].daysApart, 10);
  assert.equal(far[0].confident, false, 'the counterparty agrees; the date does not');

  const beyond = propose(
    [expected()],
    [actual({ date: '2026-07-20', counterpartyKey: 'TESTENERGIE' })],
    { recordKeys: new Map([['plan-1', { key: 'TESTENERGIE', mandateId: null }]]) },
  );
  assert.deepEqual(beyond, [], 'and three weeks is not the same payment at all');
});

test('an amount within a tenth is offered; further off is not a match', () => {
  const near = propose(
    [expected()],
    [actual({ amountCents: -6_500, counterpartyKey: 'TESTENERGIE' })],
    { recordKeys: new Map([['plan-1', { key: 'TESTENERGIE', mandateId: null }]]) },
  );
  assert.equal(near.length, 1);
  assert.equal(near[0].confident, false, 'identified, but the amount is not exact');
  assert.ok(near[0].evidence.includes('an amount within a tenth of it'));

  const wrong = propose(
    [expected()],
    [actual({ amountCents: -12_000, counterpartyKey: 'TESTENERGIE' })],
    { recordKeys: new Map([['plan-1', { key: 'TESTENERGIE', mandateId: null }]]) },
  );
  assert.deepEqual(wrong, []);
});

test('money going the other way is never the same payment', () => {
  const found = propose(
    [expected()],
    [actual({ amountCents: 6_190, counterpartyKey: 'TESTENERGIE' })],
    { recordKeys: new Map([['plan-1', { key: 'TESTENERGIE', mandateId: null }]]) },
  );
  assert.deepEqual(found, []);
});

test('neither the amount nor an identity means nothing to go on', () => {
  const found = propose(
    [expected()],
    [actual({ amountCents: -6_500 })],
  );
  assert.deepEqual(
    found,
    [],
    'an amount near a date matches half a supermarket month',
  );
});

test('one transaction can only be one payment', () => {
  const found = propose(
    [
      expected({ recordId: 'a', dueDate: '2026-06-30' }),
      expected({ recordId: 'b', dueDate: '2026-07-01' }),
    ],
    [actual()],
  );
  assert.equal(found.length, 1, 'the earlier occurrence takes it');
  assert.equal(found[0].recordId, 'a');
});

test('a transaction already matched to something is not offered again', () => {
  const found = propose([expected()], [actual()], {
    taken: new Set(['txn-1']),
  });
  assert.deepEqual(found, []);
});

test('a pairing a person has refused is not put to them twice', () => {
  const found = propose([expected()], [actual()], {
    refused: new Map([['plan-1 2026-06-30', new Set(['txn-1'])]]),
  });
  assert.deepEqual(found, []);
});

test('a confident match beats a nearer one that is only an offer', () => {
  const found = propose(
    [expected()],
    [
      actual({ transactionId: 'near', date: '2026-06-30' }),
      actual({
        transactionId: 'sure',
        date: '2026-07-02',
        counterpartyKey: 'TESTENERGIE',
      }),
    ],
    { recordKeys: new Map([['plan-1', { key: 'TESTENERGIE', mandateId: null }]]) },
  );
  assert.equal(found[0].transactionId, 'sure');
  assert.equal(found[0].confident, true);
});

test('a rescheduled occurrence is matched against where it now falls', () => {
  const found = propose(
    [expected({ dueDate: '2026-06-30', effectiveDate: '2026-07-08' })],
    [actual({ date: '2026-07-08', counterpartyKey: 'TESTENERGIE' })],
    { recordKeys: new Map([['plan-1', { key: 'TESTENERGIE', mandateId: null }]]) },
  );
  assert.equal(found[0].daysApart, 0);
  assert.equal(found[0].confident, true);
  assert.equal(found[0].dueDate, '2026-06-30', 'and it is still that occurrence');
});
