// The harness every engine test file drives the real engine through.
//
// Extracted from `ayq-engine.test.ts` when that file grew past the runner's
// per-file timeout on Windows. The timeout is per file and `node --test` gives
// each file its own process, so the durable fix for a suite that keeps growing
// is more files rather than a larger number — and a shared harness is what
// makes a second file cost three lines instead of two hundred.
//
// The built engine is forked as a child and asked the same requests the
// renderer sends. It answers from a real budget it opens or creates, so a pass
// means the Actual API really ran — Electron only has to carry the message
// afterwards.
//
// The child runs the Electron binary with ELECTRON_RUN_AS_NODE, not this Node.
// After `setup.mjs` the engine's SQLite binding is built for Electron's ABI,
// which is the whole point of that step; loading it into a plain Node would
// fail with ERR_DLOPEN_FAILED. Electron as Node is the same runtime the
// utilityProcess engine gets, minus the window — so this exercises the ABI
// that ships rather than a second one that does not.
//
// The fixtures are invented, and deliberately so: a real statement never enters
// this repository, never reaches CI and never lands in an artifact.

import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after } from 'node:test';
import { fileURLToPath } from 'node:url';

import { buildZip } from '../../ayq-camt/test/ayq-zip-writer.ts';
// The version the code actually declares. Written as a number here once, this
// file passed for two store versions without anybody noticing it was not being
// run — a test that asserts a constant it does not read is a test that has to
// be edited every time the constant moves, and one that is never edited is one
// nobody is reading the result of.
import { AYQ_STORE_VERSION } from '../src/ayq-store.ts';
import type {
  AyqEngineRequest,
  AyqRequestBody,
  AyqSnapshotWriteRequest,
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
export function engineBinary(): string {
  if (process.env.AYQ_TEST_NODE === '1') return process.execPath;
  return createRequire(import.meta.url)('electron') as string;
}

export const here = dirname(fileURLToPath(import.meta.url));
const enginePath = join(here, '..', 'dist', 'ayq-engine.js');
export const fixture = join(
  here,
  '..',
  '..',
  'ayq-camt',
  'test',
  'fixtures',
  'ayq-abn-month.xml',
);

/** A month AYQ has not seen all of: its closing balance assumes movements
 * that are not in it. */
export const gapFixture = join(
  here,
  '..',
  '..',
  'ayq-camt',
  'test',
  'fixtures',
  'ayq-coverage-gap.xml',
);

/** Every case 9 §9.1 turns on, in one invented statement. */
export const seriesFixture = join(
  here,
  '..',
  '..',
  'ayq-camt',
  'test',
  'fixtures',
  'ayq-strict-series.xml',
);

/** The invented pair that is one person's money in two of their own accounts. */
export function ownAccountFixture(name: string): string {
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
    // The engine is not this Node: whatever flags the test runner started this
    // process with (Node 24 forwards its own) are not Electron's to parse.
    execArgv: [],
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
export async function restart(dataDir: string): Promise<void> {
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

export async function send(
  request: AyqEngineRequest,
  dataDir: string,
): Promise<AyqResponse> {
  const running = engineFor(dataDir);

  return new Promise<AyqResponse>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('the engine did not answer within 120s')),
      120_000,
    );
    // Both listeners are taken off again. `once` only removes itself when it
    // fires, so the error listener of every request that succeeded stayed on the
    // child — eleven of them and Node starts warning about a leak, in the middle
    // of a log somebody is reading to find out why a test failed.
    const failed = (error: Error): void => {
      clearTimeout(timer);
      reject(error);
    };
    running.waiting.set(request.id, answer => {
      clearTimeout(timer);
      running.child.off('error', failed);
      resolve(answer);
    });
    running.child.once('error', failed);
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
export async function ask<K extends keyof AyqResults>(
  dataDir: string,
  body: (AyqRequestBody | AyqSnapshotWriteRequest) & { kind: K },
): Promise<AyqResults[K]> {
  counter += 1;
  const id = `test-${counter}`;
  const answer = await send({ ...body, id }, dataDir);

  assert.equal(answer.id, id, 'the correlation id comes back untouched');
  assert.equal(answer.ok, true, `engine said: ${JSON.stringify(answer)}`);
  assert.ok(answer.ok && answer.kind === body.kind);
  return answer.result as AyqResults[K];
}

export async function budget(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'ayq-desktop-'));
}
