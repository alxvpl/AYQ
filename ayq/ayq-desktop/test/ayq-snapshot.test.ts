// The analytical snapshot AYQ writes for AYQ Analyses, asked of the engine
// that ships (03 §13).
//
// Every claim below is read back from a file the real engine wrote from a real
// Actual budget that a real CAMT import filled — the same path the owner's own
// export takes. The fixtures are invented (03 §6.1): no real statement, account
// or figure enters this repository, CI or any artifact.

import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  CONTRACT_MAJOR,
  CONTRACT_MINOR,
  ContractValidationError,
  FORBIDDEN_KEYS,
  validateAnalyticalSnapshot,
  type AnalyticalSnapshotV1,
} from '../../ayq-analytical-contract/src/index.ts';
import type { AyqPlannedRecord, AyqSnapshotExport } from '../../ayq-client/src/ayq-ipc-contract.ts';
import { ayqCovers, ayqProvenIntervals } from '../src/ayq-evidence.ts';
import { ayqAutomaticMatchWindow, ayqProposeMatches } from '../src/ayq-match.ts';
import { ayqOccurrenceDates, ayqOccurrencesBetween, ayqPlanWindow } from '../src/ayq-plan-series.ts';
import { ayqSnapshotEvidence, ayqSnapshotExpectations } from '../src/ayq-snapshot.ts';
import { ayqMigrate, ayqReadStore, type AyqCoverageEvidence, type AyqPlanOccurrenceRecord } from '../src/ayq-store.ts';
import { ask, budget, fixture, ownAccountFixture, send } from './ayq-engine-harness.ts';

const TODAY = '2026-09-15';

async function exported(dataDir: string, name = 'snapshot.json'): Promise<{
  summary: AyqSnapshotExport;
  snapshot: AnalyticalSnapshotV1;
  text: string;
}> {
  const path = join(dataDir, 'out', name);
  const summary = await ask(dataDir, { kind: 'snapshot.export', path, today: TODAY });
  const text = await readFile(path, 'utf8');
  const snapshot = validateAnalyticalSnapshot(JSON.parse(text));
  return { summary, snapshot, text };
}

test('the export writes one file that the contract validator accepts, and answers with counts only', async () => {
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [fixture] });

  const { summary, snapshot, text } = await exported(dataDir);

  assert.equal(snapshot.meta.contractVersion, `${CONTRACT_MAJOR}.${CONTRACT_MINOR}`);
  assert.equal(snapshot.meta.contractVersion, '1.1');
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
    'path',
    'transactions',
  ]);

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
    { id: 'snapshot-impossible', kind: 'snapshot.export', path: impossible, today: TODAY },
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
  const summary = await ask(dataDir, { kind: 'snapshot.export', path, today: TODAY });
  assert.equal(summary.path, path);
  assert.equal(statSync(path).size, summary.bytes);
  assert.deepEqual(await readdir(join(dataDir, 'out', 'spaced folder')), ['own name.json']);

  // A target the engine cannot write to is a failure, and nothing is left
  // behind — no file, no temporary file.
  const blocked = join(dataDir, 'out', 'blocked');
  mkdirSync(blocked, { recursive: true });
  const asDirectory = join(blocked, 'snapshot.json');
  mkdirSync(asDirectory);
  const answer = await send({ id: 'snapshot-blocked', kind: 'snapshot.export', path: asDirectory, today: TODAY }, dataDir);
  assert.equal(answer.ok, false);
  // A code the renderer words, and the engine's reason for a developer.
  assert.equal(!answer.ok && answer.code, 'unexpected');
  assert.ok(!answer.ok && answer.detail.length > 0, 'the failure says why');
  assert.deepEqual(await readdir(blocked), ['snapshot.json'], 'no temporary file beside the target');
  assert.ok(statSync(asDirectory).isDirectory(), 'the obstacle is untouched');
});

// ---- contract 1.1: the expectation facts (A2 P1 R002 §5–§8, §11–§12) --------
//
// The expectation section is assembled by one function from the plan, the
// store and the accounts that crossed, so the cases below are invented data run
// through the very code the export runs. The plan is built the way ayqPlan
// builds it — ayqPlanWindow, then ayqOccurrencesBetween — never written out by
// hand. The last test then asks the real engine for a real export.

const AS_OF = '2026-09-15';

function planned(over: Partial<AyqPlannedRecord> & { id: string }): AyqPlannedRecord {
  return {
    name: 'Invented payment',
    kind: 'expense',
    amountCents: 5_000,
    categoryName: null,
    counterpartyKey: null,
    accountId: 'acct-a',
    startDate: '2026-01-10',
    recurrence: { frequency: 'monthly', interval: 1 },
    endDate: null,
    state: 'confirmed',
    provenance: 'manual',
    mandateId: null,
    confirmedAt: '2026-01-05',
    suggestedAt: '2026-01-05',
    createdAt: '2026-01-05T09:00:00.000Z',
    updatedAt: '2026-01-05T09:00:00.000Z',
    ...over,
  };
}

function decided(recordId: string, dueDate: string, over: Partial<AyqPlanOccurrenceRecord>): AyqPlanOccurrenceRecord {
  return {
    recordId,
    dueDate,
    rescheduledTo: null,
    matchedTransactionId: null,
    matchedAt: null,
    matchProvenance: null,
    dismissed: false,
    rejected: [],
    ...over,
  };
}

function proven(accountId: string, fromDate: string | null, toDate: string): AyqCoverageEvidence {
  return {
    accountId,
    importId: `imp-${accountId}-${toDate}`,
    fromDate,
    toDate,
    closingBalanceCents: null,
    file: `invented-${toDate}.xml`,
    readAt: `${toDate}T10:00:00.000Z`,
  };
}

function expectations(
  records: AyqPlannedRecord[],
  options: {
    decisions?: AyqPlanOccurrenceRecord[];
    evidence?: AyqCoverageEvidence[];
    transactions?: Map<string, string>;
    counterparties?: string[];
  } = {},
) {
  const store = ayqMigrate({ version: 8 });
  store.evidence = options.evidence ?? [];
  const { from, to } = ayqPlanWindow(AS_OF, records);
  const plan = { records, occurrences: ayqOccurrencesBetween(records, options.decisions ?? [], from, to, AS_OF) };
  const assembled = ayqSnapshotExpectations({
    plan,
    store,
    today: AS_OF,
    // `acct-a` has imported coverage and is in the snapshot; nothing else is.
    includedAccountKeys: new Map([['acct-a', 'acc-a']]),
    counterpartyKeys: new Set(options.counterparties ?? []),
    categoryIdByName: new Map(),
    transactionKeyById: options.transactions ?? new Map(),
  });
  return { store, plan, ...assembled };
}

test('the expected account crosses only from the record’s own account, and only when that account is in the snapshot (P4, P5, T17, T23)', () => {
  const { expectationRecords, expectedOccurrences } = expectations(
    [
      planned({ id: 'own', counterpartyKey: 'cp-invented' }),
      // The same counterparty and the same amount as `own`, whose payments are
      // in `acct-a` — but no account of its own. Nothing stands in for one.
      planned({ id: 'none', counterpartyKey: 'cp-invented', accountId: null }),
      // Its own account has nothing imported, so it is not in accounts[].
      planned({ id: 'outside', accountId: 'acct-no-import' }),
    ],
    { counterparties: ['cp-invented'] },
  );
  const key = (id: string) => expectationRecords.find(r => r.recordKey === `rec-${id}`)?.expectedAccountKey;
  assert.equal(key('own'), 'acc-a');
  assert.equal(key('none'), undefined);
  assert.equal(key('outside'), undefined);
  assert.ok(expectedOccurrences.some(o => o.recordKey === 'rec-none'));
  for (const occurrence of expectedOccurrences) {
    assert.ok(occurrence.automaticMatchThroughDate, occurrence.occurrenceKey);
    // The coverage fact exists exactly for the record with an expected account.
    assert.equal('automaticMatchWindowCovered' in occurrence, occurrence.recordKey === 'rec-own', occurrence.occurrenceKey);
  }
});

test('whether the window is covered is AYQ’s proven intervals over every day of it: a one-day gap, an unknown start or time after the data leave it unproven (P7, T16)', () => {
  const { store, expectedOccurrences } = expectations(
    [
      planned({ id: 'rent' }),
      planned({ id: 'edge', startDate: '2026-02-28', recurrence: { frequency: 'once', interval: 1 } }),
    ],
    {
      evidence: [
        proven('acct-a', '2026-01-01', '2026-02-28'),
        // Adjacent to the first: no gap between them.
        proven('acct-a', '2026-03-01', '2026-03-11'),
        // 12 March is in no statement: a gap of one day.
        proven('acct-a', '2026-03-13', '2026-05-31'),
        // June, from a file that did not say where it starts: it proves nothing.
        proven('acct-a', null, '2026-06-30'),
      ],
    },
  );
  assert.deepEqual(
    expectedOccurrences
      .filter(o => o.expectedDate <= '2026-07-10')
      .map(o => [o.expectedDate, o.automaticMatchThroughDate, o.automaticMatchWindowCovered]),
    [
      ['2026-01-10', '2026-01-17', true],
      ['2026-02-10', '2026-02-17', true],
      ['2026-02-28', '2026-03-07', true], // across the adjacent join
      ['2026-03-10', '2026-03-17', false], // across the one-day gap
      ['2026-04-10', '2026-04-17', true],
      ['2026-05-10', '2026-05-17', true],
      ['2026-06-10', '2026-06-17', false], // only evidence of unknown start
      ['2026-07-10', '2026-07-17', false], // after all the data
    ],
  );
  // The bank's data reaches 30 June, past June's window: the last statement
  // date is not what proves a window.
  assert.equal(
    store.evidence.map(e => e.toDate).sort().at(-1),
    '2026-06-30',
  );
  const intervals = ayqProvenIntervals(store, 'acct-a');
  for (const occurrence of expectedOccurrences) {
    const window = ayqAutomaticMatchWindow(occurrence.expectedDate);
    assert.equal(occurrence.automaticMatchWindowCovered, ayqCovers(intervals, window.from, window.through), occurrence.occurrenceKey);
  }
});

test('every occurrence carries the end of the matcher’s own window around its effective date — matched, dismissed and rescheduled ones too (P6, P1-C1, T15)', () => {
  const { plan, expectedOccurrences } = expectations([planned({ id: 'rent', counterpartyKey: 'cp-invented' })], {
    decisions: [
      decided('rent', '2026-02-10', { matchedTransactionId: 'txn-feb', matchedAt: '2026-02-11T08:00:00.000Z', matchProvenance: 'manual' }),
      decided('rent', '2026-03-10', { dismissed: true }),
      decided('rent', '2026-04-10', { rescheduledTo: '2026-04-20' }),
    ],
    evidence: [proven('acct-a', '2026-01-01', '2026-05-31')],
    transactions: new Map([['txn-feb', 'tx-feb']]),
  });
  const occurrence = (dueDate: string) => {
    const found = expectedOccurrences.find(o => o.occurrenceKey === `occ-rent-${dueDate}`);
    assert.ok(found, dueDate);
    return found;
  };
  assert.deepEqual(
    ['2026-02-10', '2026-03-10', '2026-04-10'].map(dueDate => {
      const one = occurrence(dueDate);
      return [one.state, one.expectedDate, one.automaticMatchThroughDate, one.automaticMatchWindowCovered];
    }),
    [
      ['matched', '2026-02-10', '2026-02-17', true],
      ['dismissed', '2026-03-10', '2026-03-17', true],
      // Rescheduled: the moved date crosses, and the window is centred on it.
      ['overdue', '2026-04-20', '2026-04-27', true],
    ],
  );
  for (const one of expectedOccurrences) {
    assert.equal(one.automaticMatchThroughDate, ayqAutomaticMatchWindow(one.expectedDate).through, one.occurrenceKey);
    assert.ok(one.automaticMatchThroughDate >= one.expectedDate);
  }

  // The matcher, handed the same occurrence from the same plan, applies
  // exactly the boundary the snapshot states.
  const moved = plan.occurrences.find(o => o.dueDate === '2026-04-10');
  assert.ok(moved);
  assert.equal(moved.effectiveDate, occurrence('2026-04-10').expectedDate);
  const matchesOn = (date: string) =>
    ayqProposeMatches({
      occurrences: [moved],
      recordKeys: new Map([['rent', { key: 'cp-invented', mandateId: null }]]),
      candidates: [{ transactionId: 'txn-x', date, amountCents: -5_000, payee: 'Invented', counterpartyKey: 'cp-invented', mandateId: null }],
      taken: new Set(),
      refused: new Map(),
    })[0]?.confident ?? false;
  assert.equal(matchesOn('2026-04-27'), true, 'on the exported through date');
  assert.equal(matchesOn('2026-04-28'), false, 'the day after it');
  assert.equal(matchesOn('2026-04-11'), false, 'the day after the due date, before the moved window');
});

test('every occurrence of the plan crosses, from the decision to the twelve-month horizon: an old unresolved one, a recent matched one, the next future one; no age cut-off (P8, T19, T20)', () => {
  // Decided in March 2025; its start date is two months earlier.
  const rent = planned({ id: 'rent', startDate: '2025-01-10', confirmedAt: '2025-03-05', suggestedAt: '2025-03-05' });
  // A rhythm that lands on the horizon itself.
  const onHorizon = planned({ id: 'yearly', startDate: '2026-09-15', confirmedAt: '2026-09-01', suggestedAt: '2026-09-01', recurrence: { frequency: 'yearly', interval: 1 } });
  const { expectedOccurrences } = expectations([rent, onHorizon], {
    decisions: [decided('rent', '2026-08-10', { matchedTransactionId: 'txn-aug', matchedAt: '2026-08-11T08:00:00.000Z', matchProvenance: 'automatic' })],
    transactions: new Map([['txn-aug', 'tx-aug']]),
  });
  const { from, to } = ayqPlanWindow(AS_OF, [rent, onHorizon]);
  assert.equal(to, '2027-09-15');

  const rentDates = expectedOccurrences.filter(o => o.recordKey === 'rec-rent').map(o => o.expectedDate);
  assert.deepEqual(rentDates, ayqOccurrenceDates(rent, from, to));
  assert.equal(rentDates[0], '2025-03-10', 'the first after the decision; January and February 2025 are history');
  assert.equal(rentDates.at(-1), '2027-09-10');
  assert.equal(rentDates.length, 31);
  const state = (date: string) => expectedOccurrences.find(o => o.recordKey === 'rec-rent' && o.expectedDate === date)?.state;
  assert.equal(state('2025-03-10'), 'overdue', 'unmatched for eighteen months, and still an expectation');
  assert.equal(state('2026-08-10'), 'matched');
  assert.equal(state('2026-10-10'), 'expected');

  assert.deepEqual(
    expectedOccurrences.filter(o => o.recordKey === 'rec-yearly').map(o => [o.expectedDate, o.state]),
    [
      ['2026-09-15', 'expected'], // due on the as-of date: not overdue
      ['2027-09-15', 'expected'], // the horizon, inclusive
    ],
  );
});

test('a snapshot the shared validator refuses is never written, and the previous file stays exactly as it was (P9)', async () => {
  const dataDir = await budget();
  await ask(dataDir, { kind: 'import.camt', paths: [fixture] });
  const { summary, text } = await exported(dataDir);

  // Judged as of tomorrow but produced today: V2 refuses it, and the refusal
  // comes from the validator the producer runs before writing.
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const answer = await send({ id: 'snapshot-tomorrow', kind: 'snapshot.export', path: summary.path, today: tomorrow }, dataDir);
  assert.equal(answer.ok, false);
  assert.match(!answer.ok ? answer.detail : '', /as_of_after_generated/);
  assert.equal(await readFile(summary.path, 'utf8'), text, 'the previous snapshot is untouched');
  assert.deepEqual(await readdir(join(dataDir, 'out')), ['snapshot.json'], 'no temporary file is left');
});

test('the snapshot repeats no matching width: its window is the matcher’s own helper (P6)', () => {
  const source = readFileSync(new URL('../src/ayq-snapshot.ts', import.meta.url), 'utf8');
  assert.match(source, /ayqAutomaticMatchWindow\(occurrence\.effectiveDate\)/);
  assert.doesNotMatch(source, /AYQ_MATCH_WINDOW_DAYS|AYQ_MATCH_OFFER_DAYS|ayqAddDays|ayqDaysBetween/);
});

test('the export is contract 1.1: judged as of the stated today, with the record’s own account, the matcher’s window and proven coverage (P1–P9)', async () => {
  const dataDir = await budget();
  // One account, its statement proving 1–30 June 2026.
  await ask(dataDir, { kind: 'import.camt', paths: [fixture] });
  const view = await ask(dataDir, { kind: 'accounts.view' });
  const accountId = view.coverage[0].accountId;

  // Decided on 1 May, due on the 15th, on the imported account.
  const saved = await ask(dataDir, {
    kind: 'plan.save',
    today: '2026-05-01',
    record: { name: 'Invented rent', kind: 'expense', amountCents: 50_000, categoryName: null, accountId, startDate: '2026-05-15', recurrence: { frequency: 'monthly', interval: 1 } },
  });
  const rent = saved.records.find(r => r.name === 'Invented rent');
  assert.ok(rent);

  // June matched by hand to a June payment; July dismissed; August moved.
  const ledger = await ask(dataDir, { kind: 'transactions.list', filter: { limit: 1000 } });
  const june = ledger.rows.find(row => row.date === '2026-06-11');
  assert.ok(june);
  await ask(dataDir, { kind: 'match.apply', recordId: rent.id, dueDate: '2026-06-15', transactionId: june.id, today: TODAY });
  await ask(dataDir, { kind: 'plan.dismissOccurrence', recordId: rent.id, dueDate: '2026-07-15', dismissed: true, today: TODAY });
  await ask(dataDir, { kind: 'plan.reschedule', recordId: rent.id, dueDate: '2026-08-15', to: '2026-08-20', today: TODAY });

  // The same counterparty and amount as that June payment, which is in the
  // imported account — and no account of its own.
  const learned = (await ask(dataDir, { kind: 'plan.list', today: TODAY })).records.find(r => r.id === rent.id)?.counterpartyKey ?? null;
  await ask(dataDir, {
    kind: 'plan.save',
    today: '2026-06-01',
    record: { name: 'Invented gym', kind: 'expense', amountCents: Math.abs(june.amountCents), categoryName: null, counterpartyKey: learned, startDate: '2026-06-11', recurrence: { frequency: 'monthly', interval: 1 } },
  });

  const { snapshot } = await exported(dataDir);
  assert.equal(snapshot.meta.contractVersion, '1.1');
  assert.equal(snapshot.meta.expectationsAsOfDate, TODAY);
  assert.ok(TODAY <= snapshot.meta.generatedAt.slice(0, 10), 'generatedAt stays the production instant');

  const [account] = snapshot.accounts;
  const rentRecord = snapshot.expectationRecords.find(r => r.name === 'Invented rent');
  const gymRecord = snapshot.expectationRecords.find(r => r.name === 'Invented gym');
  assert.ok(rentRecord && gymRecord);
  assert.equal(rentRecord.expectedAccountKey, account.accountKey);
  assert.equal(gymRecord.expectedAccountKey, undefined, 'no account is inferred from a counterparty, an amount or history');

  const rentOccurrences = snapshot.expectedOccurrences.filter(o => o.recordKey === rentRecord.recordKey);
  assert.deepEqual(
    rentOccurrences.slice(0, 6).map(o => [o.occurrenceKey.slice(-10), o.expectedDate, o.state, o.automaticMatchThroughDate, o.automaticMatchWindowCovered]),
    [
      ['2026-05-15', '2026-05-15', 'overdue', '2026-05-22', false], // before the statement begins
      ['2026-06-15', '2026-06-15', 'matched', '2026-06-22', true], // inside 1–30 June
      ['2026-07-15', '2026-07-15', 'dismissed', '2026-07-22', false], // after it
      ['2026-08-15', '2026-08-20', 'overdue', '2026-08-27', false], // moved; centred on the moved date
      ['2026-09-15', '2026-09-15', 'expected', '2026-09-22', false], // due on the as-of date
      ['2026-10-15', '2026-10-15', 'expected', '2026-10-22', false], // the next one
    ],
  );
  assert.equal(rentOccurrences.at(-1)?.expectedDate, '2027-09-15', 'to the twelve-month horizon, inclusive');

  const intervals = ayqProvenIntervals(ayqReadStore(dataDir), accountId);
  for (const occurrence of snapshot.expectedOccurrences) {
    const window = ayqAutomaticMatchWindow(occurrence.expectedDate);
    assert.equal(occurrence.automaticMatchThroughDate, window.through, occurrence.occurrenceKey);
    if (occurrence.recordKey === rentRecord.recordKey) {
      assert.equal(occurrence.automaticMatchWindowCovered, ayqCovers(intervals, window.from, window.through), occurrence.occurrenceKey);
    } else {
      assert.equal('automaticMatchWindowCovered' in occurrence, false, occurrence.occurrenceKey);
    }
  }
});
