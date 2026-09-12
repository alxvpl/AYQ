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
  AyqAliasRecord,
  AyqCategoryRule,
  AyqGround,
  AyqImportRecord,
  AyqPlannedRecord,
  AyqProvenance,
  AyqSettings,
} from '../../ayq-client/src/ayq-ipc-contract.ts';

/**
 * What has been decided about one occurrence of a planned record.
 *
 * Occurrences are generated from the record's own rhythm and are not stored.
 * This is the exception: the one a person moved, struck out, or that an actual
 * transaction turned out to be. Storing every occurrence would mean storing a
 * hundred rows that say nothing but "as expected", and a series that could then
 * disagree with the record it came from.
 */
export type AyqPlanOccurrenceRecord = {
  recordId: string;
  /** The generated date. With the record id, the occurrence's identity. */
  dueDate: string;
  /** Where a person moved it to; null is where the rhythm put it. */
  rescheduledTo: string | null;
  matchedTransactionId: string | null;
  matchedAt: string | null;
  /** A person's match outranks an automatic one and is never overwritten. */
  matchProvenance: 'manual' | 'automatic' | null;
  dismissed: boolean;
  /**
   * Transactions a person has said are *not* this payment.
   *
   * Kept so the same pairing is not offered again after the next import. A
   * refusal is a decision like any other and outlives the pass that prompted it.
   */
  rejected: string[];
};

/** What AYQ knows about an account that Actual has no field for. */
export type AyqAccountFlags = {
  /**
   * Whether this account's balance forms available funds (03 §7.6).
   *
   * AYQ's own, not Actual's `offbudget`: that flag also decides what Actual
   * counts in a budget month, which the Plan screen reads, so using it would
   * make a statement about the forecast quietly change the plan.
   */
  countsTowardFunds: boolean;
};

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

/** What the interface itself has been told to do (04 A23). */
export const AYQ_DEFAULT_SETTINGS: AyqSettings = { ground: 'system' };

const GROUNDS: readonly AyqGround[] = ['light', 'dark', 'system'];

/**
 * Bump this when the shape changes, and add a step to `migrate`.
 *
 *   1  imports, rules, provenance, decisions.
 *   2  aliases: the explicit "this imported variant is that counterparty"
 *      table. Version 1 stores gain an empty one; nothing else moves, and
 *      nothing already written is rewritten.
 *   3  Plan + Forecast: planned and recurring records, what has been decided
 *      about individual occurrences of them — including the match to an actual
 *      transaction and the pairings a person has refused — and the per-account
 *      "counts toward available funds" flag. Older stores gain three empty ones.
 *   4  `confirmedAt` and `suggestedAt` on a planned record, so that 03 §7.14
 *      can date a record's expectations from the day it was decided.
 *   5  the interface settings: which ground the owner chose (04 A23). An older
 *      store gains the default, which is to follow the system.
 */
export const AYQ_STORE_VERSION = 5;

export type AyqStore = {
  version: number;
  imports: AyqImportRecord[];
  rules: AyqCategoryRule[];
  /** Keyed by the transaction's `imported_id`. */
  provenance: Record<string, AyqProvenance>;
  /** Keyed the same way: who decided each category. */
  decisions: Record<string, AyqCategoryDecision>;
  /**
   * Explicit counterparty identity decisions, since version 2.
   *
   * Flat by construction: no alias points at a variant that is itself aliased,
   * because adding one re-points the old ones. See `ayq-aliases.ts`.
   */
  aliases: AyqAliasRecord[];
  /** Planned and recurring records, since version 3. */
  planned: AyqPlannedRecord[];
  /** What has been decided about individual occurrences, since version 3. */
  occurrences: AyqPlanOccurrenceRecord[];
  /** Keyed by Actual's account id, since version 3. */
  accountFlags: Record<string, AyqAccountFlags>;
  /** What the owner chose about the interface, since version 5. */
  settings: AyqSettings;
};

/**
 * The key a decision, a provenance record and an alias match are filed under.
 *
 * The bank's own reference when the import had one, and the transaction's id
 * when it did not — which is what makes a record survive a re-import of the
 * same statement.
 */
export function ayqRowKey(row: {
  imported_id: string | null;
  id: string;
}): string {
  return row.imported_id ?? row.id;
}

const FILE = 'ayq-store.json';

function empty(): AyqStore {
  return {
    version: AYQ_STORE_VERSION,
    imports: [],
    rules: [],
    provenance: {},
    decisions: {},
    aliases: [],
    planned: [],
    occurrences: [],
    accountFlags: {},
    settings: { ...AYQ_DEFAULT_SETTINGS },
  };
}

/**
 * The interface settings, defaulted one field at a time.
 *
 * A ground this AYQ has never heard of falls back to following the system
 * rather than to a blank window: a value written by a newer AYQ, or by a hand
 * in a text editor, is not a reason to fail to draw.
 */
export function ayqNormaliseSettings(value: unknown): AyqSettings {
  const held =
    typeof value === 'object' && value !== null
      ? (value as Partial<AyqSettings>)
      : {};
  return {
    ground: GROUNDS.includes(held.ground as AyqGround)
      ? (held.ground as AyqGround)
      : AYQ_DEFAULT_SETTINGS.ground,
  };
}

/**
 * Brings an older store up to the current shape.
 *
 * Every field is defaulted one by one rather than spread from what was read, so
 * a store written by version 1 comes back complete and a field this AYQ does
 * not know about cannot ride along into the next write.
 *
 * A store from a newer AYQ is refused rather than migrated downwards. Losing
 * somebody's aliases and rules to a downgrade is not an acceptable failure, and
 * a version this code has never seen cannot be read safely by guessing.
 */
/**
 * A version 3 record, given the two dates 03 §7.14 turns on.
 *
 * Version 3 held the records but not those dates. A record written then was
 * decided when it was created — that is the only date the file holds and it is
 * the true one, because version 3 confirmed or suggested a record in the same
 * act that created it. So `createdAt` fills whichever of the two the record's
 * state calls for, and every record survives the upgrade with the future it
 * already had.
 *
 * The day, not the instant: these are compared against occurrence dates, and
 * `2026-09-11T06:40:00Z` sorts after `2026-09-11`, which would drop the
 * occurrence falling on the very day the record was decided.
 */
function decided(one: AyqPlannedRecord): AyqPlannedRecord {
  const day = typeof one?.createdAt === 'string' ? one.createdAt.slice(0, 10) : null;
  const suggested = one?.state === 'suggested';
  return {
    ...one,
    confirmedAt: one?.confirmedAt ?? (suggested ? null : day),
    suggestedAt: one?.suggestedAt ?? (suggested ? day : null),
  };
}

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
    // Version 1 had no alias table. An empty one is the whole of that upgrade:
    // a budget imported before aliases existed has made no alias decisions.
    aliases: Array.isArray(value.aliases) ? value.aliases : [],
    // And versions 1 and 2 had no plan. Same rule: a budget that predates the
    // forecast has made no plan decisions, so an empty set is the whole
    // upgrade, and nothing already in the file is rewritten.
    //
    // Version 3 had the records but not the two dates 03 §7.14 turns on. A
    // record written then was decided when it was created — that is the only
    // date the file holds and it is the true one, because version 3 created a
    // record and confirmed or suggested it in the same act. So `createdAt`
    // fills whichever of the two the record's state calls for, and every
    // record survives the upgrade with the future it already had.
    planned: Array.isArray(value.planned) ? value.planned.map(decided) : [],
    // Each occurrence is normalised rather than trusted: a field added while
    // version 3 was being built would otherwise arrive as `undefined` in code
    // that has every right to expect an array.
    occurrences: Array.isArray(value.occurrences)
      ? value.occurrences.map(one => ({
          ...one,
          rejected: Array.isArray(one?.rejected) ? one.rejected : [],
        }))
      : [],
    accountFlags:
      typeof value.accountFlags === 'object' && value.accountFlags !== null
        ? value.accountFlags
        : {},
    // Versions 1 to 4 had no interface settings. An older store gains the
    // default, which is to follow the system — the same as never having been
    // asked, which is exactly what happened.
    settings: ayqNormaliseSettings(value.settings),
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
