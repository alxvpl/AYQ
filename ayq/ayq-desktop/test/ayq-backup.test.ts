// Backup and restore, on the files themselves (030 §3; 02 §5.9–§5.11; 03 §12).
//
// The budgets here are stand-ins: a folder named like one of Actual's, a
// metadata file naming it AYQ, and a "database" that is the SQLite header and a
// label. What is under test is the capture, the check and the replacement —
// file work — so a real SQLite would add minutes and prove nothing more. The
// engine tests in `ayq-backup-engine.test.ts` do the same things to a real
// budget through the real engine.
//
// Every store and every budget below is invented.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  AYQ_BACKUP_FORMAT,
  AYQ_BACKUP_POLICY,
  ayqAutomaticBackupDue,
  ayqBackupOverview,
  ayqBackupsDir,
  ayqCheckBackup,
  ayqCreateBackup,
  ayqFinishRestore,
  ayqRecoverInterruptedRestore,
  ayqReplaceWithBackup,
  AyqRestoreRefused,
} from '../src/ayq-backup.ts';
import type { AyqBackupManifest } from '../src/ayq-backup.ts';
import {
  AYQ_STORE_VERSION,
  ayqReadStore,
  ayqStorePath,
  ayqWriteStore,
} from '../src/ayq-store.ts';

const here = dirname(fileURLToPath(import.meta.url));
const FOLDER = 'AYQ-test0001';
const IDENTITY = { productVersion: '0.4.0', buildNumber: '010' };

function sha(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Writes one state: a budget whose database says `label`, and a store that does too. */
function writeState(dataDir: string, label: string, folder = FOLDER): void {
  mkdirSync(join(dataDir, folder), { recursive: true });
  writeFileSync(
    join(dataDir, folder, 'db.sqlite'),
    Buffer.concat([
      Buffer.from('SQLite format 3\u0000', 'latin1'),
      Buffer.from(`budget ${label}`),
    ]),
  );
  writeFileSync(
    join(dataDir, folder, 'metadata.json'),
    JSON.stringify({ id: folder, budgetName: 'AYQ' }),
  );
  const store = ayqReadStore(dataDir);
  store.counterpartyNames = {
    TESTSHOP: {
      counterpartyKey: 'TESTSHOP',
      displayName: `Shop ${label}`,
      decidedAt: '2026-01-01T00:00:00Z',
    },
  };
  ayqWriteStore(dataDir, store);
}

async function dataDirWith(label: string): Promise<string> {
  const dataDir = await mkdtemp(join(tmpdir(), 'ayq-backup-'));
  writeState(dataDir, label);
  return dataDir;
}

/**
 * Everything that makes up the live state, as file -> hash.
 *
 * The budget folder and the store, and nothing else: the backups and the status
 * are about the state, not part of it.
 */
function live(dataDir: string): Record<string, string> {
  const found: Record<string, string> = {};
  for (const entry of readdirSync(dataDir, { withFileTypes: true })) {
    if (
      entry.isDirectory() &&
      existsSync(join(dataDir, entry.name, 'metadata.json'))
    ) {
      for (const file of readdirSync(join(dataDir, entry.name))) {
        found[`${entry.name}/${file}`] = sha(
          readFileSync(join(dataDir, entry.name, file)),
        );
      }
    }
  }
  if (existsSync(ayqStorePath(dataDir))) {
    found['ayq-store.json'] = sha(readFileSync(ayqStorePath(dataDir)));
  }
  return found;
}

function create(
  dataDir: string,
  at = '2026-09-23T08:00:00.000Z',
  trigger: 'manual' | 'automatic' = 'manual',
) {
  const made = ayqCreateBackup(dataDir, {
    trigger,
    identity: IDENTITY,
    now: new Date(at),
  });
  assert.equal(made.outcome, 'created', JSON.stringify(made));
  return made as Extract<typeof made, { outcome: 'created' }>;
}

function manifestOf(dataDir: string, backupId: string): AyqBackupManifest {
  return JSON.parse(
    readFileSync(
      join(ayqBackupsDir(dataDir), backupId, 'manifest.json'),
      'utf8',
    ),
  ) as AyqBackupManifest;
}

/**
 * Rewrites a set's manifest so that every hash and the digest agree with what
 * is on disk — the way a careful forger would, so that only the fact under
 * test is wrong.
 */
function reseal(
  dataDir: string,
  backupId: string,
  change: (manifest: AyqBackupManifest) => void,
): void {
  const root = join(ayqBackupsDir(dataDir), backupId);
  const manifest = manifestOf(dataDir, backupId);
  change(manifest);
  manifest.files = manifest.files.map(one => {
    const bytes = readFileSync(join(root, ...one.path.split('/')));
    return { path: one.path, bytes: bytes.length, sha256: sha(bytes) };
  });
  const lines = [
    `format ${AYQ_BACKUP_FORMAT}`,
    `id ${manifest.backupId}`,
    `at ${manifest.createdAt}`,
    ...manifest.files.map(one => `${one.path} ${one.bytes} ${one.sha256}`),
  ];
  manifest.digest = sha(lines.join('\n'));
  writeFileSync(join(root, 'manifest.json'), JSON.stringify(manifest, null, 2));
}

// ---------------------------------------------------------------------------
// §3.1 A backup contains both parts, and they belong to the same logical point.

test('a backup holds the budget and the store, each exactly as they stood', async () => {
  const dataDir = await dataDirWith('monday');
  const before = live(dataDir);
  const { backupId, manifest } = create(dataDir);

  const paths = manifest.files.map(one => one.path).sort();
  assert.deepEqual(paths, [
    'ayq-store.json',
    'budget/db.sqlite',
    'budget/metadata.json',
  ]);
  assert.equal(manifest.budgetFolder, FOLDER);
  assert.equal(manifest.storeVersion, AYQ_STORE_VERSION);

  // Byte for byte the state that was live — both halves, from the one moment.
  const hashes = Object.fromEntries(
    manifest.files.map(one => [one.path, one.sha256]),
  );
  assert.equal(hashes['ayq-store.json'], before['ayq-store.json']);
  assert.equal(hashes['budget/db.sqlite'], before[`${FOLDER}/db.sqlite`]);
  assert.equal(
    hashes['budget/metadata.json'],
    before[`${FOLDER}/metadata.json`],
  );

  // And the backup checks out as one set.
  assert.deepEqual(ayqCheckBackup(dataDir, backupId), { ok: true, manifest });
});

test("the two halves are sealed together: neither can be exchanged for another backup's", async () => {
  const dataDir = await dataDirWith('monday');
  const monday = create(dataDir, '2026-09-21T08:00:00.000Z');
  writeState(dataDir, 'friday');
  const friday = create(dataDir, '2026-09-25T08:00:00.000Z');
  const mondayRoot = join(ayqBackupsDir(dataDir), monday.backupId);
  const fridayRoot = join(ayqBackupsDir(dataDir), friday.backupId);

  // Friday's store with Monday's budget.
  copyFileSync(
    join(fridayRoot, 'ayq-store.json'),
    join(mondayRoot, 'ayq-store.json'),
  );
  assert.deepEqual(ayqCheckBackup(dataDir, monday.backupId), {
    ok: false,
    refusal: 'mismatch',
  });

  // Friday's budget with Friday's own store, but under Monday's description.
  copyFileSync(
    join(fridayRoot, 'budget', 'db.sqlite'),
    join(mondayRoot, 'budget', 'db.sqlite'),
  );
  assert.deepEqual(ayqCheckBackup(dataDir, monday.backupId), {
    ok: false,
    refusal: 'mismatch',
  });

  // Friday's whole description carried over too: it names another backup.
  copyFileSync(
    join(fridayRoot, 'manifest.json'),
    join(mondayRoot, 'manifest.json'),
  );
  assert.deepEqual(ayqCheckBackup(dataDir, monday.backupId), {
    ok: false,
    refusal: 'mismatch',
  });

  // Friday is untouched and still a backup.
  assert.equal(ayqCheckBackup(dataDir, friday.backupId).ok, true);
});

// ---------------------------------------------------------------------------
// §3.2 Restore of a mixed or tampered set is refused before any replacement.

test('a mixed, altered or incomplete set is refused and nothing is replaced', async () => {
  const cases: Array<{
    name: string;
    spoil(root: string, dataDir: string, backupId: string): void;
    refusal: string;
  }> = [
    {
      name: 'a store from another moment',
      spoil: root => {
        const store = JSON.parse(
          readFileSync(join(root, 'ayq-store.json'), 'utf8'),
        );
        store.counterpartyNames.TESTSHOP.displayName =
          'Shop from another backup';
        writeFileSync(
          join(root, 'ayq-store.json'),
          JSON.stringify(store, null, 2),
        );
      },
      refusal: 'mismatch',
    },
    {
      name: 'an altered budget',
      spoil: root =>
        writeFileSync(
          join(root, 'budget', 'db.sqlite'),
          'SQLite format 3\u0000 edited',
        ),
      refusal: 'mismatch',
    },
    {
      name: 'a missing store',
      spoil: root => rmSync(join(root, 'ayq-store.json')),
      refusal: 'incomplete',
    },
    {
      name: 'a file that is not part of the set',
      spoil: root =>
        writeFileSync(join(root, 'budget', 'extra.sqlite'), 'stowaway'),
      refusal: 'incomplete',
    },
    {
      name: 'a description re-sealed with new hashes but the old digest',
      spoil: (root, dataDir, backupId) => {
        writeFileSync(
          join(root, 'budget', 'db.sqlite'),
          'SQLite format 3\u0000 forged',
        );
        const manifest = manifestOf(dataDir, backupId);
        const bytes = readFileSync(join(root, 'budget', 'db.sqlite'));
        manifest.files = manifest.files.map(one =>
          one.path === 'budget/db.sqlite'
            ? { ...one, bytes: bytes.length, sha256: sha(bytes) }
            : one,
        );
        writeFileSync(join(root, 'manifest.json'), JSON.stringify(manifest));
      },
      refusal: 'mismatch',
    },
  ];

  for (const one of cases) {
    const dataDir = await dataDirWith('monday');
    const { backupId } = create(dataDir);
    writeState(dataDir, 'friday');
    const before = live(dataDir);

    const root = join(ayqBackupsDir(dataDir), backupId);
    one.spoil(root, dataDir, backupId);

    const checked = ayqCheckBackup(dataDir, backupId);
    assert.deepEqual(checked, { ok: false, refusal: one.refusal }, one.name);
    assert.deepEqual(
      live(dataDir),
      before,
      `${one.name}: the current state changed`,
    );
    assert.equal(
      existsSync(join(dataDir, '.ayq-restore')),
      false,
      `${one.name}: a restore began`,
    );
  }
});

test("an identifier that is not one of AYQ's own names no backup at all", async () => {
  const dataDir = await dataDirWith('monday');
  create(dataDir);
  const before = live(dataDir);
  for (const id of [
    '..',
    '../..',
    FOLDER,
    join(dataDir, FOLDER),
    'C:\\Windows',
    '',
    '20260923T080000000Z-../x',
  ]) {
    assert.deepEqual(
      ayqCheckBackup(dataDir, id),
      { ok: false, refusal: 'unknown-backup' },
      id,
    );
  }
  assert.deepEqual(live(dataDir), before);
});

test('a copy that changes between the check and the move is not moved in', async () => {
  const dataDir = await dataDirWith('monday');
  const { backupId } = create(dataDir);
  writeState(dataDir, 'friday');
  const before = live(dataDir);
  const checked = ayqCheckBackup(dataDir, backupId);
  assert.ok(checked.ok);

  // The set is altered after it was checked and before it is staged.
  writeFileSync(
    join(ayqBackupsDir(dataDir), backupId, 'ayq-store.json'),
    '{"version":1}',
  );
  assert.throws(
    () => ayqReplaceWithBackup(dataDir, checked.manifest),
    (error: unknown) =>
      error instanceof AyqRestoreRefused && error.refusal === 'mismatch',
  );
  ayqRecoverInterruptedRestore(dataDir);
  assert.deepEqual(live(dataDir), before);
});

// ---------------------------------------------------------------------------
// §3.3 An interrupted restore leaves the pre-restore state readable and unchanged.

const STEPS = [
  'staged',
  'journal-written',
  'budget-moved-aside',
  'store-moved-aside',
  'budget-moved-in',
  'store-moved-in',
] as const;

test('a restore that fails at any step leaves the previous state exactly as it was', async () => {
  for (const step of STEPS) {
    const dataDir = await dataDirWith('monday');
    const { backupId } = create(dataDir);
    writeState(dataDir, 'friday');
    const before = live(dataDir);
    const checked = ayqCheckBackup(dataDir, backupId);
    assert.ok(checked.ok);

    assert.throws(() =>
      ayqReplaceWithBackup(dataDir, checked.manifest, reached => {
        if (reached === step) throw new Error(`failed at ${step}`);
      }),
    );
    // What the engine does with any failure.
    ayqRecoverInterruptedRestore(dataDir);

    assert.deepEqual(
      live(dataDir),
      before,
      `failed at ${step}: the state changed`,
    );
    assert.equal(
      ayqReadStore(dataDir).counterpartyNames.TESTSHOP.displayName,
      'Shop friday',
    );
    assert.equal(existsSync(join(dataDir, '.ayq-restore')), false);
    // The backup that was being restored is still there, and still whole.
    assert.equal(ayqCheckBackup(dataDir, backupId).ok, true);
  }
});

test('a process that dies halfway through a restore is put back on the next start', async () => {
  // A real interruption: a separate process runs the restore and exits on the
  // spot, with no catch, no finally and no recovery. What it leaves on disk is
  // what a power cut leaves.
  const module = pathToFileURL(join(here, '..', 'src', 'ayq-backup.ts')).href;
  for (const step of [
    'budget-moved-aside',
    'store-moved-aside',
    'budget-moved-in',
    'store-moved-in',
  ]) {
    const dataDir = await dataDirWith('monday');
    const { backupId } = create(dataDir);
    writeState(dataDir, 'friday');
    const before = live(dataDir);

    const script = `
      const { ayqCheckBackup, ayqReplaceWithBackup } = await import(${JSON.stringify(module)});
      const checked = ayqCheckBackup(${JSON.stringify(dataDir)}, ${JSON.stringify(backupId)});
      ayqReplaceWithBackup(${JSON.stringify(dataDir)}, checked.manifest, step => {
        if (step === ${JSON.stringify(step)}) process.exit(9);
      });
      process.exit(0);
    `;
    let code = 0;
    try {
      execFileSync(process.execPath, ['--input-type=module', '-e', script], {
        stdio: 'pipe',
      });
    } catch (error) {
      code = (error as { status?: number }).status ?? -1;
    }
    assert.equal(code, 9, `the restore was not interrupted at ${step}`);
    // Mid-restore, the live state is not the previous one any more…
    assert.notDeepEqual(live(dataDir), before, `nothing had moved by ${step}`);

    // …and the start-up recovery puts it back.
    assert.equal(ayqRecoverInterruptedRestore(dataDir), 'rolled-back');
    assert.deepEqual(
      live(dataDir),
      before,
      `interrupted at ${step}: the state changed`,
    );
    assert.equal(existsSync(join(dataDir, '.ayq-restore')), false);
  }
});

test('a restore that finishes replaces both halves, and keeps nothing mixed', async () => {
  const dataDir = await dataDirWith('monday');
  const monday = live(dataDir);
  const { backupId } = create(dataDir);
  writeState(dataDir, 'friday');

  const checked = ayqCheckBackup(dataDir, backupId);
  assert.ok(checked.ok);
  ayqReplaceWithBackup(dataDir, checked.manifest);
  ayqFinishRestore(dataDir);

  assert.deepEqual(live(dataDir), monday);
  assert.equal(
    ayqReadStore(dataDir).counterpartyNames.TESTSHOP.displayName,
    'Shop monday',
  );
  assert.equal(existsSync(join(dataDir, '.ayq-restore')), false);
  // Recovery after a finished restore changes nothing.
  assert.equal(ayqRecoverInterruptedRestore(dataDir), 'none');
  assert.deepEqual(live(dataDir), monday);
});

test('a backup of a budget kept under another folder name replaces the current one', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'ayq-backup-'));
  writeState(dataDir, 'monday', 'AYQ-older01');
  const monday = live(dataDir);
  const { backupId } = create(dataDir);
  // The budget is now under a different folder, as a recreated budget would be.
  const other = await mkdtemp(join(tmpdir(), 'ayq-backup-'));
  writeState(other, 'friday', 'AYQ-newer02');
  rmSync(join(dataDir, 'AYQ-older01'), { recursive: true });
  cpSync(join(other, 'AYQ-newer02'), join(dataDir, 'AYQ-newer02'), {
    recursive: true,
  });

  const checked = ayqCheckBackup(dataDir, backupId);
  assert.ok(checked.ok);
  ayqReplaceWithBackup(dataDir, checked.manifest);
  ayqFinishRestore(dataDir);
  // One budget, Monday's, under Monday's folder; Friday's folder is gone.
  assert.equal(existsSync(join(dataDir, 'AYQ-newer02')), false);
  assert.deepEqual(live(dataDir), monday);
});

// ---------------------------------------------------------------------------
// §3.4 A backup written by a newer AYQ is refused.

test('a backup whose store a newer AYQ wrote is refused, not repaired', async () => {
  const dataDir = await dataDirWith('monday');
  const { backupId } = create(dataDir);
  writeState(dataDir, 'friday');
  const before = live(dataDir);

  const root = join(ayqBackupsDir(dataDir), backupId);
  const store = JSON.parse(readFileSync(join(root, 'ayq-store.json'), 'utf8'));
  store.version = AYQ_STORE_VERSION + 1;
  writeFileSync(join(root, 'ayq-store.json'), JSON.stringify(store, null, 2));
  // Sealed properly, so the version is the only thing wrong with it.
  reseal(dataDir, backupId, manifest => {
    manifest.storeVersion = AYQ_STORE_VERSION + 1;
  });

  assert.deepEqual(ayqCheckBackup(dataDir, backupId), {
    ok: false,
    refusal: 'newer-store',
  });
  assert.equal(ayqBackupOverview(dataDir).backups[0].restorable, false);
  assert.deepEqual(live(dataDir), before);
});

test('a store that claims a newer version than its description says is refused too', async () => {
  const dataDir = await dataDirWith('monday');
  const { backupId } = create(dataDir);
  const root = join(ayqBackupsDir(dataDir), backupId);
  const store = JSON.parse(readFileSync(join(root, 'ayq-store.json'), 'utf8'));
  store.version = AYQ_STORE_VERSION + 3;
  writeFileSync(join(root, 'ayq-store.json'), JSON.stringify(store, null, 2));
  // The description still claims the current version.
  reseal(dataDir, backupId, () => undefined);
  assert.deepEqual(ayqCheckBackup(dataDir, backupId), {
    ok: false,
    refusal: 'newer-store',
  });
});

test('a backup packed by a newer AYQ is refused before it is read', async () => {
  const dataDir = await dataDirWith('monday');
  const { backupId } = create(dataDir);
  reseal(dataDir, backupId, manifest => {
    manifest.format = AYQ_BACKUP_FORMAT + 1;
  });
  assert.deepEqual(ayqCheckBackup(dataDir, backupId), {
    ok: false,
    refusal: 'newer-format',
  });
});

test('a backup of an older store is restorable; the store migrates when it opens', async () => {
  const dataDir = await dataDirWith('monday');
  // A version 8 store, which the current AYQ migrates on reading (03 §12.5).
  const old = JSON.parse(readFileSync(ayqStorePath(dataDir), 'utf8'));
  old.version = 8;
  delete old.counterpartyFoldVersion;
  writeFileSync(ayqStorePath(dataDir), JSON.stringify(old, null, 2));
  const { backupId, manifest } = create(dataDir);
  assert.equal(manifest.storeVersion, 8);
  assert.equal(ayqCheckBackup(dataDir, backupId).ok, true);
});

// ---------------------------------------------------------------------------
// §3.5 Automatic backup fires on its trigger; a failure is recorded as status.

test('an automatic backup is due with none, not again within the day, and due after it', async () => {
  const dataDir = await dataDirWith('monday');
  const at = new Date('2026-09-23T08:00:00.000Z');
  assert.equal(ayqAutomaticBackupDue(dataDir, at), true);
  create(dataDir, at.toISOString(), 'automatic');
  assert.equal(
    ayqAutomaticBackupDue(dataDir, new Date('2026-09-23T20:00:00.000Z')),
    false,
  );
  assert.equal(
    ayqAutomaticBackupDue(
      dataDir,
      new Date(at.getTime() + AYQ_BACKUP_POLICY.everyHours * 3_600_000 + 1),
    ),
    true,
  );
});

test('with no budget yet there is nothing to back up, and no failure to report', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'ayq-backup-'));
  assert.equal(ayqAutomaticBackupDue(dataDir, new Date()), false);
});

test('an automatic backup that cannot be written is recorded as a failed attempt', async () => {
  const dataDir = await dataDirWith('monday');
  // A file where the backups folder should be: every write into it fails, for
  // real, with no fault injected.
  writeFileSync(ayqBackupsDir(dataDir), 'not a folder');
  const before = live(dataDir);

  const made = ayqCreateBackup(dataDir, {
    trigger: 'automatic',
    identity: IDENTITY,
    now: new Date('2026-09-23T08:00:00.000Z'),
  });
  assert.deepEqual(made, { outcome: 'failed', failure: 'write-failed' });

  const overview = ayqBackupOverview(dataDir);
  assert.equal(overview.lastAutomaticAttempt?.outcome, 'failed');
  assert.equal(overview.lastAutomaticAttempt?.failure, 'write-failed');
  assert.equal(overview.lastAutomaticAttempt?.at, '2026-09-23T08:00:00.000Z');
  assert.equal(overview.lastAttempt?.outcome, 'failed');
  assert.deepEqual(overview.backups, []);
  // Failing to back up changes nothing about what is backed up.
  assert.deepEqual(live(dataDir), before);
});

test('a backup interrupted while writing is never listed and never restorable', async () => {
  const dataDir = await dataDirWith('monday');
  for (const step of ['budget-copied', 'manifest-written']) {
    const made = ayqCreateBackup(dataDir, {
      trigger: 'manual',
      identity: IDENTITY,
      fault: reached => {
        if (reached === step) throw new Error(`stopped at ${step}`);
      },
    });
    assert.deepEqual(
      made,
      { outcome: 'failed', failure: 'write-failed' },
      step,
    );
  }
  assert.deepEqual(ayqBackupOverview(dataDir).backups, []);
  assert.deepEqual(readdirSync(ayqBackupsDir(dataDir)), []);
});

// ---------------------------------------------------------------------------
// §3.6 History and status reflect real outcomes.

test('history and status say what actually happened, newest first', async () => {
  const dataDir = await dataDirWith('monday');
  const first = create(dataDir, '2026-09-20T08:00:00.000Z', 'automatic');
  writeState(dataDir, 'tuesday');
  const second = create(dataDir, '2026-09-21T08:00:00.000Z', 'manual');

  let overview = ayqBackupOverview(dataDir);
  assert.deepEqual(
    overview.backups.map(one => one.backupId),
    [second.backupId, first.backupId],
  );
  assert.equal(overview.latestBackupId, second.backupId);
  assert.deepEqual(
    overview.backups.map(one => one.trigger),
    ['manual', 'automatic'],
  );
  assert.equal(overview.lastAttempt?.outcome, 'succeeded');
  assert.equal(overview.lastAttempt?.backupId, second.backupId);
  assert.equal(overview.lastAutomaticAttempt?.backupId, first.backupId);
  assert.ok(overview.backups.every(one => one.restorable && one.bytes > 0));

  // A failure after them is the last attempt; the backups that exist still do.
  rmSync(join(dataDir, FOLDER), { recursive: true });
  const failed = ayqCreateBackup(dataDir, {
    trigger: 'manual',
    identity: IDENTITY,
  });
  assert.deepEqual(failed, { outcome: 'failed', failure: 'no-budget' });
  overview = ayqBackupOverview(dataDir);
  assert.equal(overview.lastAttempt?.outcome, 'failed');
  assert.equal(overview.lastAttempt?.failure, 'no-budget');
  assert.equal(overview.latestBackupId, second.backupId);
  assert.equal(overview.backups.length, 2);
});

test("only the newest automatic backups are kept; a person's own are never removed", async () => {
  const dataDir = await dataDirWith('monday');
  const manual = create(dataDir, '2026-01-01T08:00:00.000Z', 'manual');
  const total = AYQ_BACKUP_POLICY.automaticKept + 3;
  const automatic: string[] = [];
  for (let day = 1; day <= total; day += 1) {
    automatic.push(
      create(
        dataDir,
        `2026-02-${String(day).padStart(2, '0')}T08:00:00.000Z`,
        'automatic',
      ).backupId,
    );
  }
  const kept = ayqBackupOverview(dataDir).backups;
  assert.equal(
    kept.filter(one => one.trigger === 'automatic').length,
    AYQ_BACKUP_POLICY.automaticKept,
  );
  assert.ok(
    kept.some(one => one.backupId === manual.backupId),
    'a manual backup was removed',
  );
  // The ones removed are the oldest.
  for (const old of automatic.slice(0, 3)) {
    assert.ok(
      !kept.some(one => one.backupId === old),
      `${old} should have been removed`,
    );
  }
});

test('the status is operational evidence, and carries no money', async () => {
  const dataDir = await dataDirWith('monday');
  create(dataDir);
  const status = readFileSync(join(dataDir, 'ayq-backup-status.json'), 'utf8');
  // Times, triggers, outcomes and an id. No name, no amount, no path.
  assert.doesNotMatch(status, /Shop|TESTSHOP|budget monday|[A-Z]:\\\\|\/tmp\//);
  const overview = JSON.stringify(ayqBackupOverview(dataDir));
  assert.doesNotMatch(
    overview,
    /Shop|TESTSHOP|AYQ-test0001|ayq-backups|[A-Z]:\\\\/,
  );
});
