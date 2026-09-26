// Version 11 to version 12: account kinds, anchor ends and statement accounts
// (PF-006; 03 §5).
//
// The step widens the store and decides nothing (§5.7): no account is given a
// kind, no anchor is told which end of a statement it came from, and no
// evidence is told which account its statement reported on. The proof is that
// every count, every decision and every account flag is where it was, that
// available funds come out the same for every account, and that an older store
// on disk is copied before it is read into the new shape (§5.3, §5.8).
//
// Every store, name and file below is invented.

import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { ayqCountsTowardFunds } from '../src/ayq-funds.ts';
import {
  AYQ_STORE_VERSION,
  ayqMigrate,
  ayqReadStore,
  ayqStorePath,
} from '../src/ayq-store.ts';

/** A store as version 11 wrote one: two accounts, one flagged out of funds. */
function versionEleven(): Record<string, unknown> {
  return {
    version: 11,
    imports: [
      {
        id: 'imp-1',
        at: '2026-08-01T09:00:00Z',
        file: 'invented-august.zip',
        files: 3,
        records: 12,
        prepared: 12,
        imported: 12,
        duplicates: 0,
        skipped: 0,
        failed: 0,
        problems: [],
        accountId: 'acc-1',
        accountName: 'AYQ NL…1111',
        categorised: 0,
        filed: 4,
        matched: 0,
        matchesWaiting: 0,
        balanceWanted: false,
        anchoredAt: '2026-07-31',
        anchorEstablished: true,
      },
    ],
    rules: [{ counterpartyKey: 'iban:NL00TEST0000000001', categoryName: 'Groceries' }],
    provenance: {
      'ref-1': { importId: 'imp-1', counterpartyKey: 'iban:NL00TEST0000000001' },
      'ref-2': { importId: 'imp-1', counterpartyKey: 'iban:NL00TEST0000000002' },
    },
    decisions: {
      'ref-1': [{ source: 'manual', categoryName: 'Groceries', at: '2026-08-02T10:00:00Z' }],
      'ref-2': [
        { source: 'auto', categoryName: 'Bank fees', at: '2026-08-01T09:00:01Z', reason: { code: 'bank-charge' } },
      ],
    },
    aliases: [],
    planned: [],
    occurrences: [],
    accountFlags: { 'acc-2': { countsTowardFunds: false } },
    settings: { ground: 'dark' },
    anchors: [
      {
        id: 'anc-1',
        accountId: 'acc-1',
        amountCents: 100000,
        coverageDate: '2026-07-31',
        importId: 'imp-1',
        source: 'bank',
        createdAt: '2026-08-01T09:00:02Z',
      },
      {
        id: 'anc-2',
        accountId: 'acc-2',
        amountCents: 500000,
        coverageDate: '2026-07-31',
        importId: null,
        source: 'manual',
        createdAt: '2026-08-03T09:00:00Z',
      },
    ],
    evidence: [
      {
        accountId: 'acc-1',
        importId: 'imp-1',
        fromDate: '2026-07-01',
        toDate: '2026-07-31',
        closingBalanceCents: 100000,
        file: 'invented-july.xml',
        readAt: '2026-08-01T09:00:02Z',
      },
    ],
    counterpartyNames: {},
    starterTaxonomyVersion: 1,
    counterpartyFoldVersion: 2,
  };
}

function counts(store: Record<string, unknown>): Record<string, number> {
  const size = (value: unknown) =>
    Array.isArray(value) ? value.length : Object.keys(value ?? {}).length;
  return {
    imports: size(store.imports),
    rules: size(store.rules),
    provenance: size(store.provenance),
    decisions: size(store.decisions),
    anchors: size(store.anchors),
    evidence: size(store.evidence),
    accountFlags: size(store.accountFlags),
  };
}

test('version 11 becomes 12: every record stays, and no account is given a kind', () => {
  const before = versionEleven();
  const after = ayqMigrate(structuredClone(before)) as unknown as Record<string, unknown>;

  assert.equal(after.version, AYQ_STORE_VERSION);
  assert.ok(AYQ_STORE_VERSION >= 12);
  assert.deepEqual(counts(after), counts(before));
  assert.deepEqual(after.accountProfiles, {}, 'a migration decided a kind (§5.7)');

  // Nothing already written is touched — anchors and evidence keep exactly the
  // fields they had, with neither new field invented for them.
  for (const field of [
    'imports',
    'rules',
    'provenance',
    'decisions',
    'accountFlags',
    'settings',
    'anchors',
    'evidence',
  ]) {
    assert.deepEqual(after[field], before[field], `${field} changed`);
  }
  for (const anchor of after.anchors as Array<Record<string, unknown>>) {
    assert.ok(!('kind' in anchor), 'an anchor was told which end it came from');
  }
  for (const one of after.evidence as Array<Record<string, unknown>>) {
    assert.ok(!('statementAccount' in one), 'evidence was told its account');
  }
});

test('available funds come out the same for every account after the step', () => {
  const store = ayqMigrate(versionEleven());
  // The flag the owner set still stands, and the account nobody flagged keeps
  // the default for an account of unknown type (03 §7.15).
  assert.equal(ayqCountsTowardFunds(store, 'acc-1'), true);
  assert.equal(ayqCountsTowardFunds(store, 'acc-2'), false);
});

test('migrating the migrated store again changes nothing', () => {
  const once = ayqMigrate(versionEleven());
  assert.deepEqual(ayqMigrate(structuredClone(once)), once);
});

test('a version 11 store on disk is copied first, and the copy is the old shape', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'ayq-store-v12-'));
  const path = ayqStorePath(dataDir);
  const before = `${JSON.stringify(versionEleven(), null, 2)}\n`;
  writeFileSync(path, before, 'utf8');

  const store = ayqReadStore(dataDir);
  assert.equal(store.version, AYQ_STORE_VERSION);
  assert.deepEqual(store.accountProfiles, {});
  const kept = join(dataDir, `ayq-store.before-v11-to-v${AYQ_STORE_VERSION}.json`);
  assert.equal(readFileSync(kept, 'utf8'), before, 'the copy is not the version 11 store');
  // Reading did not rewrite the file: the change lands only when AYQ writes.
  assert.equal(readFileSync(path, 'utf8'), before);
});
