// Changing the shape of the owner's store — 03 §5.3 to §5.8.
//
// This is the one part of AYQ where data can be lost beyond recovery. The
// budget itself is Actual's and survives almost anything; the AYQ store holds
// the rules, the counterparty aliases, the plan and every trace of who decided
// what, and none of that can be recomputed. r006 added §5.3–§5.8 because a live
// store had already been migrated from version 3 to version 4 with no rule
// requiring a copy first.
//
// So every step is proved here on a store of the version before it, with the
// record counts before and after and with the owner's own decisions read back
// unchanged (§5.8). The stores below are invented — no real account, no real
// counterparty, no real amount.

import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  AYQ_STORE_VERSION,
  ayqMigrate,
  ayqReadStore,
  ayqStorePath,
  ayqStoreVersionOf,
  ayqWriteStore,
  type AyqStore,
} from '../src/ayq-store.ts';

async function budget(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'ayq-store-'));
}

/**
 * A store as version 1 wrote one: imports, rules, provenance and decisions.
 *
 * Everything a later version added is deliberately absent rather than present
 * and empty — a fixture that already carries the field a migration adds proves
 * nothing about the migration.
 */
function versionOne(): Record<string, unknown> {
  return {
    version: 1,
    imports: [
      { id: 'imp-1', file: 'invented-january.xml', at: '2026-01-31T10:00:00Z' },
      { id: 'imp-2', file: 'invented-february.xml', at: '2026-02-28T10:00:00Z' },
    ],
    rules: [
      {
        id: 'rule-1',
        counterpartyKey: 'TESTMARKT',
        categoryName: 'Groceries',
        createdAt: '2026-01-31T10:05:00Z',
        source: 'manual',
      },
    ],
    provenance: {
      'imp-row-1': { kind: 'structured', detail: 'creditor name and mandate' },
    },
    // One decision per transaction, which is what versions 1 to 5 held.
    decisions: {
      'imp-row-1': { source: 'manual', categoryName: 'Housekeeping', at: '2026-02-01T09:00:00Z' },
      'imp-row-2': { source: 'rule', categoryName: 'Groceries', at: '2026-02-01T09:01:00Z' },
    },
  };
}

/** The same store, brought forward by hand to the version named. */
function atVersion(to: number): Record<string, unknown> {
  const store = versionOne();
  if (to >= 2) {
    store.aliases = [
      {
        id: 'alias-1',
        variant: 'TESTMARKT 118',
        variantKey: 'TESTMARKT 118',
        counterpartyKey: 'TESTMARKT',
        counterpartyName: 'TESTMARKT',
        createdAt: '2026-02-02T09:00:00Z',
      },
    ];
  }
  if (to >= 3) {
    store.planned = [
      {
        id: 'plan-1',
        name: 'Invented rent',
        kind: 'expense',
        amountCents: 120_000,
        categoryName: 'Housing',
        counterpartyKey: null,
        accountId: null,
        startDate: '2026-03-01',
        recurrence: { frequency: 'monthly', interval: 1 },
        endDate: null,
        state: 'confirmed',
        provenance: 'manual',
        mandateId: null,
        createdAt: '2026-02-10T08:00:00Z',
        updatedAt: '2026-02-10T08:00:00Z',
      },
      {
        id: 'plan-2',
        name: 'Invented gym',
        kind: 'expense',
        amountCents: 2_500,
        categoryName: null,
        counterpartyKey: 'TESTGYM',
        accountId: null,
        startDate: '2026-03-05',
        recurrence: { frequency: 'monthly', interval: 1 },
        endDate: null,
        state: 'suggested',
        provenance: 'detected',
        mandateId: null,
        createdAt: '2026-02-11T08:00:00Z',
        updatedAt: '2026-02-11T08:00:00Z',
      },
    ];
    store.occurrences = [
      {
        recordId: 'plan-1',
        dueDate: '2026-03-01',
        rescheduledTo: null,
        matchedTransactionId: 'row-9',
        matchedAt: '2026-03-02T08:00:00Z',
        matchProvenance: 'manual',
        dismissed: false,
      },
    ];
    store.accountFlags = { 'acc-1': { countsTowardFunds: true } };
  }
  if (to >= 4) {
    store.planned = (store.planned as Record<string, unknown>[]).map(one => ({
      ...one,
      confirmedAt: one.state === 'suggested' ? null : '2026-02-10',
      suggestedAt: one.state === 'suggested' ? '2026-02-11' : null,
    }));
  }
  if (to >= 5) store.settings = { ground: 'dark' };
  if (to >= 6) {
    store.decisions = {
      'imp-row-1': [
        { source: 'manual', categoryName: 'Housekeeping', at: '2026-02-01T09:00:00Z' },
      ],
      'imp-row-2': [
        { source: 'rule', categoryName: 'Groceries', at: '2026-02-01T09:01:00Z' },
      ],
    };
  }
  if (to >= 7) {
    store.coverage = {
      'acc-1': {
        toDate: '2026-02-28',
        closingBalanceCents: 174_131,
        file: 'invented-february.xml',
        readAt: '2026-02-28T10:00:00Z',
      },
    };
  }
  store.version = to;
  return store;
}

/** What the store holds, counted the way a person would count it. */
function counts(store: AyqStore): Record<string, number> {
  return {
    imports: store.imports.length,
    rules: store.rules.length,
    provenance: Object.keys(store.provenance).length,
    decisions: Object.keys(store.decisions).length,
    aliases: store.aliases.length,
    planned: store.planned.length,
    occurrences: store.occurrences.length,
    accountFlags: Object.keys(store.accountFlags).length,
    coverage: Object.keys(store.coverage).length,
  };
}

/** The decisions the owner made, as they read after a migration. */
function standing(store: AyqStore): Record<string, string> {
  const said: Record<string, string> = {};
  for (const [key, history] of Object.entries(store.decisions)) {
    const last = history.at(-1);
    if (last) said[key] = `${last.source}:${last.categoryName}:${last.at}`;
  }
  return said;
}

// §5.8: every migration proved on a store of the previous version, with the
// counts before and after, and with no decision of the owner's changed.
for (let from = 1; from < AYQ_STORE_VERSION; from += 1) {
  test(`version ${from} becomes version ${AYQ_STORE_VERSION} and loses nothing`, () => {
    const before = atVersion(from);
    const after = ayqMigrate(before);

    assert.equal(after.version, AYQ_STORE_VERSION);

    // Every record that was there is still there, and the migration invented
    // none. The fields the store did not yet have are empty, which is the whole
    // of what those steps do.
    const was = counts(ayqMigrate(atVersion(AYQ_STORE_VERSION)));
    const now = counts(after);
    assert.equal(now.imports, was.imports, 'an import record was lost or invented');
    assert.equal(now.rules, was.rules, 'a rule was lost or invented');
    assert.equal(now.provenance, was.provenance);
    assert.equal(now.decisions, was.decisions);
    assert.equal(now.aliases, from >= 2 ? was.aliases : 0);
    assert.equal(now.planned, from >= 3 ? was.planned : 0);
    assert.equal(now.occurrences, from >= 3 ? was.occurrences : 0);
    assert.equal(now.accountFlags, from >= 3 ? was.accountFlags : 0);
    assert.equal(now.coverage, from >= 7 ? was.coverage : 0);

    // §5.4 and §4.4: the owner's decisions read back exactly as they were.
    assert.deepEqual(standing(after), {
      'imp-row-1': 'manual:Housekeeping:2026-02-01T09:00:00Z',
      'imp-row-2': 'rule:Groceries:2026-02-01T09:01:00Z',
    });

    // §5.7: shape, not meaning. No category was set, no rule applied, no
    // counterparty resolved and no expected payment matched by the migration.
    const matched = after.occurrences.filter(one => one.matchedTransactionId !== null);
    assert.equal(matched.length, from >= 3 ? 1 : 0);
    for (const one of matched) {
      assert.equal(one.matchProvenance, 'manual', 'a manual match lost its provenance');
    }

    // §5.5: repeatable. Running the chain again over its own output changes
    // nothing, which is what makes an interrupted migration safe to redo.
    assert.deepEqual(ayqMigrate(after), after);
  });
}

test('a version 3 record is dated by the day it was created (03 §7.14)', () => {
  const after = ayqMigrate(atVersion(3));
  const rent = after.planned.find(one => one.id === 'plan-1');
  const gym = after.planned.find(one => one.id === 'plan-2');
  assert.ok(rent && gym);

  // The day, not the instant: these are compared against occurrence dates.
  assert.equal(rent.confirmedAt, '2026-02-10');
  assert.equal(rent.suggestedAt, null);
  assert.equal(gym.suggestedAt, '2026-02-11');
  assert.equal(
    gym.confirmedAt,
    null,
    'a suggestion was dated as if somebody had confirmed it',
  );
});

test('a store from a newer AYQ is refused, not read', () => {
  assert.throws(
    () => ayqMigrate({ ...atVersion(AYQ_STORE_VERSION), version: AYQ_STORE_VERSION + 1 }),
    /A newer AYQ wrote it/,
  );
  assert.equal(ayqStoreVersionOf({ version: 99 }), 99);
  // A file with no version at all is the first shape, not the current one.
  assert.equal(ayqStoreVersionOf({ imports: [] }), 1);
});

test('the store is copied before its shape changes, and the copy is kept (§5.3)', async () => {
  const dataDir = await budget();
  const path = ayqStorePath(dataDir);
  const before = atVersion(4);
  writeFileSync(path, `${JSON.stringify(before, null, 2)}\n`, 'utf8');

  const read = ayqReadStore(dataDir);
  assert.equal(read.version, AYQ_STORE_VERSION);

  const kept = join(dataDir, `ayq-store.before-v4-to-v${AYQ_STORE_VERSION}.json`);
  assert.ok(existsSync(kept), 'no copy was kept before the shape changed');

  // Byte for byte what was there, not a re-serialisation of what was read.
  assert.equal(readFileSync(kept, 'utf8'), readFileSync(path, 'utf8'));
  assert.equal(
    (JSON.parse(readFileSync(kept, 'utf8')) as { version: number }).version,
    4,
    'the copy is of the old shape, which is the only useful thing to keep',
  );

  // And the migrated store is written over the original atomically (§5.4),
  // leaving no temporary file behind and leaving the copy exactly where it is.
  ayqWriteStore(dataDir, read);
  assert.equal(
    (JSON.parse(readFileSync(path, 'utf8')) as { version: number }).version,
    AYQ_STORE_VERSION,
  );
  assert.equal(existsSync(`${path}.tmp`), false, 'a temporary file was left behind');
  assert.ok(existsSync(kept), 'the copy was removed');
  assert.equal(
    (JSON.parse(readFileSync(kept, 'utf8')) as { version: number }).version,
    4,
    'the copy was overwritten with the new shape',
  );
});

test('reading an already-current store copies nothing', async () => {
  const dataDir = await budget();
  writeFileSync(
    ayqStorePath(dataDir),
    `${JSON.stringify(atVersion(AYQ_STORE_VERSION), null, 2)}\n`,
    'utf8',
  );
  ayqReadStore(dataDir);
  assert.equal(
    existsSync(join(dataDir, `ayq-store.before-v${AYQ_STORE_VERSION}-to-v${AYQ_STORE_VERSION}.json`)),
    false,
  );
});

test('a migration that cannot make its copy does not run (§5.3)', async () => {
  const dataDir = await budget();
  const path = ayqStorePath(dataDir);
  const before = `${JSON.stringify(atVersion(4), null, 2)}\n`;
  writeFileSync(path, before, 'utf8');

  // The copy has nowhere to go: a directory stands where the file would be
  // written. Blocked by shape rather than by permissions, because these tests
  // run as root on CI and root writes into a directory it has no bits for.
  mkdirSync(join(dataDir, `ayq-store.before-v4-to-v${AYQ_STORE_VERSION}.json`));

  assert.throws(
    () => ayqReadStore(dataDir),
    /could not first keep a copy/,
    'the migration ran without keeping a copy',
  );

  // And the store is exactly as it was. A shape that could not be backed up is
  // a shape that is not touched.
  assert.equal(readFileSync(path, 'utf8'), before, 'the store was changed anyway');
});

test('an interrupted migration leaves a store that still opens (§5.5)', async () => {
  const dataDir = await budget();
  const path = ayqStorePath(dataDir);
  const before = `${JSON.stringify(atVersion(5), null, 2)}\n`;
  writeFileSync(path, before, 'utf8');

  // The shape is changed in memory and the file is only replaced atomically, so
  // a process that dies between the two leaves exactly what was there.
  const first = ayqReadStore(dataDir);
  assert.equal(first.version, AYQ_STORE_VERSION);
  assert.equal(readFileSync(path, 'utf8'), before, 'reading the store rewrote it');

  // Opened again, it migrates again and comes to the same answer.
  assert.deepEqual(ayqReadStore(dataDir), first);

  // Then written, and from then on nothing migrates.
  ayqWriteStore(dataDir, first);
  assert.deepEqual(ayqReadStore(dataDir), first);
});
