// Validation completes before analysis, and a snapshot that fails it produces
// no analytical result.

import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAndValidateSnapshot, SnapshotValidationError, validateSnapshot } from '../src/validate.js';
import { utcCalendarDate } from '../src/dates.js';
import { readFixture } from './helpers.js';

const VALID = [
  'a1-result.json',
  'a1-coverage-limited.json',
  'a1-empty.json',
  'a1-insufficient.json',
  'a1-comparison-unavailable-currency.json',
  'a1-unsupported-multicurrency.json',
  'a1-reconciliation-difference.json',
  'a1-reversal-detail.json',
  'a1-not-identified.json',
];

test('every valid fixture passes the validator', () => {
  for (const name of VALID) {
    assert.doesNotThrow(() => validateSnapshot(readFixture(name)), name);
  }
});

test('case 17 — a reversal reference that does not resolve makes the snapshot invalid', () => {
  const raw = readFixture('a1-invalid-broken-reversal.json');
  assert.throws(
    () => validateSnapshot(raw),
    (error: unknown) =>
      error instanceof SnapshotValidationError && error.reason === 'invariant',
  );
  const result = parseAndValidateSnapshot(JSON.stringify(raw));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, 'invariant');
});

function mutate(change: (snapshot: any) => void): any {
  const raw = readFixture('a1-result.json') as any;
  change(raw);
  return raw;
}

test('a reconciliation state outside the frozen baseline is refused rather than shown', () => {
  assert.throws(
    () => validateSnapshot(mutate(s => { s.accounts[0].reconciliation.state = 'unavailable'; })),
    (error: unknown) => error instanceof SnapshotValidationError && error.reason === 'invariant',
  );
});

test('a reconciliation state that contradicts its difference is refused', () => {
  assert.throws(
    () =>
      validateSnapshot(
        mutate(s => {
          s.accounts[0].reconciliation.statementClosingBalance.amount += 500;
          s.accounts[0].reconciliation.difference.amount = 500;
          // state stays `agrees` while the difference is not zero
        }),
      ),
    (error: unknown) => error instanceof SnapshotValidationError && error.reason === 'invariant',
  );
});

test('a difference that does not follow from the balances it compares is refused', () => {
  assert.throws(
    () => validateSnapshot(mutate(s => { s.accounts[0].reconciliation.difference.amount = 77; })),
    (error: unknown) => error instanceof SnapshotValidationError && error.reason === 'invariant',
  );
});

test('a money value that is not integer minor units is refused', () => {
  assert.throws(
    () => validateSnapshot(mutate(s => { s.transactions[0].amount.amount = -45.5; })),
    (error: unknown) => error instanceof SnapshotValidationError && error.reason === 'invariant',
  );
});

test('a currency that meta.currencies does not declare is refused', () => {
  assert.throws(
    () => validateSnapshot(mutate(s => { s.transactions[0].amount.currency = 'GBP'; })),
    (error: unknown) => error instanceof SnapshotValidationError && error.reason === 'invariant',
  );
});

test('a reference to an account, category or counterparty that is not there is refused', () => {
  for (const change of [
    (s: any) => { s.transactions[0].accountKey = 'acc-nowhere'; },
    (s: any) => { s.transactions[0].categoryId = 'cat-nowhere'; },
    (s: any) => { s.transactions[0].counterpartyKey = 'cp-nowhere'; },
  ]) {
    assert.throws(
      () => validateSnapshot(mutate(change)),
      (error: unknown) => error instanceof SnapshotValidationError && error.reason === 'invariant',
    );
  }
});

test('a newer contract major is refused as such', () => {
  assert.throws(
    () => validateSnapshot(mutate(s => { s.meta.contractVersion = '2.0.0'; })),
    (error: unknown) => error instanceof SnapshotValidationError && error.reason === 'contractMajor',
  );
});

test('a file that is not a snapshot is malformed, and its detail never becomes the reason', () => {
  const result = parseAndValidateSnapshot('{ not json');
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, 'malformed');
    assert.ok(result.detail.length > 0);
  }
  const wrongShape = parseAndValidateSnapshot('{"meta":{}}');
  assert.equal(wrongShape.ok, false);
  if (!wrongShape.ok) assert.equal(wrongShape.reason, 'malformed');
});

test('a transaction class outside the frozen baseline is refused, so every class has a word', () => {
  assert.throws(
    () => validateSnapshot(mutate(s => { s.transactions[0].transactionClass = 'crypto_transfer'; })),
    (error: unknown) => error instanceof SnapshotValidationError && error.reason === 'invariant',
  );
});

// ---------------------------------------------------------------------------
// A1-relevant frozen-r003 validation (011 §7 T2.1–T2.5; r004 §8.11 item 11).
// Each refusal is an internal inconsistency of the file and carries the
// `invariant` reason, so the screen says the existing sentence and nothing new.
// ---------------------------------------------------------------------------

function refusedAsInvariant(raw: unknown, label: string): void {
  assert.throws(
    () => validateSnapshot(raw),
    (error: unknown) => error instanceof SnapshotValidationError && error.reason === 'invariant',
    label,
  );
}

test('T2.1 — generatedAt must be RFC 3339 UTC; a local-offset or offset-less instant is refused', () => {
  for (const generatedAt of [
    '2026-03-05T06:00:00+02:00',
    '2026-03-05T06:00:00-00:00',
    '2026-03-05T06:00:00',
    '2026-03-05 06:00:00Z',
    '2026-03-05',
    'March 5, 2026 06:00 UTC',
  ]) {
    refusedAsInvariant(mutate(s => { s.meta.generatedAt = generatedAt; }), generatedAt);
  }
  for (const generatedAt of ['2026-03-05T06:00:00Z', '2026-03-05T06:00:00.250Z', '2026-03-05T06:00:00+00:00']) {
    assert.doesNotThrow(() => validateSnapshot(mutate(s => { s.meta.generatedAt = generatedAt; })), generatedAt);
  }
  // The date helper stays independently usable on any instant; the snapshot
  // rule is the validator's, not the helper's.
  assert.equal(utcCalendarDate('2026-03-01T23:30:00+02:00'), '2026-03-01');
});

test('T2.2 — a transaction in a currency other than its account\'s is an invalid file, not a multi-currency result', () => {
  refusedAsInvariant(
    mutate(s => {
      s.meta.currencies = ['EUR', 'USD'];
      s.transactions[0].amount.currency = 'USD'; // on acc-daily, a EUR account
    }),
    'USD on a EUR account',
  );
});

test('T2.3 — every money field of an account is in that account\'s currency', () => {
  for (const change of [
    (s: any) => { s.accounts[0].openingBalance.currency = 'USD'; },
    (s: any) => { s.accounts[0].ledgerBalance.currency = 'USD'; },
    (s: any) => { s.accounts[0].statementCoverage.closingBalance.currency = 'USD'; },
    (s: any) => { s.accounts[0].reconciliation.ledgerBalanceAtCoverageDate.currency = 'USD'; },
    (s: any) => { s.accounts[0].reconciliation.statementClosingBalance.currency = 'USD'; },
    (s: any) => { s.accounts[0].reconciliation.difference.currency = 'USD'; },
  ]) {
    refusedAsInvariant(
      mutate(s => {
        s.meta.currencies = ['EUR', 'USD'];
        change(s);
      }),
      change.toString(),
    );
  }
});

test('T2.4 — a categorised transaction carries provenance, and a rule names itself', () => {
  // transactions[0] is categorised by rule-001.
  for (const change of [
    (s: any) => { s.transactions[0].categorisation = null; },
    (s: any) => { s.transactions[0].categorisation = { source: 'none' }; },
    (s: any) => { s.transactions[0].categorisation = { source: 'rule', ruleKey: null }; },
    (s: any) => { s.transactions[0].categorisation = { source: 'rule', ruleKey: '' }; },
    (s: any) => { s.transactions[0].categorisation = { source: 'rule' }; },
  ]) {
    refusedAsInvariant(mutate(change), change.toString());
  }
  // A manual decision needs no rule; a named rule is provenance.
  assert.doesNotThrow(() => validateSnapshot(mutate(s => { s.transactions[0].categorisation = { source: 'manual' }; })));
  assert.doesNotThrow(() =>
    validateSnapshot(mutate(s => { s.transactions[0].categorisation = { source: 'rule', ruleKey: 'rule-002' }; })),
  );
});

test('T2.5 — an internal transfer carrying a category or a canonical counterparty is refused', () => {
  // transactions[7] is the internal transfer f01-t08.
  assert.equal((readFixture('a1-result.json') as any).transactions[7].isInternalTransfer, true);
  refusedAsInvariant(
    mutate(s => {
      s.transactions[7].categoryId = 'cat-groceries';
      s.transactions[7].categorisation = { source: 'manual' };
    }),
    'transfer with a category',
  );
  refusedAsInvariant(mutate(s => { s.transactions[7].counterpartyKey = 'cp-superstore'; }), 'transfer with a counterparty');
});
