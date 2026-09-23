// Backup and restore of one coherent AYQ state (02 §5.8–§5.11, 03 §12, 04 A38).
//
// What AYQ holds lives in two places beside each other in the data directory:
// the Actual budget (a folder of its own, the SQLite file inside it) and the AYQ
// store (`ayq-store.json`), which carries the rules, the aliases, the plan and
// every decision about who filed what. Neither means anything without the other:
// a budget from Tuesday with Friday's rules files Tuesday's transactions under
// decisions made about transactions it does not hold. So a backup is always both
// halves, captured while nothing is writing either, and a restore always puts
// both back — or neither.
//
// This module is the file work and nothing else. It never opens the budget and
// never talks to Actual; the engine closes the budget before calling in here and
// opens it again afterwards (`ayq-engine.ts`), which is what makes "nothing is
// writing" true rather than hoped for.
//
// ## A backup
//
//   ayq-backups/<id>/manifest.json   what the set is, and a SHA-256 per file
//   ayq-backups/<id>/budget/…        the budget folder, every file in it
//   ayq-backups/<id>/ayq-store.json  the AYQ store, byte for byte
//
// It is written under `.partial-<id>` and renamed into place only when complete,
// so a backup interrupted halfway is never listed and never restorable. The
// manifest's own digest covers the id, the moment and every file's hash, so a
// part taken from another backup, or a manifest carried over from one, does not
// check out.
//
// ## A restore
//
// The set is checked completely before anything moves. Then its files are
// copied beside the data directory and checked again, a journal is written, the
// current budget and store are moved aside, and the restored ones are moved in.
// Each move is a rename, and the journal says how far it got: a restore that
// fails, or a process that dies halfway through one, is put back by
// `ayqRecoverInterruptedRestore` — which the engine also runs on every start,
// before it opens anything.

import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import type {
  AyqBackupAttempt,
  AyqBackupEntry,
  AyqBackupFailure,
  AyqBackupOverview,
  AyqBackupTrigger,
  AyqRestoreRefusal,
} from '../../ayq-client/src/ayq-ipc-contract.ts';

import {
  AYQ_STORE_VERSION,
  ayqReadStore,
  ayqStorePath,
  ayqStoreVersionOf,
} from './ayq-store.ts';

/**
 * PROVISIONAL (06 §8.5). The choices 03 §12.2 and 04 A38 leave open, in the
 * one place they are made, for the owner to overrule.
 *
 *   everyHours      An automatic backup is made when the engine starts and the
 *                   newest backup of any kind is older than this. Starting is
 *                   the one moment nothing has opened the budget yet, so the
 *                   capture needs no pause in anybody's work.
 *   automaticKept   How many automatic backups are kept; older ones are removed
 *                   once a newer one has been written. Backups a person made,
 *                   and the ones kept before a restore, are never removed by
 *                   AYQ.
 *
 * And one choice made alongside them: a restore first backs up what it is about
 * to replace (trigger `before-restore`) and does not proceed if it cannot, so
 * that restoring the wrong backup can itself be undone.
 */
export const AYQ_BACKUP_POLICY = {
  everyHours: 24,
  automaticKept: 10,
} as const;

/** How a backup is packed. A set packed by a newer AYQ is refused. */
export const AYQ_BACKUP_FORMAT = 1;

/** The budget Actual keeps for AYQ, found the way the engine finds it. */
const BUDGET_NAME = 'AYQ';

const BACKUPS = 'ayq-backups';
const STATUS = 'ayq-backup-status.json';
const RESTORING = '.ayq-restore';
const MANIFEST = 'manifest.json';
const STORE = 'ayq-store.json';

/** `20260923T081523456Z-k3x9qa`: sortable by time, and nothing else. */
const BACKUP_ID = /^\d{8}T\d{9}Z-[a-z0-9]{6}$/;

/** A file of the set, as the manifest names it: `/`-separated and relative. */
export type AyqBackupFile = { path: string; bytes: number; sha256: string };

export type AyqBackupManifest = {
  format: number;
  backupId: string;
  createdAt: string;
  trigger: AyqBackupTrigger;
  productVersion: string;
  buildNumber: string;
  /** The folder the budget lived in, which is its Actual id. */
  budgetFolder: string;
  storeVersion: number;
  files: AyqBackupFile[];
  /** SHA-256 over the id, the moment and every file's hash, in order. */
  digest: string;
};

/** What the engine knows about the build doing the backing up. */
export type AyqBackupIdentity = { productVersion: string; buildNumber: string };

/**
 * A step a restore or a backup has reached, handed to a test that wants to fail
 * it there. Production passes nothing.
 */
export type AyqBackupFault = (step: string) => void;

export function ayqBackupsDir(dataDir: string): string {
  return join(dataDir, BACKUPS);
}

function statusPath(dataDir: string): string {
  return join(dataDir, STATUS);
}

function restoreDir(dataDir: string): string {
  return join(dataDir, RESTORING);
}

function sha256(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * The seal over a set: its id, its moment and every file's hash, in order.
 *
 * Exported for the acceptance run, which has to build a set that is sealed
 * correctly and wrong in exactly one other way.
 */
export function ayqManifestDigest(
  backupId: string,
  createdAt: string,
  files: readonly AyqBackupFile[],
): string {
  const lines = [
    `format ${AYQ_BACKUP_FORMAT}`,
    `id ${backupId}`,
    `at ${createdAt}`,
    ...files.map(one => `${one.path} ${one.bytes} ${one.sha256}`),
  ];
  return sha256(lines.join('\n'));
}

function newBackupId(now: Date): string {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace('.', '');
  return `${stamp}-${Math.random().toString(36).slice(2, 8).padEnd(6, '0')}`;
}

/**
 * The folder Actual keeps AYQ's budget in, or null when there is none yet.
 *
 * Actual treats every directory holding a `metadata.json` as a budget and names
 * it by its folder; the engine opens the first called `AYQ`. The same scan, in
 * the same order, so this and the engine never disagree about which one it is.
 */
export function ayqBudgetFolder(dataDir: string): string | null {
  if (!existsSync(dataDir)) return null;
  for (const entry of readdirSync(dataDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name === BACKUPS || entry.name === RESTORING) continue;
    const metadata = join(dataDir, entry.name, 'metadata.json');
    if (!existsSync(metadata)) continue;
    try {
      const held = JSON.parse(readFileSync(metadata, 'utf8')) as {
        budgetName?: unknown;
      };
      if (held.budgetName === BUDGET_NAME) return entry.name;
    } catch {
      // Not a budget anybody can open, so not this one.
    }
  }
  return null;
}

/** Every file under a folder, as `/`-separated paths relative to it. */
function filesUnder(root: string, prefix = ''): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(join(root, prefix), {
    withFileTypes: true,
  })) {
    const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) found.push(...filesUnder(root, relative));
    else if (entry.isFile()) found.push(relative);
  }
  return found.sort();
}

function isFolder(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function writeAtomically(path: string, text: string): void {
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, text, 'utf8');
  renameSync(temporary, path);
}

// ---------------------------------------------------------------------------
// Status: the outcome of each attempt, kept as state (030 §2).

type AyqBackupStatus = {
  version: 1;
  lastAttempt: AyqBackupAttempt | null;
  lastAutomaticAttempt: AyqBackupAttempt | null;
};

function readStatus(dataDir: string): AyqBackupStatus {
  try {
    const held = JSON.parse(
      readFileSync(statusPath(dataDir), 'utf8'),
    ) as Partial<AyqBackupStatus>;
    return {
      version: 1,
      lastAttempt: held.lastAttempt ?? null,
      lastAutomaticAttempt: held.lastAutomaticAttempt ?? null,
    };
  } catch {
    // Absent on a first launch; unreadable is treated the same, because the
    // status is evidence about attempts and the backups themselves are on disk.
    return { version: 1, lastAttempt: null, lastAutomaticAttempt: null };
  }
}

function recordAttempt(dataDir: string, attempt: AyqBackupAttempt): void {
  const status = readStatus(dataDir);
  status.lastAttempt = attempt;
  if (attempt.trigger === 'automatic') status.lastAutomaticAttempt = attempt;
  try {
    mkdirSync(dataDir, { recursive: true });
    writeAtomically(
      statusPath(dataDir),
      `${JSON.stringify(status, null, 2)}\n`,
    );
  } catch {
    // Nowhere to say it. The attempt's own outcome still goes back to whoever
    // asked, which for a person pressing the button is the screen.
  }
}

// ---------------------------------------------------------------------------
// Making a backup.

export type AyqBackupOutcome =
  | { outcome: 'created'; backupId: string; manifest: AyqBackupManifest }
  | { outcome: 'failed'; failure: AyqBackupFailure };

/**
 * Captures the budget and the store as one set.
 *
 * The caller guarantees nothing is writing either: the engine calls this only
 * with the budget closed and every other request held. Every attempt, made or
 * failed, is recorded as the last attempt.
 */
export function ayqCreateBackup(
  dataDir: string,
  options: {
    trigger: AyqBackupTrigger;
    identity: AyqBackupIdentity;
    now?: Date;
    fault?: AyqBackupFault;
  },
): AyqBackupOutcome {
  const now = options.now ?? new Date();
  const at = now.toISOString();
  const outcome = capture(dataDir, now, options);
  recordAttempt(dataDir, {
    at,
    trigger: options.trigger,
    outcome: outcome.outcome === 'created' ? 'succeeded' : 'failed',
    backupId: outcome.outcome === 'created' ? outcome.backupId : null,
    failure: outcome.outcome === 'failed' ? outcome.failure : null,
  });
  if (outcome.outcome === 'created' && options.trigger === 'automatic') {
    pruneAutomatic(dataDir);
  }
  return outcome;
}

function capture(
  dataDir: string,
  now: Date,
  options: {
    trigger: AyqBackupTrigger;
    identity: AyqBackupIdentity;
    fault?: AyqBackupFault;
  },
): AyqBackupOutcome {
  const folder = ayqBudgetFolder(dataDir);
  if (folder === null) return { outcome: 'failed', failure: 'no-budget' };

  // The store as it stands on disk. A store AYQ could not read is not captured
  // as though it were one: the engine would set it aside on opening, and a
  // backup of it would restore a loss.
  let storeBytes: Buffer;
  let storeVersion: number;
  try {
    storeBytes = existsSync(ayqStorePath(dataDir))
      ? readFileSync(ayqStorePath(dataDir))
      : // No store yet is a real state — the one AYQ reads as empty — and the
        // set records exactly that, so a restore of it is that state too.
        Buffer.from(
          `${JSON.stringify(ayqReadStore(dataDir), null, 2)}\n`,
          'utf8',
        );
    storeVersion = ayqStoreVersionOf(JSON.parse(storeBytes.toString('utf8')));
  } catch {
    return { outcome: 'failed', failure: 'store-unreadable' };
  }

  const backupId = newBackupId(now);
  const backups = ayqBackupsDir(dataDir);
  const partial = join(backups, `.partial-${backupId}`);
  try {
    mkdirSync(join(partial, 'budget'), { recursive: true });
    const source = join(dataDir, folder);
    for (const relative of filesUnder(source)) {
      const target = join(partial, 'budget', ...relative.split('/'));
      mkdirSync(join(target, '..'), { recursive: true });
      copyFileSync(join(source, ...relative.split('/')), target);
    }
    options.fault?.('budget-copied');
    writeFileSync(join(partial, STORE), storeBytes);

    // Hashed from the copies, not the originals: what is recorded is what is
    // actually in the backup.
    const files = filesUnder(partial).map(relative => {
      const bytes = readFileSync(join(partial, ...relative.split('/')));
      return { path: relative, bytes: bytes.length, sha256: sha256(bytes) };
    });
    const createdAt = now.toISOString();
    const manifest: AyqBackupManifest = {
      format: AYQ_BACKUP_FORMAT,
      backupId,
      createdAt,
      trigger: options.trigger,
      productVersion: options.identity.productVersion,
      buildNumber: options.identity.buildNumber,
      budgetFolder: folder,
      storeVersion,
      files,
      digest: ayqManifestDigest(backupId, createdAt, files),
    };
    writeFileSync(
      join(partial, MANIFEST),
      `${JSON.stringify(manifest, null, 2)}\n`,
      'utf8',
    );
    options.fault?.('manifest-written');
    renameSync(partial, join(backups, backupId));
    return { outcome: 'created', backupId, manifest };
  } catch {
    rmSync(partial, { recursive: true, force: true });
    return { outcome: 'failed', failure: 'write-failed' };
  }
}

/** Removes automatic backups beyond the newest `automaticKept`. */
function pruneAutomatic(dataDir: string): void {
  const automatic = listed(dataDir).filter(
    one => one.manifest.trigger === 'automatic',
  );
  for (const old of automatic.slice(AYQ_BACKUP_POLICY.automaticKept)) {
    rmSync(join(ayqBackupsDir(dataDir), old.manifest.backupId), {
      recursive: true,
      force: true,
    });
  }
}

/**
 * Takes away what an interrupted backup left behind.
 *
 * A `.partial-` folder is a backup that never finished, so it was never listed
 * and never restorable; removing it loses nothing.
 */
export function ayqClearPartialBackups(dataDir: string): void {
  const backups = ayqBackupsDir(dataDir);
  if (!isFolder(backups)) return;
  for (const entry of readdirSync(backups, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name.startsWith('.partial-')) {
      rmSync(join(backups, entry.name), { recursive: true, force: true });
    }
  }
}

// ---------------------------------------------------------------------------
// What exists.

type Listed = { manifest: AyqBackupManifest; bytes: number };

/** Every finished backup whose manifest reads, newest first. */
function listed(dataDir: string): Listed[] {
  const backups = ayqBackupsDir(dataDir);
  // Not there yet, or something that is not a folder standing in its place: in
  // either case there are no backups to list, and saying so is not an error.
  if (!isFolder(backups)) return [];
  const found: Listed[] = [];
  for (const entry of readdirSync(backups, { withFileTypes: true })) {
    if (!entry.isDirectory() || !BACKUP_ID.test(entry.name)) continue;
    try {
      const manifest = JSON.parse(
        readFileSync(join(backups, entry.name, MANIFEST), 'utf8'),
      ) as AyqBackupManifest;
      if (manifest.backupId !== entry.name) continue;
      const bytes = (manifest.files ?? []).reduce(
        (sum, one) => sum + Number(one.bytes ?? 0),
        0,
      );
      found.push({ manifest, bytes });
    } catch {
      // A folder whose description cannot be read is not a backup AYQ can
      // restore, and listing it would offer one.
    }
  }
  return found.sort((a, b) =>
    a.manifest.createdAt < b.manifest.createdAt ? 1 : -1,
  );
}

export function ayqBackupOverview(dataDir: string): AyqBackupOverview {
  const status = readStatus(dataDir);
  const backups: AyqBackupEntry[] = listed(dataDir).map(
    ({ manifest, bytes }) => ({
      backupId: manifest.backupId,
      createdAt: manifest.createdAt,
      trigger: manifest.trigger,
      productVersion: String(manifest.productVersion ?? ''),
      buildNumber: String(manifest.buildNumber ?? ''),
      bytes,
      restorable:
        manifest.format <= AYQ_BACKUP_FORMAT &&
        Number(manifest.storeVersion) <= AYQ_STORE_VERSION,
    }),
  );
  return {
    backups,
    latestBackupId: backups[0]?.backupId ?? null,
    lastAttempt: status.lastAttempt,
    lastAutomaticAttempt: status.lastAutomaticAttempt,
    automatic: {
      everyHours: AYQ_BACKUP_POLICY.everyHours,
      kept: AYQ_BACKUP_POLICY.automaticKept,
    },
  };
}

/** Whether the engine should make an automatic backup now. */
export function ayqAutomaticBackupDue(dataDir: string, now: Date): boolean {
  if (ayqBudgetFolder(dataDir) === null) return false;
  const newest = listed(dataDir)[0];
  if (newest === undefined) return true;
  const age = now.getTime() - Date.parse(newest.manifest.createdAt);
  return !(age >= 0 && age < AYQ_BACKUP_POLICY.everyHours * 3_600_000);
}

// ---------------------------------------------------------------------------
// Checking a set, completely, before anything is replaced.

export type AyqBackupChecked =
  | { ok: true; manifest: AyqBackupManifest }
  | { ok: false; refusal: AyqRestoreRefusal };

function refuse(refusal: AyqRestoreRefusal): AyqBackupChecked {
  return { ok: false, refusal };
}

/** A manifest path that stays inside its set and names one of its two halves. */
function safePath(path: unknown): path is string {
  if (typeof path !== 'string' || path === '') return false;
  const parts = path.split('/');
  if (parts.some(part => part === '' || part === '.' || part === '..')) {
    return false;
  }
  if (/[\\:]/.test(path)) return false;
  return path === STORE || (parts[0] === 'budget' && parts.length >= 2);
}

/**
 * Checks every byte of a set against its own description.
 *
 * Reads the files from `root` (the set itself, or a staged copy of it), so the
 * same check guards the backup before a restore begins and the copy a restore
 * is about to move into place.
 */
function checkFiles(
  root: string,
  manifest: AyqBackupManifest,
): AyqRestoreRefusal | null {
  const listedPaths = manifest.files.map(one => one.path);
  const held = filesUnder(root).filter(path => path !== MANIFEST);
  const missing = listedPaths.filter(path => !held.includes(path));
  const extra = held.filter(path => !listedPaths.includes(path));
  if (missing.length > 0 || extra.length > 0) return 'incomplete';
  for (const one of manifest.files) {
    let bytes: Buffer;
    try {
      bytes = readFileSync(join(root, ...one.path.split('/')));
    } catch {
      return 'unreadable';
    }
    if (bytes.length !== one.bytes || sha256(bytes) !== one.sha256) {
      return 'mismatch';
    }
  }
  return null;
}

export function ayqCheckBackup(
  dataDir: string,
  backupId: string,
): AyqBackupChecked {
  // An id is one of AYQ's own, or it is nothing. This is also what keeps a
  // request from naming a folder outside the backups: there is no id of that
  // shape that is a path.
  if (typeof backupId !== 'string' || !BACKUP_ID.test(backupId)) {
    return refuse('unknown-backup');
  }
  const root = join(ayqBackupsDir(dataDir), backupId);
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    return refuse('unknown-backup');
  }

  let manifest: AyqBackupManifest;
  try {
    manifest = JSON.parse(
      readFileSync(join(root, MANIFEST), 'utf8'),
    ) as AyqBackupManifest;
  } catch {
    return refuse(
      existsSync(join(root, MANIFEST)) ? 'unreadable' : 'incomplete',
    );
  }
  if (typeof manifest !== 'object' || manifest === null) {
    return refuse('unreadable');
  }

  // A newer packing is refused before any of it is interpreted.
  if (!Number.isInteger(manifest.format)) return refuse('unreadable');
  if (manifest.format > AYQ_BACKUP_FORMAT) return refuse('newer-format');

  // The description belongs to this set: a manifest carried over from another
  // backup names that backup, and its digest is over that backup's moment.
  if (manifest.backupId !== backupId) return refuse('mismatch');
  if (
    !Array.isArray(manifest.files) ||
    !manifest.files.every(one => safePath(one?.path))
  ) {
    return refuse('unreadable');
  }
  if (
    typeof manifest.budgetFolder !== 'string' ||
    !/^[A-Za-z0-9._-]+$/.test(manifest.budgetFolder)
  ) {
    return refuse('unreadable');
  }
  const paths = manifest.files.map(one => one.path);
  if (
    !paths.includes(STORE) ||
    !paths.includes('budget/db.sqlite') ||
    !paths.includes('budget/metadata.json')
  ) {
    return refuse('incomplete');
  }
  if (
    manifest.digest !==
    ayqManifestDigest(manifest.backupId, manifest.createdAt, manifest.files)
  ) {
    return refuse('mismatch');
  }

  const files = checkFiles(root, manifest);
  if (files !== null) return refuse(files);

  // Both halves are what they say they are. Now what they say.
  let store: unknown;
  try {
    store = JSON.parse(readFileSync(join(root, STORE), 'utf8'));
  } catch {
    return refuse('unreadable');
  }
  const storeVersion = ayqStoreVersionOf(store);
  // 06 §6.2: a store written by a newer AYQ is refused, not repaired. Read from
  // the store itself, not only from the description of it.
  if (
    storeVersion > AYQ_STORE_VERSION ||
    manifest.storeVersion > AYQ_STORE_VERSION
  ) {
    return refuse('newer-store');
  }
  if (storeVersion !== manifest.storeVersion) return refuse('mismatch');

  try {
    const metadata = JSON.parse(
      readFileSync(join(root, 'budget', 'metadata.json'), 'utf8'),
    ) as { budgetName?: unknown };
    if (metadata.budgetName !== BUDGET_NAME) return refuse('mismatch');
  } catch {
    return refuse('unreadable');
  }
  const header = readFileSync(join(root, 'budget', 'db.sqlite')).subarray(
    0,
    16,
  );
  if (header.toString('latin1') !== 'SQLite format 3\u0000') {
    return refuse('unreadable');
  }

  return { ok: true, manifest };
}

// ---------------------------------------------------------------------------
// Replacing the current state with a checked set.

type AyqRestoreJournal = {
  format: 1;
  backupId: string;
  phase: 'staged' | 'complete';
  /** The budget folder that was live when the restore began. */
  liveFolder: string;
  /** Whether a store file existed then. */
  liveStore: boolean;
  /** The folder the restored budget goes into. */
  incomingFolder: string;
};

function journalPath(dataDir: string): string {
  return join(restoreDir(dataDir), 'journal.json');
}

/** Raised when the staged copy does not check out: nothing has been replaced. */
export class AyqRestoreRefused extends Error {
  readonly refusal: AyqRestoreRefusal;

  constructor(refusal: AyqRestoreRefusal) {
    super(`restore refused: ${refusal}`);
    this.refusal = refusal;
  }
}

/**
 * Moves a checked set into place, as one unit.
 *
 * The budget must be closed. On return the restored state is live and the
 * previous one is held under `.ayq-restore/previous` until the engine has
 * opened the restored budget and calls `ayqFinishRestore` — or, if it cannot,
 * `ayqRecoverInterruptedRestore`, which puts the previous state back.
 *
 * Throws on any failure. Whatever it throws, the caller runs the recovery;
 * the recovery is the same one the engine runs after a crash, so the path a
 * test exercises by failing a step is the path a power cut takes.
 */
export function ayqReplaceWithBackup(
  dataDir: string,
  manifest: AyqBackupManifest,
  fault?: AyqBackupFault,
): void {
  // Whatever an earlier attempt left is resolved before this one looks at
  // what is live.
  ayqRecoverInterruptedRestore(dataDir);
  const working = restoreDir(dataDir);

  const liveFolder = ayqBudgetFolder(dataDir);
  if (liveFolder === null) {
    throw new Error('there is no current budget to replace');
  }
  const incomingFolder = manifest.budgetFolder;
  if (
    incomingFolder !== liveFolder &&
    existsSync(join(dataDir, incomingFolder))
  ) {
    throw new AyqRestoreRefused('conflict');
  }

  // 1. Stage: a copy of the set beside the data directory, on the same volume,
  //    checked again byte for byte. What moves into place is what was checked.
  const incoming = join(working, 'incoming');
  const setRoot = join(ayqBackupsDir(dataDir), manifest.backupId);
  mkdirSync(incoming, { recursive: true });
  for (const one of manifest.files) {
    const target = join(incoming, ...one.path.split('/'));
    mkdirSync(join(target, '..'), { recursive: true });
    copyFileSync(join(setRoot, ...one.path.split('/')), target);
  }
  const staged = checkFiles(incoming, manifest);
  if (staged !== null) throw new AyqRestoreRefused(staged);
  fault?.('staged');

  // 2. The journal, before anything live is touched. From here on, recovery
  //    knows what was live and what was coming in.
  const journal: AyqRestoreJournal = {
    format: 1,
    backupId: manifest.backupId,
    phase: 'staged',
    liveFolder,
    liveStore: existsSync(ayqStorePath(dataDir)),
    incomingFolder,
  };
  writeAtomically(
    journalPath(dataDir),
    `${JSON.stringify(journal, null, 2)}\n`,
  );
  fault?.('journal-written');

  // 3. The current state steps aside.
  const previous = join(working, 'previous');
  mkdirSync(previous, { recursive: true });
  renameSync(join(dataDir, liveFolder), join(previous, 'budget'));
  fault?.('budget-moved-aside');
  if (journal.liveStore) {
    renameSync(ayqStorePath(dataDir), join(previous, STORE));
  }
  fault?.('store-moved-aside');

  // 4. The restored state moves in.
  renameSync(join(incoming, 'budget'), join(dataDir, incomingFolder));
  fault?.('budget-moved-in');
  renameSync(join(incoming, STORE), ayqStorePath(dataDir));
  fault?.('store-moved-in');
}

/** The restored state opened: the previous one is no longer needed here. */
export function ayqFinishRestore(dataDir: string): void {
  const path = journalPath(dataDir);
  if (existsSync(path)) {
    const journal = JSON.parse(readFileSync(path, 'utf8')) as AyqRestoreJournal;
    journal.phase = 'complete';
    writeAtomically(path, `${JSON.stringify(journal, null, 2)}\n`);
  }
  rmSync(restoreDir(dataDir), { recursive: true, force: true });
}

/**
 * Puts back whatever a restore that did not finish had moved.
 *
 * Safe to run at any time and on any state: with no restore in progress it
 * does nothing. It reads what is on disk rather than trusting a phase, because
 * a process can die between any two renames:
 *
 *   - the previous budget is under `previous/budget`: whatever stands in the
 *     live place came from the backup, and is removed; the previous goes back;
 *   - the previous store is under `previous/`: the same;
 *   - there was no store when the restore began: a store in the live place came
 *     from the backup, and is removed.
 *
 * Nothing it removes is the only copy of anything: it is a copy of a backup
 * that is still in `ayq-backups`.
 */
export function ayqRecoverInterruptedRestore(
  dataDir: string,
): 'none' | 'rolled-back' | 'finished' {
  const working = restoreDir(dataDir);
  if (!existsSync(working)) return 'none';

  let journal: AyqRestoreJournal | null = null;
  try {
    journal = JSON.parse(
      readFileSync(journalPath(dataDir), 'utf8'),
    ) as AyqRestoreJournal;
  } catch {
    // No journal: the restore stopped while staging, before anything live was
    // touched. The staged copy is all there is to take away.
    journal = null;
  }

  if (journal !== null && journal.phase === 'complete') {
    rmSync(working, { recursive: true, force: true });
    return 'finished';
  }

  if (journal !== null) {
    const previousBudget = join(working, 'previous', 'budget');
    if (existsSync(previousBudget)) {
      const incomingLive = join(dataDir, journal.incomingFolder);
      if (existsSync(incomingLive)) {
        rmSync(incomingLive, { recursive: true, force: true });
      }
      const liveLive = join(dataDir, journal.liveFolder);
      if (existsSync(liveLive)) {
        rmSync(liveLive, { recursive: true, force: true });
      }
      renameSync(previousBudget, liveLive);
    }
    const previousStore = join(working, 'previous', STORE);
    if (existsSync(previousStore)) {
      rmSync(ayqStorePath(dataDir), { force: true });
      renameSync(previousStore, ayqStorePath(dataDir));
    } else if (!journal.liveStore) {
      rmSync(ayqStorePath(dataDir), { force: true });
    }
  }

  rmSync(working, { recursive: true, force: true });
  return 'rolled-back';
}
