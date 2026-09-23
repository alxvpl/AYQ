// Needs attention through the real engine (036 §4; 010 with 013's corrections).
//
// Each source class is made to hold by the real condition that governs it and
// then made to stop holding by the real way that condition ends — never by
// touching the attention answer itself, which is not stored and cannot be.
//
// Every statement below is invented. Two are derived here from invented
// fixtures: a file that is not a statement, and the one missing movement of
// the coverage-gap statement.

import assert from 'node:assert/strict';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';

import type {
  AyqAttention,
  AyqAttentionKind,
} from '../../ayq-client/src/ayq-ipc-contract.ts';
import { ayqBackupsDir } from '../src/ayq-backup.ts';

import {
  ask,
  budget,
  fixture,
  gapFixture,
  here,
  restart,
} from './ayq-engine-harness.ts';

const noBalance = join(
  here,
  '..',
  '..',
  'ayq-camt',
  'test',
  'fixtures',
  'ayq-no-balance.xml',
);

function kinds(attention: AyqAttention): AyqAttentionKind[] {
  return attention.groups.map(one => one.kind);
}

async function attention(
  dataDir: string,
  today?: string,
): Promise<AyqAttention> {
  return ask(dataDir, {
    kind: 'attention',
    ...(today === undefined ? {} : { today }),
  });
}

test('an empty budget needs nothing', async () => {
  const dataDir = await budget();
  assert.deepEqual(kinds(await attention(dataDir)), []);
});

test('an unknown balance holds until the balance is set, by the one Set account balance path', async () => {
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [noBalance] });

  const before = await attention(dataDir);
  const group = before.groups.find(one => one.kind === 'balance-unknown');
  assert.ok(group, 'an account with no anchor did not need attention');
  assert.equal(group.count, 1);
  const accountId = group.accounts?.[0]?.accountId;
  assert.ok(accountId);

  // 013 §4: the same path the account's own detail offers.
  const view = await ask(dataDir, { kind: 'accounts.view' });
  const coverage = view.coverage.find(one => one.accountId === accountId);
  assert.ok(coverage?.toDate);
  await ask(dataDir, {
    kind: 'accounts.setBalance',
    accountId,
    amountCents: 12_345,
    coverageDate: coverage.toDate,
  });
  assert.ok(!kinds(await attention(dataDir)).includes('balance-unknown'));
});

test('a reconciliation difference holds until the missing movement is imported', async () => {
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [fixture] });
  assert.ok(
    !kinds(await attention(dataDir)).includes('reconciliation-difference'),
  );

  // The bank's July closing balance assumes a movement AYQ has not been given.
  await ask(dataDir, { kind: 'import.camt', paths: [gapFixture] });
  const differs = (await attention(dataDir)).groups.find(
    one => one.kind === 'reconciliation-difference',
  );
  assert.ok(differs, 'a difference the bank states did not need attention');
  assert.equal(differs.count, 1);

  // The missing movement: the credit of 268.69 that makes 1741.31 - 10.00
  // close at 2000.00. A statement of movements only, with no balance of its own.
  const gap = await readFile(gapFixture, 'utf8');
  const missing = gap
    .replace(/<Bal>[\s\S]*?<\/Bal>\s*/g, '')
    .replace('<Amt Ccy="EUR">10.00</Amt>', '<Amt Ccy="EUR">268.69</Amt>')
    .replace('<CdtDbtInd>DBIT</CdtDbtInd>', '<CdtDbtInd>CRDT</CdtDbtInd>')
    .replaceAll('2026-07-15', '2026-07-20')
    .replace('TESTGAP0000000001', 'TESTGAP0000000002')
    .replace(
      '<Id>NL00TEST0123456789.2026-07-31</Id>',
      '<Id>NL00TEST0123456789.2026-07-31-B</Id>',
    );
  const path = join(dataDir, 'the-missing-movement.xml');
  await writeFile(path, missing, 'utf8');
  await ask(dataDir, { kind: 'import.camt', paths: [path] });

  const view = await ask(dataDir, { kind: 'accounts.view' });
  assert.equal(
    view.accounts[0]?.reconciliation?.differenceCents,
    0,
    'the fixture did not close the gap',
  );
  assert.ok(
    !kinds(await attention(dataDir)).includes('reconciliation-difference'),
  );
});

test('a payment due today, then overdue, then dismissed', async () => {
  const dataDir = await budget();
  await ask(dataDir, {
    kind: 'plan.save',
    today: '2026-06-15',
    record: {
      name: 'Invented rent',
      kind: 'expense',
      amountCents: 90_000,
      categoryName: null,
      startDate: '2026-06-20',
      recurrence: { frequency: 'monthly', interval: 1 },
    },
  });

  assert.ok(
    !kinds(await attention(dataDir, '2026-06-15')).includes('due-today'),
  );
  const due = await attention(dataDir, '2026-06-20');
  assert.deepEqual(
    due.groups.filter(one => one.kind === 'due-today').map(one => one.count),
    [1],
  );
  assert.ok(
    !kinds(due).includes('overdue'),
    'due today is not overdue (03 §7.26)',
  );

  const late = await attention(dataDir, '2026-06-22');
  assert.ok(!kinds(late).includes('due-today'));
  assert.deepEqual(
    late.groups.filter(one => one.kind === 'overdue').map(one => one.count),
    [1],
  );

  // Dismissed under Upcoming's own semantics, and the condition is gone.
  const plan = await ask(dataDir, { kind: 'plan.list', today: '2026-06-22' });
  const record = plan.records[0];
  assert.ok(record);
  await ask(dataDir, {
    kind: 'plan.dismissOccurrence',
    recordId: record.id,
    dueDate: '2026-06-20',
    dismissed: true,
    today: '2026-06-22',
  });
  assert.ok(!kinds(await attention(dataDir, '2026-06-22')).includes('overdue'));
});

test('counterparties to review are one group, however many, until they are filed', async () => {
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [fixture] });
  const unfiled = await ask(dataDir, { kind: 'counterparties.unfiled' });
  assert.ok(unfiled.length > 1, 'the fixture leaves too little to review');

  const review = (await attention(dataDir)).groups.filter(
    one => one.kind === 'review',
  );
  // One group (013 §5), counting what is in it.
  assert.equal(review.length, 1);
  assert.equal(review[0].count, unfiled.length);

  const categories = await ask(dataDir, { kind: 'categories.list' });
  const other = categories.find(one => one.name === 'Other') ?? categories[0];
  assert.ok(other);
  for (const one of unfiled) {
    await ask(dataDir, {
      kind: 'transaction.categoriseCounterparty',
      counterpartyKey: one.key,
      categoryId: other.id,
      createRule: false,
    });
  }
  assert.ok(!kinds(await attention(dataDir)).includes('review'));
});

test('a file an import could not use holds until it is marked handled (013 §1b)', async () => {
  const dataDir = await budget();
  const bad = join(dataDir, 'shopping-list.xml');
  await writeFile(bad, '<list><item>bread</item></list>', 'utf8');
  await ask(dataDir, { kind: 'import.camt', paths: [fixture, bad] });

  const group = (await attention(dataDir)).groups.find(
    one => one.kind === 'import-failed',
  );
  assert.ok(group, 'a file the import could not use did not need attention');
  assert.deepEqual(
    group.files?.map(one => [one.name, one.code]),
    [['shopping-list.xml', 'no-entries']],
  );

  const history = await ask(dataDir, {
    kind: 'imports.markHandled',
    importId: group.files?.[0]?.importId ?? '',
    name: 'shopping-list.xml',
  });
  // Import history changed — not the attention item (013 §1b).
  assert.ok(history[0]?.problems[0]?.handledAt);
  assert.ok(!kinds(await attention(dataDir)).includes('import-failed'));

  // And it outlives the engine: the mark is in the store.
  await restart(dataDir);
  assert.ok(!kinds(await attention(dataDir)).includes('import-failed'));
});

test('a file an import could not use holds until a later import reads it (013 §1a)', async () => {
  const dataDir = await budget();
  const late = join(dataDir, 'late.xml');
  await writeFile(late, '<Document><BkToCstmrStmt>', 'utf8');
  await ask(dataDir, { kind: 'import.camt', paths: [fixture, late] });
  assert.ok(kinds(await attention(dataDir)).includes('import-failed'));

  // The same name, now a statement AYQ can read, imported later.
  await writeFile(late, await readFile(gapFixture, 'utf8'), 'utf8');
  await ask(dataDir, { kind: 'import.camt', paths: [late] });
  assert.ok(!kinds(await attention(dataDir)).includes('import-failed'));
});

test('a failed backup holds until a backup succeeds', async () => {
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [fixture] });
  await restart(dataDir);
  // Something that is not a folder where the backups go: every attempt fails.
  await rm(ayqBackupsDir(dataDir), { recursive: true, force: true });
  await writeFile(ayqBackupsDir(dataDir), 'not a folder', 'utf8');
  const failed = await ask(dataDir, { kind: 'backup.create' });
  assert.equal(failed.outcome, 'failed');

  const group = (await attention(dataDir)).groups.find(
    one => one.kind === 'backup-failed',
  );
  assert.ok(group, 'a failed backup did not need attention');
  assert.equal(group.backup?.failure, 'write-failed');

  await rm(ayqBackupsDir(dataDir), { force: true });
  const made = await ask(dataDir, { kind: 'backup.create' });
  assert.equal(made.outcome, 'created');
  assert.ok(!kinds(await attention(dataDir)).includes('backup-failed'));
});

test('a file mark that names nothing is refused as a code', async () => {
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [fixture] });
  const { send } = await import('./ayq-engine-harness.ts');
  const answer = await send(
    {
      id: 'mark-nothing',
      kind: 'imports.markHandled',
      importId: 'no-such-import',
      name: 'x.xml',
    },
    dataDir,
  );
  assert.equal(answer.ok, false);
  assert.ok(!answer.ok && answer.code === 'import-problem-not-found');
});
