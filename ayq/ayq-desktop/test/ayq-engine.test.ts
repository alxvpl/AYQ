// The engine half of the application, exercised without a window.
//
// The built engine is forked as a child and asked the same requests the
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
//
// The fixture is invented, and deliberately so: a real statement never enters
// this repository, never reaches CI and never lands in an artifact.

import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { buildZip } from '../../ayq-camt/test/ayq-zip-writer.ts';
import type {
  AyqRequest,
  AyqRequestBody,
  AyqResponse,
  AyqResults,
} from '../../ayq-client/src/ayq-ipc-contract.ts';

// `require('electron')` resolves to the binary's path, not to Electron's own
// module surface, which is exactly what is wanted here.
const electronPath = createRequire(import.meta.url)('electron') as string;

const here = dirname(fileURLToPath(import.meta.url));
const enginePath = join(here, '..', 'dist', 'ayq-engine.js');
const fixture = join(
  here,
  '..',
  '..',
  'ayq-camt',
  'test',
  'fixtures',
  'ayq-abn-month.xml',
);

let counter = 0;

async function send(
  request: AyqRequest,
  dataDir: string,
): Promise<AyqResponse> {
  const child = fork(enginePath, [], {
    execPath: electronPath,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', AYQ_DATA_DIR: dataDir },
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
    // Waited for, not just asked for. Windows locks an open file, so a budget
    // whose engine has not finished dying can still be held when the next fork
    // tries to open it — and the next request then waits on a handle rather
    // than on an answer.
    await Promise.race([
      once(child, 'exit'),
      new Promise(resolve => setTimeout(resolve, 5_000)),
    ]);
  }
}

/**
 * Asks one question and insists the engine answered that question.
 *
 * Every test reads through this, so a response of the wrong kind — or an error
 * where a result was expected — fails where it happened rather than three
 * assertions later.
 */
async function ask<K extends keyof AyqResults>(
  dataDir: string,
  body: AyqRequestBody & { kind: K },
): Promise<AyqResults[K]> {
  counter += 1;
  const id = `test-${counter}`;
  const answer = await send({ ...body, id }, dataDir);

  assert.equal(answer.id, id, 'the correlation id comes back untouched');
  assert.equal(answer.ok, true, `engine said: ${JSON.stringify(answer)}`);
  assert.ok(answer.ok && answer.kind === body.kind);
  return answer.result as AyqResults[K];
}

async function budget(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'ayq-desktop-'));
}

test('a fresh budget is created, and it is empty', async () => {
  const dataDir = await budget();
  const status = await ask(dataDir, { kind: 'engine.status' });

  assert.match(status.apiVersion, /^\d+\.\d+\.\d+/, 'a real API version');
  assert.equal(status.engineHost, 'node child_process fork');
  assert.equal(status.budgetCreated, true, 'nothing existed in a fresh dir');
  assert.ok(status.budgetId.length > 0);
  assert.equal(status.storeVersion, 1, 'the AYQ store declares its version');

  // Empty means empty: no demo account, no invented entries.
  assert.deepEqual(await ask(dataDir, { kind: 'accounts.list' }), []);

  const ledger = await ask(dataDir, { kind: 'transactions.list' });
  assert.deepEqual(ledger.rows, []);
  assert.equal(ledger.total, 0);

  const summary = await ask(dataDir, { kind: 'summary' });
  assert.equal(summary.transactionCount, 0);
  assert.equal(summary.totalBalanceCents, 0);
  assert.equal(summary.month, null);
  assert.equal(summary.lastImportAt, null);
});

test('a second launch reopens the budget instead of creating another', async () => {
  const dataDir = await budget();

  const first = await ask(dataDir, { kind: 'engine.status' });
  assert.equal(first.budgetCreated, true);

  const second = await ask(dataDir, { kind: 'engine.status' });
  assert.equal(second.budgetCreated, false, 'reopened, not recreated');
  assert.equal(second.budgetId, first.budgetId);
});

test('an unknown request kind is refused, not guessed at', async () => {
  const dataDir = await budget();
  const answer = await send(
    { id: 'c', kind: 'engine.nonsense' } as unknown as AyqRequest,
    dataDir,
  );

  assert.equal(answer.ok, false);
  if (answer.ok) return;
  assert.equal(answer.id, 'c');
  assert.match(answer.message, /unknown request kind/);
});

test('a CAMT.053 file is imported through the real API', async () => {
  const dataDir = await budget();
  const summary = await ask(dataDir, { kind: 'import.camt', paths: [fixture] });

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

  const accounts = await ask(dataDir, { kind: 'accounts.list' });
  assert.equal(accounts.length, 1);
  // 741.31 net across the month, balanced by the engine's spreadsheet.
  assert.equal(accounts[0].balanceCents, 74131);
  assert.equal(accounts[0].transactionCount, 14);
});

test('the imported transactions come back as ledger rows', async () => {
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [fixture] });

  const ledger = await ask(dataDir, { kind: 'transactions.list' });
  assert.equal(ledger.total, 14, "the engine's count, not the list's length");
  assert.equal(ledger.rows.length, 14);

  // Newest first, and the fixture's own month decides what that means.
  assert.deepEqual(ledger.rows.map(row => row.date), [
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
  ]);

  const [newest] = ledger.rows;
  assert.equal(newest.amountCents, -6190);
  assert.equal(newest.payee, 'Testenergie Nederland B.V.');
  assert.equal(newest.account, 'AYQ NL…6789');
  assert.equal(newest.cleared, true, 'the statement booked it');
  assert.equal(newest.categoryId, null, 'nothing categorises anything yet');

  const salary = ledger.rows.find(row => row.amountCents > 0);
  assert.equal(salary?.date, '2026-06-24');
  assert.equal(salary?.amountCents, 125000);
  assert.equal(salary?.payee, 'Testwerkgever B.V.');

  // The counterparty is canonical, not the terminal's variant: six Albert
  // Heijn visits across three store numbers are one counterparty.
  const albert = ledger.rows.filter(row => row.payee === 'Albert Heijn');
  assert.equal(albert.length, 6, 'every store number collapsed into one name');

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
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [fixture] });

  const first = await ask(dataDir, { kind: 'transactions.list' });
  const second = await ask(dataDir, { kind: 'transactions.list' });

  assert.deepEqual(
    second.rows.map(row => row.id),
    first.rows.map(row => row.id),
    "the ordering is the engine's, and it is total",
  );
});

test('the ledger can be searched and filtered', async () => {
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [fixture] });

  const search = await ask(dataDir, {
    kind: 'transactions.list',
    filter: { search: 'albert' },
  });
  assert.equal(search.total, 6, 'the counterparty, case-blind');

  // What the bank said is searchable too, even though it is not shown.
  const raw = await ask(dataDir, {
    kind: 'transactions.list',
    filter: { search: 'apple pay' },
  });
  assert.equal(raw.total, 1);

  const dated = await ask(dataDir, {
    kind: 'transactions.list',
    filter: { from: '2026-06-20', to: '2026-06-27' },
  });
  assert.deepEqual(dated.rows.map(row => row.date), [
    '2026-06-27',
    '2026-06-25',
    '2026-06-24',
    '2026-06-21',
  ]);

  const uncategorised = await ask(dataDir, {
    kind: 'transactions.list',
    filter: { uncategorised: true },
  });
  assert.equal(uncategorised.total, 14, 'nothing has a category yet');

  const limited = await ask(dataDir, {
    kind: 'transactions.list',
    filter: { limit: 3 },
  });
  assert.equal(limited.shown, 3);
  assert.equal(limited.total, 14, 'the budget still holds fourteen');
});

test('a transaction explains where its name came from', async () => {
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [fixture] });

  const ledger = await ask(dataDir, { kind: 'transactions.list' });
  const card = ledger.rows.find(row => row.date === '2026-06-21');
  assert.ok(card);

  const detail = await ask(dataDir, {
    kind: 'transaction.detail',
    transactionId: card.id,
  });

  assert.equal(detail.row.payee, 'Albert Heijn');
  // The variant the terminal printed is kept, and it is not what is shown.
  assert.match(detail.importedPayee ?? '', /ALBERT HEIJN 1234/);
  assert.ok(detail.importedId && detail.importedId.length > 0);

  const provenance = detail.provenance;
  assert.ok(provenance, 'the import remembered what Actual has no field for');
  assert.equal(provenance.counterpartyKey, 'ALBERT HEIJN');
  assert.equal(provenance.resolvedBy, 'description');
  assert.equal(provenance.kind, 'card-terminal');
  assert.equal(provenance.bankTransactionCode, 'PMNT/CCRD/POSD');
  assert.equal(provenance.valueDate, '2026-06-21');
  assert.equal(provenance.file, 'ayq-abn-month.xml');

  // The direct debit carries its mandate, which is what makes it a
  // subscription rather than a habit.
  const debit = ledger.rows.find(row => row.date === '2026-06-30');
  const debitDetail = await ask(dataDir, {
    kind: 'transaction.detail',
    transactionId: debit?.id ?? '',
  });
  assert.equal(debitDetail.provenance?.kind, 'direct-debit');
  assert.ok(debitDetail.provenance?.mandateId);
});

test('a category can be set, remembered, and applied to the rest', async () => {
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [fixture] });

  const categories = await ask(dataDir, { kind: 'categories.list' });
  assert.ok(categories.length > 0, 'Actual seeds its own categories');
  const groceries = categories.find(category => !category.isIncome);
  assert.ok(groceries);

  const ledger = await ask(dataDir, { kind: 'transactions.list' });
  const albert = ledger.rows.filter(row => row.payee === 'Albert Heijn');
  assert.equal(albert.length, 6);

  // One decision, and the rule carries it to the other five.
  const updated = await ask(dataDir, {
    kind: 'transaction.categorise',
    transactionId: albert[0].id,
    categoryId: groceries.id,
    createRule: true,
  });
  assert.equal(updated.categoryId, groceries.id);

  const rules = await ask(dataDir, { kind: 'rules.list' });
  assert.equal(rules.length, 1);
  assert.equal(rules[0].counterpartyKey, 'ALBERT HEIJN');
  assert.equal(rules[0].categoryName, groceries.name);

  const after = await ask(dataDir, {
    kind: 'transactions.list',
    filter: { search: 'albert' },
  });
  assert.equal(
    after.rows.filter(row => row.categoryId === groceries.id).length,
    6,
    'every visit to that shop, not just the one that was clicked',
  );

  const others = await ask(dataDir, {
    kind: 'transactions.list',
    filter: { uncategorised: true },
  });
  assert.equal(others.total, 8, 'and nothing else was touched');

  // A category can be taken off again.
  const cleared = await ask(dataDir, {
    kind: 'transaction.categorise',
    transactionId: albert[0].id,
    categoryId: null,
  });
  assert.equal(cleared.categoryId, null);

  // Forgetting the rule leaves the categories it already set alone.
  const remaining = await ask(dataDir, {
    kind: 'rules.remove',
    ruleId: rules[0].id,
  });
  assert.deepEqual(remaining, []);
});

test('rules survive a restart and are applied to a later import', async () => {
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [fixture] });

  const categories = await ask(dataDir, { kind: 'categories.list' });
  const category = categories.find(candidate => !candidate.isIncome);
  assert.ok(category);

  const ledger = await ask(dataDir, { kind: 'transactions.list' });
  const fuel = ledger.rows.find(row => row.payee === 'Testfuel');
  assert.ok(fuel, 'the fuel stops are one counterparty too');

  await ask(dataDir, {
    kind: 'transaction.categorise',
    transactionId: fuel.id,
    categoryId: category.id,
    createRule: true,
  });

  // A new engine process, reading the store from disk.
  const rules = await ask(dataDir, { kind: 'rules.list' });
  assert.equal(rules.length, 1);

  const applied = await ask(dataDir, { kind: 'rules.apply' });
  assert.equal(applied.categorised, 0, 'the import already applied them');

  const fuelRows = await ask(dataDir, {
    kind: 'transactions.list',
    filter: { search: 'testfuel' },
  });
  assert.equal(fuelRows.total, 4);
  assert.ok(
    fuelRows.rows.every(row => row.categoryId === category.id),
    'all four, from one decision',
  );
});

test('the recurring view finds the mandate and the rhythm', async () => {
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [fixture] });

  const recurring = await ask(dataDir, { kind: 'recurring.list' });
  const names = recurring.map(entry => entry.name);

  // Six Albert Heijn visits across June are a habit with a rhythm; the salary
  // is income and belongs in the summary, not here.
  assert.ok(!names.includes('Testwerkgever B.V.'), 'income is not a subscription');
  assert.ok(recurring.length > 0, 'something recurs in a month of shopping');

  for (const entry of recurring) {
    assert.ok(entry.occurrences >= 3, 'twice is a coincidence');
    assert.ok(entry.averageAmountCents < 0, 'money going out');
    assert.ok(entry.firstDate <= entry.lastDate);
  }
});

test('the import history records what happened', async () => {
  const dataDir = await budget();
  assert.deepEqual(await ask(dataDir, { kind: 'imports.list' }), []);

  await ask(dataDir, { kind: 'import.camt', paths: [fixture] });
  await ask(dataDir, { kind: 'import.camt', paths: [fixture] });

  const history = await ask(dataDir, { kind: 'imports.list' });
  assert.equal(history.length, 2, 'both runs, newest first');
  assert.ok(history[0].at >= history[1].at);

  assert.equal(history[1].imported, 14, 'the first put fourteen in');
  assert.equal(history[0].imported, 0, 'the second put none in');
  assert.equal(history[0].duplicates, 14);
  assert.equal(history[0].file, 'ayq-abn-month.xml');
  assert.equal(history[0].accountName, 'AYQ NL…6789');

  const summary = await ask(dataDir, { kind: 'summary' });
  assert.equal(summary.lastImportAt, history[0].at);
});

test('importing the same file twice does not duplicate anything', async () => {
  const dataDir = await budget();

  const first = await ask(dataDir, { kind: 'import.camt', paths: [fixture] });
  assert.equal(first.imported, 14);

  const second = await ask(dataDir, { kind: 'import.camt', paths: [fixture] });
  assert.equal(second.records, 14, 'the same file was read again in full');
  assert.equal(second.imported, 0, 'but nothing new was added');
  assert.equal(second.duplicates, 14, 'every row matched one already there');
  assert.equal(second.transactionCountAfter, first.transactionCountAfter);
  assert.equal(second.accountId, first.accountId, 'the same account');

  const ledger = await ask(dataDir, { kind: 'transactions.list' });
  assert.equal(ledger.total, 14);
});

test('a ZIP of statements is imported without being extracted', async () => {
  const dataDir = await budget();
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

  const summary = await ask(dataDir, { kind: 'import.camt', paths: [archive] });
  assert.equal(summary.file, 'ayq-statements.zip');
  assert.equal(summary.files, 2, 'both documents were read out of the archive');
  assert.equal(summary.records, 28, 'and both were parsed');
  assert.equal(summary.prepared, 14, 'the second copy of each was collapsed');
  assert.equal(summary.imported, 14, 'the fourteen distinct entries');
  assert.equal(summary.duplicates, 14, 'the second copy of each');
  assert.equal(summary.transactionCountAfter, 14);
});

test('the summary adds up what the ledger holds', async () => {
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [fixture] });

  const summary = await ask(dataDir, { kind: 'summary' });
  assert.equal(summary.transactionCount, 14);
  assert.equal(summary.totalBalanceCents, 74131);
  assert.equal(summary.month, '2026-06');
  assert.equal(summary.monthIncomeCents, 125000);
  // Everything that went out in June: the balance minus the salary.
  assert.equal(summary.monthExpenseCents, 74131 - 125000);
  assert.equal(summary.uncategorisedCount, 14);
  assert.equal(summary.accounts.length, 1);
  assert.ok(summary.counterpartyCount >= 5, 'the shops collapsed into a few');
  assert.ok(summary.counterpartyCount < 14, 'and fewer than the rows');
});

test('what AYQ keeps survives a restart', async () => {
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [fixture] });

  const categories = await ask(dataDir, { kind: 'categories.list' });
  const category = categories.find(candidate => !candidate.isIncome);
  assert.ok(category);

  const ledger = await ask(dataDir, { kind: 'transactions.list' });
  const coffee = ledger.rows.find(row => row.payee === 'Koffiehuis De Test');
  assert.ok(coffee);
  await ask(dataDir, {
    kind: 'transaction.categorise',
    transactionId: coffee.id,
    categoryId: category.id,
    createRule: true,
  });

  // Every request above ran in its own engine process against the same
  // directory, so this is already a restart. What matters is that the file on
  // disk is the whole state: the rule, the history and the provenance.
  const store = JSON.parse(
    await readFile(join(dataDir, 'ayq-store.json'), 'utf8'),
  ) as {
    version: number;
    rules: unknown[];
    imports: unknown[];
    provenance: Record<string, unknown>;
  };

  assert.equal(store.version, 1);
  assert.equal(store.rules.length, 1);
  assert.equal(store.imports.length, 1);
  assert.equal(Object.keys(store.provenance).length, 14);

  const reopened = await ask(dataDir, { kind: 'transactions.list' });
  assert.equal(reopened.total, 14);
  assert.equal(
    reopened.rows.filter(row => row.categoryId === category.id).length,
    2,
    'both coffees, still filed where they were put',
  );
});

test('a store from a newer AYQ is refused, not overwritten', async () => {
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [fixture] });

  const path = join(dataDir, 'ayq-store.json');
  const original = await readFile(path, 'utf8');
  await writeFile(
    path,
    JSON.stringify({ ...JSON.parse(original), version: 99 }),
    'utf8',
  );

  const answer = await send(
    { id: 'newer', kind: 'transactions.list' },
    dataDir,
  );
  assert.equal(answer.ok, false, 'the engine refuses rather than guessing');
  if (answer.ok) return;
  assert.match(answer.message, /version 99/);
  assert.match(answer.message, /upgrade rather than overwrite/);

  // And it really did not touch the file.
  const after = JSON.parse(await readFile(path, 'utf8')) as { version: number };
  assert.equal(after.version, 99);
});

test('several statements can be imported in one go', async () => {
  const dataDir = await budget();
  const statement = await readFile(fixture, 'utf8');

  // Two exports of the same month, as a bank would name them. The days overlap
  // completely, which is the case that decides whether picking a whole folder
  // is safe.
  const first = join(dataDir, 'ayq-2026-06-a.xml');
  const second = join(dataDir, 'ayq-2026-06-b.xml');
  await writeFile(first, statement, 'utf8');
  await writeFile(second, statement, 'utf8');

  const summary = await ask(dataDir, {
    kind: 'import.camt',
    paths: [first, second],
  });

  assert.equal(summary.file, '2 files');
  assert.equal(summary.files, 2);
  assert.equal(summary.records, 28);
  assert.equal(summary.prepared, 14, 'the overlap was collapsed');
  assert.equal(summary.imported, 14);
  assert.equal(summary.duplicates, 14);
  assert.equal(summary.transactionCountAfter, 14);
});

test('an empty choice is refused rather than counted as an import', async () => {
  const dataDir = await budget();
  const answer = await send({ id: 'none', kind: 'import.camt', paths: [] }, dataDir);

  assert.equal(answer.ok, false);
  if (answer.ok) return;
  assert.match(answer.message, /no file was chosen/);
  assert.deepEqual(await ask(dataDir, { kind: 'imports.list' }), []);
});
