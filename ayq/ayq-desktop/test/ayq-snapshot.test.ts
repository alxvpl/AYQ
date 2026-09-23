// The analytical snapshot AYQ writes for AYQ Analyses, asked of the engine
// that ships (02 §7.8–§7.16, 03 §13).
//
// Every claim below is read back from a file the real engine wrote from a real
// Actual budget that a real CAMT import filled — the same path the owner's own
// export takes. The fixtures are invented (03 §6.1): no real statement, account
// or figure enters this repository, CI or any artifact.

import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  CONTRACT_MAJOR,
  ContractValidationError,
  FORBIDDEN_KEYS,
  validateAnalyticalSnapshot,
  type AnalyticalSnapshotV1,
} from '../../ayq-analytical-contract/src/index.ts';
import type { AyqSnapshotWritten } from '../../ayq-client/src/ayq-ipc-contract.ts';
import { ayqProvenIntervals } from '../src/ayq-evidence.ts';
import {
  ayqSnapshotEvidence,
  ayqSnapshotPartialPath,
  ayqWriteSnapshotFile,
} from '../src/ayq-snapshot.ts';
import { ayqReadStore } from '../src/ayq-store.ts';
import { ask, budget, fixture, ownAccountFixture, send } from './ayq-engine-harness.ts';

const TODAY = '2026-09-15';

async function exported(dataDir: string, name = 'snapshot.json'): Promise<{
  summary: AyqSnapshotWritten;
  snapshot: AnalyticalSnapshotV1;
  text: string;
}> {
  const path = join(dataDir, 'out', name);
  const summary = await ask(dataDir, { kind: 'snapshot.write', path, today: TODAY });
  const text = await readFile(path, 'utf8');
  const snapshot = validateAnalyticalSnapshot(JSON.parse(text));
  return { summary, snapshot, text };
}

test('the export writes one file that the contract validator accepts, and answers with counts only', async () => {
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [fixture] });

  const { summary, snapshot, text } = await exported(dataDir);

  assert.equal(snapshot.meta.contractVersion, `${CONTRACT_MAJOR}.0`);
  assert.equal(summary.accounts, snapshot.accounts.length);
  assert.equal(summary.transactions, snapshot.transactions.length);
  assert.equal(summary.counterparties, snapshot.counterparties.length);
  assert.equal(summary.bytes, Buffer.byteLength(text, 'utf8'));
  assert.equal(summary.generatedAt, snapshot.meta.generatedAt);
  // The answer is counts and a location; nothing in it is a figure.
  assert.deepEqual(Object.keys(summary).sort(), [
    'accounts',
    'bytes',
    'counterparties',
    'generatedAt',
    'outcome',
    'path',
    'transactions',
  ]);
  assert.equal(summary.outcome, 'written');

  // No temporary file is left beside the result (03 §13.10).
  const left = await readdir(join(dataDir, 'out'));
  assert.deepEqual(left, ['snapshot.json']);
});

test('nothing 03 §13.8 excludes crosses: no IBAN, reference, mandate, raw description or store shape', async () => {
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [fixture] });

  const { snapshot, text } = await exported(dataDir);

  // The fixture's full IBAN appears nowhere in the file; only the masked
  // identifier does.
  assert.doesNotMatch(text, /NL\d{2}[A-Z]{4}\d{10}/);
  for (const account of snapshot.accounts) {
    assert.match(account.displayIdentifier, /^[A-Z]{2}…[A-Z0-9]{4}$/);
  }

  // Every forbidden key the validator knows is absent at every depth — the
  // validator already refuses them, so this is the same claim from the file.
  const keys = new Set<string>();
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) value.forEach(walk);
    else if (value !== null && typeof value === 'object') {
      for (const [key, inner] of Object.entries(value)) {
        keys.add(key.toLowerCase());
        walk(inner);
      }
    }
  };
  walk(snapshot);
  for (const forbidden of FORBIDDEN_KEYS) {
    assert.equal(keys.has(forbidden.toLowerCase()), false, `key ${forbidden} crossed`);
  }

  // Transaction keys are digests, never the bank's own reference.
  for (const transaction of snapshot.transactions) {
    assert.match(transaction.transactionKey, /^tx-[0-9a-f]{24}$/);
    assert.ok([...transaction.evidenceText].length <= 256);
    assert.doesNotMatch(transaction.evidenceText, /[\r\n]/);
  }
});

test('coverage crosses as AYQ proved it: the statement dates, and a start only where one is proven', async () => {
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [fixture] });

  const view = await ask(dataDir, { kind: 'accounts.view' });
  const { snapshot } = await exported(dataDir);

  assert.equal(snapshot.accounts.length, 1);
  const [account] = snapshot.accounts;
  const [coverage] = view.coverage;
  assert.equal(account.statementCoverage.lastStatementDate, coverage.toDate);
  // A whole month, stated by the bank with its period: the start is the one
  // AYQ proved, and it is present only because AYQ proved it (03 §8.7).
  const proven = ayqProvenIntervals(ayqReadStore(dataDir), coverage.accountId).find(
    one => one.to === coverage.toDate,
  );
  assert.equal(account.statementCoverage.coverageStartDate, proven?.from);
  assert.equal(account.currency, 'EUR');
  assert.deepEqual(snapshot.meta.currencies, ['EUR']);
  assert.equal(snapshot.meta.coverage.reliabilityBoundary, view.reliableTo ?? undefined);
});

test('reconciliation crosses only where the bank stated a closing balance at the coverage date', async () => {
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [fixture] });

  const view = await ask(dataDir, { kind: 'accounts.view' });
  const { snapshot } = await exported(dataDir);
  const [account] = snapshot.accounts;
  const [ayqAccount] = view.accounts;

  if (ayqAccount.reconciliation === null) {
    assert.equal(account.reconciliation.state, 'unavailable');
    assert.equal('bankClosingBalance' in account.statementCoverage, false);
  } else {
    assert.notEqual(account.reconciliation.state, 'unavailable');
    assert.ok(account.reconciliation.state !== 'unavailable');
    assert.equal(
      account.statementCoverage.bankClosingBalance?.amount,
      ayqAccount.reconciliation.statementBalanceCents,
    );
    assert.equal(
      account.reconciliation.ledgerBalanceAtCoverageDate.amount,
      ayqAccount.reconciliation.ledgerBalanceCents,
    );
    assert.equal(account.reconciliation.difference.amount, ayqAccount.reconciliation.differenceCents);
    assert.equal(account.reconciliation.state === 'agrees', ayqAccount.reconciliation.agrees);
  }

  // The absolute balance is known exactly when AYQ knows it, and is the same
  // number the Accounts screen shows.
  if (ayqAccount.balanceCents === null) {
    assert.equal(account.absoluteBalance.state, 'unknown');
  } else {
    assert.deepEqual(account.absoluteBalance, {
      state: 'known',
      amount: { amount: ayqAccount.balanceCents, currency: 'EUR' },
    });
  }
});

test('a movement between the owner’s own accounts crosses as one pair with no counterparty and no category', async () => {
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [ownAccountFixture('ayq-own-current.xml')] });
  await ask(dataDir, { kind: 'import.camt', paths: [ownAccountFixture('ayq-own-savings.xml')] });

  const { snapshot } = await exported(dataDir);
  assert.equal(snapshot.accounts.length, 2);

  const transfers = snapshot.transactions.filter(t => t.internalTransfer !== undefined);
  assert.ok(transfers.length >= 2, 'both sides of the transfer are in the snapshot');
  for (const side of transfers) {
    assert.equal(side.counterparty.state, 'not_applicable');
    assert.equal(side.category.state, 'not_applicable');
    const counter = snapshot.accounts.find(a => a.accountKey === side.internalTransfer?.counterAccountKey);
    assert.ok(counter, 'the counter account is one of the two');
    assert.notEqual(counter.accountKey, side.accountKey);
  }
  const byPair = new Map<string, typeof transfers>();
  for (const side of transfers) {
    const key = side.internalTransfer!.pairKey;
    byPair.set(key, [...(byPair.get(key) ?? []), side]);
  }
  const paired = [...byPair.values()].filter(sides => sides.length === 2);
  assert.ok(paired.length >= 1, 'at least one pair is matched across the two accounts');
  for (const [left, right] of paired) {
    assert.equal(left.amount.amount, -right.amount.amount);
    assert.equal(left.bookingDate, right.bookingDate);
  }

  // Integrity counts describe the content (017 §3), and the validator has
  // already agreed; here the transfer sides are outside the counterparty tallies.
  const nonTransfer = snapshot.transactions.filter(t => t.internalTransfer === undefined);
  assert.equal(
    snapshot.meta.counts.counterpartyNotApplicable,
    nonTransfer.filter(t => t.counterparty.state === 'not_applicable').length,
  );
});

test('every categorised transaction names its provenance, and every uncategorised one stays so', async () => {
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [fixture] });

  const ledger = await ask(dataDir, { kind: 'transactions.list', filter: { limit: 1000 } });
  assert.equal(ledger.shown, ledger.total, 'the whole register, for the comparison');
  const { snapshot } = await exported(dataDir);

  assert.equal(snapshot.transactions.length, ledger.total);
  const uncategorised = snapshot.transactions.filter(t => t.category.state === 'uncategorised');
  assert.equal(snapshot.meta.counts.uncategorisedTransactions, uncategorised.length);
  // One account, so no internal transfer: what is uncategorised in the
  // Register is exactly what is uncategorised in the snapshot.
  assert.equal(
    uncategorised.length,
    ledger.rows.filter(row => row.categoryId === null).length,
  );
  for (const row of ledger.rows) {
    const transaction = snapshot.transactions.find(
      t => t.bookingDate === row.date && t.amount.amount === row.amountCents,
    );
    assert.ok(transaction, 'every register row is in the snapshot with its date and amount');
  }

  for (const transaction of snapshot.transactions) {
    const category = transaction.category;
    if (category.state !== 'categorised') continue;
    assert.ok(['manual', 'learned_rule', 'automatic'].includes(category.source));
    if (category.source === 'learned_rule') {
      assert.ok(category.ruleKey, 'a learned rule names itself');
    } else {
      assert.equal('ruleKey' in category, false);
    }
    assert.ok(snapshot.categories.some(c => c.categoryId === category.categoryId));
  }
  if (ledger.rows.some(row => row.categoryId !== null)) {
    assert.ok(snapshot.transactions.some(t => t.category.state === 'categorised'));
  }
});

test('the forecast crosses as a sealed result, available exactly when AYQ knows available funds', async () => {
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [fixture] });

  const view = await ask(dataDir, { kind: 'forecast', today: TODAY });
  const { snapshot } = await exported(dataDir);

  assert.equal(snapshot.forecast.kind, 'canonical_ayq_forecast');
  assert.equal(snapshot.forecast.horizonMonths, 12);
  assert.equal(snapshot.forecast.asOfDate, view.today);
  assert.equal(snapshot.forecast.horizonEnd, view.horizon);
  if (view.availableFundsCents === null) {
    assert.equal(snapshot.forecast.state, 'unavailable');
    assert.ok(snapshot.forecast.state === 'unavailable');
    assert.ok(snapshot.forecast.unavailableReason.length <= 128);
  } else {
    assert.equal(snapshot.forecast.state, 'available');
    assert.ok(snapshot.forecast.state === 'available');
    assert.equal(snapshot.forecast.openingPosition.amount, view.availableFundsCents);
    for (const point of snapshot.forecast.series) {
      const month = view.months.find(m => point.date.startsWith(m.month));
      assert.ok(month, 'every point is a month AYQ projected');
      assert.equal(point.projectedPosition.amount, month.closingCents);
    }
  }
});

test('an export that cannot be written answers with an error and leaves nothing behind', async () => {
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [fixture] });

  // The validator is the gate the producer runs before writing: what it
  // refuses is never on disk. Its refusal is a typed error, not a partial file.
  assert.throws(
    () => validateAnalyticalSnapshot({ meta: { contractVersion: '2.0' } }),
    ContractValidationError,
  );

  // A target inside a file cannot be created; the engine says so and the
  // directory it would have needed does not appear.
  const { summary } = await exported(dataDir);
  assert.ok(summary.bytes > 0);
  const impossible = join(summary.path, 'inner', 'snapshot.json');
  const answer = await send(
    { id: 'snapshot-impossible', kind: 'snapshot.write', path: impossible, today: TODAY },
    dataDir,
  );
  assert.equal(answer.ok, false);
  assert.equal(existsSync(impossible), false);
  assert.equal(existsSync(join(summary.path, 'inner')), false);
});

test('the evidence text withholds a full IBAN however the bank spaced it, as the contract checks it (03 §13.8)', () => {
  // Invented identifiers, in the spaced form a statement prints and the
  // unspaced form a resolver folds them to.
  const spaced = ayqSnapshotEvidence('Payment to NL91 ABNA 0417 1643 00 for rent');
  const folded = ayqSnapshotEvidence('Payment to NL91ABNA0417164300 for rent');
  const lower = ayqSnapshotEvidence('betaling nl91abna0417164300');
  for (const text of [spaced, folded, lower]) {
    assert.doesNotMatch(text.replace(/\s+/g, '').toUpperCase(), /[A-Z]{2}\d{2}[A-Z0-9]{11,30}/);
    assert.ok(text.includes('…'), 'the identifier is withheld, not silently dropped');
  }
  assert.equal(spaced, 'Payment to … for rent');
  // What is not an IBAN is left alone; a line break becomes a space; the
  // bound is 256 code points.
  assert.equal(ayqSnapshotEvidence('Superstore\nAmsterdam 2026'), 'Superstore Amsterdam 2026');
  assert.equal([...ayqSnapshotEvidence('é'.repeat(300))].length, 256);
  assert.equal(ayqSnapshotEvidence(null), '');
});

test('success is claimed only for a file that is there at the size written; the answer carries the exact path', async () => {
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [fixture] });

  // The path is returned unchanged, and the file on disk is exactly the
  // bytes the answer claims — read back, not assumed.
  const path = join(dataDir, 'out', 'spaced folder', 'own name.json');
  const summary = await ask(dataDir, { kind: 'snapshot.write', path, today: TODAY });
  assert.equal(summary.path, path);
  assert.equal(statSync(path).size, summary.bytes);
  assert.deepEqual(await readdir(join(dataDir, 'out', 'spaced folder')), ['own name.json']);

  // A target the engine cannot write to is a failure, and nothing is left
  // behind — no file, no temporary file.
  const blocked = join(dataDir, 'out', 'blocked');
  mkdirSync(blocked, { recursive: true });
  const asDirectory = join(blocked, 'snapshot.json');
  mkdirSync(asDirectory);
  const answer = await send({ id: 'snapshot-blocked', kind: 'snapshot.write', path: asDirectory, today: TODAY }, dataDir);
  assert.equal(answer.ok, false);
  assert.ok(!answer.ok && answer.code === 'snapshot-write-failed', 'the failure is coded');
  assert.deepEqual(await readdir(blocked), ['snapshot.json'], 'no temporary file beside the target');
  assert.ok(statSync(asDirectory).isDirectory(), 'the obstacle is untouched');
});

test('an export stopped after its partial was proven leaves the previous snapshot byte for byte (03 §13.10)', async () => {
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [fixture] });
  const { summary, text } = await exported(dataDir);
  const previous = readFileSync(summary.path);

  // A second, different snapshot, stopped between the proof and the move — as
  // the process ending there would stop it.
  const next = text.replace(/"generatedAt": "[^"]+"/, '"generatedAt": "2030-01-01T00:00:00Z"');
  assert.notEqual(next, text);
  assert.throws(
    () =>
      ayqWriteSnapshotFile(summary.path, next, () => {
        throw new Error('the process ended here');
      }),
    (error: unknown) => (error as { code?: string }).code === 'snapshot-write-failed',
  );
  assert.deepEqual(readFileSync(summary.path), previous, 'the previous snapshot is untouched');
  validateAnalyticalSnapshot(JSON.parse(readFileSync(summary.path, 'utf8')));
  assert.equal(existsSync(ayqSnapshotPartialPath(summary.path)), false, 'no partial is left');

  // What does not validate never replaces it, however it was written.
  assert.throws(
    () => ayqWriteSnapshotFile(summary.path, '{"meta": {"contractVersion": "1.0"}}'),
    (error: unknown) => (error as { code?: string }).code === 'snapshot-invalid',
  );
  assert.deepEqual(readFileSync(summary.path), previous);
  assert.equal(existsSync(ayqSnapshotPartialPath(summary.path)), false);
});

test('a partial left by an interrupted export is never the snapshot, and the next export writes over it', async () => {
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [fixture] });
  const { summary } = await exported(dataDir);
  const previous = readFileSync(summary.path);
  const partial = ayqSnapshotPartialPath(summary.path);
  writeFileSync(partial, '{"meta": {"contractVersion": "1.0", "snaps');
  assert.deepEqual(readFileSync(summary.path), previous);

  const again = await ask(dataDir, { kind: 'snapshot.write', path: summary.path, today: TODAY });
  assert.equal(again.outcome, 'written');
  assert.equal(existsSync(partial), false);
  validateAnalyticalSnapshot(JSON.parse(readFileSync(summary.path, 'utf8')));
  assert.deepEqual(await readdir(join(dataDir, 'out')), ['snapshot.json']);

  // Something that is not AYQ's partial file at that name is left alone, and
  // the export fails without touching the snapshot.
  const before = readFileSync(summary.path);
  mkdirSync(join(partial, 'not-ours'), { recursive: true });
  const refused = await send(
    { id: 'snapshot-obstructed', kind: 'snapshot.write', path: summary.path, today: TODAY },
    dataDir,
  );
  assert.equal(refused.ok, false);
  assert.ok(!refused.ok && refused.code === 'snapshot-write-failed');
  assert.deepEqual(readFileSync(summary.path), before);
  assert.ok(statSync(join(partial, 'not-ours')).isDirectory());
});

test('the engine never chooses a place itself: a window request for an export is not a write', async () => {
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [fixture] });
  const answer = await send({ id: 'snapshot-from-window', kind: 'snapshot.export' }, dataDir);
  assert.equal(answer.ok, false);
  assert.ok(!answer.ok && answer.code === 'snapshot-not-from-window');
});

test('a cash withdrawal crosses with no counterparty, as not applicable', async () => {
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [ownAccountFixture('ayq-abn-day.xml')] });
  const { snapshot } = await exported(dataDir);
  const cash = snapshot.transactions.filter(one => one.transactionClass === 'cash_withdrawal');
  assert.ok(cash.length >= 1, 'the invented day has an ATM withdrawal');
  for (const one of cash) assert.equal(one.counterparty.state, 'not_applicable');
});

test('category plans cross as Plan holds them, month by month, and only where something is planned', async () => {
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [fixture] });
  const category = (await ask(dataDir, { kind: 'categories.list' })).find(one => !one.isIncome);
  assert.ok(category, 'the budget has an expense category');
  const month = TODAY.slice(0, 7);
  await ask(dataDir, { kind: 'budget.setPlan', month, categoryId: category.id, cents: 12_300 });

  const { snapshot } = await exported(dataDir);
  assert.deepEqual(snapshot.categoryPlans, [
    { categoryId: `cat-${category.id}`, month, plannedAmount: { amount: 12_300, currency: 'EUR' } },
  ]);

  // Cleared, it does not cross as nought.
  await ask(dataDir, { kind: 'budget.setPlan', month, categoryId: category.id, cents: 0 });
  const cleared = await exported(dataDir, 'cleared.json');
  assert.deepEqual(cleared.snapshot.categoryPlans, []);
});
