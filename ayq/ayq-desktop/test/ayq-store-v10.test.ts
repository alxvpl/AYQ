// Version 9 to version 10: recorded reasons become codes (04 A24; 03 §5; 033
// §5; 034 §2).
//
// Version 9 kept two kinds of English in the owner's store: why AYQ's own
// classification filed a transaction (`because` on an automatic decision), and
// why a chosen file could not be imported (`reason` on an import's problems).
// Version 10 keeps the code each sentence stood for, and the words are the
// catalogue's. This is representation, not meaning (§5.7), so the proof is
// that nothing else moves: every count, every decision's source, category and
// moment, and — read back through the catalogue — the same thing said.
//
// Then 034 §2: a backup sealed while the store was version 9 still restores
// under version 10. The set is restored exactly as it was sealed, and the
// ordinary migration then runs on the restored store, with its own safety copy.
//
// Every store, name and file below is invented.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  ayqFilingReasonText,
  ayqImportProblemText,
} from '../../ayq-client/src/ayq-reasons.ts';
import {
  ayqBackupsDir,
  ayqCheckBackup,
  ayqCreateBackup,
  ayqFinishRestore,
  ayqReplaceWithBackup,
} from '../src/ayq-backup.ts';
import {
  AYQ_STORE_VERSION,
  ayqMigrate,
  ayqReadStore,
  ayqStorePath,
  ayqWriteStore,
} from '../src/ayq-store.ts';

/** Every sentence version 9 could write, and one it never wrote. */
const V9_BANK_CHARGE = 'the bank\u2019s own charge';
const V9_INTEREST = 'interest charged by the bank';
const V9_COUNTERPARTY = 'the counterparty is ALBERT HEIJN';
const NOT_V9 = 'because the moon was full';

/** A store as version 9 wrote one, with every kind of decision and problem. */
function versionNine(): Record<string, unknown> {
  return {
    version: 9,
    imports: [
      {
        id: 'imp-1',
        at: '2026-03-01T09:00:00Z',
        file: 'invented-march.xml',
        files: 7,
        records: 40,
        prepared: 40,
        imported: 38,
        duplicates: 2,
        skipped: 0,
        failed: 6,
        accountId: 'acc-1',
        accountName: 'Invented current account',
        categorised: 12,
        filed: 10,
        matched: 1,
        matchesWaiting: 0,
        problems: [
          { name: 'empty.xml', reason: 'it holds no CAMT.053 entries' },
          { name: 'list.xml', reason: 'it is not a CAMT.053 document' },
          { name: 'moved.xml', reason: 'it is no longer there' },
          { name: 'locked.xml', reason: 'AYQ is not allowed to read it' },
          { name: 'exports', reason: 'it is a folder, not a file' },
          {
            name: 'broken.zip',
            reason: 'invalid central directory file header',
          },
        ],
      },
      {
        id: 'imp-2',
        at: '2026-04-01T09:00:00Z',
        file: 'invented-april.xml',
        files: 1,
        records: 10,
        prepared: 10,
        imported: 10,
        duplicates: 0,
        skipped: 0,
        failed: 0,
        accountId: 'acc-1',
        accountName: 'Invented current account',
        categorised: 0,
        filed: 0,
        matched: 0,
        matchesWaiting: 0,
        problems: [],
      },
    ],
    rules: [
      {
        id: 'rule-1',
        counterpartyKey: 'TESTMARKT',
        categoryName: 'Groceries',
        createdAt: '2026-01-31T10:05:00Z',
      },
    ],
    provenance: {
      'row-1': { counterpartyKey: 'TESTMARKT', kind: 'card-payment' },
      'row-2': { counterpartyKey: 'ALBERT HEIJN', kind: 'card-payment' },
    },
    decisions: {
      'row-1': [
        {
          source: 'rule',
          categoryName: 'Groceries',
          at: '2026-02-01T00:00:00Z',
        },
        {
          source: 'manual',
          categoryName: 'Household',
          at: '2026-02-02T00:00:00Z',
        },
      ],
      'row-2': [
        {
          source: 'auto',
          categoryName: 'Groceries',
          at: '2026-02-03T00:00:00Z',
          because: V9_COUNTERPARTY,
        },
      ],
      'row-3': [
        {
          source: 'auto',
          categoryName: 'Bank fees',
          at: '2026-02-04T00:00:00Z',
          because: V9_BANK_CHARGE,
        },
      ],
      'row-4': [
        {
          source: 'auto',
          categoryName: 'Bank fees',
          at: '2026-02-05T00:00:00Z',
          because: V9_INTEREST,
        },
        { source: 'manual', categoryName: '', at: '2026-02-06T00:00:00Z' },
      ],
      'row-5': [
        {
          source: 'auto',
          categoryName: 'Other',
          at: '2026-02-07T00:00:00Z',
          because: NOT_V9,
        },
      ],
      // An automatic decision from before reasons were recorded at all.
      'row-6': [
        {
          source: 'auto',
          categoryName: 'Groceries',
          at: '2026-02-08T00:00:00Z',
        },
      ],
    },
    aliases: [],
    planned: [],
    occurrences: [],
    accountFlags: { 'acc-1': { countsTowardFunds: true } },
    settings: { ground: 'dark' },
    anchors: [],
    evidence: [],
    counterpartyNames: {},
    starterTaxonomyVersion: 1,
    counterpartyFoldVersion: 2,
  };
}

async function folder(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'ayq-store-v10-'));
}

/** Apostrophes aside, the same words: v9 wrote a curly one, the catalogue a straight one. */
function said(text: string): string {
  return text.replace(/’/g, "'");
}

/** Counts that must not move, whatever the representation does. */
function counts(store: Record<string, unknown>) {
  const decisions = store.decisions as Record<string, unknown[]>;
  const imports = store.imports as Array<Record<string, unknown>>;
  return {
    decisionKeys: Object.keys(decisions).length,
    decisionEntries: Object.values(decisions).reduce(
      (sum, one) => sum + one.length,
      0,
    ),
    imports: imports.length,
    problems: imports.map(one => (one.problems as unknown[]).length),
    rules: (store.rules as unknown[]).length,
    provenance: Object.keys(store.provenance as object).length,
    importCounts: imports.map(one => [
      one.records,
      one.imported,
      one.duplicates,
      one.failed,
      one.categorised,
      one.filed,
    ]),
  };
}

test('version 9 becomes 10: every count and every decision stays where it was', () => {
  const before = versionNine();
  const after = ayqMigrate(structuredClone(before)) as unknown as Record<
    string,
    unknown
  >;

  assert.equal(after.version, AYQ_STORE_VERSION);
  assert.equal(AYQ_STORE_VERSION, 10);
  assert.deepEqual(counts(after), counts(before));

  // Each decision keeps its source, its category and its moment, in order.
  const strip = (history: unknown[]) =>
    history.map(one => {
      const { source, categoryName, at } = one as Record<string, unknown>;
      return { source, categoryName, at };
    });
  for (const [key, history] of Object.entries(
    before.decisions as Record<string, unknown[]>,
  )) {
    assert.deepEqual(
      strip((after.decisions as Record<string, unknown[]>)[key]),
      strip(history),
      `the decisions on ${key} changed`,
    );
  }
  // And nothing else in the store is touched.
  for (const field of [
    'rules',
    'provenance',
    'accountFlags',
    'settings',
    'aliases',
    'planned',
  ]) {
    assert.deepEqual(after[field], before[field], `${field} changed`);
  }
});

test('the reasons version 9 wrote become their codes, and say the same thing', () => {
  const after = ayqMigrate(versionNine());
  const reasonOf = (key: string) =>
    after.decisions[key].find(one => one.source === 'auto')?.reason;

  assert.deepEqual(reasonOf('row-2'), {
    code: 'counterparty',
    counterparty: 'ALBERT HEIJN',
  });
  assert.deepEqual(reasonOf('row-3'), { code: 'bank-charge' });
  assert.deepEqual(reasonOf('row-4'), { code: 'bank-interest' });
  // No stored English is left anywhere in a decision.
  assert.doesNotMatch(JSON.stringify(after.decisions), /"because"/);

  // Read back through the catalogue, the same sentence as before.
  for (const [key, sentence] of [
    ['row-2', V9_COUNTERPARTY],
    ['row-3', V9_BANK_CHARGE],
    ['row-4', V9_INTEREST],
  ] as const) {
    const reason = reasonOf(key);
    assert.ok(reason);
    assert.equal(said(ayqFilingReasonText(reason)), said(sentence), key);
  }

  const problems = after.imports[0].problems;
  assert.deepEqual(
    problems.slice(0, 5).map(one => one.code),
    ['no-entries', 'not-camt', 'gone', 'not-allowed', 'folder'],
  );
  const v9Problems = (
    versionNine().imports as Array<{
      problems: Array<{ name: string; reason: string }>;
    }>
  )[0].problems;
  for (const [index, problem] of problems.slice(0, 5).entries()) {
    assert.equal(
      ayqImportProblemText(problem),
      `${v9Problems[index].name} — ${v9Problems[index].reason}`,
    );
  }
  assert.doesNotMatch(JSON.stringify(after.imports), /"reason"/);
});

test('a sentence version 9 never wrote is kept as evidence, and never shown', () => {
  const after = ayqMigrate(versionNine());
  const unknownReason = after.decisions['row-5'][0].reason;
  // Kept word for word, and not read as a decision about anything.
  assert.deepEqual(unknownReason, { code: 'legacy', legacyText: NOT_V9 });
  assert.equal(after.decisions['row-5'][0].categoryName, 'Other');
  assert.equal(after.decisions['row-5'][0].source, 'auto');
  // What a person sees is the catalogue's fallback, not the stored text.
  assert.ok(unknownReason);
  assert.doesNotMatch(ayqFilingReasonText(unknownReason), /moon/);

  const unknownProblem = after.imports[0].problems[5];
  assert.deepEqual(unknownProblem, {
    name: 'broken.zip',
    code: 'legacy',
    legacyText: 'invalid central directory file header',
  });
  assert.doesNotMatch(
    ayqImportProblemText(unknownProblem),
    /central directory/,
  );

  // A decision with no reason at all stays without one.
  assert.equal(after.decisions['row-6'][0].reason, undefined);
});

test('migrating the migrated store again changes nothing', () => {
  const once = ayqMigrate(versionNine());
  assert.deepEqual(ayqMigrate(structuredClone(once)), once);
});

test('a version 9 store on disk is copied first, and the copy is the old shape', async () => {
  const dataDir = await folder();
  const path = ayqStorePath(dataDir);
  const before = `${JSON.stringify(versionNine(), null, 2)}\n`;
  writeFileSync(path, before, 'utf8');

  const store = ayqReadStore(dataDir);
  assert.equal(store.version, 10);
  const kept = join(dataDir, 'ayq-store.before-v9-to-v10.json');
  assert.equal(
    readFileSync(kept, 'utf8'),
    before,
    'the copy is not the version 9 store',
  );
  // Reading did not rewrite the file: the change lands only when AYQ writes.
  assert.equal(readFileSync(path, 'utf8'), before);
});

test('a version 9 store whose copy cannot be made is not migrated', async () => {
  const dataDir = await folder();
  const path = ayqStorePath(dataDir);
  const before = `${JSON.stringify(versionNine(), null, 2)}\n`;
  writeFileSync(path, before, 'utf8');
  // A folder where the copy would go.
  mkdirSync(join(dataDir, 'ayq-store.before-v9-to-v10.json'));

  assert.throws(() => ayqReadStore(dataDir), /could not first keep a copy/);
  assert.equal(
    readFileSync(path, 'utf8'),
    before,
    'the store was changed anyway',
  );
});

test('an interrupted migration leaves the old store or the new one, never half of each', async () => {
  const dataDir = await folder();
  const path = ayqStorePath(dataDir);
  const before = `${JSON.stringify(versionNine(), null, 2)}\n`;
  writeFileSync(path, before, 'utf8');

  // A write that died halfway leaves its temporary file, never the store.
  writeFileSync(`${path}.tmp`, '{"version":10,"decisions":{"row-1":[', 'utf8');
  const opened = ayqReadStore(dataDir);
  assert.equal(opened.version, 10);
  assert.equal(
    readFileSync(path, 'utf8'),
    before,
    'the old store is still whole',
  );

  // Written, it is the new shape and opens as it is.
  ayqWriteStore(dataDir, opened);
  const written = JSON.parse(readFileSync(path, 'utf8')) as { version: number };
  assert.equal(written.version, 10);
  assert.deepEqual(ayqReadStore(dataDir), opened);
});

test('a version 11 store is refused, not repaired', () => {
  const ahead = versionNine();
  ahead.version = 11;
  assert.throws(() => ayqMigrate(ahead), /version 11/);
});

// ---------------------------------------------------------------------------
// 034 §2: a backup sealed while the store was version 9.

const FOLDER = 'AYQ-test0009';

function writeBudget(dataDir: string, label: string): void {
  mkdirSync(join(dataDir, FOLDER), { recursive: true });
  writeFileSync(
    join(dataDir, FOLDER, 'db.sqlite'),
    Buffer.concat([
      Buffer.from('SQLite format 3\u0000', 'latin1'),
      Buffer.from(label),
    ]),
  );
  writeFileSync(
    join(dataDir, FOLDER, 'metadata.json'),
    JSON.stringify({ id: FOLDER, budgetName: 'AYQ' }),
  );
}

/** Every file of a backup set, as name -> hash. */
function sealed(dataDir: string, backupId: string): Record<string, string> {
  const root = join(ayqBackupsDir(dataDir), backupId);
  const found: Record<string, string> = {};
  const walk = (prefix: string) => {
    for (const entry of readdirSync(join(root, prefix), {
      withFileTypes: true,
    })) {
      const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(relative);
      } else {
        found[relative] = createHash('sha256')
          .update(readFileSync(join(root, ...relative.split('/'))))
          .digest('hex');
      }
    }
  };
  walk('');
  return found;
}

/** A data directory whose backup was sealed with a version 9 store. */
async function withVersionNineBackup(): Promise<{
  dataDir: string;
  backupId: string;
}> {
  const dataDir = await folder();
  writeBudget(dataDir, 'budget as of the v9 backup');
  writeFileSync(
    ayqStorePath(dataDir),
    `${JSON.stringify(versionNine(), null, 2)}\n`,
    'utf8',
  );
  const made = ayqCreateBackup(dataDir, {
    trigger: 'manual',
    identity: { productVersion: '0.4.0', buildNumber: '010' },
  });
  assert.equal(made.outcome, 'created');
  assert.ok(made.outcome === 'created');
  assert.equal(made.manifest.storeVersion, 9);
  return { dataDir, backupId: made.backupId };
}

test('a backup sealed with a version 9 store restores, then migrates like any store', async () => {
  const { dataDir, backupId } = await withVersionNineBackup();
  const seal = sealed(dataDir, backupId);

  // Since then the owner kept working on version 9, then a launch of version
  // 10 migrated that later store and left its safety copy under the name a
  // v9 -> v10 copy takes. That copy is of a different store from the backup's.
  const later = versionNine();
  later.settings = { ground: 'system' };
  writeFileSync(
    ayqStorePath(dataDir),
    `${JSON.stringify(later, null, 2)}\n`,
    'utf8',
  );
  const live = ayqReadStore(dataDir);
  live.settings = { ground: 'light' };
  ayqWriteStore(dataDir, live);
  const earlierCopy = join(dataDir, 'ayq-store.before-v9-to-v10.json');
  const earlierCopyBytes = readFileSync(earlierCopy);
  writeBudget(dataDir, 'budget as it is now');

  const checked = ayqCheckBackup(dataDir, backupId);
  assert.ok(checked.ok, 'a version 9 backup was refused under version 10');
  ayqReplaceWithBackup(dataDir, checked.manifest);
  ayqFinishRestore(dataDir);

  // Restored exactly as sealed: the store is the version 9 file, untouched.
  const restoredRaw = JSON.parse(
    readFileSync(ayqStorePath(dataDir), 'utf8'),
  ) as { version: number };
  assert.equal(restoredRaw.version, 9);

  // Then opened the ordinary way: migrated, with a safety copy of *this* store.
  const opened = ayqReadStore(dataDir);
  assert.equal(opened.version, 10);
  assert.deepEqual(
    counts(opened as unknown as Record<string, unknown>),
    counts(versionNine()),
  );
  const copies = readdirSync(dataDir).filter(name =>
    name.startsWith('ayq-store.before-v9-to-v10'),
  );
  assert.equal(
    copies.length,
    2,
    'the restored store got no safety copy of its own',
  );
  assert.deepEqual(
    readFileSync(earlierCopy),
    earlierCopyBytes,
    'the earlier copy was overwritten',
  );
  const ownCopy = copies.find(
    name => name !== 'ayq-store.before-v9-to-v10.json',
  );
  assert.ok(ownCopy);
  assert.equal(
    (
      JSON.parse(readFileSync(join(dataDir, ownCopy), 'utf8')) as {
        version: number;
      }
    ).version,
    9,
  );

  // Decision provenance and reasons, read through the catalogue.
  assert.deepEqual(
    opened.decisions['row-1'].map(one => one.source),
    ['rule', 'manual'],
  );
  const reason = opened.decisions['row-3'][0].reason;
  assert.ok(reason);
  assert.equal(said(ayqFilingReasonText(reason)), said(V9_BANK_CHARGE));

  // And the backup itself is byte for byte what was sealed.
  assert.deepEqual(sealed(dataDir, backupId), seal);
  assert.ok(ayqCheckBackup(dataDir, backupId).ok);
});

test('the migration never touches a backup file, even after the store is written', async () => {
  const { dataDir, backupId } = await withVersionNineBackup();
  const seal = sealed(dataDir, backupId);
  const checked = ayqCheckBackup(dataDir, backupId);
  assert.ok(checked.ok);
  ayqReplaceWithBackup(dataDir, checked.manifest);
  ayqFinishRestore(dataDir);
  ayqWriteStore(dataDir, ayqReadStore(dataDir));
  assert.equal(
    (
      JSON.parse(readFileSync(ayqStorePath(dataDir), 'utf8')) as {
        version: number;
      }
    ).version,
    10,
  );
  assert.deepEqual(sealed(dataDir, backupId), seal);
});

test('a backup whose store is version 11 is still refused', async () => {
  const dataDir = await folder();
  writeBudget(dataDir, 'budget');
  const ahead = versionNine();
  ahead.version = 11;
  writeFileSync(ayqStorePath(dataDir), `${JSON.stringify(ahead)}\n`, 'utf8');
  const made = ayqCreateBackup(dataDir, {
    trigger: 'manual',
    identity: { productVersion: '0.9.0', buildNumber: '090' },
  });
  assert.equal(made.outcome, 'created');
  assert.ok(made.outcome === 'created');
  assert.deepEqual(ayqCheckBackup(dataDir, made.backupId), {
    ok: false,
    refusal: 'newer-store',
  });
  assert.equal(existsSync(join(dataDir, '.ayq-restore')), false);
});
