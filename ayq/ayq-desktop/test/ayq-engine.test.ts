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
//
// The tests run one at a time and the file is given far longer than it needs.
// Both of those are measurements rather than preferences. What costs the time
// is creating thirty real Actual budgets, and on the Windows runner that is
// disk rather than processor: running two at once was tried and made the file
// slower — 184s to 317s — because two Electron processes writing SQLite
// contend for a disk that scans everything written to it. And the same file
// has taken anywhere from 140s to 317s on identical code depending on the
// runner, which is why its limit is nowhere near its typical duration.

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
/**
 * The binary the engine is forked with.
 *
 * Electron as Node, because that is the runtime the shipped engine gets and the
 * ABI its SQLite binding is built for. AYQ_TEST_NODE=1 forks this Node instead:
 * on a machine without the toolchain to build that binding for Electron it is
 * the difference between running these tests and not running them. CI never
 * sets it — the Windows workflow exists to prove the shipped path, and would
 * prove nothing about it on a substitute runtime.
 */
function engineBinary(): string {
  if (process.env.AYQ_TEST_NODE === '1') return process.execPath;
  return createRequire(import.meta.url)('electron') as string;
}

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

/** The invented pair that is one person's money in two of their own accounts. */
function ownAccountFixture(name: string): string {
  return join(here, '..', '..', 'ayq-camt', 'test', 'fixtures', name);
}

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
    execPath: engineBinary(),
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
  assert.equal(status.storeVersion, 4, 'the AYQ store declares its version');
  assert.equal(
    status.budgetType,
    'tracking',
    'not an envelope budget: a plan is per month and does not carry (03 §7.8)',
  );

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
  // 1,000.00 to start, as the statement says it stood, plus 741.31 net across
  // the month: the closing balance the bank itself states.
  assert.equal(accounts[0].balanceCents, 174131);
  // Fourteen — the bank's entries. The opening balance is a transaction in
  // Actual's model and is not one of them.
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
  // What the statement says the account closed at, not what its entries move.
  assert.equal(summary.totalBalanceCents, 174131);
  assert.equal(summary.month, '2026-06');
  assert.equal(summary.monthIncomeCents, 125000);
  // Everything that went out in June: the month's net minus the salary.
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
    aliases: unknown[];
  };

  assert.equal(store.version, 4);
  assert.equal(store.rules.length, 1);
  assert.deepEqual(store.aliases, [], 'nobody has aliased anything here');
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

test('a version 3 store is carried forward whole, with §7.14 s dates filled in', async () => {
  const dataDir = await budget();

  // A store exactly as version 3 wrote one: two records, neither carrying the
  // dates 03 §7.14 turns on, because version 3 had no such fields. Both start
  // well before they were written, which is the case the migration has to get
  // right — and every value here is invented.
  const v3 = {
    version: 3,
    imports: [],
    rules: [],
    provenance: {},
    decisions: {},
    aliases: [],
    accountFlags: {},
    occurrences: [],
    planned: [
      {
        id: 'plan-old-confirmed',
        name: 'Rent',
        kind: 'expense',
        amountCents: 120_000,
        categoryName: 'Housing',
        counterpartyKey: null,
        accountId: null,
        startDate: '2025-01-01',
        recurrence: { frequency: 'monthly', interval: 1 },
        endDate: null,
        state: 'confirmed',
        provenance: 'manual',
        mandateId: null,
        createdAt: '2026-05-20T09:15:00.000Z',
        updatedAt: '2026-05-20T09:15:00.000Z',
      },
      {
        id: 'plan-old-suggested',
        name: 'Testenergie',
        kind: 'expense',
        amountCents: 6_190,
        categoryName: null,
        counterpartyKey: 'testenergie',
        accountId: null,
        startDate: '2025-02-11',
        recurrence: { frequency: 'monthly', interval: 1 },
        endDate: null,
        state: 'suggested',
        provenance: 'detected',
        mandateId: null,
        createdAt: '2026-05-20T09:15:00.000Z',
        updatedAt: '2026-05-20T09:15:00.000Z',
      },
    ],
  };
  await writeFile(
    join(dataDir, 'ayq-store.json'),
    JSON.stringify(v3, null, 2),
    'utf8',
  );
  await restart(dataDir);

  const plan = await ask(dataDir, { kind: 'plan.list', today: '2026-06-15' });
  assert.equal(plan.records.length, 2, 'neither record was dropped');

  const confirmed = plan.records.find(one => one.id === 'plan-old-confirmed');
  const suggested = plan.records.find(one => one.id === 'plan-old-suggested');
  assert.ok(confirmed && suggested);
  assert.equal(
    confirmed.confirmedAt,
    '2026-05-20',
    'the day it was created is the day it was confirmed, and it is a day',
  );
  assert.equal(confirmed.suggestedAt, null, 'nobody suggested it');
  assert.equal(suggested.suggestedAt, '2026-05-20');
  assert.equal(suggested.confirmedAt, null, 'nobody has accepted it yet');

  // The future each record already had is the future it still has: monthly
  // from the migration date to the horizon, for both of them.
  const rent = plan.occurrences.filter(one => one.recordId === 'plan-old-confirmed');
  assert.equal(rent[0].dueDate, '2026-06-01');
  assert.equal(rent.at(-1)?.dueDate, '2027-06-01');
  assert.equal(rent.length, 13);
  assert.equal(
    plan.occurrences.filter(one => one.dueDate < '2026-05-20').length,
    0,
    'and seventeen months of history did not arrive as arrears (03 §7.14)',
  );

  // Reading does not rewrite the file — a read that quietly rewrites somebody's
  // store is how a downgrade eats data. The upgrade lands when something next
  // writes, and accepting the suggestion is such a write. It is also what
  // 03 §7.14 dates a confirmation from, so both are checked at once.
  const onRead = JSON.parse(
    await readFile(join(dataDir, 'ayq-store.json'), 'utf8'),
  ) as { version: number };
  assert.equal(onRead.version, 3, 'reading it left the file exactly as it was');

  const accepted = await ask(dataDir, {
    kind: 'plan.setState',
    recordId: 'plan-old-suggested',
    state: 'confirmed',
    today: '2026-06-15',
  });
  const now = accepted.records.find(one => one.id === 'plan-old-suggested');
  assert.equal(now?.state, 'confirmed');
  assert.equal(now?.confirmedAt, '2026-06-15', 'accepted today, so expected from today');
  assert.equal(
    now?.suggestedAt,
    '2026-05-20',
    'and when it was suggested is not rewritten by accepting it',
  );
  assert.equal(
    accepted.occurrences.filter(
      one => one.recordId === 'plan-old-suggested' && one.dueDate < '2026-06-15',
    ).length,
    0,
    'confirming it does not conjure up the months before the confirmation',
  );

  const store = JSON.parse(
    await readFile(join(dataDir, 'ayq-store.json'), 'utf8'),
  ) as { version: number; planned: unknown[] };
  assert.equal(store.version, 4, 'and now the file says so');
  assert.equal(store.planned.length, 2, 'with both records still in it');
});

test('the three rules 03 r004 changed, on the state they are about', async () => {
  // The same two invented files the Windows acceptance step uses, generated by
  // the same script, so what CI proves on the installed application and what
  // this proves against the engine are the same scenario and cannot drift.
  const dataDir = await budget();
  const CONF_TODAY = '2026-06-15';
  const seed = join(dataDir, 'ayq-store.json');
  const statement = join(dataDir, 'conformance.xml');
  await new Promise<void>((resolve, reject) => {
    const child = fork(
      join(here, '..', 'make-conformance-fixture.mjs'),
      [seed, statement, CONF_TODAY],
      { stdio: 'ignore' },
    );
    child.on('error', reject);
    child.on('exit', code =>
      code === 0 ? resolve() : reject(new Error(`fixture exited ${code}`)),
    );
  });
  await restart(dataDir);

  const summary = await ask(dataDir, { kind: 'import.camt', paths: [statement] });
  assert.equal(summary.imported, 4, 'the invented statement went in');

  // 03 §7.16. Both subscription payments carry the mandate the record carries,
  // both are exact, both are inside the week. Neither is applied.
  assert.equal(
    summary.matched,
    0,
    'two candidates, so AYQ does not choose — it asks (03 §7.16)',
  );
  assert.ok(
    summary.matchesWaiting >= 1,
    'and it does ask: the match is offered and waits',
  );

  const plan = await ask(dataDir, { kind: 'plan.list', today: CONF_TODAY });
  assert.equal(plan.records.length, 3, 'the version 3 store came through whole');

  const of = (id: string) => plan.occurrences.filter(one => one.recordId === id);

  // 03 §7.13. Six months unpaid, and every one of them still counts. Under the
  // rule this replaces, everything past ninety days would have disappeared.
  const overdue = of('plan-conf-overdue').filter(one => one.state === 'overdue');
  assert.ok(
    overdue.length >= 6,
    `six months of arrears are all still there, not just a quarter (${overdue.length})`,
  );
  assert.ok(
    overdue.some(one => one.dueDate < '2026-03-17'),
    'including ones older than the ninety days that used to be the cut-off',
  );

  // 03 §7.14. Suggested today out of two years of statements, and owed nothing.
  const detected = of('plan-conf-detected');
  assert.equal(
    detected.filter(one => one.state === 'overdue').length,
    0,
    'two years of history arrived as history, not as arrears (03 §7.14)',
  );
  assert.ok(detected.length > 0, 'but it does expect things from now on');
  assert.ok(
    detected.every(one => one.suggested),
    'and every one of them says it is only a suggestion (03 §7.12)',
  );

  // And the forecast counts the arrears it is supposed to count.
  const forecast = await ask(dataDir, { kind: 'forecast', today: CONF_TODAY });
  const arrears = forecast.events.filter(
    one => one.recordId === 'plan-conf-overdue',
  );
  assert.equal(arrears.length, of('plan-conf-overdue').length);
  assert.ok(
    arrears.filter(one => one.flagged).length >= 6,
    'the old ones are in the position, flagged, and dated today (03 §7.13)',
  );
  assert.ok(
    arrears.filter(one => one.flagged).every(one => one.date === CONF_TODAY),
    'as due today, because a date in the past is never subtracted from anything',
  );
  assert.equal(
    forecast.events.filter(one => one.recordId === 'plan-conf-detected' && one.flagged)
      .length,
    0,
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

test('a store that cannot be read is kept, not overwritten', async () => {
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [fixture] });

  const ledger = await ask(dataDir, { kind: 'transactions.list' });
  const coffee = ledger.rows.find(row => row.payee === 'Koffiehuis De Test');
  assert.ok(coffee);
  const categories = await ask(dataDir, { kind: 'categories.list' });
  const category = categories.find(candidate => !candidate.isIncome);
  assert.ok(category);
  await ask(dataDir, {
    kind: 'transaction.categorise',
    transactionId: coffee.id,
    categoryId: category.id,
    createRule: true,
  });

  // Truncated the way a half-written file or a bad sector leaves it.
  await restart(dataDir);
  await writeFile(
    join(dataDir, 'ayq-store.json'),
    '{"version": 1, "rules": [',
    'utf8',
  );

  const status = await ask(dataDir, { kind: 'engine.status' });
  assert.ok(status.storeDamaged, 'the engine says it had to set one aside');
  assert.match(status.storeDamaged ?? '', /^ayq-store\.damaged-/);
  assert.equal(status.budgetCreated, false, 'the budget itself still opened');

  // The unreadable file is still there under its new name, so what was in it
  // is recoverable by hand rather than gone.
  const kept = await readFile(join(dataDir, status.storeDamaged ?? ''), 'utf8');
  assert.equal(kept, '{"version": 1, "rules": [');

  // And the transactions, which are Actual's, are untouched.
  const after = await ask(dataDir, { kind: 'transactions.list' });
  assert.equal(after.total, 14);

  // The rules are gone with the file, which is the honest outcome — and the
  // fresh store must not carry a phantom of them.
  assert.deepEqual(await ask(dataDir, { kind: 'rules.list' }), []);
});

test('spending answers by category, and counts what nobody filed', async () => {
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [fixture] });

  const before = await ask(dataDir, { kind: 'spending' });
  assert.equal(before.rows.length, 1, 'nothing is filed, so there is one row');
  assert.equal(before.rows[0]?.categoryId, null);
  assert.equal(before.rows[0]?.categoryName, 'Uncategorised');
  assert.equal(before.uncategorisedCents, before.totalCents);
  assert.ok(before.incomeCents > 0, 'the salary is income, not a category');
  assert.deepEqual(before.years, ['2026']);
  assert.deepEqual(before.months, ['2026-06']);

  // Spending is stated positive, and income is never netted into it.
  assert.ok(before.totalCents > 0);

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

  const after = await ask(dataDir, { kind: 'spending' });
  const filed = after.rows.find(row => row.categoryId === transport.id);
  assert.ok(filed, 'the category it was filed in is a row now');
  assert.equal(filed.transactions, 4, 'all four fuel stops');
  assert.ok(filed.cents > 0);

  // The total did not move: filing changes where the money is attributed and
  // not how much there is.
  assert.equal(after.totalCents, before.totalCents);
  assert.equal(
    after.uncategorisedCents,
    before.totalCents - filed.cents,
    'what is left unfiled is the rest, exactly',
  );
  assert.equal(
    Math.round(after.rows.reduce((sum, row) => sum + row.share, 0) * 100),
    100,
    'the shares add up',
  );
});

test('spending narrows to a period without losing the periods on offer', async () => {
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [fixture] });

  const june = await ask(dataDir, {
    kind: 'spending',
    filter: { from: '2026-06-01', to: '2026-06-30' },
  });
  const all = await ask(dataDir, { kind: 'spending' });
  assert.equal(june.totalCents, all.totalCents, 'the fixture is one month');

  // Asked of the whole budget rather than of the period, or the control that
  // chooses a period could never leave the one it is on.
  assert.deepEqual(june.months, all.months);
  assert.deepEqual(june.years, all.years);

  const empty = await ask(dataDir, {
    kind: 'spending',
    filter: { from: '2020-01-01', to: '2020-12-31' },
  });
  assert.equal(empty.totalCents, 0);
  assert.deepEqual(empty.rows, []);
  assert.deepEqual(empty.months, all.months, 'still offers the real months');
});

test('the backlog is a list of shops, largest first, and shrinks by one decision', async () => {
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [fixture] });

  const backlog = await ask(dataDir, { kind: 'counterparties.unfiled' });

  // Fourteen transactions, but four counterparties to decide about — and the
  // salary is not among them, because income is not spending to be filed.
  assert.equal(backlog.length, 4);
  assert.ok(
    backlog.every(one => one.name !== 'Testwerkgever B.V.'),
    'what came in is not a shop to categorise',
  );

  const amounts = backlog.map(one => one.cents);
  assert.deepEqual(
    [...amounts].sort((left, right) => right - left),
    amounts,
    'largest first, because that is where the attention is worth spending',
  );

  const fuel = backlog.find(one => one.name === 'Testfuel');
  assert.ok(fuel);
  assert.equal(fuel.transactions, 4, 'every variant the bank printed, as one');
  assert.ok(fuel.firstDate <= fuel.lastDate);

  const categories = await ask(dataDir, { kind: 'categories.list' });
  const transport = categories.find(category => category.name === 'Transport');
  assert.ok(transport);

  const filed = await ask(dataDir, {
    kind: 'transaction.categoriseCounterparty',
    counterpartyKey: fuel.key,
    categoryId: transport.id,
  });
  assert.equal(filed.categorised, 4, 'one decision, all four');

  const after = await ask(dataDir, { kind: 'counterparties.unfiled' });
  assert.equal(after.length, 3, 'and the backlog is one shorter');
  assert.ok(after.every(one => one.key !== fuel.key));

  // What left the backlog arrived in the breakdown; nothing was lost between.
  const spending = await ask(dataDir, { kind: 'spending' });
  const row = spending.rows.find(one => one.categoryId === transport.id);
  assert.ok(row);
  assert.equal(row.cents, fuel.cents);
  assert.equal(
    spending.uncategorisedCents,
    after.reduce((sum, one) => sum + one.cents, 0),
    'and what is left unfiled is exactly what the backlog still lists',
  );
});

test("the balance is the bank's, not the sum of what happened to be imported", async () => {
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [fixture] });

  // The fixture states its own opening and closing balances, the way a real
  // statement does. What AYQ shows has to be the second of those: an account
  // opened at zero and filled with one month of entries would show the month's
  // net movement, which looks like a balance and is not one.
  const accounts = await ask(dataDir, { kind: 'accounts.list' });
  assert.equal(accounts.length, 1);
  assert.equal(
    accounts[0]?.balanceCents,
    174131,
    'the closing balance the statement states',
  );

  const summary = await ask(dataDir, { kind: 'summary' });
  assert.equal(summary.totalBalanceCents, 174131);

  // And the difference between the two balances is exactly what the entries
  // move, which is the bank's arithmetic agreeing with ours.
  const ledger = await ask(dataDir, { kind: 'transactions.list' });
  const moved = ledger.rows.reduce((sum, row) => sum + row.amountCents, 0);
  assert.equal(174131 - 100000, moved);
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

/* ------------------------------------------------ counterparties and aliases

   The situation these exercise is the one the automatic resolver cannot solve
   on its own: a filling station whose terminal prints TESTFUEL on some visits
   and TEST FUEL STATION on others. Nothing in the statement connects them —
   no shared IBAN, no mandate, no similarity a program has any business acting
   on — so AYQ reads two counterparties and a person says they are one.

   The fixture is invented, and so is everything asserted about it.           */

const variants = join(
  here,
  '..',
  '..',
  'ayq-camt',
  'test',
  'fixtures',
  'ayq-alias-variants.xml',
);

const later = join(
  here,
  '..',
  '..',
  'ayq-camt',
  'test',
  'fixtures',
  'ayq-alias-later.xml',
);

/** The counterparty by that key, or a failure naming what was there instead. */
function counterparty(
  list: AyqResults['counterparties.list'],
  key: string,
): AyqResults['counterparties.list']['rows'][number] {
  const found = list.rows.find(row => row.key === key);
  assert.ok(
    found,
    `no counterparty ${key}; the budget holds ${list.rows
      .map(row => row.key)
      .join(', ')}`,
  );
  return found;
}

/** Imports the two-name fixture and says the two names are one shop. */
async function aliasedBudget(dataDir: string): Promise<void> {
  await ask(dataDir, { kind: 'import.camt', paths: [variants] });
  await ask(dataDir, {
    kind: 'alias.create',
    variantKey: 'TEST FUEL STATION',
    variant: 'TEST FUEL STATION',
    counterpartyKey: 'TESTFUEL',
  });
}

test('the counterparties are grouped by who they are, not by what was printed', async () => {
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [fixture] });

  const list = await ask(dataDir, { kind: 'counterparties.list' });

  // Fourteen transactions, five counterparties. Six visits to one supermarket
  // arrived under six different raw strings and are one line.
  assert.equal(list.total, 5);
  assert.equal(list.shown, 5);

  // The key is AYQ's — normalised, so six terminal strings are one shop. The
  // name is the budget's: Actual titles the payee names it is given, and what a
  // counterparty is called on screen is its business rather than AYQ's.
  const shop = counterparty(list, 'ALBERT HEIJN');
  assert.equal(shop.name, 'Albert Heijn');
  assert.equal(shop.transactions, 6);
  assert.equal(shop.outgoingCents, 15259, "the engine's own total");
  assert.equal(shop.firstDate, '2026-06-02');
  assert.equal(shop.lastDate, '2026-06-27');
  assert.equal(shop.categoryName, null, 'nothing has been filed here yet');
  assert.equal(shop.aliases, 0);

  assert.equal(counterparty(list, 'TESTFUEL').transactions, 4);
  assert.equal(counterparty(list, 'KOFFIEHUIS DE TEST').transactions, 2);

  // Money coming in is a counterparty too, and it has spent nothing.
  const employer = counterparty(list, 'TESTWERKGEVER B V');
  assert.equal(employer.transactions, 1);
  assert.equal(employer.outgoingCents, 0);

  // Biggest spend first: a list of counterparties is read to find out where
  // the money went.
  assert.deepEqual(
    list.rows.map(row => row.key),
    [
      'TESTFUEL',
      'ALBERT HEIJN',
      'TESTENERGIE NEDERLAND B V',
      'KOFFIEHUIS DE TEST',
      'TESTWERKGEVER B V',
    ],
  );

  // And searching narrows it, by name or by key.
  const searched = await ask(dataDir, {
    kind: 'counterparties.list',
    filter: { search: 'heijn' },
  });
  assert.equal(searched.total, 1);
  assert.equal(searched.rows[0].key, 'ALBERT HEIJN');
});

test('a counterparty says what AYQ has seen it called', async () => {
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [fixture] });

  const detail = await ask(dataDir, {
    kind: 'counterparty.detail',
    key: 'ALBERT HEIJN',
  });

  assert.equal(detail.counterparty.transactions, 6);
  assert.equal(detail.variants.length, 1, 'one key, however many strings');
  assert.equal(detail.variants[0].key, 'ALBERT HEIJN');
  assert.equal(detail.variants[0].transactions, 6);
  assert.equal(detail.variants[0].aliased, false, 'the statement said so');

  // The names the terminal actually printed, which is the evidence for the
  // grouping rather than the identity itself.
  assert.deepEqual(
    [...detail.variants[0].names].sort(),
    ['ALBERT HEIJN 1234', 'ALBERT HEIJN 5678', 'ALBERT HEIJN 9012'],
  );

  assert.equal(detail.recent.length, 6, 'the newest transactions of this shop');
  assert.ok(
    detail.recent.every(row => row.payee === 'Albert Heijn'),
    'the ledger rows belong to the counterparty they were asked for',
  );
});

test('an alias moves the transactions it is true of, and no others', async () => {
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [variants] });

  const before = await ask(dataDir, { kind: 'counterparties.list' });
  assert.equal(before.total, 3, 'the resolver reads three counterparties');
  assert.equal(counterparty(before, 'TESTFUEL').transactions, 2);
  assert.equal(counterparty(before, 'TEST FUEL STATION').transactions, 2);
  assert.equal(counterparty(before, 'TESTBOEKHANDEL').transactions, 3);
  const bookshopBefore = counterparty(before, 'TESTBOEKHANDEL');

  const applied = await ask(dataDir, {
    kind: 'alias.create',
    variantKey: 'TEST FUEL STATION',
    variant: 'TEST FUEL STATION',
    counterpartyKey: 'TESTFUEL',
  });

  // Exactly the two transactions provenance proves were imported under that
  // key. Not the three from the bookshop, and not the two that were already
  // TESTFUEL and already carry the right name.
  assert.equal(applied.moved, 2);
  assert.equal(applied.counterpartyKey, 'TESTFUEL');
  assert.equal(applied.counterpartyName, 'Testfuel');
  assert.equal(applied.aliases.length, 1);
  assert.equal(applied.aliases[0].variantKey, 'TEST FUEL STATION');
  assert.equal(applied.aliases[0].counterpartyKey, 'TESTFUEL');

  const after = await ask(dataDir, { kind: 'counterparties.list' });
  assert.equal(after.total, 2, 'two counterparties became one');
  const fuel = counterparty(after, 'TESTFUEL');
  assert.equal(fuel.transactions, 4);
  assert.equal(fuel.outgoingCents, 16600, '40 + 41 + 42 + 43');
  assert.equal(fuel.firstDate, '2026-01-05');
  assert.equal(fuel.lastDate, '2026-04-05');
  assert.equal(fuel.aliases, 1);

  // The unrelated counterparty is untouched in every particular.
  assert.deepEqual(counterparty(after, 'TESTBOEKHANDEL'), bookshopBefore);

  // The ledger agrees, which is the part a person actually sees.
  const ledger = await ask(dataDir, {
    kind: 'transactions.list',
    filter: { counterpartyKey: 'TESTFUEL' },
  });
  assert.equal(ledger.total, 4);
  assert.ok(ledger.rows.every(row => row.payee === 'Testfuel'));

  const bookshop = await ask(dataDir, {
    kind: 'transactions.list',
    filter: { counterpartyKey: 'TESTBOEKHANDEL' },
  });
  assert.equal(bookshop.total, 3);
  // Not renamed, not re-cased, not touched.
  assert.ok(bookshop.rows.every(row => row.payee === 'Testboekhandel'));
});

test('an alias never rewrites what the bank sent', async () => {
  const dataDir = await budget();
  await aliasedBudget(dataDir);

  const ledger = await ask(dataDir, {
    kind: 'transactions.list',
    filter: { counterpartyKey: 'TESTFUEL' },
  });
  const moved = ledger.rows.find(row => row.date === '2026-04-05');
  assert.ok(moved, 'the transaction that was moved is in the ledger');
  assert.equal(moved.payee, 'Testfuel', 'it is filed under the chosen name');

  const detail = await ask(dataDir, {
    kind: 'transaction.detail',
    transactionId: moved.id,
  });

  // The evidence, exactly as it was imported: the key the automatic resolver
  // decided, the name it pronounced, and the string the terminal printed.
  assert.ok(detail.provenance, 'the transaction still has its provenance');
  assert.equal(detail.provenance.counterpartyKey, 'TEST FUEL STATION');
  assert.equal(detail.provenance.counterpartyName, 'TEST FUEL STATION');
  assert.equal(detail.provenance.resolvedBy, 'description');
  assert.match(detail.importedPayee ?? '', /TEST FUEL STATION/);
  assert.match(detail.provenance.description ?? '', /TEST FUEL STATION/);

  // And the variant is still listed under the counterparty it was moved to,
  // marked as a decision rather than as something the statement said.
  const counterpartyDetail = await ask(dataDir, {
    kind: 'counterparty.detail',
    key: 'TESTFUEL',
  });
  const variant = counterpartyDetail.variants.find(
    one => one.key === 'TEST FUEL STATION',
  );
  assert.ok(variant, 'the variant is not shown under the counterparty');
  assert.equal(variant.aliased, true);
  assert.equal(variant.transactions, 2);
  assert.deepEqual(variant.names, ['TEST FUEL STATION']);
});

test('an alias survives a restart, and the store carries it', async () => {
  const dataDir = await budget();
  await aliasedBudget(dataDir);

  await restart(dataDir);

  // Read from the file the engine left behind, before anything reopens it.
  const store = JSON.parse(
    await readFile(join(dataDir, 'ayq-store.json'), 'utf8'),
  ) as { version: number; aliases: Array<Record<string, string>> };
  assert.equal(store.version, 4);
  assert.equal(store.aliases.length, 1);
  assert.equal(store.aliases[0].variantKey, 'TEST FUEL STATION');
  assert.equal(store.aliases[0].counterpartyKey, 'TESTFUEL');
  assert.equal(store.aliases[0].variant, 'TEST FUEL STATION');

  const aliases = await ask(dataDir, { kind: 'aliases.list' });
  assert.equal(aliases.length, 1);
  assert.equal(aliases[0].counterpartyName, 'Testfuel');

  const list = await ask(dataDir, { kind: 'counterparties.list' });
  assert.equal(list.total, 2);
  assert.equal(counterparty(list, 'TESTFUEL').transactions, 4);
});

test('a later import of the same variant obeys the alias', async () => {
  const dataDir = await budget();
  await aliasedBudget(dataDir);
  await restart(dataDir);

  const imported = await ask(dataDir, {
    kind: 'import.camt',
    paths: [later],
  });
  assert.equal(imported.imported, 2);

  const list = await ask(dataDir, { kind: 'counterparties.list' });
  assert.equal(list.total, 2, 'nothing new appeared under the old name');
  assert.equal(counterparty(list, 'TESTFUEL').transactions, 6);

  const ledger = await ask(dataDir, {
    kind: 'transactions.list',
    filter: { counterpartyKey: 'TESTFUEL' },
  });
  assert.equal(ledger.total, 6);
  const newest = ledger.rows[0];
  assert.equal(newest.date, '2026-06-05');
  assert.equal(newest.payee, 'Testfuel', 'the person had the last word');

  // The precedence, in one pair of assertions: the automatic resolver read
  // TEST FUEL STATION out of this entry and recorded it, and the name the
  // transaction carries is the one the person chose.
  const detail = await ask(dataDir, {
    kind: 'transaction.detail',
    transactionId: newest.id,
  });
  assert.equal(detail.provenance?.counterpartyKey, 'TEST FUEL STATION');
  assert.equal(detail.provenance?.counterpartyName, 'TEST FUEL STATION');
  assert.equal(detail.row.payee, 'Testfuel');
});

test('an alias does not overwrite a category a person filed by hand', async () => {
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [variants] });

  const categories = await ask(dataDir, { kind: 'categories.list' });
  const groceries = categories.find(one => one.name === 'Groceries');
  const transport = categories.find(one => one.name === 'Transport');
  assert.ok(groceries && transport, 'the seeded categories are there');

  // One of the station's transactions is filed by hand, deliberately under a
  // category that has nothing to do with the rule below.
  const station = await ask(dataDir, {
    kind: 'transactions.list',
    filter: { counterpartyKey: 'TEST FUEL STATION' },
  });
  const byHand = station.rows[0];
  await ask(dataDir, {
    kind: 'transaction.categorise',
    transactionId: byHand.id,
    categoryId: groceries.id,
    createRule: false,
  });

  // And the counterparty it is about to join has a standing rule of its own.
  await ask(dataDir, {
    kind: 'transaction.categoriseCounterparty',
    counterpartyKey: 'TESTFUEL',
    categoryId: transport.id,
  });

  await ask(dataDir, {
    kind: 'alias.create',
    variantKey: 'TEST FUEL STATION',
    variant: 'TEST FUEL STATION',
    counterpartyKey: 'TESTFUEL',
  });

  const after = await ask(dataDir, {
    kind: 'transactions.list',
    filter: { counterpartyKey: 'TESTFUEL' },
  });
  const kept = after.rows.find(row => row.id === byHand.id);
  assert.ok(kept, 'the transaction is still there, under its new counterparty');
  assert.equal(kept.category, 'Groceries', 'a person outranks the automation');
  assert.equal(kept.categorySource, 'manual');

  // The rule did file the other three, which is the point of it.
  const filed = after.rows.filter(row => row.category === 'Transport');
  assert.equal(filed.length, 3);

  // An alias is not a rule: the counterparty has one category rule, the one it
  // had before, and aliasing wrote no second one.
  const rules = await ask(dataDir, { kind: 'rules.list' });
  assert.equal(rules.length, 1);
  assert.equal(rules[0].counterpartyKey, 'TESTFUEL');
  assert.equal(rules[0].categoryName, 'Transport');
});

test('recurring reads the counterparty a person settled on', async () => {
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [variants] });

  const before = await ask(dataDir, { kind: 'recurring.list' });
  // Two visits under each name is a coincidence, and AYQ says nothing about
  // coincidences. The bookshop's three are a rhythm.
  assert.deepEqual(
    before.map(one => one.key),
    ['TESTBOEKHANDEL'],
  );

  await ask(dataDir, {
    kind: 'alias.create',
    variantKey: 'TEST FUEL STATION',
    variant: 'TEST FUEL STATION',
    counterpartyKey: 'TESTFUEL',
  });

  const after = await ask(dataDir, { kind: 'recurring.list' });
  const fuel = after.find(one => one.key === 'TESTFUEL');
  assert.ok(fuel, 'the merged counterparty does not recur');
  assert.equal(fuel.occurrences, 4, 'the four visits are one series');
  assert.equal(fuel.cadence, 'monthly');
  assert.equal(fuel.firstDate, '2026-01-05');
  assert.equal(fuel.lastDate, '2026-04-05');
  assert.equal(fuel.name, 'Testfuel');

  // And the bookshop is exactly as it was.
  const bookshop = after.find(one => one.key === 'TESTBOEKHANDEL');
  assert.ok(bookshop);
  assert.equal(bookshop.occurrences, 3);

  // The counterparties workspace says the same thing, from the same source.
  const list = await ask(dataDir, { kind: 'counterparties.list' });
  assert.equal(counterparty(list, 'TESTFUEL').recurring, true);
});

test('an alias can be taken back, and the names go back with it', async () => {
  const dataDir = await budget();
  await aliasedBudget(dataDir);

  const aliases = await ask(dataDir, { kind: 'aliases.list' });
  const undone = await ask(dataDir, {
    kind: 'alias.remove',
    aliasId: aliases[0].id,
  });
  assert.equal(undone.aliases.length, 0);
  assert.equal(undone.moved, 2, 'the two that were moved came back');

  const list = await ask(dataDir, { kind: 'counterparties.list' });
  assert.equal(list.total, 3, 'the counterparty the resolver read is back');
  assert.equal(counterparty(list, 'TESTFUEL').transactions, 2);
  assert.equal(counterparty(list, 'TEST FUEL STATION').transactions, 2);
  assert.equal(counterparty(list, 'TESTBOEKHANDEL').transactions, 3);
});

test('an alias must point at a counterparty that exists', async () => {
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [variants] });

  const refused = await send(
    {
      id: 'nowhere',
      kind: 'alias.create',
      variantKey: 'TEST FUEL STATION',
      variant: 'TEST FUEL STATION',
      counterpartyKey: 'A SHOP NOBODY HAS EVER VISITED',
    },
    dataDir,
  );
  assert.equal(refused.ok, false);
  if (refused.ok) return;
  assert.match(refused.message, /no counterparty in this budget has that key/);

  const itself = await send(
    {
      id: 'itself',
      kind: 'alias.create',
      variantKey: 'TESTFUEL',
      variant: 'TESTFUEL 22',
      counterpartyKey: 'TESTFUEL',
    },
    dataDir,
  );
  assert.equal(itself.ok, false);
  if (itself.ok) return;
  assert.match(itself.message, /cannot be an alias of itself/);

  // Neither refusal changed anything.
  const list = await ask(dataDir, { kind: 'counterparties.list' });
  assert.equal(list.total, 3);
  assert.deepEqual(await ask(dataDir, { kind: 'aliases.list' }), []);
});

test('a damaged store loses the aliases and nothing else', async () => {
  const dataDir = await budget();
  await aliasedBudget(dataDir);
  await restart(dataDir);

  // Truncated mid-array, the way a crash during a write would leave it.
  await writeFile(
    join(dataDir, 'ayq-store.json'),
    '{"version": 2, "aliases": [',
    'utf8',
  );

  const status = await ask(dataDir, { kind: 'engine.status' });
  assert.match(
    status.storeDamaged ?? '',
    /^ayq-store\.damaged-.+\.json$/,
    'the unreadable store was kept rather than overwritten',
  );
  assert.equal(status.storeVersion, 4, 'and a fresh store took its place');

  // The transactions are Actual's and none of this was theirs to lose. Without
  // the alias the resolver's own reading is what is left, which is the honest
  // outcome: AYQ lost the decision, not the evidence.
  assert.deepEqual(await ask(dataDir, { kind: 'aliases.list' }), []);
  const ledger = await ask(dataDir, { kind: 'transactions.list' });
  assert.equal(ledger.total, 7);

  const detail = await ask(dataDir, {
    kind: 'counterparty.detail',
    key: 'TESTFUEL',
  });
  assert.equal(detail.variants.length, 0, 'the provenance went with the store');

  // A newer store is still refused rather than replaced, aliases or not.
  await restart(dataDir);
  await writeFile(
    join(dataDir, 'ayq-store.json'),
    JSON.stringify({ version: 99, aliases: [] }),
    'utf8',
  );
  const refused = await send({ id: 'newer-2', kind: 'aliases.list' }, dataDir);
  assert.equal(refused.ok, false);
  if (refused.ok) return;
  assert.match(refused.message, /version 99/);
});

/* ------------------------------------------------------------------ the plan

   Records, states and occurrences across a real engine and a real restart. The
   rhythm itself is proved in ayq-plan-series.test.ts, on invented data and in
   milliseconds; what these add is that the decisions survive the process that
   made them, which is the only part a pure test cannot show.                 */

test('a planned payment survives the process that created it', async () => {
  const dataDir = await budget();

  const saved = await ask(dataDir, {
    kind: 'plan.save',
    today: '2026-06-15',
    record: {
      name: 'Rent',
      kind: 'expense',
      amountCents: 120_000,
      categoryName: 'Housing',
      startDate: '2026-07-01',
      recurrence: { frequency: 'monthly', interval: 1 },
    },
  });

  assert.equal(saved.records.length, 1);
  const record = saved.records[0];
  assert.equal(record.name, 'Rent');
  assert.equal(record.amountCents, 120_000);
  assert.equal(
    record.state,
    'confirmed',
    'a record a person typed is one they confirmed (03 §7.7)',
  );
  assert.equal(record.provenance, 'manual');
  assert.equal(saved.today, '2026-06-15', 'the engine used the date it was given');
  assert.equal(saved.horizon, '2027-06-15', 'twelve months (03 §7.9)');
  assert.equal(saved.occurrences.length, 12);
  assert.equal(saved.occurrences[0].dueDate, '2026-07-01');
  assert.equal(saved.occurrences[0].state, 'expected');

  // A restart, not a redraw: the engine is killed and the budget reopened by a
  // new process over the same directory.
  await restart(dataDir);
  const after = await ask(dataDir, { kind: 'plan.list', today: '2026-06-15' });
  assert.equal(after.records.length, 1);
  assert.equal(after.records[0].id, record.id);
  assert.equal(after.records[0].name, 'Rent');
  assert.equal(after.occurrences.length, 12);
});

test('a record can be edited, dismissed, accepted back and removed', async () => {
  const dataDir = await budget();
  const created = await ask(dataDir, {
    kind: 'plan.save',
    today: '2026-06-15',
    record: {
      name: 'Gym',
      kind: 'expense',
      amountCents: 2_500,
      categoryName: null,
      startDate: '2026-07-05',
      recurrence: { frequency: 'monthly', interval: 1 },
    },
  });
  const id = created.records[0].id;

  const edited = await ask(dataDir, {
    kind: 'plan.save',
    today: '2026-06-15',
    record: {
      id,
      name: 'Gym membership',
      kind: 'expense',
      amountCents: 3_000,
      categoryName: 'Health',
      startDate: '2026-07-05',
      recurrence: { frequency: 'monthly', interval: 1 },
    },
  });
  assert.equal(edited.records.length, 1, 'edited, not duplicated');
  assert.equal(edited.records[0].name, 'Gym membership');
  assert.equal(edited.records[0].amountCents, 3_000);
  assert.equal(edited.records[0].categoryName, 'Health');

  const dismissed = await ask(dataDir, {
    kind: 'plan.setState',
    recordId: id,
    state: 'dismissed',
    today: '2026-06-15',
  });
  assert.equal(dismissed.records[0].state, 'dismissed');
  assert.ok(
    dismissed.occurrences.every(one => one.state === 'dismissed'),
    'a dismissed record dismisses everything it would have produced',
  );

  const back = await ask(dataDir, {
    kind: 'plan.setState',
    recordId: id,
    state: 'confirmed',
    today: '2026-06-15',
  });
  assert.equal(back.records[0].state, 'confirmed');
  assert.equal(back.occurrences[0].state, 'expected');

  const gone = await ask(dataDir, {
    kind: 'plan.remove',
    recordId: id,
    today: '2026-06-15',
  });
  assert.deepEqual(gone.records, []);
  assert.deepEqual(gone.occurrences, []);
});

test('one occurrence moves without moving the series, and survives a restart', async () => {
  const dataDir = await budget();
  const created = await ask(dataDir, {
    kind: 'plan.save',
    today: '2026-06-15',
    record: {
      name: 'Insurance',
      kind: 'expense',
      amountCents: 4_500,
      categoryName: 'Insurance',
      startDate: '2026-07-01',
      recurrence: { frequency: 'monthly', interval: 1 },
    },
  });
  const id = created.records[0].id;

  const moved = await ask(dataDir, {
    kind: 'plan.reschedule',
    recordId: id,
    dueDate: '2026-08-01',
    to: '2026-08-06',
    today: '2026-06-15',
  });
  const august = moved.occurrences.find(one => one.dueDate === '2026-08-01');
  assert.equal(august?.effectiveDate, '2026-08-06');
  assert.equal(august?.state, 'rescheduled');

  const september = moved.occurrences.find(one => one.dueDate === '2026-09-01');
  assert.equal(
    september?.effectiveDate,
    '2026-09-01',
    'the rhythm is unchanged: one late payment is not a new arrangement',
  );

  await restart(dataDir);
  const after = await ask(dataDir, { kind: 'plan.list', today: '2026-06-15' });
  assert.equal(
    after.occurrences.find(one => one.dueDate === '2026-08-01')?.effectiveDate,
    '2026-08-06',
  );

  // A date the record does not fall on is refused rather than silently stored.
  const wrong = await send(
    {
      id: 'plan-wrong-date',
      kind: 'plan.reschedule',
      recordId: id,
      dueDate: '2026-08-02',
      to: '2026-08-09',
    },
    dataDir,
  );
  assert.equal(wrong.ok, false);
  if (wrong.ok) return;
  assert.match(wrong.message, /does not fall on that date/);
});

test('a single occurrence can be struck out, and the rest stand', async () => {
  const dataDir = await budget();
  const created = await ask(dataDir, {
    kind: 'plan.save',
    today: '2026-06-15',
    record: {
      name: 'Cleaner',
      kind: 'expense',
      amountCents: 6_000,
      categoryName: null,
      startDate: '2026-07-03',
      recurrence: { frequency: 'weekly', interval: 1 },
    },
  });
  const id = created.records[0].id;

  const struck = await ask(dataDir, {
    kind: 'plan.dismissOccurrence',
    recordId: id,
    dueDate: '2026-07-10',
    dismissed: true,
    today: '2026-06-15',
  });
  assert.equal(
    struck.occurrences.find(one => one.dueDate === '2026-07-10')?.state,
    'dismissed',
  );
  assert.equal(
    struck.occurrences.find(one => one.dueDate === '2026-07-17')?.state,
    'expected',
  );
  assert.equal(struck.records[0].state, 'confirmed', 'the record itself stands');
});

test('a record is refused rather than stored wrong', async () => {
  const dataDir = await budget();
  const refusals: Array<[Record<string, unknown>, RegExp]> = [
    [{ name: '  ' }, /needs a name/],
    [{ amountCents: 0 }, /above zero/],
    [{ amountCents: -100 }, /above zero/],
    [{ startDate: '5 July' }, /YYYY-MM-DD/],
    [{ endDate: '2026-01-01' }, /before the start date/],
  ];

  let index = 0;
  for (const [broken, says] of refusals) {
    index += 1;
    const answer = await send(
      {
        id: `plan-refuse-${index}`,
        kind: 'plan.save',
        record: {
          name: 'Rent',
          kind: 'expense',
          amountCents: 1_000,
          categoryName: null,
          startDate: '2026-07-01',
          recurrence: { frequency: 'monthly', interval: 1 },
          ...broken,
        } as never,
      },
      dataDir,
    );
    assert.equal(answer.ok, false, JSON.stringify(broken));
    if (answer.ok) continue;
    assert.match(answer.message, says);
  }

  const plan = await ask(dataDir, { kind: 'plan.list', today: '2026-06-15' });
  assert.deepEqual(plan.records, [], 'nothing broken was stored');
});

test('the detection offers records, and offers them once', async () => {
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [fixture] });

  const first = await ask(dataDir, { kind: 'plan.suggest', today: '2026-06-15' });
  const rhythms = await ask(dataDir, { kind: 'recurring.list' });
  const projectable = rhythms.filter(
    one => one.cadence !== 'irregular' && one.nextExpectedDate !== null,
  );
  assert.equal(
    first.added,
    projectable.length,
    'every rhythm with a next date becomes an offer',
  );

  for (const record of first.plan.records) {
    assert.equal(record.state, 'suggested', 'an offer, not a decision');
    assert.equal(record.provenance, 'detected');
    assert.equal(record.kind, 'expense');
    assert.ok(record.amountCents > 0);
  }

  // Running it again offers nothing new: a suggestion somebody has dealt with
  // does not come back the next time an import happens.
  const again = await ask(dataDir, { kind: 'plan.suggest', today: '2026-06-15' });
  assert.equal(again.added, 0);
  assert.equal(again.plan.records.length, first.plan.records.length);

  if (first.plan.records.length === 0) return;
  const accepted = await ask(dataDir, {
    kind: 'plan.setState',
    recordId: first.plan.records[0].id,
    state: 'confirmed',
    today: '2026-06-15',
  });
  assert.equal(
    accepted.records.find(one => one.id === first.plan.records[0].id)?.provenance,
    'manual',
    'accepting an offer makes it a person s decision (03 §4.3)',
  );
});

/* ------------------------------------------------------------ available funds

   03 §7.6: only flagged accounts form available funds, the flag is the owner's
   per account, and a transfer between a flagged and an unflagged account is a
   movement of money — never income and never an expense.                     */

test('an account counts toward available funds until somebody says otherwise', async () => {
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [fixture] });

  const accounts = await ask(dataDir, { kind: 'accounts.list' });
  assert.equal(accounts.length, 1);
  assert.equal(
    accounts[0].countsTowardFunds,
    true,
    'the default, because nothing AYQ has says which kind of account it is',
  );

  const summary = await ask(dataDir, { kind: 'summary' });
  assert.equal(
    summary.availableFundsCents,
    summary.totalBalanceCents,
    'with one counting account they are the same figure',
  );
});

test('the flag is the owner’s, per account, and it survives a restart', async () => {
  const dataDir = await budget();
  await ask(dataDir, {
    kind: 'import.camt',
    paths: [ownAccountFixture('ayq-own-current.xml')],
  });
  await ask(dataDir, {
    kind: 'import.camt',
    paths: [ownAccountFixture('ayq-own-savings.xml')],
  });

  const both = await ask(dataDir, { kind: 'accounts.list' });
  assert.equal(both.length, 2, 'two accounts, from two statements');
  const savings = both.find(one => one.balanceCents > 700_000);
  const current = both.find(one => one !== savings);
  assert.ok(savings && current);

  // The bank's own arithmetic, from the statements' opening balances.
  assert.equal(current.balanceCents, 147_500);
  assert.equal(savings.balanceCents, 750_240);

  const before = await ask(dataDir, { kind: 'summary' });
  assert.equal(before.totalBalanceCents, 897_740);
  assert.equal(before.availableFundsCents, 897_740, 'both count, by default');

  const after = await ask(dataDir, {
    kind: 'accounts.setFlag',
    accountId: savings.id,
    countsTowardFunds: false,
  });
  assert.equal(
    after.find(one => one.id === savings.id)?.countsTowardFunds,
    false,
  );
  assert.equal(
    after.find(one => one.id === current.id)?.countsTowardFunds,
    true,
    'one account at a time; the others are not touched',
  );

  const narrowed = await ask(dataDir, { kind: 'summary' });
  assert.equal(
    narrowed.totalBalanceCents,
    897_740,
    'the money is all still there',
  );
  assert.equal(
    narrowed.availableFundsCents,
    147_500,
    'but only the flagged account is available to spend (03 §7.6)',
  );

  await restart(dataDir);
  const kept = await ask(dataDir, { kind: 'summary' });
  assert.equal(kept.availableFundsCents, 147_500, 'the decision outlived the process');
});

test('money moved between two of the owner’s own accounts is neither income nor expense', async () => {
  const dataDir = await budget();
  await ask(dataDir, {
    kind: 'import.camt',
    paths: [ownAccountFixture('ayq-own-current.xml')],
  });
  await ask(dataDir, {
    kind: 'import.camt',
    paths: [ownAccountFixture('ayq-own-savings.xml')],
  });

  // Four transactions: the 500 out, the 500 in, a 25.00 card payment and 2.40
  // of interest. The opening balances are the account's starting point and are
  // not transactions of the bank's.
  const ledger = await ask(dataDir, { kind: 'transactions.list' });
  assert.equal(ledger.total, 4, 'both sides of the transfer are still in the ledger');

  const spending = await ask(dataDir, { kind: 'spending' });
  assert.equal(
    spending.transferCount,
    2,
    'both halves of the transfer were recognised and left out',
  );
  assert.equal(
    spending.totalCents,
    2_500,
    'the 25.00 card payment, and not the 500.00 that only changed accounts',
  );
  assert.equal(
    spending.incomeCents,
    240,
    'the interest is income; the 500.00 arriving is money that was already there',
  );

  const summary = await ask(dataDir, { kind: 'summary' });
  assert.equal(summary.transactionCount, 4);
  assert.equal(summary.month, '2026-08');
  assert.equal(summary.monthIncomeCents, 240);
  assert.equal(summary.monthExpenseCents, -2_500);
  assert.equal(
    summary.uncategorisedCount,
    2,
    'a transfer is not a thing waiting to be filed',
  );

  const backlog = await ask(dataDir, { kind: 'counterparties.unfiled' });
  assert.ok(
    backlog.every(one => !one.name.includes('TESTPERSOON')),
    'and it is not offered a category either',
  );
  assert.equal(backlog.length, 1, 'only the shop is waiting');
});

test('one account on its own has nobody to transfer to', async () => {
  // The rule needs two accounts to mean anything, and a budget with one must
  // not start calling ordinary payments transfers because a counterparty IBAN
  // happens to be there.
  const dataDir = await budget();
  await ask(dataDir, {
    kind: 'import.camt',
    paths: [ownAccountFixture('ayq-own-current.xml')],
  });

  const spending = await ask(dataDir, { kind: 'spending' });
  assert.equal(spending.transferCount, 0);
  assert.equal(
    spending.totalCents,
    52_500,
    'both payments count, because both left the money',
  );
});

/* ------------------------------------------------------------- monthly plan

   Actual's capability, used rather than duplicated (02 §5.1) — and used only
   because the tracking budget's per-month arithmetic is 03 §7.8 exactly. The
   test that matters is the one that would catch it if that stopped being true:
   an unused remainder must not appear in the next month.                     */

test('a category plan is per month, and does not carry into the next', async () => {
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [fixture] });
  const categories = await ask(dataDir, { kind: 'categories.list' });
  const groceries = categories.find(one => one.name === 'Groceries');
  assert.ok(groceries);

  const august = await ask(dataDir, {
    kind: 'budget.setPlan',
    month: '2026-08',
    categoryId: groceries.id,
    cents: 20_000,
  });
  const september = await ask(dataDir, {
    kind: 'budget.setPlan',
    month: '2026-09',
    categoryId: groceries.id,
    cents: 20_000,
  });

  const row = (answer: typeof august) =>
    answer.categories.find(one => one.categoryId === groceries.id);

  assert.equal(row(august)?.planCents, 20_000);
  assert.equal(row(august)?.actualCents, 0, 'nothing was spent in August');
  assert.equal(row(august)?.remainingCents, 20_000);
  assert.equal(
    row(september)?.remainingCents,
    20_000,
    'September is its own month: August s unused plan is not added to it (03 §7.8)',
  );

  // And the plan is Actual's, so it is there after a restart without AYQ
  // keeping a second copy of it anywhere.
  await restart(dataDir);
  const again = await ask(dataDir, { kind: 'budget.month', month: '2026-08' });
  assert.equal(
    again.categories.find(one => one.categoryId === groceries.id)?.planCents,
    20_000,
  );
});

test('the plan is measured against what actually happened', async () => {
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [fixture] });
  const categories = await ask(dataDir, { kind: 'categories.list' });
  const groceries = categories.find(one => one.name === 'Groceries');
  assert.ok(groceries);

  // File the fixture's supermarket, which is six transactions in June 2026.
  const unfiled = await ask(dataDir, { kind: 'counterparties.unfiled' });
  const shop = unfiled.find(one => one.transactions === 6);
  assert.ok(shop, 'the fixture s supermarket');
  await ask(dataDir, {
    kind: 'transaction.categoriseCounterparty',
    counterpartyKey: shop.key,
    categoryId: groceries.id,
  });

  const under = await ask(dataDir, {
    kind: 'budget.setPlan',
    month: '2026-06',
    categoryId: groceries.id,
    cents: 20_000,
  });
  const row = under.categories.find(one => one.categoryId === groceries.id);
  assert.equal(row?.planCents, 20_000);
  assert.equal(
    row?.actualCents,
    shop.cents,
    'the actual is the spending the ledger already knows about, stated positive',
  );
  assert.equal(row?.remainingCents, 20_000 - shop.cents);
  assert.equal(row?.overspentCents, 0);

  // And overspending is said out loud rather than folded into a negative
  // remainder, which 03 §7.8 explicitly does not want.
  const over = await ask(dataDir, {
    kind: 'budget.setPlan',
    month: '2026-06',
    categoryId: groceries.id,
    cents: 1_000,
  });
  const tight = over.categories.find(one => one.categoryId === groceries.id);
  assert.equal(tight?.remainingCents, 0, 'never below zero');
  assert.equal(tight?.overspentCents, shop.cents - 1_000);
});

test('a month or a plan that makes no sense is refused', async () => {
  const dataDir = await budget();
  const categories = await ask(dataDir, { kind: 'categories.list' });

  const wrongMonth = await send(
    { id: 'budget-bad-month', kind: 'budget.month', month: '2026-6' },
    dataDir,
  );
  assert.equal(wrongMonth.ok, false);
  if (!wrongMonth.ok) assert.match(wrongMonth.message, /YYYY-MM/);

  const negative = await send(
    {
      id: 'budget-negative',
      kind: 'budget.setPlan',
      month: '2026-06',
      categoryId: categories[0].id,
      cents: -100,
    },
    dataDir,
  );
  assert.equal(negative.ok, false);
  if (!negative.ok) assert.match(negative.message, /not negative/);
});

/* --------------------------------------------------------------- the forecast

   The arithmetic is proved on invented data in ayq-forecast.test.ts. What this
   adds is that the engine gathers the right things to hand it: the flagged
   accounts' balances, the records, and Actual's own per-month plan.          */

test('the forecast starts from available funds and takes the plan and the records', async () => {
  const dataDir = await budget();
  await ask(dataDir, {
    kind: 'import.camt',
    paths: [ownAccountFixture('ayq-own-current.xml')],
  });
  await ask(dataDir, {
    kind: 'import.camt',
    paths: [ownAccountFixture('ayq-own-savings.xml')],
  });

  const categories = await ask(dataDir, { kind: 'categories.list' });
  const groceries = categories.find(one => one.name === 'Groceries');
  assert.ok(groceries);
  await ask(dataDir, {
    kind: 'budget.setPlan',
    month: '2026-10',
    categoryId: groceries.id,
    cents: 40_000,
  });
  await ask(dataDir, {
    kind: 'plan.save',
    record: {
      name: 'Rent',
      kind: 'expense',
      amountCents: 120_000,
      categoryName: 'Housing',
      startDate: '2026-10-01',
      recurrence: { frequency: 'monthly', interval: 1 },
      endDate: '2026-10-01',
    },
  });

  const started = Date.now();
  const answer = await ask(dataDir, { kind: 'forecast', today: '2026-09-15' });
  process.stdout.write(
    `[ayq-test] forecast over 13 months: ${Date.now() - started} ms\n`,
  );

  assert.equal(answer.today, '2026-09-15');
  assert.equal(answer.horizon, '2027-09-15');
  assert.equal(
    answer.availableFundsCents,
    897_740,
    'both accounts count, so far',
  );
  assert.equal(answer.months.length, 13);

  const october = answer.months.find(one => one.month === '2026-10');
  assert.equal(
    october?.expectedExpenseCents,
    160_000,
    'the 40 000 plan and the 120 000 rent, which is in another category',
  );
  assert.equal(answer.closingCents, 897_740 - 160_000);

  // And the flag reaches it: turning the savings account off has to move the
  // position it starts from, or the flag is decoration.
  const accounts = await ask(dataDir, { kind: 'accounts.list' });
  const savings = accounts.find(one => one.balanceCents > 700_000);
  assert.ok(savings);
  await ask(dataDir, {
    kind: 'accounts.setFlag',
    accountId: savings.id,
    countsTowardFunds: false,
  });

  const narrowed = await ask(dataDir, { kind: 'forecast', today: '2026-09-15' });
  assert.equal(narrowed.availableFundsCents, 147_500);
  assert.equal(narrowed.closingCents, 147_500 - 160_000);
  assert.equal(
    narrowed.lowest.balanceCents,
    147_500 - 160_000,
    'and the forecast says so: this goes negative in October',
  );
});

test('a month Actual keeps no budget for holds no plan, and says it cannot take one', async () => {
  // Actual builds budget months for a fixed range and its own API refuses the
  // rest — exclusive of the last month, so the twelfth month ahead is readable
  // and not plannable. AYQ answers with the truth about it rather than an
  // error, and refuses a plan there with a reason.
  const dataDir = await budget();
  const months = await ask(dataDir, { kind: 'budget.month', month: '2026-09' });
  assert.equal(months.editable, true);

  const far = await ask(dataDir, { kind: 'budget.month', month: '2099-01' });
  assert.equal(far.editable, false);
  assert.equal(far.totalPlanCents, 0);
  assert.ok(far.categories.length > 0, 'the categories are still listed');
  assert.ok(far.categories.every(one => one.planCents === 0));

  const refused = await send(
    {
      id: 'budget-out-of-range',
      kind: 'budget.setPlan',
      month: '2099-01',
      categoryId: far.categories[0].categoryId,
      cents: 1_000,
    },
    dataDir,
  );
  assert.equal(refused.ok, false);
  if (refused.ok) return;
  assert.match(refused.message, /no month 2099-01 to plan in/);
});

/* ------------------------------------------------------ matching, end to end

   What counts as a match is proved on invented data in ayq-match.test.ts. What
   these add is the part that needs a real budget: that a match is stored, that
   it takes the payment out of the forecast, that a person's decision is not
   overwritten, and that matching by hand teaches AYQ enough to do it itself
   next time (04 A6).                                                        */

/** The fixture's monthly direct debit: 61.90 on 30 June 2026. */
const ENERGY_CENTS = 6_190;
const ENERGY_DATE = '2026-06-30';

async function budgetWithEnergyPlan(dataDir: string): Promise<string> {
  await ask(dataDir, { kind: 'import.camt', paths: [fixture] });
  const plan = await ask(dataDir, {
    kind: 'plan.save',
    today: ENERGY_DATE,
    record: {
      name: 'Energy',
      kind: 'expense',
      amountCents: ENERGY_CENTS,
      categoryName: 'Utilities',
      startDate: ENERGY_DATE,
      recurrence: { frequency: 'monthly', interval: 1 },
    },
  });
  return plan.records[0].id;
}

test('a payment typed by hand is offered a match, not given one', async () => {
  const dataDir = await budget();
  const recordId = await budgetWithEnergyPlan(dataDir);

  const found = await ask(dataDir, {
    kind: 'match.propose',
    today: ENERGY_DATE,
  });
  assert.equal(
    found.applied,
    0,
    'nothing identifies the counterparty yet, so nothing is applied',
  );
  assert.equal(found.proposals.length, 1);

  const proposal = found.proposals[0];
  assert.equal(proposal.recordId, recordId);
  assert.equal(proposal.dueDate, ENERGY_DATE);
  assert.equal(proposal.transactionAmountCents, -ENERGY_CENTS);
  assert.equal(proposal.daysApart, 0);
  assert.equal(proposal.confident, false);
  assert.deepEqual(proposal.evidence, ['the same amount', 'the same day']);
});

test('matching by hand takes it out of the forecast, and teaches AYQ the counterparty', async () => {
  const dataDir = await budget();
  const recordId = await budgetWithEnergyPlan(dataDir);
  const proposal = (
    await ask(dataDir, { kind: 'match.propose', today: ENERGY_DATE })
  ).proposals[0];

  const before = await ask(dataDir, { kind: 'forecast', today: ENERGY_DATE });
  assert.ok(
    before.events.some(one => one.date === ENERGY_DATE && one.label === 'Energy'),
    'it is expected before it is matched',
  );

  const matched = await ask(dataDir, {
    kind: 'match.apply',
    recordId,
    dueDate: ENERGY_DATE,
    transactionId: proposal.transactionId,
    today: ENERGY_DATE,
  });
  const occurrence = matched.plan.occurrences.find(
    one => one.dueDate === ENERGY_DATE,
  );
  assert.equal(occurrence?.state, 'matched');
  assert.equal(occurrence?.matchProvenance, 'manual');
  assert.equal(occurrence?.matchedTransactionId, proposal.transactionId);

  const after = await ask(dataDir, { kind: 'forecast', today: ENERGY_DATE });
  assert.ok(
    !after.events.some(one => one.date === ENERGY_DATE && one.label === 'Energy'),
    'a matched payment has happened, and stops being expected (03 §7.3)',
  );

  // The transaction is untouched: matching is a statement about the expectation,
  // not an edit to the ledger.
  const ledger = await ask(dataDir, { kind: 'transactions.list' });
  assert.equal(ledger.total, 14);

  // And the record learned who it is paid to, which is what makes next month
  // automatic. It had no counterparty when it was typed.
  const record = matched.plan.records.find(one => one.id === recordId);
  assert.ok(
    record?.counterpartyKey,
    'the key came from the transaction the person pointed at',
  );

  await restart(dataDir);
  const kept = await ask(dataDir, { kind: 'plan.list', today: ENERGY_DATE });
  assert.equal(
    kept.occurrences.find(one => one.dueDate === ENERGY_DATE)?.state,
    'matched',
    'and it outlived the process that decided it',
  );
});

test('once AYQ knows the counterparty it matches by itself, and never over a person', async () => {
  const dataDir = await budget();
  const recordId = await budgetWithEnergyPlan(dataDir);
  const proposal = (
    await ask(dataDir, { kind: 'match.propose', today: ENERGY_DATE })
  ).proposals[0];
  await ask(dataDir, {
    kind: 'match.apply',
    recordId,
    dueDate: ENERGY_DATE,
    transactionId: proposal.transactionId,
    today: ENERGY_DATE,
  });

  // Undone, so the same evidence is on the table again — but now the record
  // carries the counterparty the person's decision taught it.
  await ask(dataDir, {
    kind: 'match.unmatch',
    recordId,
    dueDate: ENERGY_DATE,
    today: ENERGY_DATE,
  });
  const again = await ask(dataDir, {
    kind: 'match.propose',
    today: ENERGY_DATE,
  });
  assert.equal(again.applied, 1, 'the counterparty agrees, the amount is exact');
  assert.deepEqual(again.proposals, [], 'and there is nothing left to ask');
  const occurrence = again.plan.occurrences.find(
    one => one.dueDate === ENERGY_DATE,
  );
  assert.equal(occurrence?.state, 'matched');
  assert.equal(occurrence?.matchProvenance, 'automatic');

  // A person's match is never overwritten by a later pass (03 §4.4). Matched by
  // hand, then asked again: it stays theirs.
  await ask(dataDir, {
    kind: 'match.apply',
    recordId,
    dueDate: ENERGY_DATE,
    transactionId: proposal.transactionId,
    today: ENERGY_DATE,
  });
  const third = await ask(dataDir, {
    kind: 'match.propose',
    today: ENERGY_DATE,
  });
  assert.equal(
    third.plan.occurrences.find(one => one.dueDate === ENERGY_DATE)
      ?.matchProvenance,
    'manual',
  );
});

test('a refused pairing is not offered again', async () => {
  const dataDir = await budget();
  const recordId = await budgetWithEnergyPlan(dataDir);
  const proposal = (
    await ask(dataDir, { kind: 'match.propose', today: ENERGY_DATE })
  ).proposals[0];

  await ask(dataDir, {
    kind: 'match.reject',
    recordId,
    dueDate: ENERGY_DATE,
    transactionId: proposal.transactionId,
    today: ENERGY_DATE,
  });

  const again = await ask(dataDir, {
    kind: 'match.propose',
    today: ENERGY_DATE,
  });
  assert.deepEqual(again.proposals, [], 'the refusal stands');
  assert.equal(again.applied, 0);

  await restart(dataDir);
  const later = await ask(dataDir, {
    kind: 'match.propose',
    today: ENERGY_DATE,
  });
  assert.deepEqual(later.proposals, [], 'and it outlived the process');
});

test('an import looks for matches by itself, and says what it found', async () => {
  const dataDir = await budget();
  const recordId = await budgetWithEnergyPlan(dataDir);
  const proposal = (
    await ask(dataDir, { kind: 'match.propose', today: ENERGY_DATE })
  ).proposals[0];
  await ask(dataDir, {
    kind: 'match.apply',
    recordId,
    dueDate: ENERGY_DATE,
    transactionId: proposal.transactionId,
    today: ENERGY_DATE,
  });
  await ask(dataDir, {
    kind: 'match.unmatch',
    recordId,
    dueDate: ENERGY_DATE,
    today: ENERGY_DATE,
  });

  // The second import adds nothing, and the matching pass that runs with it is
  // the one under test: it has the counterparty now, so it applies the match
  // without anybody asking.
  const summary = await ask(dataDir, { kind: 'import.camt', paths: [fixture] });
  assert.equal(summary.imported, 0, 'still nothing new to import');
  assert.equal(summary.matched, 1, 'and one expected payment turned out to be one');
  assert.equal(summary.matchesWaiting, 0);
});

test('one transaction cannot be two expected payments', async () => {
  const dataDir = await budget();
  const recordId = await budgetWithEnergyPlan(dataDir);
  const proposal = (
    await ask(dataDir, { kind: 'match.propose', today: ENERGY_DATE })
  ).proposals[0];
  await ask(dataDir, {
    kind: 'match.apply',
    recordId,
    dueDate: ENERGY_DATE,
    transactionId: proposal.transactionId,
    today: ENERGY_DATE,
  });

  const second = await ask(dataDir, {
    kind: 'plan.save',
    today: ENERGY_DATE,
    record: {
      name: 'Something else',
      kind: 'expense',
      amountCents: ENERGY_CENTS,
      categoryName: null,
      startDate: ENERGY_DATE,
      recurrence: { frequency: 'once', interval: 1 },
    },
  });
  const other = second.records.find(one => one.name === 'Something else');
  assert.ok(other);

  const refused = await send(
    {
      id: 'match-double',
      kind: 'match.apply',
      recordId: other.id,
      dueDate: ENERGY_DATE,
      transactionId: proposal.transactionId,
    },
    dataDir,
  );
  assert.equal(refused.ok, false);
  if (refused.ok) return;
  assert.match(refused.message, /already matched to another expected payment/);
});

/* ------------------------------------------------------------- the worksheet

   Categories down, one month across. The plan and the actual are Actual's; what
   is still expected is the forecast's own figure for that month, read rather
   than recomputed, so this screen and Upcoming cannot disagree (04 A9).      */

test('the sheet shows the plan, the actual, what is left and what is still expected', async () => {
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [fixture] });
  const categories = await ask(dataDir, { kind: 'categories.list' });
  const groceries = categories.find(one => one.name === 'Groceries');
  assert.ok(groceries);

  // File the fixture's supermarket into Groceries, in June 2026.
  const unfiled = await ask(dataDir, { kind: 'counterparties.unfiled' });
  const shop = unfiled.find(one => one.transactions === 6);
  assert.ok(shop);
  await ask(dataDir, {
    kind: 'transaction.categoriseCounterparty',
    counterpartyKey: shop.key,
    categoryId: groceries.id,
  });
  await ask(dataDir, {
    kind: 'budget.setPlan',
    month: '2026-06',
    categoryId: groceries.id,
    cents: 20_000,
  });

  const sheet = await ask(dataDir, {
    kind: 'plan.month',
    month: '2026-06',
    today: '2026-06-15',
  });
  assert.equal(sheet.month, '2026-06');
  assert.equal(sheet.editable, true);
  assert.ok(sheet.months.includes('2026-06'));

  const row = sheet.rows.find(one => one.categoryId === groceries.id);
  assert.equal(row?.planCents, 20_000);
  assert.equal(row?.actualCents, shop.cents);
  assert.equal(row?.remainingCents, 20_000 - shop.cents);
  assert.equal(
    row?.expectedCents,
    20_000 - shop.cents,
    'what is left of the plan is what is still expected from it',
  );

  // And the sheet agrees with the forecast about the month, because it is the
  // same figure: one set of records, read two ways (04 A9).
  const forecast = await ask(dataDir, { kind: 'forecast', today: '2026-06-15' });
  assert.equal(
    forecast.months.find(one => one.month === '2026-06')?.expectedExpenseCents,
    sheet.totalExpectedCents,
  );
});

test('a plan and a record in one category are not counted twice on the sheet', async () => {
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [fixture] });
  const categories = await ask(dataDir, { kind: 'categories.list' });
  const housing = categories.find(one => one.name === 'Housing');
  assert.ok(housing);

  await ask(dataDir, {
    kind: 'budget.setPlan',
    month: '2026-10',
    categoryId: housing.id,
    cents: 150_000,
  });
  await ask(dataDir, {
    kind: 'plan.save',
    today: '2026-09-15',
    record: {
      name: 'Rent',
      kind: 'expense',
      amountCents: 120_000,
      categoryName: 'Housing',
      startDate: '2026-10-01',
      recurrence: { frequency: 'once', interval: 1 },
    },
  });

  const sheet = await ask(dataDir, {
    kind: 'plan.month',
    month: '2026-10',
    today: '2026-09-15',
  });
  const row = sheet.rows.find(one => one.categoryId === housing.id);
  assert.equal(row?.planCents, 150_000);
  assert.equal(
    row?.expectedCents,
    150_000,
    'the larger of the plan and the record, not their sum (03 §7.8)',
  );
});

test('a month with no budget can be read and not planned in', async () => {
  const dataDir = await budget();
  const far = await ask(dataDir, {
    kind: 'plan.month',
    month: '2099-01',
    today: '2026-09-15',
  });
  assert.equal(far.editable, false);
  assert.equal(far.totalPlanCents, 0);
  assert.ok(far.rows.length > 0);
});
