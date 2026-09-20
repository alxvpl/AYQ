// Validation completes before analysis, and a snapshot that fails it produces
// no analytical result.

import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAndValidateSnapshot, SnapshotValidationError, validateSnapshot } from '../src/validate.js';
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
