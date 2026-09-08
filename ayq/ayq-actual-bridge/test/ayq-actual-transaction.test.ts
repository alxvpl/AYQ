import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { ayqParseCamt } from '../../ayq-camt/src/ayq-camt053.ts';
import { ayqResolveCounterparty } from '../../ayq-camt/src/counterparty/ayq-resolve.ts';
import {
  ayqDecimalToCents,
  ayqEntryCents,
  ayqToActualTransaction,
} from '../src/ayq-actual-transaction.ts';
import { ayqProvenanceRecord } from '../src/ayq-provenance.ts';
import { ayqPrepare } from '../src/ayq-import.ts';

const fixture = fileURLToPath(
  new URL('../../ayq-camt/test/fixtures/ayq-abn-day.xml', import.meta.url),
);
const entries = await ayqParseCamt(await readFile(fixture, 'utf8'), {
  file: 'ayq-abn-day.xml',
});

test('decimal text becomes cents without passing through a float', () => {
  assert.equal(ayqDecimalToCents('23.45'), 2345);
  assert.equal(ayqDecimalToCents('1250.00'), 125000);
  assert.equal(ayqDecimalToCents('0.42'), 42);
  assert.equal(ayqDecimalToCents('3.3'), 330);
  assert.equal(ayqDecimalToCents('7'), 700);
  assert.equal(ayqDecimalToCents('1234,56'), 123456);
  assert.equal(ayqDecimalToCents('-61.90'), -6190);
  assert.equal(ayqDecimalToCents('not a number'), null);
  assert.equal(ayqDecimalToCents(null), null);

  // A third decimal rounds half away from zero.
  assert.equal(ayqDecimalToCents('0.005'), 1);
  assert.equal(ayqDecimalToCents('0.004'), 0);

  // The float route would give 2344.9999999999995 here.
  assert.equal(ayqDecimalToCents('23.45'), Math.round(23.45 * 100));
});

test('the sign comes from CdtDbtInd, not from the text', () => {
  assert.equal(ayqEntryCents(entries[0]), -2345); // card payment, DBIT
  assert.equal(ayqEntryCents(entries[3]), 42); // interest, CRDT
  assert.equal(ayqEntryCents(entries[5]), 125000); // incoming transfer, CRDT
  assert.equal(ayqEntryCents(entries[4]), -6190); // direct debit, DBIT
});

test('a card entry gets the resolved payee and keeps what the bank said', () => {
  const entry = entries[0];
  const transaction = ayqToActualTransaction(
    entry,
    ayqResolveCounterparty(entry),
  );

  assert.equal(transaction?.payee_name, 'ALBERT HEIJN 1234');
  assert.equal(
    transaction?.imported_payee,
    'BEA, Betaalpas   ALBERT HEIJN 1234,PAS421 NR:00A1B2, 31.05.26/23:10   AMSTERDAM',
  );
  assert.equal(transaction?.amount, -2345);
  assert.equal(transaction?.cleared, true);
  assert.equal(transaction?.imported_id, '2026053100000001');
});

test('the booking date is used and both dates survive in provenance', () => {
  const entry = entries[4]; // BookgDt 05-31, ValDt 05-30
  const counterparty = ayqResolveCounterparty(entry);
  const transaction = ayqToActualTransaction(entry, counterparty);
  assert.equal(transaction?.date, '2026-05-31');

  const provenance = ayqProvenanceRecord(entry, counterparty);
  assert.equal(provenance.bookingDate, '2026-05-31');
  assert.equal(provenance.valueDate, '2026-05-30');
});

test('provenance carries what Actual has no field for', () => {
  const entry = entries[4];
  const provenance = ayqProvenanceRecord(entry, ayqResolveCounterparty(entry));

  assert.equal(provenance.counterpartyIban, 'NL00TEST0987654321');
  assert.equal(provenance.bankTransactionCode, 'PMNT/RDDT/ESDD');
  assert.equal(provenance.mandateId, 'MANDAAT-4471902');
  assert.equal(provenance.endToEndId, 'E2E-ENERGIE-202605');
  assert.equal(provenance.counterpartyAgentBic, 'INGBNL2A');
  assert.equal(provenance.resolvedBy, 'structured');
  assert.equal(provenance.paymentKind, 'direct-debit');
  // The provenance is keyed by the same id the transaction carries.
  assert.equal(provenance.importedId, '2026053100000005');
});

test('every record in the day maps to a transaction', () => {
  const prepared = ayqPrepare(entries);
  assert.equal(prepared.transactions.length, entries.length);
  assert.equal(prepared.skipped, 0);
  assert.equal(prepared.provenance.length, entries.length);

  for (const transaction of prepared.transactions) {
    assert.match(transaction.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(Number.isInteger(transaction.amount), true);
    assert.ok(transaction.imported_id);
  }

  // Deduplication only works if the keys are distinct.
  const keys = new Set(prepared.transactions.map(item => item.imported_id));
  assert.equal(keys.size, prepared.transactions.length);
});

test('the intermediary payment does not land under the PSP', () => {
  const entry = entries[6];
  const counterparty = ayqResolveCounterparty(entry);
  const transaction = ayqToActualTransaction(entry, counterparty);

  assert.notEqual(transaction?.payee_name, 'Stichting Mollie Payments');
  assert.equal(
    ayqProvenanceRecord(entry, counterparty).intermediary,
    'MOLLIE',
  );
});
