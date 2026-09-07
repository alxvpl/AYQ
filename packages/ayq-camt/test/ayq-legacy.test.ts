import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ayqParseCamt } from '../src/ayq-camt053.ts';
import { ayqToLegacyTransaction } from '../src/ayq-legacy.ts';
import { ayqMeasure } from '../src/ayq-measure.ts';
import { readFixture } from './ayq-fixtures.ts';

const day = await readFixture('ayq-abn-day.xml');
const entries = await ayqParseCamt(day, { file: 'ayq-abn-day.xml' });

test('петте полета на Actual продължават да излизат', () => {
  for (const entry of entries) {
    const legacy = ayqToLegacyTransaction(entry);
    assert.ok(legacy.date !== null);
    assert.ok(legacy.amount !== null);
    assert.ok(
      legacy.payee_name !== null,
      'всеки запис излиза с непразно име, както в измерването',
    );
    assert.equal(legacy.payee_name, legacy.imported_payee);
  }
});

test('картовият запис дава суровия низ като име — това е загубата', () => {
  const legacy = ayqToLegacyTransaction(entries[0]);
  assert.equal(
    legacy.payee_name,
    'BEA, Betaalpas   ALBERT HEIJN 1234,PAS421 NR:00A1B2, 31.05.26/23:10   AMSTERDAM',
  );
  assert.equal(legacy.amount, -23.45);
  assert.equal(legacy.date, '2026-05-31');
  assert.equal(legacy.imported_id, '2026053100000001');
});

test('нормализацията свива имена, които петте полета не свиват', () => {
  const measurement = ayqMeasure(entries, 1);
  assert.equal(measurement.records, 9);
  assert.equal(measurement.entries, 9);
  assert.equal(measurement.withoutTxDtls, 4);
  assert.equal(measurement.present.bankTransactionCode, 9);
  assert.equal(measurement.present.bothDates, 9);
  assert.equal(measurement.present.mandateId, 2);
  assert.equal(measurement.present.counterpartyIban, 4);
  assert.equal(measurement.bankTransactionCodes['PMNT/CCRD/POSD'], 1);
  assert.ok(
    measurement.distinctCounterpartyKeys < measurement.distinctLegacyPayees,
  );
});
