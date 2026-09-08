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
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

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

/**
 * One engine per budget directory, kept alive between requests.
 *
 * This is what the application does: Electron starts the engine once and talks
 * to it for the life of the window. Starting a fresh Electron and reopening the
 * budget for every single question cost this file more than two minutes of
 * process startup, and it also made every request a restart — which quietly
 * turned "survives a restart" into an assertion that proved nothing, because
 * there was no other kind of call to tell it apart from. A restart is now asked
 * for by name, with `restart()`.
 */
const engines = new Map<string, EngineChild>();

type EngineChild = {
  child: ReturnType<typeof fork>;
  waiting: Map<string, (answer: AyqResponse) => void>;
};

function engineFor(dataDir: string): EngineChild {
  const running = engines.get(dataDir);
  if (running) return running;

  const child = fork(enginePath, [], {
    execPath: electronPath,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', AYQ_DATA_DIR: dataDir },
    stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
  });

  const started: EngineChild = { child, waiting: new Map() };
  child.on('message', message => {
    const answer = message as AyqResponse;
    started.waiting.get(answer.id)?.(answer);
    started.waiting.delete(answer.id);
  });
  engines.set(dataDir, started);
  return started;
}

/**
 * Stops the engine for a budget and waits for the process to be gone.
 *
 * Waited for, not just asked for. Windows locks an open file, so a budget whose
 * engine has not finished dying can still be held when the next one tries to
 * open it — and the next request then waits on a handle rather than on an
 * answer.
 */
async function restart(dataDir: string): Promise<void> {
  const running = engines.get(dataDir);
  if (!running) return;
  engines.delete(dataDir);

  running.child.kill();
  const gave = new Promise<void>(resolve => {
    // Unreferenced: a timer that outlives the tests would hold the runner open
    // long after the last assertion, which is a hang with a tidy explanation.
    const timer = setTimeout(resolve, 5_000);
    timer.unref();
  });
  await Promise.race([once(running.child, 'exit'), gave]);
}

async function send(
  request: AyqRequest,
  dataDir: string,
): Promise<AyqResponse> {
  const running = engineFor(dataDir);

  return new Promise<AyqResponse>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('the engine did not answer within 120s')),
      120_000,
    );
    running.waiting.set(request.id, answer => {
      clearTimeout(timer);
      resolve(answer);
    });
    running.child.once('error', error => {
      clearTimeout(timer);
      reject(error);
    });
    running.child.send(request);
  });
}

// Nothing this file started outlives it: an engine still running would keep the
// test runner open after the last test, which reads as a hang.
after(async () => {
  await Promise.all([...engines.keys()].map(dataDir => restart(dataDir)));
});

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

  await restart(dataDir);

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
  assert.deepEqual(
    dated.rows.map(row => row.date),
    ['2026-06-27', '2026-06-25', '2026-06-24', '2026-06-21'],
  );

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
  const groceries = categories.find(category => category.name === 'Groceries');
  assert.ok(groceries, 'AYQ seeds a category a grocery shop can go in');

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
  assert.equal(updated.row.categoryId, groceries.id);
  assert.equal(updated.row.categorySource, 'manual', 'a person chose it');

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
  assert.equal(cleared.row.categoryId, null);

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
  await restart(dataDir);
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

test('the recurring view finds a rhythm and leaves coincidences out', async () => {
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [fixture] });

  const recurring = await ask(dataDir, { kind: 'recurring.list' });

  // The fixture decides this exactly: Albert Heijn six times and Testfuel
  // four, both often enough to be a rhythm. The two coffees are twice, which
  // is a coincidence; the energy bill is once; and the salary is income, which
  // belongs in the summary rather than among the things you pay.
  assert.deepEqual(
    recurring.map(
      entry => `${entry.name} ${entry.occurrences}× ${entry.cadence}`,
    ),
    ['Albert Heijn 6× weekly', 'Testfuel 4× weekly'],
  );

  const [albert] = recurring;
  assert.equal(albert.firstDate, '2026-06-02');
  assert.equal(albert.lastDate, '2026-06-27');
  assert.equal(
    albert.nextExpectedDate,
    '2026-07-02',
    'the last date plus the median gap',
  );
  assert.equal(albert.lastAmountCents, -944);
  assert.equal(
    albert.amountVaries,
    true,
    '9.44 and 63.90 are not the same charge',
  );
  assert.equal(albert.mandateId, null, 'a card payment carries no mandate');

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

  // The engine is stopped before anything below is read, so what follows comes
  // from the files it left behind: the rule, the history and the provenance
  // have to be the whole state, or a restart loses some of it.
  await restart(dataDir);

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
  const answer = await send(
    { id: 'none', kind: 'import.camt', paths: [] },
    dataDir,
  );

  assert.equal(answer.ok, false);
  if (answer.ok) return;
  assert.match(answer.message, /no file was chosen/);
  assert.deepEqual(await ask(dataDir, { kind: 'imports.list' }), []);
});

test('a file that cannot be read is named, and the budget is left alone', async () => {
  const dataDir = await budget();
  const missing = join(dataDir, 'never-existed.xml');

  const answer = await send(
    { id: 'gone', kind: 'import.camt', paths: [missing] },
    dataDir,
  );

  assert.equal(answer.ok, false);
  if (answer.ok) return;
  assert.match(answer.message, /never-existed\.xml/, 'says which file');
  assert.match(
    answer.message,
    /no longer there/,
    'says what was wrong with it',
  );

  // Nothing was written: no import in the history, and no transactions.
  assert.deepEqual(await ask(dataDir, { kind: 'imports.list' }), []);
  assert.equal((await ask(dataDir, { kind: 'transactions.list' })).total, 0);
});

test('a file that is not CAMT is refused without touching the budget', async () => {
  const dataDir = await budget();
  const notCamt = join(dataDir, 'shopping-list.xml');
  await writeFile(notCamt, '<list><item>bread</item></list>', 'utf8');

  const answer = await send(
    { id: 'nonsense', kind: 'import.camt', paths: [notCamt] },
    dataDir,
  );

  assert.equal(answer.ok, false);
  if (answer.ok) return;
  assert.match(answer.message, /shopping-list\.xml/);
  assert.match(answer.message, /no CAMT\.053 entries/);
  assert.equal((await ask(dataDir, { kind: 'transactions.list' })).total, 0);
});

test('one unusable file does not abandon the ones beside it', async () => {
  const dataDir = await budget();
  const broken = join(dataDir, 'truncated.xml');
  await writeFile(broken, '<Document><BkToCstmrStmt>', 'utf8');
  const missing = join(dataDir, 'not-here.xml');

  const summary = await ask(dataDir, {
    kind: 'import.camt',
    paths: [broken, fixture, missing],
  });

  assert.equal(summary.imported, 14, 'the readable statement still imported');
  assert.equal(summary.transactionCountAfter, 14);

  const named = summary.problems.map(problem => problem.name).sort();
  assert.deepEqual(named, ['not-here.xml', 'truncated.xml']);
  assert.equal(summary.failed, 2, 'both are counted, and both are named');

  // And the history records the same thing the screen was told.
  const history = await ask(dataDir, { kind: 'imports.list' });
  assert.equal(history.length, 1);
  assert.equal(history[0]?.problems.length, 2);
});

test('a fresh budget has a short, usable set of categories', async () => {
  const dataDir = await budget();
  const categories = await ask(dataDir, { kind: 'categories.list' });

  const spending = categories
    .filter(category => !category.isIncome)
    .map(category => category.name)
    .sort();

  assert.deepEqual(spending, [
    'Eating out',
    'Groceries',
    'Health',
    'Housing',
    'Insurance',
    'Savings',
    'Shopping',
    'Subscriptions',
    'Transport',
    'Utilities',
  ]);

  // Actual's own placeholders are replaced rather than added to: "General" is
  // where a transaction goes to be forgotten.
  for (const placeholder of ['Food', 'General', 'Bills', 'Bills (Flexible)']) {
    assert.ok(!spending.includes(placeholder), `${placeholder} is still there`);
  }

  assert.ok(
    categories.some(category => category.isIncome),
    'and income keeps its own group',
  );
});

test('a category can be created and renamed, and its rules follow', async () => {
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [fixture] });

  const before = await ask(dataDir, { kind: 'categories.list' });
  const group = before.find(category => category.name === 'Groceries')?.groupId;
  assert.ok(group);

  const created = await ask(dataDir, {
    kind: 'categories.create',
    name: 'Coffee',
    groupId: group,
  });
  const coffee = created.find(category => category.name === 'Coffee');
  assert.ok(coffee, 'the new category is there');

  // File a counterparty into it, and remember the decision.
  const ledger = await ask(dataDir, { kind: 'transactions.list' });
  const cafe = ledger.rows.find(row => row.payee === 'Koffiehuis De Test');
  assert.ok(cafe);
  await ask(dataDir, {
    kind: 'transaction.categorise',
    transactionId: cafe.id,
    categoryId: coffee.id,
    createRule: true,
  });

  const renamed = await ask(dataDir, {
    kind: 'categories.rename',
    categoryId: coffee.id,
    name: 'Coffee and cake',
  });
  assert.ok(renamed.some(category => category.name === 'Coffee and cake'));
  assert.ok(!renamed.some(category => category.name === 'Coffee'));

  // The rule keeps a category by name, so a rename that did not move it would
  // quietly orphan it.
  const rules = await ask(dataDir, { kind: 'rules.list' });
  assert.equal(rules.length, 1);
  assert.equal(rules[0].categoryName, 'Coffee and cake');

  const applied = await ask(dataDir, { kind: 'rules.apply' });
  assert.equal(applied.categorised, 0, 'both coffees were already filed');

  const after = await ask(dataDir, {
    kind: 'transactions.list',
    filter: { search: 'koffiehuis' },
  });
  assert.ok(
    after.rows.every(row => row.category === 'Coffee and cake'),
    'and the transactions followed the name',
  );
});

test('filing one transaction offers the rest of the counterparty', async () => {
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [fixture] });

  const categories = await ask(dataDir, { kind: 'categories.list' });
  const groceries = categories.find(category => category.name === 'Groceries');
  assert.ok(groceries);

  const ledger = await ask(dataDir, { kind: 'transactions.list' });
  const albert = ledger.rows.filter(row => row.payee === 'Albert Heijn');
  assert.equal(albert.length, 6);

  // One row, by hand, with no rule: the other five stay where they were.
  const answer = await ask(dataDir, {
    kind: 'transaction.categorise',
    transactionId: albert[0].id,
    categoryId: groceries.id,
  });

  assert.equal(answer.row.categoryId, groceries.id);
  assert.equal(answer.row.categorySource, 'manual');
  assert.equal(answer.counterpartyKey, 'ALBERT HEIJN');
  assert.equal(answer.counterpartyName, 'Albert Heijn');
  assert.equal(answer.pendingForCounterparty, 5, 'the other five, exactly');
  assert.deepEqual(await ask(dataDir, { kind: 'rules.list' }), []);

  const midway = await ask(dataDir, {
    kind: 'transactions.list',
    filter: { search: 'albert' },
  });
  assert.equal(
    midway.rows.filter(row => row.categoryId === groceries.id).length,
    1,
    'nothing was filed that was not asked for',
  );

  // Accepting the offer files the rest and remembers the counterparty.
  const accepted = await ask(dataDir, {
    kind: 'transaction.categoriseCounterparty',
    counterpartyKey: 'ALBERT HEIJN',
    categoryId: groceries.id,
  });
  assert.equal(accepted.categorised, 5);

  const after = await ask(dataDir, {
    kind: 'transactions.list',
    filter: { search: 'albert' },
  });
  assert.equal(
    after.rows.filter(row => row.categoryId === groceries.id).length,
    6,
  );
  assert.equal(
    after.rows.filter(row => row.categorySource === 'manual').length,
    1,
    'the one chosen by hand is still marked as such',
  );
  assert.equal(
    after.rows.filter(row => row.categorySource === 'rule').length,
    5,
  );

  // And no other counterparty was touched because its name looks similar.
  const others = await ask(dataDir, {
    kind: 'transactions.list',
    filter: { uncategorised: true },
  });
  assert.equal(others.total, 8);
  assert.ok(
    others.rows.every(row => row.payee !== 'Albert Heijn'),
    'the shop that was filed is not among the unfiled',
  );
});

test('a rule never overwrites a category filed by hand', async () => {
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [fixture] });

  const categories = await ask(dataDir, { kind: 'categories.list' });
  const groceries = categories.find(category => category.name === 'Groceries');
  const shopping = categories.find(category => category.name === 'Shopping');
  assert.ok(groceries && shopping);

  const ledger = await ask(dataDir, { kind: 'transactions.list' });
  const albert = ledger.rows.filter(row => row.payee === 'Albert Heijn');

  // One visit is filed by hand somewhere else on purpose — a big shop that was
  // not groceries. Then the counterparty gets a rule for Groceries.
  await ask(dataDir, {
    kind: 'transaction.categorise',
    transactionId: albert[0].id,
    categoryId: shopping.id,
  });
  await ask(dataDir, {
    kind: 'transaction.categoriseCounterparty',
    counterpartyKey: 'ALBERT HEIJN',
    categoryId: groceries.id,
  });

  const after = await ask(dataDir, {
    kind: 'transactions.list',
    filter: { search: 'albert' },
  });
  const exception = after.rows.find(row => row.id === albert[0].id);
  assert.equal(exception?.category, 'Shopping', 'the correction stands');
  assert.equal(exception?.categorySource, 'manual');
  assert.equal(
    after.rows.filter(row => row.category === 'Groceries').length,
    5,
    'and the rule filed the other five',
  );

  // Applying the rules again changes nothing, however often it runs.
  assert.equal((await ask(dataDir, { kind: 'rules.apply' })).categorised, 0);
  const later = await ask(dataDir, {
    kind: 'transactions.list',
    filter: { search: 'albert' },
  });
  assert.equal(
    later.rows.find(row => row.id === albert[0].id)?.category,
    'Shopping',
  );
});

test('a changed rule re-files what it filed, and nothing else', async () => {
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [fixture] });

  const categories = await ask(dataDir, { kind: 'categories.list' });
  const groceries = categories.find(category => category.name === 'Groceries');
  const eatingOut = categories.find(category => category.name === 'Eating out');
  assert.ok(groceries && eatingOut);

  await ask(dataDir, {
    kind: 'transaction.categoriseCounterparty',
    counterpartyKey: 'ALBERT HEIJN',
    categoryId: groceries.id,
  });
  const first = await ask(dataDir, {
    kind: 'transactions.list',
    filter: { search: 'albert' },
  });
  assert.equal(
    first.rows.filter(row => row.category === 'Groceries').length,
    6,
  );

  // The person changes their mind about the whole counterparty.
  const again = await ask(dataDir, {
    kind: 'transaction.categoriseCounterparty',
    counterpartyKey: 'ALBERT HEIJN',
    categoryId: eatingOut.id,
  });
  assert.equal(again.categorised, 6, 'its own earlier work is revised');

  const after = await ask(dataDir, {
    kind: 'transactions.list',
    filter: { search: 'albert' },
  });
  assert.equal(
    after.rows.filter(row => row.category === 'Eating out').length,
    6,
  );
  assert.equal(
    (await ask(dataDir, { kind: 'rules.list' })).length,
    1,
    'one counterparty, one rule',
  );
});

test('categories survive a restart, and a re-import adds nothing', async () => {
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [fixture] });

  const categories = await ask(dataDir, { kind: 'categories.list' });
  const transport = categories.find(category => category.name === 'Transport');
  assert.ok(transport);

  const ledger = await ask(dataDir, { kind: 'transactions.list' });
  const fuel = ledger.rows.find(row => row.payee === 'Testfuel');
  assert.ok(fuel);

  await ask(dataDir, {
    kind: 'transaction.categorise',
    transactionId: fuel.id,
    categoryId: transport.id,
    createRule: true,
  });

  // The engine is stopped and started again here: the state is on disk or it
  // is gone.
  await restart(dataDir);

  const reopened = await ask(dataDir, {
    kind: 'transactions.list',
    filter: { search: 'testfuel' },
  });
  assert.equal(reopened.total, 4);
  assert.ok(
    reopened.rows.every(row => row.category === 'Transport'),
    'all four, still filed',
  );
  assert.equal(
    reopened.rows.filter(row => row.categorySource === 'manual').length,
    1,
  );

  // And importing the same statement again neither duplicates a transaction
  // nor disturbs a category.
  const second = await ask(dataDir, { kind: 'import.camt', paths: [fixture] });
  assert.equal(second.imported, 0);
  assert.equal(second.duplicates, 14);
  assert.equal(second.transactionCountAfter, 14);

  const afterReimport = await ask(dataDir, {
    kind: 'transactions.list',
    filter: { search: 'testfuel' },
  });
  assert.equal(afterReimport.total, 4);
  assert.ok(afterReimport.rows.every(row => row.category === 'Transport'));
});

test('the ledger can be narrowed to one category or one counterparty', async () => {
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [fixture] });

  const categories = await ask(dataDir, { kind: 'categories.list' });
  const groceries = categories.find(category => category.name === 'Groceries');
  assert.ok(groceries);

  await ask(dataDir, {
    kind: 'transaction.categoriseCounterparty',
    counterpartyKey: 'ALBERT HEIJN',
    categoryId: groceries.id,
  });

  const filed = await ask(dataDir, {
    kind: 'transactions.list',
    filter: { categoryId: groceries.id },
  });
  assert.equal(filed.total, 6);
  assert.ok(filed.rows.every(row => row.payee === 'Albert Heijn'));

  const unfiled = await ask(dataDir, {
    kind: 'transactions.list',
    filter: { uncategorised: true },
  });
  assert.equal(unfiled.total, 8);

  // One counterparty, by its canonical key rather than by a name that varies.
  const oneShop = await ask(dataDir, {
    kind: 'transactions.list',
    filter: { counterpartyKey: 'TESTFUEL' },
  });
  assert.equal(oneShop.total, 4);
  assert.ok(oneShop.rows.every(row => row.payee === 'Testfuel'));

  // And the two filters compose rather than fighting.
  const both = await ask(dataDir, {
    kind: 'transactions.list',
    filter: { counterpartyKey: 'ALBERT HEIJN', categoryId: groceries.id },
  });
  assert.equal(both.total, 6);
});
