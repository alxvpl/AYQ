import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ayqParseCamt } from '../src/ayq-camt053.ts';
import { ayqStripPadding } from '../src/ayq-xml.ts';
import { padLikeAbn, readFixture } from './ayq-fixtures.ts';

const day = await readFixture('ayq-abn-day.xml');
const batchAndFx = await readFixture('ayq-batch-and-fx.xml');

test('запълването до 32 500 байта се реже преди сравнение', async () => {
  const padded = padLikeAbn(day);
  assert.equal(Buffer.byteLength(padded, 'utf8'), 32_500);
  assert.equal(ayqStripPadding(padded), day.trim());

  const fromPadded = await ayqParseCamt(padded);
  const fromRaw = await ayqParseCamt(day);
  assert.deepEqual(fromPadded, fromRaw);
});

test('един запис на TxDtls, а без TxDtls — един на Ntry', async () => {
  const entries = await ayqParseCamt(day, { file: 'ayq-abn-day.xml' });
  assert.equal(entries.length, 9);

  const withoutDetails = entries.filter(e => e.position.transactionCount === 0);
  assert.equal(withoutDetails.length, 4);
  for (const entry of withoutDetails) {
    assert.equal(entry.position.transactionIndex, -1);
  }
});

test('контекстът на извлечението пътува с всеки запис', async () => {
  const [first] = await ayqParseCamt(day, { file: 'ayq-abn-day.xml' });
  assert.equal(first.statement.file, 'ayq-abn-day.xml');
  assert.equal(first.statement.flavour, 'camt.053');
  assert.equal(first.statement.accountIban, 'NL00TEST0123456789');
  assert.equal(first.statement.accountServicerBic, 'ABNANL2A');
  assert.equal(first.statement.statementId, 'NL00TEST0123456789.2026-05-31');
  assert.equal(first.statement.legalSequenceNumber, '151');
  assert.equal(first.statement.accountOwnerName, 'J. TESTPERSOON');
});

test('картовият запис пази описанието знак по знак', async () => {
  const [card] = await ayqParseCamt(day);
  assert.equal(card.amount.value, -23.45);
  assert.equal(card.amount.currency, 'EUR');
  assert.equal(card.creditDebitIndicator, 'DBIT');
  assert.equal(card.bankTransactionCode.code, 'PMNT/CCRD/POSD');
  assert.equal(card.bankTransactionCode.domain, 'PMNT');
  assert.equal(card.bankTransactionCode.family, 'CCRD');
  assert.equal(card.bankTransactionCode.subFamily, 'POSD');
  assert.equal(card.status, 'BOOK');
  assert.equal(
    card.additionalEntryInformation,
    'BEA, Betaalpas   ALBERT HEIJN 1234,PAS421 NR:00A1B2, 31.05.26/23:10   AMSTERDAM',
  );
  assert.equal(card.rawDescription, card.additionalEntryInformation);
});

test('двете дати стоят поотделно', async () => {
  const entries = await ayqParseCamt(day);
  const directDebit = entries[4];
  assert.equal(directDebit.bookingDate.date, '2026-05-31');
  assert.equal(directDebit.valueDate.date, '2026-05-30');
  assert.notEqual(directDebit.bookingDate.date, directDebit.valueDate.date);
  for (const entry of entries) {
    assert.ok(entry.bookingDate.date !== null);
    assert.ok(entry.valueDate.date !== null);
  }
});

test('директният дебит носи целия Refs блок, IBAN, BIC и Purp', async () => {
  const directDebit = (await ayqParseCamt(day))[4];
  assert.equal(directDebit.creditor.name, 'TESTENERGIE NEDERLAND B.V.');
  assert.equal(directDebit.creditor.iban, 'NL00TEST0987654321');
  assert.equal(directDebit.creditor.country, 'NL');
  assert.deepEqual(directDebit.creditor.addressLines, ['Postbus 1']);
  assert.equal(directDebit.references.mandateId, 'MANDAAT-4471902');
  assert.equal(directDebit.references.endToEndId, 'E2E-ENERGIE-202605');
  assert.equal(directDebit.references.instructionId, 'INSTR-88213');
  assert.equal(directDebit.references.messageId, 'MSG-2026-05-30-77');
  assert.equal(directDebit.references.paymentInformationId, 'PMTINF-2026-05-30');
  assert.equal(
    directDebit.references.accountServicerReference,
    '2026053100000005',
  );
  assert.equal(directDebit.agents.creditorAgentBic, 'INGBNL2A');
  assert.equal(directDebit.purposeCode, 'OTHR');
  assert.deepEqual(directDebit.remittanceUnstructured, [
    'Termijnbedrag mei 2026 klantnummer 990011',
  ]);
});

test('при кредит контрагентът е длъжникът', async () => {
  const incoming = (await ayqParseCamt(day))[5];
  assert.equal(incoming.creditDebitIndicator, 'CRDT');
  assert.equal(incoming.amount.value, 1250);
  assert.equal(incoming.debtor.name, 'TESTWERKGEVER B.V.');
  assert.equal(incoming.debtor.iban, 'NL00TEST0555000111');
  assert.equal(incoming.agents.debtorAgentBic, 'RABONL2U');
  assert.equal(incoming.creditor.name, null);
});

test('сторното носи RvslInd и RtrInf', async () => {
  const reversal = (await ayqParseCamt(day))[7];
  assert.equal(reversal.reversalIndicator, true);
  assert.equal(reversal.returnInformation?.reasonCode, 'MD06');
  assert.deepEqual(reversal.returnInformation?.additionalInformation, [
    'Terugboeking incasso op verzoek rekeninghouder',
  ]);
});

test('сметка без IBAN се пази като Othr', async () => {
  const other = (await ayqParseCamt(day))[8];
  assert.equal(other.creditor.iban, null);
  assert.equal(other.creditor.otherAccountId, '000123456');
  assert.equal(other.creditor.otherAccountScheme, 'BBAN');
  assert.equal(other.entryReference, 'NTRY-000009');
  assert.equal(other.bankTransactionCode.code, 'XTND/NTAV/NTAV');
});

test('batch-нат запис се разцепва, а сумата на Ntry не се губи', async () => {
  const entries = await ayqParseCamt(batchAndFx);
  const batched = entries.filter(e => e.position.transactionCount === 2);
  assert.equal(batched.length, 2);

  assert.equal(batched[0].amount.value, -120);
  assert.equal(batched[1].amount.value, -60);
  for (const entry of batched) {
    assert.equal(entry.entryAmount.value, -180);
    assert.equal(entry.batch?.numberOfTransactions, '2');
    assert.equal(entry.batch?.messageId, 'BATCH-2026-06-01');
  }
  assert.equal(batched[0].creditor.name, 'TESTVERHUURDER B.V.');
  assert.equal(batched[1].creditor.name, 'TESTVERZEKERAAR N.V.');
});

test('валутната операция и таксата се пазят', async () => {
  const fx = (await ayqParseCamt(batchAndFx)).at(-1);
  assert.equal(fx?.amount.value, -92.11);
  assert.equal(fx?.currencyExchange?.instructedAmount?.raw, '99.00');
  assert.equal(fx?.currencyExchange?.instructedAmount?.currency, 'USD');
  assert.equal(fx?.currencyExchange?.transactionAmount?.currency, 'EUR');
  assert.equal(fx?.currencyExchange?.sourceCurrency, 'USD');
  assert.equal(fx?.currencyExchange?.targetCurrency, 'EUR');
  assert.equal(fx?.currencyExchange?.exchangeRate, '1.0884');
  assert.equal(fx?.charges.length, 1);
  assert.equal(fx?.charges[0].amount.raw, '1.15');
  assert.equal(fx?.charges[0].bearer, 'DEBT');
  assert.equal(fx?.charges[0].isDebit, true);
});

test('ключът за дедупликация е уникален и не зависи от името на файла', async () => {
  const first = await ayqParseCamt(day, { file: 'export-a.xml' });
  const second = await ayqParseCamt(day, { file: 'export-b.xml' });
  assert.deepEqual(
    first.map(e => e.ayqKey),
    second.map(e => e.ayqKey),
  );
  assert.equal(new Set(first.map(e => e.ayqKey)).size, first.length);
});

test('суровият възел се закача само когато е поискан', async () => {
  const without = await ayqParseCamt(day);
  assert.equal(without[0].rawNode, undefined);
  const withRaw = await ayqParseCamt(day, { keepRawNode: true });
  assert.ok(withRaw[0].rawNode?.entry);
});
