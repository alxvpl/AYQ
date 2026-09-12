// What a reversal does to the totals, asked of the engine that ships.
//
// 03 §9 decides the meaning: a confirmed reversal or refund of an expense is a
// reduction of that expense and never income; sign, size, an equal and opposite
// pair, and an expense category do not prove a reversal; and Register, Reports
// and Plan state the same thing about the same transaction.
//
// Every figure below is read back from the real engine over the real IPC, from
// a real Actual budget that a real CAMT import filled — because a helper tested
// on its own can be right while the three screens still disagree, and it was
// exactly that disagreement this file exists to stop (06 §8.1).
//
// The fixture is invented (03 §6.1).

import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import type {
  AyqRequest,
  AyqRequestBody,
  AyqResponse,
  AyqResults,
} from '../../ayq-client/src/ayq-ipc-contract.ts';

/** The shipped runtime, or this Node where that binding cannot be built. */
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
  'ayq-abn-reversals.xml',
);

const MONTH = { from: '2026-06-01', to: '2026-06-30' };

type EngineChild = {
  child: ReturnType<typeof fork>;
  waiting: Map<string, (answer: AyqResponse) => void>;
};

const engines = new Map<string, EngineChild>();
let counter = 0;

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

after(async () => {
  for (const [dataDir, running] of engines) {
    engines.delete(dataDir);
    running.child.kill();
    const gave = new Promise<void>(resolve => {
      const timer = setTimeout(resolve, 5_000);
      timer.unref();
    });
    await Promise.race([once(running.child, 'exit'), gave]);
  }
});

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
    const failed = (error: Error): void => {
      clearTimeout(timer);
      running.child.off('error', failed);
      reject(error);
    };
    running.waiting.set(request.id, answer => {
      clearTimeout(timer);
      running.child.off('error', failed);
      resolve(answer);
    });
    running.child.on('error', failed);
    running.child.send(request);
  });
}

async function ask<K extends keyof AyqResults>(
  dataDir: string,
  body: AyqRequestBody & { kind: K },
): Promise<AyqResults[K]> {
  counter += 1;
  const id = `reversal-${counter}`;
  const answer = await send({ ...body, id }, dataDir);
  assert.equal(answer.id, id);
  assert.equal(answer.ok, true, `engine said: ${JSON.stringify(answer)}`);
  assert.ok(answer.ok && answer.kind === body.kind);
  return answer.result as AyqResults[K];
}

type Prepared = {
  dataDir: string;
  /** The direct debit, its reversal (RvslInd) and one more card payment. */
  energy: string;
  /** The direct debit and its reversal, the one carrying RtrInf only. */
  water: string;
  /** The card payment and the credit that carries no reversal evidence. */
  shop: string;
};

/**
 * One budget, imported and filed by hand, the way a person files it.
 *
 * The rows are found by amount because every amount in the fixture is distinct,
 * and filed with `transaction.categorise` — the request the detail pane sends.
 * No rule is learned: this is a statement about these transactions (03 §4.1).
 */
async function prepared(): Promise<Prepared> {
  const dataDir = await mkdtemp(join(tmpdir(), 'ayq-reversal-'));
  const imported = await ask(dataDir, {
    kind: 'import.camt',
    paths: [fixture],
  });
  assert.equal(imported.imported, 8, 'eight entries, all of them imported');

  const categories = await ask(dataDir, { kind: 'categories.list' });
  const expense = categories.filter(one => !one.isIncome);
  assert.ok(expense.length >= 3, 'the seed has enough expense categories');
  const [energy, water, shop] = expense;

  const ledger = await ask(dataDir, { kind: 'transactions.list' });
  const byAmount = new Map(ledger.rows.map(row => [row.amountCents, row.id]));
  const file = async (cents: number, categoryId: string): Promise<void> => {
    const transactionId = byAmount.get(cents);
    assert.ok(transactionId, `no transaction of ${cents} cents was imported`);
    await ask(dataDir, {
      kind: 'transaction.categorise',
      transactionId,
      categoryId,
      createRule: false,
    });
  };

  // The expense, its reversal, and a second unrelated expense beside them.
  await file(-4_000, energy.id);
  await file(4_000, energy.id);
  await file(-1_200, energy.id);
  // The expense and its reversal, the one the bank marked with RtrInf alone.
  await file(-2_500, water.id);
  await file(2_500, water.id);
  // The card payment, and the credit that has no reversal evidence at all.
  await file(-1_800, shop.id);
  await file(1_800, shop.id);

  return { dataDir, energy: energy.id, water: water.id, shop: shop.id };
}

function spendingOf(
  rows: readonly { categoryId: string | null; cents: number }[],
  categoryId: string,
): number {
  return rows.find(row => row.categoryId === categoryId)?.cents ?? 0;
}

test('Reports: a reversal reduces its category and is not income', async () => {
  const { dataDir, energy, water, shop } = await prepared();
  const spending = await ask(dataDir, { kind: 'spending', filter: MONTH });

  // 40.00 out, 40.00 reversed, 12.00 out: what the month cost is 12.00.
  assert.equal(
    spendingOf(spending.rows, energy),
    1_200,
    '03 §9.1: the reversal reduces the category it reverses',
  );
  // 25.00 out and 25.00 reversed is a month that cost nothing there.
  assert.equal(spendingOf(spending.rows, water), 0);
  // 18.00 out, and a credit that proves nothing: the category still cost 18.00.
  assert.equal(
    spendingOf(spending.rows, shop),
    1_800,
    '03 §9.5: an equal and opposite credit does not reduce spending',
  );

  assert.equal(spending.totalCents, 3_000, '12.00 + 0 + 18.00');
  // The salary and the unproven credit. Neither reversal is in it (§9.2).
  assert.equal(spending.incomeCents, 251_800);
  assert.equal(spending.transferCount, 0, 'one account holds no transfers');
});

test('Register: a reversal lowers Spent and never raises Received', async () => {
  const { dataDir } = await prepared();
  const ledger = await ask(dataDir, { kind: 'transactions.list' });

  assert.equal(ledger.total, 8);
  assert.equal(
    ledger.incomeCents,
    251_800,
    'Received is the salary and the unproven credit, and no reversal',
  );
  assert.equal(
    ledger.expenseCents,
    3_000,
    'Spent is 40 + 25 + 18 + 12, less the 40 and the 25 that came back',
  );
  // The money that moved is the money that moved: the rule moves a figure from
  // one side to the other and must not invent or destroy any of it.
  assert.equal(ledger.netCents, 248_800);
});

test('Plan: the month actual is AYQ’s own, not the engine’s netting', async () => {
  const { dataDir, energy, water, shop } = await prepared();
  const budget = await ask(dataDir, { kind: 'budget.month', month: '2026-06' });
  const actual = (categoryId: string): number =>
    budget.categories.find(one => one.categoryId === categoryId)?.actualCents ??
    -1;

  assert.equal(actual(energy), 1_200, 'the reversal is netted, as §9.1 says');
  assert.equal(actual(water), 0);
  assert.equal(
    actual(shop),
    1_800,
    '03 §9.5: a credit without reversal evidence does not lower the actual',
  );
});

test('Register, Reports and Plan answer the same about the same rows', async () => {
  const { dataDir, energy, water, shop } = await prepared();
  const [spending, budget] = await Promise.all([
    ask(dataDir, { kind: 'spending', filter: MONTH }),
    ask(dataDir, { kind: 'budget.month', month: '2026-06' }),
  ]);
  const ledger = await ask(dataDir, { kind: 'transactions.list' });

  for (const categoryId of [energy, water, shop]) {
    const reports = spendingOf(spending.rows, categoryId);
    const plan =
      budget.categories.find(one => one.categoryId === categoryId)
        ?.actualCents ?? -1;
    assert.equal(
      reports,
      plan,
      `03 §9.3: Reports and Plan disagree about ${categoryId}`,
    );
  }

  // And the Register's own two figures are the same statement, summed.
  assert.equal(ledger.expenseCents, spending.totalCents);
  assert.equal(ledger.incomeCents, spending.incomeCents);
});

test('an ordinary expense and an ordinary credit are untouched by the rule', async () => {
  const { dataDir } = await prepared();

  // The salary alone, asked for by the amount filter: an ordinary credit is
  // income and the whole of it.
  const salary = await ask(dataDir, {
    kind: 'transactions.list',
    filter: { minCents: 250_000 },
  });
  assert.equal(salary.total, 1);
  assert.equal(salary.incomeCents, 250_000);
  assert.equal(salary.expenseCents, 0);

  // The two card payments, which no reversal touches.
  const cards = await ask(dataDir, {
    kind: 'transactions.list',
    filter: { minCents: 1_200, maxCents: 1_800 },
  });
  assert.equal(cards.incomeCents, 1_800, 'the unproven credit is still income');
  assert.equal(cards.expenseCents, 3_000, '18.00 and 12.00 went out');
});
