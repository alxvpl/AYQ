import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ayqParseCamt } from '../src/ayq-camt053.ts';
import { ayqResolveCounterparty } from '../src/counterparty/ayq-resolve.ts';
import { readFixture } from './ayq-fixtures.ts';

const day = await readFixture('ayq-abn-day.xml');
const batchAndFx = await readFixture('ayq-batch-and-fx.xml');

const entries = await ayqParseCamt(day, { file: 'ayq-abn-day.xml' });

test('веригата винаги тръгва от BkTxCd', () => {
  for (const entry of entries) {
    const resolved = ayqResolveCounterparty(entry);
    assert.equal(resolved.trail[0].layer, 'bank-transaction-code');
  }
});

test('картовият запис се решава от описанието, а не от IBAN', () => {
  const resolved = ayqResolveCounterparty(entries[0]);
  assert.equal(resolved.kind, 'card-terminal');
  assert.equal(resolved.resolvedBy, 'description');
  assert.equal(resolved.name, 'ALBERT HEIJN 1234');
  assert.equal(resolved.key, 'ALBERT HEIJN');
  assert.equal(resolved.iban, null);

  const structured = resolved.trail.find(step => step.layer === 'structured');
  assert.equal(structured?.accepted, false);
  assert.match(structured?.note ?? '', /няма TxDtls/);
});

test('банкоматът също минава през описанието', () => {
  const resolved = ayqResolveCounterparty(entries[1]);
  assert.equal(resolved.kind, 'card-withdrawal');
  assert.equal(resolved.resolvedBy, 'description');
  assert.equal(resolved.key, 'GELDMAAT WESTERSTRAAT');
});

test('такса и лихва се решават от BkTxCd — контрагентът е банката', () => {
  const fee = ayqResolveCounterparty(entries[2]);
  assert.equal(fee.kind, 'bank-fee');
  assert.equal(fee.resolvedBy, 'bank-transaction-code');
  assert.equal(fee.name, 'ABN AMRO Bank');

  const interest = ayqResolveCounterparty(entries[3]);
  assert.equal(interest.kind, 'interest');
  assert.equal(interest.resolvedBy, 'bank-transaction-code');
  assert.equal(interest.name, 'ABN AMRO Bank');
});

test('директният дебит се решава от структурираните данни и носи мандата', () => {
  const resolved = ayqResolveCounterparty(entries[4]);
  assert.equal(resolved.kind, 'direct-debit');
  assert.equal(resolved.resolvedBy, 'structured');
  assert.equal(resolved.name, 'TESTENERGIE NEDERLAND B.V.');
  assert.equal(resolved.iban, 'NL00TEST0987654321');
  assert.equal(resolved.mandateId, 'MANDAAT-4471902');
});

test('при кредит се взима длъжникът', () => {
  const resolved = ayqResolveCounterparty(entries[5]);
  assert.equal(resolved.kind, 'credit-transfer');
  assert.equal(resolved.resolvedBy, 'structured');
  assert.equal(resolved.name, 'TESTWERKGEVER B.V.');
});

test('посредникът не се приема за контрагент', () => {
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
  assert.match(intermediary?.note ?? '', /посредника/);
});

test('сторното се класифицира като сторно, а не като директен дебит', () => {
  const resolved = ayqResolveCounterparty(entries[7]);
  assert.equal(resolved.kind, 'reversal');
});

test('картов запис с RmtInf пак намира маркера в AddtlNtryInf', async () => {
  const fx = (await ayqParseCamt(batchAndFx)).at(-1);
  const resolved = ayqResolveCounterparty(fx!);
  assert.equal(resolved.resolvedBy, 'description');
  assert.equal(resolved.name, 'TESTWINKEL ONLINE');
  assert.equal(resolved.intermediary, 'CCV');
});

test('псевдонимът има последна дума и се записва във веригата', () => {
  const byKey = ayqResolveCounterparty(entries[0], {
    aliases: [{ key: 'ALBERT HEIJN', name: 'Albert Heijn' }],
  });
  assert.equal(byKey.resolvedBy, 'alias');
  assert.equal(byKey.name, 'Albert Heijn');
  assert.equal(byKey.trail.at(-1)?.layer, 'alias');

  const byMandate = ayqResolveCounterparty(entries[4], {
    aliases: [{ mandateId: 'MANDAAT-4471902', name: 'Ток' }],
  });
  assert.equal(byMandate.resolvedBy, 'alias');
  assert.equal(byMandate.name, 'Ток');

  const byIban = ayqResolveCounterparty(entries[4], {
    aliases: [{ iban: 'NL00TEST0987654321', name: 'Ток по IBAN' }],
  });
  assert.equal(byIban.name, 'Ток по IBAN');
});

test('допълнителен посредник може да се подаде отвън', () => {
  const resolved = ayqResolveCounterparty(entries[4], {
    intermediaryNames: ['TESTENERGIE'],
  });
  assert.equal(resolved.intermediary, 'TESTENERGIE');
  assert.notEqual(resolved.resolvedBy, 'structured');
});

test('всеки запис получава решение и следа', () => {
  for (const entry of entries) {
    const resolved = ayqResolveCounterparty(entry);
    assert.ok(resolved.trail.length >= 1);
    assert.ok(resolved.key !== null, `няма ключ за ${entry.ayqKey}`);
  }
});
