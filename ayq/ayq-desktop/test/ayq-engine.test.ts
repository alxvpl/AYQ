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

test('the engine answers engine.status from a real budget', async () => {
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

  // The engine's own query language counted these, not the test.
  assert.equal(status.transactionCount, 2);

  assert.equal(status.accounts.length, 1);
  const [account] = status.accounts;
  assert.equal(account.name, 'AYQ demo account');
  // 1250.00 in and 61.90 out, balanced by the engine's spreadsheet.
  assert.equal(account.balanceCents, 125000 - 6190);
});

test('a second launch reopens the budget instead of creating another', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'ayq-desktop-'));

  const first = await askStatus('a', dataDir);
  assert.equal(first.budgetCreated, true);

  const second = await askStatus('b', dataDir);
  assert.equal(second.budgetCreated, false, 'reopened, not recreated');
  assert.equal(second.budgetId, first.budgetId);
  assert.equal(second.transactionCount, 2, 'no duplicate seeding');
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

  // The fresh budget the engine seeds carries two invented entries; the import
  // adds to that, so the arithmetic below is stated rather than assumed.
  const before = await askStatus('before', dataDir);
  assert.equal(before.transactionCount, 2);

  const summary = await askImport('import-1', dataDir, fixture);

  assert.equal(summary.files, 1, 'one CAMT document in the file');
  assert.equal(summary.records, 14, 'the parser produced every entry');
  assert.equal(summary.prepared, 14, 'each record mapped to a transaction');
  assert.equal(summary.skipped, 0);
  assert.equal(summary.failed, 0);
  assert.equal(summary.imported, 14, 'the engine added all fourteen');
  assert.equal(summary.duplicates, 0, 'nothing was there to duplicate');
  assert.equal(summary.transactionCountAfter, 16, '2 seeded + 14 imported');

  // The account is named from the statement's IBAN, masked: two letters and
  // the last four, so two accounts stay distinguishable without the number
  // travelling into the interface, a screenshot or a CI log.
  assert.equal(summary.accountName, 'AYQ NL…6789');
  assert.ok(summary.accountId.length > 0);
  assert.equal(summary.budgetName, 'AYQ');

  // And the transactions are really in the budget, counted by the engine's own
  // query language rather than by the summary that just claimed them.
  const after = await askStatus('after', dataDir);
  assert.equal(after.transactionCount, 16);
  assert.equal(after.accounts.length, 2, 'the demo account and the imported one');
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
  assert.equal(summary.transactionCountAfter, 16, '2 seeded + 14 imported');
});
