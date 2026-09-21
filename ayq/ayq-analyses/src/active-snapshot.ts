// AYQ Analyses — the one active snapshot the application holds.
//
// The owner decided that what he loads stays loaded (r002 §6.1). The
// application therefore keeps its own copy of the active snapshot — the exact
// validated bytes, never a derived figure — in its per-user data directory,
// as 02_ARCHITECTURE r006 §7.12 permits. There is one copy, no archive and no
// history. It is read and revalidated at every launch through the same
// contract validator a manual load uses, and nothing here follows, polls or
// adopts a newer export on its own.
//
// Replacement is failure-safe: a candidate is validated first; its bytes are
// written beside the copy, read back and compared; only then does one rename
// make it the active copy. Until that rename the previous copy is untouched
// and in use, and a failed or interrupted replacement never leaves the
// application with neither (r002 §11.5).
//
// This module runs in the main process only. It takes the directory as a
// parameter so the suite can exercise it against a scratch directory.

import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs/promises';
import { join } from 'node:path';
import { parseAndValidateSnapshot, type SnapshotInvalidReason } from './validate.js';
import type { AyqAnalyticalSnapshot } from './types.js';

/** What the renderer may be told about the copy: a display name, never a path. */
export interface SnapshotIdentity {
  /** The name of the file the snapshot was loaded from, retained as display metadata (r002 §11.3). */
  fileName: string | null;
}

export type ActiveSnapshot =
  | { status: 'none' }
  | { status: 'loaded'; snapshot: AyqAnalyticalSnapshot; identity: SnapshotIdentity }
  | { status: 'invalid'; reason: SnapshotInvalidReason; identity: SnapshotIdentity };

export type ReplaceOutcome =
  | { status: 'loaded'; snapshot: AyqAnalyticalSnapshot; identity: SnapshotIdentity }
  /** The candidate was refused by the validator; the active copy is untouched. */
  | { status: 'invalid'; reason: SnapshotInvalidReason }
  /** The candidate was valid but its copy could not be proven on disk; the active copy is untouched. */
  | { status: 'failed' };

/** The filesystem operations replacement uses; the suite substitutes failing ones. */
export type ActiveSnapshotIo = Pick<typeof fs, 'mkdir' | 'readFile' | 'writeFile' | 'rename' | 'rm'>;

const SNAPSHOT_FILE = 'active-snapshot.json';
const META_FILE = 'active-snapshot.meta.json';

export function activeSnapshotPaths(directory: string): { snapshot: string; meta: string } {
  return { snapshot: join(directory, SNAPSHOT_FILE), meta: join(directory, META_FILE) };
}

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'ENOENT';
}

async function readIdentity(metaPath: string, io: ActiveSnapshotIo): Promise<SnapshotIdentity> {
  try {
    const parsed: unknown = JSON.parse(await io.readFile(metaPath, 'utf8'));
    const fileName =
      typeof parsed === 'object' && parsed !== null && typeof (parsed as { fileName?: unknown }).fileName === 'string'
        ? (parsed as { fileName: string }).fileName
        : null;
    return { fileName };
  } catch {
    // A missing or unreadable name is no name: the copy is still the copy.
    return { fileName: null };
  }
}

/**
 * The launch read (r002 §6.2). No copy is "No data loaded"; a copy that
 * revalidates is the active snapshot; a copy that does not is refused and is
 * neither repaired nor removed — the owner replaces or removes it himself.
 */
export async function readActiveSnapshot(directory: string, io: ActiveSnapshotIo = fs): Promise<ActiveSnapshot> {
  const paths = activeSnapshotPaths(directory);
  let bytes: Buffer;
  try {
    bytes = await io.readFile(paths.snapshot);
  } catch (error) {
    if (isMissing(error)) return { status: 'none' };
    throw error;
  }
  const identity = await readIdentity(paths.meta, io);
  const validated = parseAndValidateSnapshot(bytes.toString('utf8'));
  if (validated.ok) return { status: 'loaded', snapshot: validated.snapshot, identity };
  console.error(`Active snapshot refused at launch (${validated.reason}): ${validated.detail}`);
  return { status: 'invalid', reason: validated.reason, identity };
}

async function writeProven(target: string, bytes: Buffer, io: ActiveSnapshotIo): Promise<void> {
  const temporary = `${target}.${randomBytes(6).toString('hex')}.tmp`;
  try {
    await io.writeFile(temporary, bytes);
    const readBack = await io.readFile(temporary);
    if (!readBack.equals(bytes)) throw new Error('the written copy does not read back as written');
    await io.rename(temporary, target);
  } catch (error) {
    await io.rm(temporary, { force: true });
    throw error;
  }
}

/**
 * Makes a candidate the active snapshot, or leaves the active snapshot exactly
 * as it was. The candidate is the bytes of the file the owner chose; only its
 * name crosses to the renderer.
 */
export async function replaceActiveSnapshot(
  directory: string,
  candidate: Buffer,
  fileName: string,
  io: ActiveSnapshotIo = fs,
): Promise<ReplaceOutcome> {
  const validated = parseAndValidateSnapshot(candidate.toString('utf8'));
  if (!validated.ok) {
    console.error(`Snapshot refused (${validated.reason}): ${validated.detail}`);
    return { status: 'invalid', reason: validated.reason };
  }

  const paths = activeSnapshotPaths(directory);
  try {
    await io.mkdir(directory, { recursive: true });
    await writeProven(paths.snapshot, candidate, io);
    // The copy is active from this point. The name follows; if it cannot be
    // written, no name is kept rather than a previous file's name.
    try {
      await writeProven(paths.meta, Buffer.from(JSON.stringify({ fileName }), 'utf8'), io);
    } catch (error) {
      console.error('The snapshot name could not be kept:', (error as { code?: string }).code ?? 'error');
      await io.rm(paths.meta, { force: true });
      return { status: 'loaded', snapshot: validated.snapshot, identity: { fileName: null } };
    }
  } catch (error) {
    // No path and no content: the code is enough to act on.
    console.error('The snapshot copy could not be written:', (error as { code?: string }).code ?? 'error');
    return { status: 'failed' };
  }
  return { status: 'loaded', snapshot: validated.snapshot, identity: { fileName } };
}

/**
 * Removal (r003 §11.6): the copy first, so that a removal that fails on disk
 * leaves the copy and its retained name exactly as they were — the
 * application still holds it, name included. Once the copy is gone the name
 * follows; a name that could not be deleted names nothing (the launch read
 * reports "none" for a missing copy whatever the meta file says) and is
 * never shown.
 */
export async function removeActiveSnapshot(directory: string, io: ActiveSnapshotIo = fs): Promise<void> {
  const paths = activeSnapshotPaths(directory);
  await io.rm(paths.snapshot, { force: true });
  try {
    await io.rm(paths.meta, { force: true });
  } catch (error) {
    console.error('The snapshot name could not be removed:', (error as { code?: string }).code ?? 'error');
  }
}
