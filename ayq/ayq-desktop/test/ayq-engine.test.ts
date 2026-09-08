// The engine half of the slice, exercised without Electron.
//
// The built engine is forked as a plain Node child and asked the same request
// the renderer sends. It answers from a real budget it opens or creates, so a
// pass here means the Actual API really ran — Electron only has to carry the
// message afterwards.

import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import type {
  AyqRequest,
  AyqResponse,
} from '../../ayq-client/src/ayq-ipc-contract.ts';

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
    env: { ...process.env, AYQ_DATA_DIR: dataDir },
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

test('the engine answers engine.status from a real budget', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'ayq-desktop-'));
  const answer = await ask({ id: 'test-1', kind: 'engine.status' }, dataDir);

  assert.equal(answer.id, 'test-1', 'the correlation id comes back untouched');
  assert.equal(answer.ok, true, `engine said: ${JSON.stringify(answer)}`);
  if (!answer.ok) return;

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

  const first = await ask({ id: 'a', kind: 'engine.status' }, dataDir);
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.equal(first.result.budgetCreated, true);

  const second = await ask({ id: 'b', kind: 'engine.status' }, dataDir);
  assert.equal(second.ok, true);
  if (!second.ok) return;

  assert.equal(second.result.budgetCreated, false, 'reopened, not recreated');
  assert.equal(second.result.budgetId, first.result.budgetId);
  assert.equal(second.result.transactionCount, 2, 'no duplicate seeding');
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
