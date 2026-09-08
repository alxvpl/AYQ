// The round trip that step 4 exists to prove: intermediate records go into
// Actual through the stable Node API and come back out of it, with no Actual
// UI, no sync server and no monorepo build.
//
// This test runs the real `@actual-app/api`, so it is slower than the rest and
// writes a budget into a temporary directory. Actual logs a
// `cloudStorage.upload failed ... unauthorized` line at the end of an import;
// that is it trying to reach a sync server that was never configured, and it
// does not affect the local budget.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { ayqParseCamt } from '../../ayq-camt/src/ayq-camt053.ts';
import {
  ayqImportAgain,
  ayqImportToActual,
  ayqPrepare,
  ayqReadLedger,
} from '../src/ayq-import.ts';

const fixture = fileURLToPath(
  new URL('../../ayq-camt/test/fixtures/ayq-abn-day.xml', import.meta.url),
);
const entries = await ayqParseCamt(await readFile(fixture, 'utf8'), {
  file: 'ayq-abn-day.xml',
});

test('records load into Actual headless and read back intact', async t => {
  t.diagnostic(`importing ${entries.length} records`);
  const dataDir = await mkdtemp(join(tmpdir(), 'ayq-actual-'));

  const result = await ayqImportToActual({
    dataDir,
    budgetName: 'AYQ spike',
    accountName: 'ABN AMRO private',
    entries,
  });

  assert.deepEqual(result.errors, [], 'the API reported no import errors');
  assert.equal(result.skipped, 0, 'no record was dropped before sending');
  assert.equal(result.prepared, entries.length);
  assert.equal(result.added, entries.length, 'every record became a transaction');
  assert.ok(result.budgetId.length > 0);
  assert.ok(result.accountId.length > 0);

  // The provenance file sits next to the budget, because Actual's schema has
  // nowhere to keep a counterparty IBAN, a BkTxCd or a SEPA mandate.
  assert.ok(result.provenanceFile);
  const provenance = JSON.parse(
    await readFile(result.provenanceFile as string, 'utf8'),
  );
  assert.equal(provenance.length, entries.length);
  assert.ok(
    provenance.some(
      (record: { bankTransactionCode: string | null }) =>
        record.bankTransactionCode === 'PMNT/RDDT/ESDD',
    ),
  );

  const ledger = await ayqReadLedger(
    dataDir,
    result.budgetId,
    result.accountId,
    '2026-05-01',
    '2026-06-30',
  );
  assert.equal(ledger.length, entries.length, 'the ledger holds every record');

  // Amounts survive as integer cents, sign and all.
  const amounts = ledger.map(row => row.amount).sort((a, b) => a - b);
  assert.ok(amounts.includes(-2345), 'the card payment is a debit of 23.45');
  assert.ok(amounts.includes(125000), 'the salary is a credit of 1250.00');
  // The total is derived from the records rather than typed in, so the
  // assertion checks the round trip instead of a number someone believed.
  const expectedTotal = ayqPrepare(entries).transactions.reduce(
    (sum, transaction) => sum + transaction.amount,
    0,
  );
  assert.equal(
    amounts.reduce((sum, value) => sum + value, 0),
    expectedTotal,
    'the ledger totals exactly what was sent',
  );

  // The payee is the resolved counterparty; what the bank said is still there.
  const card = ledger.find(row => row.amount === -2345);
  assert.match(card?.payee ?? '', /albert heijn/i);
  assert.match(card?.importedPayee ?? '', /^BEA, Betaalpas/);

  // The bank, not a raw description, is the counterparty of the fee.
  const fee = ledger.find(row => row.amount === -330);
  assert.match(fee?.payee ?? '', /abn amro/i);

  // The intermediary never becomes the payee.
  assert.equal(
    ledger.some(row => /mollie/i.test(row.payee ?? '')),
    false,
  );
});

test('a second export of the same day adds nothing', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'ayq-actual-'));

  const first = await ayqImportToActual({
    dataDir,
    budgetName: 'AYQ dedup',
    accountName: 'ABN AMRO private',
    entries,
  });
  assert.equal(first.added, entries.length);

  // ABN AMRO names each export after the moment of download, so the same day
  // arrives under a different file name. The key must not depend on it.
  const reexport = await ayqParseCamt(await readFile(fixture, 'utf8'), {
    file: 'another-export-name.xml',
  });

  const again = await ayqImportAgain(
    dataDir,
    first.budgetId,
    first.accountId,
    reexport,
  );
  assert.deepEqual(again.errors, []);
  assert.equal(again.added, 0, 'nothing was added the second time');

  const ledger = await ayqReadLedger(
    dataDir,
    first.budgetId,
    first.accountId,
    '2026-05-01',
    '2026-06-30',
  );
  assert.equal(ledger.length, entries.length, 'the ledger did not double');
});
