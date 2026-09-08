import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ayqParseCamt } from '../src/ayq-camt053.ts';
import { ayqResolveCounterparty } from '../src/counterparty/ayq-resolve.ts';
import { readFixture } from './ayq-fixtures.ts';

const day = await readFixture('ayq-abn-day.xml');
const batchAndFx = await readFixture('ayq-batch-and-fx.xml');

const entries = await ayqParseCamt(day, { file: 'ayq-abn-day.xml' });

test('the chain always starts at BkTxCd', () => {
  for (const entry of entries) {
    const resolved = ayqResolveCounterparty(entry);
    assert.equal(resolved.trail[0].layer, 'bank-transaction-code');
  }
});

test('a card entry is resolved from the description, not from an IBAN', () => {
  const resolved = ayqResolveCounterparty(entries[0]);
  assert.equal(resolved.kind, 'card-terminal');
  assert.equal(resolved.resolvedBy, 'description');
  assert.equal(resolved.name, 'ALBERT HEIJN 1234');
  assert.equal(resolved.key, 'ALBERT HEIJN');
  assert.equal(resolved.iban, null);

  const structured = resolved.trail.find(step => step.layer === 'structured');
  assert.equal(structured?.accepted, false);
  assert.match(structured?.note ?? '', /no TxDtls/);
});

test('an ATM withdrawal also goes through the description', () => {
  const resolved = ayqResolveCounterparty(entries[1]);
  assert.equal(resolved.kind, 'card-withdrawal');
  assert.equal(resolved.resolvedBy, 'description');
  assert.equal(resolved.key, 'GELDMAAT WESTERSTRAAT');
});

test('fees and interest resolve from BkTxCd — the bank is the counterparty', () => {
  const fee = ayqResolveCounterparty(entries[2]);
  assert.equal(fee.kind, 'bank-fee');
  assert.equal(fee.resolvedBy, 'bank-transaction-code');
  assert.equal(fee.name, 'ABN AMRO Bank');

  const interest = ayqResolveCounterparty(entries[3]);
  assert.equal(interest.kind, 'interest');
  assert.equal(interest.resolvedBy, 'bank-transaction-code');
  assert.equal(interest.name, 'ABN AMRO Bank');
});

test('a direct debit resolves from structured data and carries the mandate', () => {
  const resolved = ayqResolveCounterparty(entries[4]);
  assert.equal(resolved.kind, 'direct-debit');
  assert.equal(resolved.resolvedBy, 'structured');
  assert.equal(resolved.name, 'TESTENERGIE NEDERLAND B.V.');
  assert.equal(resolved.iban, 'NL00TEST0987654321');
  assert.equal(resolved.mandateId, 'MANDAAT-4471902');
});

test('on a credit the debtor is taken', () => {
  const resolved = ayqResolveCounterparty(entries[5]);
  assert.equal(resolved.kind, 'credit-transfer');
  assert.equal(resolved.resolvedBy, 'structured');
  assert.equal(resolved.name, 'TESTWERKGEVER B.V.');
});

test('an intermediary is not accepted as the counterparty', () => {
  const resolved = ayqResolveCounterparty(entries[6]);
  assert.equal(resolved.intermediary, 'MOLLIE');
  assert.equal(resolved.resolvedBy, 'description');
  assert.notEqual(resolved.name, 'Stichting Mollie Payments');
  assert.equal(resolved.key, 'BOEKHANDEL DE TESTBERG BESTELLING');

  const structured = resolved.trail.find(step => step.layer === 'structured');
  assert.equal(structured?.accepted, false);
  assert.equal(structured?.name, 'Stichting Mollie Payments');

  const intermediary = resolved.trail.find(step => step.layer === 'intermediary');
  assert.equal(intermediary?.accepted, false);
  assert.match(intermediary?.note ?? '', /intermediary/);
});

test('a reversal is classified as a reversal, not as a direct debit', () => {
  const resolved = ayqResolveCounterparty(entries[7]);
  assert.equal(resolved.kind, 'reversal');
});

test('a card entry with RmtInf still finds the marker in AddtlNtryInf', async () => {
  const fx = (await ayqParseCamt(batchAndFx)).at(-1);
  const resolved = ayqResolveCounterparty(fx!);
  assert.equal(resolved.resolvedBy, 'description');
  assert.equal(resolved.name, 'TESTWINKEL ONLINE');
  assert.equal(resolved.intermediary, 'CCV');
});

test('the alias has the last word and is recorded in the chain', () => {
  const byKey = ayqResolveCounterparty(entries[0], {
    aliases: [{ key: 'ALBERT HEIJN', name: 'Albert Heijn' }],
  });
  assert.equal(byKey.resolvedBy, 'alias');
  assert.equal(byKey.name, 'Albert Heijn');
  assert.equal(byKey.trail.at(-1)?.layer, 'alias');

  const byMandate = ayqResolveCounterparty(entries[4], {
    aliases: [{ mandateId: 'MANDAAT-4471902', name: 'Electricity' }],
  });
  assert.equal(byMandate.resolvedBy, 'alias');
  assert.equal(byMandate.name, 'Electricity');

  const byIban = ayqResolveCounterparty(entries[4], {
    aliases: [{ iban: 'NL00TEST0987654321', name: 'Electricity by IBAN' }],
  });
  assert.equal(byIban.name, 'Electricity by IBAN');
});

test('an extra intermediary can be supplied from outside', () => {
  const resolved = ayqResolveCounterparty(entries[4], {
    intermediaryNames: ['TESTENERGIE'],
  });
  assert.equal(resolved.intermediary, 'TESTENERGIE');
  assert.notEqual(resolved.resolvedBy, 'structured');
});

test('every record gets a decision and a trail', () => {
  for (const entry of entries) {
    const resolved = ayqResolveCounterparty(entry);
    assert.ok(resolved.trail.length >= 1);
    assert.ok(resolved.key !== null, `no key for ${entry.ayqKey}`);
  }
});
