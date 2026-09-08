// What AYQ keeps that Actual has no field for.
//
// Actual's transaction schema has no counterparty account, no bank transaction
// code and no SEPA mandate, and no notion of a rule that says where a
// counterparty belongs. Rather than smuggle those into the notes, they live in
// one file beside the budget, keyed by the same `imported_id` the transaction
// carries.
//
// The file is versioned and written atomically. A budget written by a newer
// AYQ is refused rather than quietly rewritten with fields it does not know —
// losing a person's rules to a downgrade is not an acceptable failure mode.

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import type {
  AyqCategoryRule,
  AyqImportRecord,
  AyqProvenance,
} from '../../ayq-client/src/ayq-ipc-contract.ts';

/**
 * How a transaction came to have the category it has.
 *
 * Kept because the difference decides what may overwrite what: a rule may
 * revise its own earlier work, and may never touch a person's.
 */
export type AyqCategoryDecision = {
  source: 'manual' | 'rule';
  /** Empty when a person deliberately cleared the category. */
  categoryName: string;
  at: string;
};

/** Bump this when the shape changes, and add a step to `migrate`. */
export const AYQ_STORE_VERSION = 1;

export type AyqStore = {
  version: number;
  imports: AyqImportRecord[];
  rules: AyqCategoryRule[];
  /** Keyed by the transaction's `imported_id`. */
  provenance: Record<string, AyqProvenance>;
  /** Keyed the same way: who decided each category. */
  decisions: Record<string, AyqCategoryDecision>;
};

const FILE = 'ayq-store.json';

function empty(): AyqStore {
  return {
    version: AYQ_STORE_VERSION,
    imports: [],
    rules: [],
    provenance: {},
    decisions: {},
  };
}

/**
 * Brings an older store up to the current shape.
 *
 * There is one version so far, so this is a shape check rather than a chain of
 * steps. It exists now, with the fields defaulted one by one, because the first
 * upgrade is exactly when nobody wants to be writing it.
 */
function migrate(raw: unknown): AyqStore {
  if (typeof raw !== 'object' || raw === null) return empty();
  const value = raw as Partial<AyqStore>;

  const version = Number(value.version ?? 0);
  if (version > AYQ_STORE_VERSION) {
    throw new Error(
      `this budget's AYQ store is version ${version}, and this AYQ knows ` +
        `version ${AYQ_STORE_VERSION}. A newer AYQ wrote it; upgrade rather ` +
        'than overwrite it.',
    );
  }

  return {
    version: AYQ_STORE_VERSION,
    imports: Array.isArray(value.imports) ? value.imports : [],
    rules: Array.isArray(value.rules) ? value.rules : [],
    provenance:
      typeof value.provenance === 'object' && value.provenance !== null
        ? value.provenance
        : {},
    decisions:
      typeof value.decisions === 'object' && value.decisions !== null
        ? value.decisions
        : {},
  };
}

const DAMAGED = /^ayq-store\.damaged-.+\.json$/;

/**
 * The most recent store AYQ had to set aside, if it ever had to.
 *
 * Read from the directory rather than remembered in a variable, so it still
 * answers on the launch after the one that lost it — which is usually the
 * launch on which somebody notices their rules are gone.
 */
export function ayqDamagedStore(dataDir: string): string | null {
  if (!existsSync(dataDir)) return null;
  const kept = readdirSync(dataDir)
    .filter(name => DAMAGED.test(name))
    .sort();
  return kept.at(-1) ?? null;
}

export function ayqStorePath(dataDir: string): string {
  return join(dataDir, FILE);
}

/** Reads the store, or hands back an empty one on a first launch. */
export function ayqReadStore(dataDir: string): AyqStore {
  const path = ayqStorePath(dataDir);
  if (!existsSync(path)) return empty();

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    // A file that will not parse is a lost cache, not lost money: the budget
    // itself is Actual's and is intact, so AYQ opens rather than refusing to.
    //
    // But it is not nothing either — every rule and every trace of where a
    // name came from lived in there. So the damaged file is moved aside before
    // anything writes over it, and its name is reported to the screen. A
    // packaged application writes to no console: a warning on stderr is a
    // warning nobody receives.
    process.stderr.write(
      `[ayq-store] ${path} could not be read (${
        error instanceof Error ? error.message : String(error)
      }); keeping it aside and starting a fresh store.\n`,
    );
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    try {
      renameSync(path, join(dataDir, `ayq-store.damaged-${stamp}.json`));
    } catch {
      // Unmovable as well as unreadable. The fresh store is still returned;
      // there is nothing further AYQ can do for the old one.
    }
    return empty();
  }

  return migrate(parsed);
}

/**
 * Writes the store atomically.
 *
 * A half-written file after a crash would lose every rule and every trace of
 * where a name came from, so the new content lands beside the old one and is
 * renamed over it.
 */
export function ayqWriteStore(dataDir: string, store: AyqStore): void {
  mkdirSync(dataDir, { recursive: true });
  const path = ayqStorePath(dataDir);
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
  renameSync(temporary, path);
}

/** A short, sortable, collision-free enough identifier. */
export function ayqId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}
