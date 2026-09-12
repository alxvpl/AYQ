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
//
// Changing its shape is governed by 03 §5.3–§5.8: the file is copied first and
// the copy is kept, the steps run one version at a time in order, the new file
// is moved into place rather than edited where it lies, an interrupted
// migration leaves a store that still opens, and a step changes shape and never
// meaning. Every step is proved on a store of the version before it.

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import type {
  AyqAliasRecord,
  AyqCategoryRule,
  AyqDecision,
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

/**
 * How far one account's statements reach (03 §8.1).
 *
 * The bank's own closing balance and the date it applies to, kept per account
 * so that AYQ can say what it agrees with rather than asserting a balance and
 * hoping. Only the statement that reaches furthest is kept: importing an older
 * one after a newer one must not move the boundary backwards.
 */
export type AyqStatementCoverage = {
  /** The date the statement reaches to, YYYY-MM-DD. */
  toDate: string;
  closingBalanceCents: number;
  /** The file it came from. The base name only; paths are never recorded. */
  file: string | null;
  readAt: string;
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
export type AyqCategoryDecision = AyqDecision;

/**
 * How many decisions about one transaction are kept.
 *
 * A history, because "it is in Groceries because a rule put it there, after
 * you had put it in Housekeeping" is what a person needs when a category looks
 * wrong — and bounded, because it is a record of a small argument and not a
 * log. The oldest fall off the front; the one that stands is always the last.
 */
export const AYQ_DECISIONS_KEPT = 20;

/** The decision that stands for one transaction, or nothing if none does. */
export function ayqStandingDecision(
  store: AyqStore,
  key: string,
): AyqCategoryDecision | null {
  return store.decisions[key]?.at(-1) ?? null;
}

/** Adds a decision to a transaction's history, keeping the newest of them. */
export function ayqAddDecision(
  store: AyqStore,
  key: string,
  decision: AyqCategoryDecision,
): void {
  const kept = [...(store.decisions[key] ?? []), decision];
  store.decisions[key] = kept.slice(-AYQ_DECISIONS_KEPT);
}

/** What the interface itself has been told to do (04 A23). */
export const AYQ_DEFAULT_SETTINGS: AyqSettings = { ground: 'system' };

const GROUNDS: readonly AyqGround[] = ['light', 'dark', 'system'];

/**
 * Bump this when the shape changes, and add one step to `AYQ_MIGRATIONS`.
 *
 * The steps run one integer version at a time, in order (03 §5.6), and the
 * store is copied before any of them runs (§5.3).
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
 *   6  a transaction's category decisions become a history rather than one
 *      current value. The single decision an older store holds becomes a
 *      history of one, which is exactly what it is.
 *   7  statement coverage: the date each account's statements reach to and
 *      the closing balance the bank stated there (03 §8.1). An older store
 *      gains an empty one — which is the truth about it, because nothing was
 *      recorded at import time and inventing it from the ledger would be
 *      AYQ agreeing with itself.
 */
export const AYQ_STORE_VERSION = 7;

export type AyqStore = {
  version: number;
  imports: AyqImportRecord[];
  rules: AyqCategoryRule[];
  /** Keyed by the transaction's `imported_id`. */
  provenance: Record<string, AyqProvenance>;
  /**
   * Keyed the same way: who decided each category, oldest first.
   *
   * A list since version 6. The last entry is the decision that stands.
   */
  decisions: Record<string, AyqCategoryDecision[]>;
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
  /** How far each account's statements reach, since version 7 (03 §8.1). */
  coverage: Record<string, AyqStatementCoverage>;
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
    coverage: {},
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
 * Bringing an older store up to the current shape (03 §5.3–§5.8).
 *
 * One integer version at a time, in order (§5.6). Each step below is handed the
 * store as the version before it wrote it and returns the version after — so a
 * store from version 1 passes through every step that has been written since,
 * and adding a version means adding one step rather than editing six defaults.
 *
 * A step changes shape and not meaning (§5.7). None of them resolves a
 * counterparty, applies a rule, sets a category or matches an expected payment,
 * and where a new field has no value for existing data it stays empty, because
 * empty is what AYQ actually knows about it.
 *
 * The whole chain runs in memory and the file is only ever replaced atomically
 * (§5.4), which is what makes it repeatable (§5.5): interrupted, the old file
 * is still there to be read, and reading it again completes the change.
 */
type AyqRaw = Record<string, unknown>;

/** One step, from the version before it to `to`. */
type AyqMigration = {
  to: number;
  /** What the shape change is, in the words a person would use. */
  what: string;
  change: (store: AyqRaw) => AyqRaw;
};

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

const AYQ_MIGRATIONS: readonly AyqMigration[] = [
  {
    to: 2,
    what: 'an alias table',
    // A budget imported before aliases existed has made no alias decisions, so
    // an empty table is the whole of this upgrade.
    change: store => ({ ...store, aliases: array(store.aliases) }),
  },
  {
    to: 3,
    what: 'planned records, occurrence decisions and the account flags',
    // Same rule: a budget that predates the forecast has made no plan
    // decisions, and nothing already in the file is rewritten.
    change: store => ({
      ...store,
      planned: array(store.planned),
      occurrences: array(store.occurrences).map(one => {
        const held = one as AyqRaw;
        return { ...held, rejected: array(held.rejected) };
      }),
      accountFlags: record(store.accountFlags),
    }),
  },
  {
    to: 4,
    what: 'the day each planned record was confirmed or suggested (03 §7.14)',
    change: store => ({
      ...store,
      planned: (array(store.planned) as AyqPlannedRecord[]).map(decided),
    }),
  },
  {
    to: 5,
    what: 'the interface settings (04 A23)',
    // The default is to follow the system, which is the same as never having
    // been asked — which is exactly what happened.
    change: store => ({ ...store, settings: ayqNormaliseSettings(store.settings) }),
  },
  {
    to: 6,
    what: 'a transaction\u2019s category decisions as a history',
    // The one decision an older store holds is the decision that stands, so it
    // becomes a history with one entry in it. Nothing is invented, nothing is
    // lost, and no decision changes.
    change: store => ({ ...store, decisions: decisionsOf(store.decisions) }),
  },
  {
    to: 7,
    what: 'how far each account\u2019s statements reach (03 §8.1)',
    // Empty is the truth about an older store: nothing was recorded at import
    // time, and deriving it from the ledger now would be AYQ agreeing with
    // itself rather than with the bank.
    change: store => ({ ...store, coverage: record(store.coverage) }),
  },
];

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function record(value: unknown): Record<string, never> {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, never>)
    : {};
}

/** The version a file claims, with a missing one read as the first shape. */
export function ayqStoreVersionOf(raw: unknown): number {
  if (typeof raw !== 'object' || raw === null) return AYQ_STORE_VERSION;
  const claimed = Number((raw as AyqRaw).version ?? 0);
  return Number.isFinite(claimed) && claimed >= 1 ? claimed : 1;
}

/**
 * Runs the steps a store of this version has not had, in order.
 *
 * Exported so a test can hand it a store of one version and read back the next,
 * which is what 03 §5.8 asks of every migration.
 */
export function ayqMigrate(raw: unknown): AyqStore {
  if (typeof raw !== 'object' || raw === null) return empty();

  const from = ayqStoreVersionOf(raw);
  if (from > AYQ_STORE_VERSION) {
    // Refused rather than migrated downwards (§5.6). Losing somebody's aliases
    // and rules to a downgrade is not an acceptable failure, and a shape this
    // code has never seen cannot be read safely by guessing.
    throw new Error(
      `this budget's AYQ store is version ${from}, and this AYQ knows ` +
        `version ${AYQ_STORE_VERSION}. A newer AYQ wrote it; upgrade rather ` +
        'than overwrite it.',
    );
  }

  let held = raw as AyqRaw;
  for (const step of AYQ_MIGRATIONS) {
    if (step.to <= from) continue;
    held = step.change(held);
    held = { ...held, version: step.to };
  }

  // And then the shape is asserted rather than assumed. A field a development
  // build wrote half of, or a file somebody edited by hand, arrives here as
  // whatever it is; every reader below has a right to the type it declares.
  return {
    version: AYQ_STORE_VERSION,
    imports: array(held.imports) as AyqImportRecord[],
    rules: array(held.rules) as AyqCategoryRule[],
    provenance: record(held.provenance) as unknown as Record<string, AyqProvenance>,
    decisions: decisionsOf(held.decisions),
    aliases: array(held.aliases) as AyqAliasRecord[],
    planned: array(held.planned) as AyqPlannedRecord[],
    occurrences: array(held.occurrences) as AyqPlanOccurrenceRecord[],
    accountFlags: record(held.accountFlags) as unknown as Record<
      string,
      AyqAccountFlags
    >,
    settings: ayqNormaliseSettings(held.settings),
    coverage: record(held.coverage) as unknown as Record<
      string,
      AyqStatementCoverage
    >,
  };
}

function decisionsOf(value: unknown): Record<string, AyqCategoryDecision[]> {
  if (typeof value !== 'object' || value === null) return {};
  const held: Record<string, AyqCategoryDecision[]> = {};
  for (const [key, one] of Object.entries(value as Record<string, unknown>)) {
    if (Array.isArray(one)) {
      held[key] = (one as AyqCategoryDecision[]).slice(-AYQ_DECISIONS_KEPT);
    } else if (typeof one === 'object' && one !== null) {
      held[key] = [one as AyqCategoryDecision];
    }
  }
  return held;
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

  const from = ayqStoreVersionOf(parsed);
  if (from < AYQ_STORE_VERSION) {
    // 03 §5.3: the store is copied before the shape changes, and the copy is
    // kept. AYQ has already migrated a live store from 3 to 4 with no rule
    // requiring one, and that is the single way the owner's rules, aliases and
    // plan can be lost beyond recovery. A migration that could not first make
    // its copy does not run — so this throws rather than proceeding, and the
    // window reports it the way it reports any store it could not open.
    ayqKeepBeforeMigrating(dataDir, from);
  }

  return ayqMigrate(parsed);
}

/**
 * The copy 03 §5.3 requires, made before a migration and kept afterwards.
 *
 * One per version, not one per launch: a store read and never written is
 * migrated again on the next launch, and a directory filling with identical
 * copies of the same shape is noise rather than safety. The copy that exists is
 * the one that matters, so an existing one is left exactly where it is.
 *
 * "Kept until the migrated store has been opened successfully at least once" is
 * the floor and not the ceiling: nothing here ever deletes one. A file of a few
 * kilobytes is the cheapest insurance in this product, and the owner can remove
 * one whenever they choose.
 */
export function ayqKeepBeforeMigrating(dataDir: string, from: number): string {
  const path = ayqStorePath(dataDir);
  const kept = join(dataDir, `ayq-store.before-v${from}-to-v${AYQ_STORE_VERSION}.json`);
  // A file, specifically. Anything else standing at that name — a directory, a
  // dangling link — is not a copy of anybody's store, and treating it as one
  // would let the migration run with no copy at all.
  if (existsSync(kept) && statSync(kept).isFile()) return kept;

  try {
    // Copied, not moved: the store AYQ is about to read from stays where it is,
    // so an interruption here leaves the old shape intact and readable (§5.5).
    copyFileSync(path, kept);
  } catch (error) {
    throw new Error(
      `this budget's AYQ store is version ${from} and has to be brought to ` +
        `version ${AYQ_STORE_VERSION}, and AYQ could not first keep a copy of ` +
        `it at ${kept} (${
          error instanceof Error ? error.message : String(error)
        }). The store has not been changed. Make that directory writable, or ` +
        'copy the file aside yourself, and open AYQ again.',
    );
  }
  process.stderr.write(
    `[ayq-store] kept ${kept} before bringing version ${from} to ` +
      `${AYQ_STORE_VERSION}\n`,
  );
  return kept;
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
