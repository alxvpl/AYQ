// The engine half of the slice, exercised without a window.
//
// The built engine is forked as a child and asked the same request the
// renderer sends. It answers from a real budget it opens or creates, so a pass
// here means the Actual API really ran — Electron only has to carry the
// message afterwards.
//
// The child runs the Electron binary with ELECTRON_RUN_AS_NODE, not this Node.
// After `setup.mjs` the engine's SQLite binding is built for Electron's ABI,
// which is the whole point of that step; loading it into a plain Node would
// fail with ERR_DLOPEN_FAILED. Electron as Node is the same runtime the
// utilityProcess engine gets, minus the window — so this exercises the ABI
// that ships rather than a second one that does not.

import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { buildZip } from '../../ayq-camt/test/ayq-zip-writer.ts';
import type {
  AyqEngineStatus,
  AyqImportSummary,
  AyqLedger,
  AyqRequest,
  AyqResponse,
} from '../../ayq-client/src/ayq-ipc-contract.ts';

// `require('electron')` resolves to the binary's path, not to Electron's own
// module surface, which is exactly what is wanted here.
const electronPath = createRequire(import.meta.url)('electron') as string;

const enginePath = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'dist',
  'ayq-engine.js',
);

async function ask(
  request: AyqRequest,
  dataDir: string,
): Promise<AyqResponse> {
  const child = fork(enginePath, [], {
    execPath: electronPath,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      AYQ_DATA_DIR: dataDir,
    },
    stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
  });

  try {
    return await new Promise<AyqResponse>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('the engine did not answer within 120s')),
        120_000,
      );
      child.on('message', message => {
        clearTimeout(timer);
        resolve(message as AyqResponse);
      });
      child.on('error', reject);
      child.send(request);
    });
  } finally {
    child.kill();
  }
}

/** Asks for the status and insists the engine answered that, not something else. */
async function askStatus(
  id: string,
  dataDir: string,
): Promise<AyqEngineStatus> {
  const answer = await ask({ id, kind: 'engine.status' }, dataDir);
  assert.equal(answer.ok, true, `engine said: ${JSON.stringify(answer)}`);
  assert.ok(answer.ok && answer.kind === 'engine.status');
  return answer.result;
}

/** Reads the ledger and insists the engine answered that. */
async function askLedger(id: string, dataDir: string): Promise<AyqLedger> {
  const answer = await ask({ id, kind: 'transactions.list' }, dataDir);
  assert.equal(answer.ok, true, `engine said: ${JSON.stringify(answer)}`);
  assert.ok(answer.ok && answer.kind === 'transactions.list');
  return answer.result;
}

/** Imports one CAMT file and insists on an import answer. */
async function askImport(
  id: string,
  dataDir: string,
  path: string,
): Promise<AyqImportSummary> {
  const answer = await ask({ id, kind: 'import.camt', path }, dataDir);
  assert.equal(answer.ok, true, `engine said: ${JSON.stringify(answer)}`);
  assert.ok(answer.ok && answer.kind === 'import.camt');
  return answer.result;
}

test('a fresh budget is created, and it is empty', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'ayq-desktop-'));
  const answer = await ask({ id: 'test-1', kind: 'engine.status' }, dataDir);

  assert.equal(answer.id, 'test-1', 'the correlation id comes back untouched');
  assert.equal(answer.ok, true, `engine said: ${JSON.stringify(answer)}`);
  if (!answer.ok || answer.kind !== 'engine.status') return;

  const status = answer.result;
  assert.match(status.apiVersion, /^\d+\.\d+\.\d+/, 'a real API version');
  assert.equal(status.engineHost, 'node child_process fork');
  assert.equal(status.budgetCreated, true, 'nothing existed in a fresh dir');
  assert.ok(status.budgetId.length > 0);

  // Empty means empty: no demo account, no invented entries. Both numbers are
  // the engine's own, one from its spreadsheet and one from its query language.
  assert.deepEqual(status.accounts, [], 'no account was invented');
  assert.equal(status.transactionCount, 0, 'and no transaction either');
});

test('the ledger of an empty budget is empty', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'ayq-desktop-'));
  const ledger = await askLedger('empty', dataDir);

  assert.deepEqual(ledger.rows, []);
  assert.equal(ledger.total, 0);
  assert.equal(ledger.shown, 0);
});

test('a second launch reopens the budget instead of creating another', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'ayq-desktop-'));

  const first = await askStatus('a', dataDir);
  assert.equal(first.budgetCreated, true);

  const second = await askStatus('b', dataDir);
  assert.equal(second.budgetCreated, false, 'reopened, not recreated');
  assert.equal(second.budgetId, first.budgetId);
  assert.equal(second.transactionCount, 0, 'and still empty');
});

test('an unknown request kind is refused, not guessed at', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'ayq-desktop-'));
  const answer = await ask(
    { id: 'c', kind: 'engine.nonsense' } as unknown as AyqRequest,
    dataDir,
  );

  assert.equal(answer.ok, false);
  if (answer.ok) return;
  assert.equal(answer.id, 'c');
  assert.match(answer.message, /unknown request kind/);
});

/**
 * The fixture is invented, and deliberately so: a real statement never enters
 * this repository, never reaches CI and never lands in an artifact. Fourteen
 * entries, three merchants, one direct debit, one salary — all fictional.
 */
const fixture = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'ayq-camt',
  'test',
  'fixtures',
  'ayq-abn-month.xml',
);

test('a CAMT.053 file is imported through the real API', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'ayq-desktop-'));

  const before = await askStatus('before', dataDir);
  assert.equal(before.transactionCount, 0, 'the budget starts empty');

  const summary = await askImport('import-1', dataDir, fixture);

  assert.equal(summary.files, 1, 'one CAMT document in the file');
  assert.equal(summary.records, 14, 'the parser produced every entry');
  assert.equal(summary.prepared, 14, 'each record mapped to a transaction');
  assert.equal(summary.skipped, 0);
  assert.equal(summary.failed, 0);
  assert.equal(summary.imported, 14, 'the engine added all fourteen');
  assert.equal(summary.duplicates, 0, 'nothing was there to duplicate');
  assert.equal(summary.transactionCountAfter, 14);

  // The account is named from the statement's IBAN, masked: two letters and
  // the last four, so two accounts stay distinguishable without the number
  // travelling into the interface, a screenshot or a CI log.
  assert.equal(summary.accountName, 'AYQ NL…6789');
  assert.ok(summary.accountId.length > 0);
  assert.equal(summary.budgetName, 'AYQ');

  // And the transactions are really in the budget, counted by the engine's own
  // query language rather than by the summary that just claimed them.
  const after = await askStatus('after', dataDir);
  assert.equal(after.transactionCount, 14);
  assert.equal(after.accounts.length, 1, 'the one account the statement named');
  // 741.31 net across the month, balanced by the engine's spreadsheet.
  assert.equal(after.accounts[0].balanceCents, 74131);
});

test('the imported transactions come back as ledger rows', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'ayq-desktop-'));
  await askImport('fill', dataDir, fixture);

  const ledger = await askLedger('rows', dataDir);
  assert.equal(ledger.total, 14, "the engine's count, not the list's length");
  assert.equal(ledger.shown, 14);
  assert.equal(ledger.rows.length, 14);

  // Newest first, and the fixture's own month decides what that means.
  assert.deepEqual(
    ledger.rows.map(row => row.date),
    [
      '2026-06-30',
      '2026-06-27',
      '2026-06-25',
      '2026-06-24',
      '2026-06-21',
      '2026-06-18',
      '2026-06-17',
      '2026-06-14',
      '2026-06-11',
      '2026-06-09',
      '2026-06-05',
      '2026-06-04',
      '2026-06-03',
      '2026-06-02',
    ],
  );

  // The values are the fixture's, in cents, signed by CdtDbtInd.
  const [newest] = ledger.rows;
  assert.equal(newest.amountCents, -6190);
  assert.equal(newest.payee, 'Testenergie Nederland B.V.');
  assert.equal(newest.account, 'AYQ NL…6789');
  assert.ok(newest.accountId.length > 0);
  assert.equal(newest.cleared, true, 'the statement booked it');
  assert.equal(newest.category, null, 'nothing categorises anything yet');

  const salary = ledger.rows.find(row => row.amountCents > 0);
  assert.equal(salary?.date, '2026-06-24');
  assert.equal(salary?.amountCents, 125000);
  assert.equal(salary?.payee, 'Testwerkgever B.V.');

  // The counterparty is the resolver's, not the bank's string. Every card
  // entry in this fixture arrives as "BEA, Betaalpas   ALBERT HEIJN 1234,PAS42…"
  // and none of that reaches the row.
  const card = ledger.rows.find(row => row.date === '2026-06-21');
  assert.equal(card?.payee, 'Albert Heijn 1234');
  for (const row of ledger.rows) {
    assert.ok(row.payee !== null, 'every row names a counterparty');
    assert.ok(
      !/^BEA[,.]|PAS\d|Betaalpas/.test(row.payee ?? ''),
      `the raw bank description reached the ledger: ${row.payee}`,
    );
  }

  assert.equal(
    ledger.rows.reduce((total, row) => total + row.amountCents, 0),
    74131,
    'and the month adds up',
  );
});

test('a second read of an unchanged budget returns the same order', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'ayq-desktop-'));
  await askImport('fill', dataDir, fixture);

  const first = await askLedger('once', dataDir);
  const second = await askLedger('twice', dataDir);

  assert.deepEqual(
    second.rows.map(row => row.id),
    first.rows.map(row => row.id),
    'the ordering is the engine\'s, and it is total',
  );
});

test('a limit returns the newest rows, and still counts them all', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'ayq-desktop-'));
  await askImport('fill', dataDir, fixture);

  const answer = await ask(
    { id: 'limited', kind: 'transactions.list', limit: 3 },
    dataDir,
  );
  assert.ok(answer.ok && answer.kind === 'transactions.list');

  assert.equal(answer.result.shown, 3);
  assert.equal(answer.result.total, 14, 'the budget still holds fourteen');
  assert.deepEqual(
    answer.result.rows.map(row => row.date),
    ['2026-06-30', '2026-06-27', '2026-06-25'],
  );
});

test('importing the same file twice does not duplicate anything', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'ayq-desktop-'));

  const first = await askImport('once', dataDir, fixture);
  assert.equal(first.imported, 14);

  const second = await askImport('twice', dataDir, fixture);

  assert.equal(second.records, 14, 'the same file was read again in full');
  assert.equal(second.prepared, 14, 'and mapped again in full');
  assert.equal(second.imported, 0, 'but nothing new was added');
  assert.equal(second.duplicates, 14, 'every row matched one already there');
  assert.equal(second.failed, 0);
  assert.equal(
    second.transactionCountAfter,
    first.transactionCountAfter,
    'the budget holds exactly what it held before the second import',
  );
  assert.equal(second.accountId, first.accountId, 'the same account, not a new one');

  // And the ledger a person is looking at did not grow either.
  const ledger = await askLedger('after', dataDir);
  assert.equal(ledger.total, 14);
  assert.equal(ledger.rows.length, 14);
});

test('a ZIP of statements is imported without being extracted', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'ayq-desktop-'));
  const statement = await readFile(fixture, 'utf8');

  // The same fictional month, twice over, under the names an export would give
  // it. One archive, two documents, and the records inside them identical —
  // which is also why the second document adds nothing.
  const archive = join(dataDir, 'ayq-statements.zip');
  await writeFile(
    archive,
    buildZip([
      { name: 'ayq-2026-06-a.xml', content: statement },
      { name: 'nested/ayq-2026-06-b.xml', content: statement },
    ]),
  );

  const summary = await askImport('zip', dataDir, archive);

  assert.equal(summary.file, 'ayq-statements.zip');
  assert.equal(summary.files, 2, 'both documents were read out of the archive');
  assert.equal(summary.records, 28, 'and both were parsed');
  assert.equal(summary.prepared, 14, 'the second copy of each was collapsed');
  assert.equal(summary.failed, 0);
  assert.equal(summary.imported, 14, 'the fourteen distinct entries');
  assert.equal(summary.duplicates, 14, 'the second copy of each');
  assert.equal(summary.transactionCountAfter, 14);
});
