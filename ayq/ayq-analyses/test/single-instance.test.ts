// One instance over the store (02_ARCHITECTURE r007 §7.16), proven as process
// concurrency: the real application is built and launched twice against one
// scratch store. The first process holds the lock, reads the store at launch
// and keeps running; the second obtains no lock, reads nothing, writes
// nothing and exits, and no second window exists. The ordering in main.ts —
// the lock before anything that can reach the store — is asserted at source
// level beside it, because the concurrency run proves the outcome and the
// source proves the rule.

import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import electron from 'electron';
import { buildApplication } from '../build-lib.mjs';
import { activeSnapshotPaths } from '../src/active-snapshot.js';
import { FIXTURE_DIRECTORY } from './helpers.js';

const APP = resolve('dist-test', 'app');
// The scratch store lives beside the built application under dist-test/,
// which build-tests.mjs wipes before every run: Chromium's helper processes
// can outlive the main process by a moment, so removal is best-effort here
// and certain next time.
const STORE = resolve('dist-test', 'instance-store');
const LAUNCH_LOG = 'Active snapshot refused at launch';
const started: Instance[] = [];
let store = '';

interface Instance {
  process: ChildProcess;
  output: () => string;
  exited: Promise<number | null>;
}

function launch(): Instance {
  const child = spawn(String(electron), [`--user-data-dir=${store}`, join(APP, 'main.js')], {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: false,
  });
  let text = '';
  child.stdout?.on('data', chunk => (text += String(chunk)));
  child.stderr?.on('data', chunk => (text += String(chunk)));
  const exited = new Promise<number | null>(resolveExit => child.on('exit', code => resolveExit(code)));
  const instance = { process: child, output: () => text, exited };
  started.push(instance);
  return instance;
}

/**
 * Ends an instance and its whole process tree: Chromium's helper processes
 * would otherwise outlive the main process, keep the inherited pipes open
 * and hold the scratch store for half a minute.
 */
async function end(instance: Instance): Promise<void> {
  const child = instance.process;
  if (child.exitCode === null && child.signalCode === null) {
    if (process.platform === 'win32' && child.pid !== undefined) {
      execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      child.kill();
    }
    await instance.exited;
  }
  child.stdout?.destroy();
  child.stderr?.destroy();
}

async function until(condition: () => boolean, what: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise(resolveWait => setTimeout(resolveWait, 100));
  }
}

function storeState(): Record<string, string> {
  const state: Record<string, string> = {};
  for (const name of readdirSync(store).filter(entry => entry.startsWith('active-snapshot')).sort()) {
    state[name] = createHash('sha256').update(readFileSync(join(store, name))).digest('hex');
  }
  return state;
}

/**
 * Top-level windows titled as the application among the processes this test
 * launched — and only those: an installed AYQ Analyses the owner has open on
 * the same machine (over its own store) is not part of the experiment.
 */
function applicationWindows(): number {
  if (process.platform !== 'win32') return -1;
  const pids = started.map(instance => instance.process.pid).filter((pid): pid is number => pid !== undefined);
  if (pids.length === 0) return 0;
  const out = execFileSync(
    'powershell',
    [
      '-NoProfile',
      '-Command',
      `(Get-Process -Id ${pids.join(',')} -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -eq 'AYQ Analyses' } | Measure-Object).Count`,
    ],
    { encoding: 'utf8' },
  );
  return Number.parseInt(out.trim(), 10);
}

before(async () => {
  await buildApplication(APP);
  rmSync(STORE, { recursive: true, force: true });
  mkdirSync(STORE, { recursive: true });
  store = STORE;
  // A copy the launch read refuses, so that a read of the store leaves a
  // bounded line in the reading process's log: the reader is identifiable.
  const refused = readFileSync(join(FIXTURE_DIRECTORY, 'a1-result.json'), 'utf8').replace(
    '"contractVersion": "1.0"',
    '"contractVersion": "2.0"',
  );
  assert.ok(refused.includes('"contractVersion": "2.0"'));
  writeFileSync(activeSnapshotPaths(store).snapshot, refused);
  writeFileSync(activeSnapshotPaths(store).meta, JSON.stringify({ fileName: 'refused.json' }));
});

after(async () => {
  for (const instance of started) await end(instance);
  try {
    rmSync(STORE, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    // Left under dist-test/ for build-tests.mjs to wipe.
  }
});

test('a second process obtains no lock, touches nothing in the store, opens no window and exits; the first keeps running', async () => {
  const first = launch();
  await until(() => first.output().includes(LAUNCH_LOG), 'the first instance to read the store at launch', 60_000);
  assert.equal(first.process.exitCode, null, 'the first instance is running');
  await until(() => applicationWindows() === 1, 'the first window', 30_000);
  const before = storeState();
  assert.deepEqual(Object.keys(before), ['active-snapshot.json', 'active-snapshot.meta.json']);

  const second = launch();
  await until(() => second.process.exitCode !== null || second.process.signalCode !== null, 'the second instance to exit', 30_000);
  assert.equal(await second.exited, 0, 'the second instance exits cleanly');
  assert.equal(first.process.exitCode, null, 'the first instance is still running');
  // The second process never read the store: the launch read's line is absent
  // from its log, and nothing about a snapshot appears in it at all.
  assert.ok(!second.output().includes(LAUNCH_LOG), 'the second instance did not read the store');
  assert.ok(!/snapshot/i.test(second.output()), `the second instance's log mentions no snapshot:\n${second.output()}`);
  // Nothing written, nothing renamed, nothing deleted, no temporary file.
  assert.deepEqual(storeState(), before);
  assert.deepEqual(readdirSync(store).filter(name => name.endsWith('.tmp')), []);
  // No second window, and no message: the running window is simply there.
  assert.equal(applicationWindows(), 1);

  await end(first);
});

test('the lock is the first act of the main process, before anything that can reach the store', () => {
  const main = readFileSync(resolve('src', 'main.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  const lock = main.indexOf('app.requestSingleInstanceLock()');
  assert.ok(lock > 0, 'the lock is requested');
  // Nothing runs before the lock but declarations: no ready handler, no
  // window, no IPC registration, no store call.
  const beforeLock = main.slice(0, lock);
  for (const act of ['whenReady', 'registerIpc()', 'createWindow()', 'readActiveSnapshot(', 'replaceActiveSnapshot(', 'removeActiveSnapshot(']) {
    const uses = beforeLock.split(act).length - 1;
    const declared = ['readActiveSnapshot(', 'replaceActiveSnapshot(', 'removeActiveSnapshot(', 'createWindow()', 'registerIpc()'].includes(act) ? 1 : 0;
    assert.ok(uses <= declared, `${act} is used before the lock is taken`);
  }
  // The process that loses the lock quits, and only the branch that holds it
  // ever becomes ready, registers the store's channels or makes a window.
  assert.match(main, /if \(!holdsTheStore\) \{\s*app\.quit\(\);\s*\} else \{[\s\S]*whenReady[\s\S]*registerIpc\(\);[\s\S]*createWindow\(\);[\s\S]*\}/);
  assert.equal(main.split('registerIpc();').length - 1, 1);
  // The second launch brings the running window forward and says nothing.
  assert.match(main, /app\.on\('second-instance', bringForward\)/);
  assert.ok(!/dialog\.showMessageBox|Notification|already running/i.test(main), 'nothing is shown on a second launch');
});
