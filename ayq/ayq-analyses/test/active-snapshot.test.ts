// The one active snapshot the application holds (r002 §6.1, §6.2, §11.5,
// §11.6; 02_ARCHITECTURE r006 §7.12), proven against a scratch directory:
// a candidate is validated before it replaces the copy; the previous copy
// survives a refused candidate, a failed write and a failed rename; the copy
// is revalidated at launch and a refused copy yields no snapshot; removal
// clears the copy and the retained name together.

import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import * as fs from 'node:fs/promises';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  activeSnapshotPaths,
  readActiveSnapshot,
  removeActiveSnapshot,
  replaceActiveSnapshot,
  type ActiveSnapshotIo,
} from '../src/active-snapshot.js';
import { FIXTURE_DIRECTORY } from './helpers.js';

const RESULT = readFileSync(join(FIXTURE_DIRECTORY, 'a1-result.json'));
const EMPTY = readFileSync(join(FIXTURE_DIRECTORY, 'a1-empty.json'));
const BROKEN = readFileSync(join(FIXTURE_DIRECTORY, 'a1-invalid-broken-reversal.json'));

const scratchDirectories: string[] = [];

function scratch(): string {
  const directory = mkdtempSync(join(tmpdir(), 'ayq-analyses-active-'));
  scratchDirectories.push(directory);
  return directory;
}

after(() => {
  for (const directory of scratchDirectories) rmSync(directory, { recursive: true, force: true });
});

function bytesOf(directory: string): Buffer {
  return readFileSync(activeSnapshotPaths(directory).snapshot);
}

function nameOf(directory: string): string | null {
  const { meta } = activeSnapshotPaths(directory);
  return existsSync(meta) ? (JSON.parse(readFileSync(meta, 'utf8')) as { fileName: string }).fileName : null;
}

test('no copy is "No data loaded", and the directory need not exist yet', async () => {
  const directory = join(scratch(), 'not-yet');
  assert.deepEqual(await readActiveSnapshot(directory), { status: 'none' });
});

test('a valid candidate becomes the active copy — the exact bytes, plus the name and nothing else', async () => {
  const directory = scratch();
  const outcome = await replaceActiveSnapshot(directory, RESULT, 'march.json');
  assert.equal(outcome.status, 'loaded');
  assert.deepEqual(outcome.status === 'loaded' && outcome.identity, { fileName: 'march.json' });
  assert.ok(bytesOf(directory).equals(RESULT), 'the copy is byte-identical to the file chosen');
  assert.equal(nameOf(directory), 'march.json');
  // Nothing else is written: no temporary file survives, no path is recorded.
  assert.deepEqual(readdirSync(directory).sort(), ['active-snapshot.json', 'active-snapshot.meta.json']);
  assert.ok(!readFileSync(activeSnapshotPaths(directory).meta, 'utf8').includes(directory));
});

test('the copy is revalidated at launch and comes back with its name', async () => {
  const directory = scratch();
  await replaceActiveSnapshot(directory, RESULT, 'march.json');
  const active = await readActiveSnapshot(directory);
  assert.equal(active.status, 'loaded');
  if (active.status !== 'loaded') return;
  assert.equal(active.identity.fileName, 'march.json');
  assert.equal(active.snapshot.meta.contractVersion, '1.0');
});

test('a refused candidate leaves the active copy exactly as it was', async () => {
  const directory = scratch();
  await replaceActiveSnapshot(directory, RESULT, 'march.json');
  const outcome = await replaceActiveSnapshot(directory, BROKEN, 'broken.json');
  assert.equal(outcome.status, 'invalid');
  assert.ok(bytesOf(directory).equals(RESULT));
  assert.equal(nameOf(directory), 'march.json');
  assert.deepEqual(readdirSync(directory).sort(), ['active-snapshot.json', 'active-snapshot.meta.json']);
});

test('a candidate that cannot be written leaves the active copy exactly as it was, and no temporary file', async () => {
  const directory = scratch();
  await replaceActiveSnapshot(directory, RESULT, 'march.json');
  const failing: ActiveSnapshotIo = {
    ...fs,
    writeFile: async () => {
      throw Object.assign(new Error('disk full'), { code: 'ENOSPC' });
    },
  };
  const outcome = await replaceActiveSnapshot(directory, EMPTY, 'empty.json', failing);
  assert.equal(outcome.status, 'failed');
  assert.ok(bytesOf(directory).equals(RESULT));
  assert.equal(nameOf(directory), 'march.json');
  assert.deepEqual(readdirSync(directory).sort(), ['active-snapshot.json', 'active-snapshot.meta.json']);
});

test('a candidate whose copy cannot be proven — the rename fails, or the read-back differs — leaves the previous copy in use', async () => {
  const directory = scratch();
  await replaceActiveSnapshot(directory, RESULT, 'march.json');
  const renameFails: ActiveSnapshotIo = {
    ...fs,
    rename: async () => {
      throw Object.assign(new Error('locked'), { code: 'EPERM' });
    },
  };
  assert.equal((await replaceActiveSnapshot(directory, EMPTY, 'empty.json', renameFails)).status, 'failed');
  assert.ok(bytesOf(directory).equals(RESULT));
  assert.deepEqual(readdirSync(directory).sort(), ['active-snapshot.json', 'active-snapshot.meta.json']);

  const readsBackWrong: ActiveSnapshotIo = {
    ...fs,
    readFile: (async (path: string, ...rest: unknown[]) =>
      String(path).endsWith('.tmp') ? Buffer.from('not what was written') : (fs.readFile as any)(path, ...rest)) as any,
  };
  assert.equal((await replaceActiveSnapshot(directory, EMPTY, 'empty.json', readsBackWrong)).status, 'failed');
  assert.ok(bytesOf(directory).equals(RESULT));
  assert.equal(nameOf(directory), 'march.json');
  assert.deepEqual(readdirSync(directory).sort(), ['active-snapshot.json', 'active-snapshot.meta.json']);
});

test('a second valid candidate replaces the first, bytes and name together', async () => {
  const directory = scratch();
  await replaceActiveSnapshot(directory, RESULT, 'march.json');
  const outcome = await replaceActiveSnapshot(directory, EMPTY, 'april.json');
  assert.equal(outcome.status, 'loaded');
  assert.ok(bytesOf(directory).equals(EMPTY));
  assert.equal(nameOf(directory), 'april.json');
  const active = await readActiveSnapshot(directory);
  assert.equal(active.status === 'loaded' && active.identity.fileName, 'april.json');
});

test('a copy that fails revalidation at launch is refused, produces no snapshot, and is neither repaired nor removed', async () => {
  const directory = scratch();
  await replaceActiveSnapshot(directory, RESULT, 'march.json');
  // The copy is damaged underneath the application: the contract's shape check refuses it.
  const paths = activeSnapshotPaths(directory);
  writeFileSync(paths.snapshot, RESULT.toString('utf8').replace('"contractVersion": "1.0"', '"contractVersion": "2.0"'));
  const active = await readActiveSnapshot(directory);
  assert.equal(active.status, 'invalid');
  if (active.status !== 'invalid') return;
  assert.equal(active.reason, 'contractMajor');
  assert.equal(active.identity.fileName, 'march.json');
  assert.ok(!('snapshot' in active), 'no figure can come from a refused copy');
  assert.ok(existsSync(paths.snapshot) && existsSync(paths.meta), 'the copy is kept for the owner to replace or remove');

  const garbage = scratch();
  writeFileSync(activeSnapshotPaths(garbage).snapshot, '{ not json');
  const malformed = await readActiveSnapshot(garbage);
  assert.equal(malformed.status === 'invalid' && malformed.reason, 'malformed');
  assert.equal(malformed.status === 'invalid' && malformed.identity.fileName, null);
});

test('removal deletes the copy and the retained name together and returns to "No data loaded"', async () => {
  const directory = scratch();
  await replaceActiveSnapshot(directory, RESULT, 'march.json');
  await removeActiveSnapshot(directory);
  assert.deepEqual(readdirSync(directory), []);
  assert.deepEqual(await readActiveSnapshot(directory), { status: 'none' });
  // Removing nothing is not an error.
  await removeActiveSnapshot(directory);
});

test('a refused copy can still be removed', async () => {
  const directory = scratch();
  writeFileSync(activeSnapshotPaths(directory).snapshot, '{ not json');
  writeFileSync(activeSnapshotPaths(directory).meta, JSON.stringify({ fileName: 'old.json' }));
  assert.equal((await readActiveSnapshot(directory)).status, 'invalid');
  await removeActiveSnapshot(directory);
  assert.deepEqual(await readActiveSnapshot(directory), { status: 'none' });
});

test('the source file is not a dependency: once copied, it can go', async () => {
  const directory = scratch();
  const source = join(scratch(), 'export.json');
  writeFileSync(source, RESULT);
  await replaceActiveSnapshot(directory, readFileSync(source), 'export.json');
  await fs.rm(source);
  const active = await readActiveSnapshot(directory);
  assert.equal(active.status, 'loaded');
  assert.equal(active.status === 'loaded' && active.identity.fileName, 'export.json');
});
