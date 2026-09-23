// Backup and restore through the real engine, on a real budget (030 §3).
//
// `ayq-backup.test.ts` proves the file work on stand-ins. This file asks the
// engine the three questions the renderer asks — `backup.overview`,
// `backup.create`, `backup.restore` — over a budget Actual itself created and
// an invented statement imported into it, and reads the answers back through
// the same requests every screen uses.
//
// The two facts followed through every test live in the two halves: how many
// transactions the budget holds (Actual's SQLite) and what the owner called a
// counterparty (the AYQ store). A restore that brought back one and not the
// other would fail here.

import assert from 'node:assert/strict';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  ayqBackupsDir,
  ayqCheckBackup,
  ayqReplaceWithBackup,
} from '../src/ayq-backup.ts';
import { AYQ_STORE_VERSION } from '../src/ayq-store.ts';

import {
  ask,
  budget,
  fixture,
  restart,
  send,
  seriesFixture,
} from './ayq-engine-harness.ts';

type State = {
  transactions: number;
  name: string | undefined;
  imports: number;
};

/** The two halves, as the screens read them. */
async function stateOf(dataDir: string, key: string): Promise<State> {
  const summary = await ask(dataDir, { kind: 'summary' });
  const list = await ask(dataDir, { kind: 'counterparties.list' });
  const imports = await ask(dataDir, { kind: 'imports.list' });
  return {
    transactions: summary.transactionCount,
    name: list.rows.find(one => one.key === key)?.name,
    imports: imports.length,
  };
}

/** A budget with a statement in it and a counterparty the owner renamed. */
async function started(
  name: string,
): Promise<{ dataDir: string; key: string }> {
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [fixture] });
  const list = await ask(dataDir, { kind: 'counterparties.list' });
  const key = list.rows[0]?.key;
  assert.ok(key, 'the statement resolved no counterparty');
  await ask(dataDir, {
    kind: 'counterparty.setName',
    counterpartyKey: key,
    displayName: name,
  });
  return { dataDir, key };
}

async function backUp(dataDir: string): Promise<string> {
  const made = await ask(dataDir, { kind: 'backup.create' });
  assert.equal(made.outcome, 'created', JSON.stringify(made));
  assert.ok(made.outcome === 'created');
  return made.backupId;
}

/** Changes both halves: a new statement in the budget, a new name in the store. */
async function changeBoth(
  dataDir: string,
  key: string,
  name: string,
): Promise<void> {
  await ask(dataDir, { kind: 'import.camt', paths: [seriesFixture] });
  await ask(dataDir, {
    kind: 'counterparty.setName',
    counterpartyKey: key,
    displayName: name,
  });
}

test('a backup made now is restored whole: the budget and the store together', async () => {
  const { dataDir, key } = await started('Before');
  const before = await stateOf(dataDir, key);
  const backupId = await backUp(dataDir);

  await changeBoth(dataDir, key, 'After');
  const after = await stateOf(dataDir, key);
  assert.ok(
    after.transactions > before.transactions,
    'the second statement added nothing',
  );
  assert.equal(after.name, 'After');

  const restored = await ask(dataDir, { kind: 'backup.restore', backupId });
  assert.equal(restored.outcome, 'restored', JSON.stringify(restored));
  assert.ok(restored.outcome === 'restored');

  // Both halves are Monday's again — not one of them.
  assert.deepEqual(await stateOf(dataDir, key), before);

  // What was replaced was kept, and it is the state from just before.
  const kept = restored.overview.backups.find(
    one => one.backupId === restored.keptBackupId,
  );
  assert.equal(kept?.trigger, 'before-restore');
  const undone = await ask(dataDir, {
    kind: 'backup.restore',
    backupId: restored.keptBackupId,
  });
  assert.equal(undone.outcome, 'restored');
  assert.deepEqual(await stateOf(dataDir, key), after);

  // And it survives the engine starting again from what is on disk.
  await restart(dataDir);
  assert.deepEqual(await stateOf(dataDir, key), after);
});

test('a mixed set is refused through the engine, and the state in use is untouched', async () => {
  const { dataDir, key } = await started('Monday');
  const monday = await backUp(dataDir);
  await changeBoth(dataDir, key, 'Friday');
  const friday = await backUp(dataDir);
  const now = await stateOf(dataDir, key);

  // Friday's store put into Monday's backup.
  const root = (id: string) => join(ayqBackupsDir(dataDir), id);
  copyFileSync(
    join(root(friday), 'ayq-store.json'),
    join(root(monday), 'ayq-store.json'),
  );

  const refused = await ask(dataDir, {
    kind: 'backup.restore',
    backupId: monday,
  });
  assert.deepEqual(
    {
      outcome: refused.outcome,
      refusal: refused.outcome === 'refused' ? refused.refusal : null,
    },
    { outcome: 'refused', refusal: 'mismatch' },
  );
  assert.deepEqual(await stateOf(dataDir, key), now);
  // A refusal is decided before anything moves, so nothing was kept either.
  assert.ok(
    !refused.overview.backups.some(one => one.trigger === 'before-restore'),
  );
  assert.equal(existsSync(join(dataDir, '.ayq-restore')), false);
});

test('a backup a newer AYQ wrote is refused through the engine', async () => {
  const { dataDir, key } = await started('Monday');
  const backupId = await backUp(dataDir);
  const now = await stateOf(dataDir, key);

  const path = join(ayqBackupsDir(dataDir), backupId, 'ayq-store.json');
  const store = JSON.parse(readFileSync(path, 'utf8'));
  store.version = AYQ_STORE_VERSION + 1;
  writeFileSync(path, JSON.stringify(store));

  const refused = await ask(dataDir, { kind: 'backup.restore', backupId });
  assert.equal(refused.outcome, 'refused');
  // Altered after it was sealed, so it is also a mismatch; either way it is not
  // restored. The sealed-newer case is pinned in ayq-backup.test.ts.
  assert.ok(
    refused.outcome === 'refused' &&
      (refused.refusal === 'newer-store' || refused.refusal === 'mismatch'),
  );
  assert.deepEqual(await stateOf(dataDir, key), now);
});

test("the renderer's request can only name a backup, never a place on disk", async () => {
  const { dataDir, key } = await started('Monday');
  const now = await stateOf(dataDir, key);
  for (const backupId of [
    '..',
    '../..',
    dataDir,
    join(dataDir, 'ayq-store.json'),
    'C:\\',
  ]) {
    const refused = await ask(dataDir, { kind: 'backup.restore', backupId });
    assert.equal(refused.outcome, 'refused', backupId);
    assert.ok(
      refused.outcome === 'refused' && refused.refusal === 'unknown-backup',
    );
  }
  assert.deepEqual(await stateOf(dataDir, key), now);
});

test('an automatic backup is made when the engine starts on a budget that has none', async () => {
  const dataDir = await budget();
  // The first start creates the budget, so there was nothing to back up yet.
  await ask(dataDir, { kind: 'import.camt', paths: [fixture] });
  let overview = await ask(dataDir, { kind: 'backup.overview' });
  assert.deepEqual(overview.backups, []);
  assert.equal(overview.lastAutomaticAttempt, null);

  await restart(dataDir);
  overview = await ask(dataDir, { kind: 'backup.overview' });
  assert.equal(overview.backups.length, 1);
  assert.equal(overview.backups[0].trigger, 'automatic');
  assert.equal(overview.lastAutomaticAttempt?.outcome, 'succeeded');
  assert.equal(
    overview.lastAutomaticAttempt?.backupId,
    overview.backups[0].backupId,
  );
  assert.equal(ayqCheckBackup(dataDir, overview.backups[0].backupId).ok, true);

  // Not again on the same day.
  await restart(dataDir);
  overview = await ask(dataDir, { kind: 'backup.overview' });
  assert.equal(overview.backups.length, 1);
});

test('an automatic backup that fails is recorded, and AYQ still opens', async () => {
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [fixture] });
  await restart(dataDir);
  // Something that is not a folder where the backups go: a real failure.
  writeFileSync(ayqBackupsDir(dataDir), 'not a folder');

  const summary = await ask(dataDir, { kind: 'summary' });
  assert.ok(summary.transactionCount > 0, 'the budget did not open');
  const overview = await ask(dataDir, { kind: 'backup.overview' });
  assert.equal(overview.lastAutomaticAttempt?.outcome, 'failed');
  assert.equal(overview.lastAutomaticAttempt?.failure, 'write-failed');
  assert.equal(overview.lastAttempt?.outcome, 'failed');
});

test('a restore interrupted by the process dying is put back when the engine starts', async () => {
  const { dataDir, key } = await started('Monday');
  const backupId = await backUp(dataDir);
  await changeBoth(dataDir, key, 'Friday');
  const friday = await stateOf(dataDir, key);

  // The engine is stopped and the restore is run by hand to the point where
  // Monday's budget has moved in and Monday's store has not — then abandoned,
  // with no recovery, the way a power cut would abandon it.
  await restart(dataDir);
  const checked = ayqCheckBackup(dataDir, backupId);
  assert.ok(checked.ok);
  assert.throws(() =>
    ayqReplaceWithBackup(dataDir, checked.manifest, step => {
      if (step === 'budget-moved-in') throw new Error('the power went');
    }),
  );
  assert.ok(
    existsSync(join(dataDir, '.ayq-restore')),
    'nothing was left half done',
  );

  // The next start finds it and puts Friday back, both halves.
  assert.deepEqual(await stateOf(dataDir, key), friday);
  assert.equal(existsSync(join(dataDir, '.ayq-restore')), false);
});

test('a backup asked for while a statement is importing captures one moment', async () => {
  const { dataDir, key } = await started('Monday');
  const onlyFirst = await stateOf(dataDir, key);

  // Sent together, not one after the other: the import writes the budget and
  // the store, and the backup must fall wholly before it or wholly after it.
  const [imported, made] = await Promise.all([
    send(
      { id: 'concurrent-import', kind: 'import.camt', paths: [seriesFixture] },
      dataDir,
    ),
    send({ id: 'concurrent-backup', kind: 'backup.create' }, dataDir),
  ]);
  assert.equal(imported.ok, true, JSON.stringify(imported));
  assert.ok(
    made.ok &&
      made.kind === 'backup.create' &&
      made.result.outcome === 'created',
  );
  const backupId =
    made.result.outcome === 'created' ? made.result.backupId : '';
  const both = await stateOf(dataDir, key);
  assert.ok(both.transactions > onlyFirst.transactions);

  await ask(dataDir, {
    kind: 'counterparty.setName',
    counterpartyKey: key,
    displayName: 'Later',
  });
  const restored = await ask(dataDir, { kind: 'backup.restore', backupId });
  assert.equal(restored.outcome, 'restored');

  // Whichever moment it was, the budget and the store agree about it: the
  // statement's transactions (the budget) and its import record (the store)
  // are both there, or neither is.
  const state = await stateOf(dataDir, key);
  assert.ok(
    [JSON.stringify(onlyFirst), JSON.stringify(both)].includes(
      JSON.stringify(state),
    ),
    `the backup mixed two moments: ${JSON.stringify({ onlyFirst, both, state })}`,
  );
});
