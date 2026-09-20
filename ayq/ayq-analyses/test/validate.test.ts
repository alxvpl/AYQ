// Validation completes before analysis, and a snapshot that fails it produces
// no analytical result.
//
// The rules themselves are the executable contract's (ayq/ayq-analytical-
// contract) and are proven there, case by case. What is proven here is the
// consumer's side of them: every intended-valid fixture passes; what the
// contract refuses reaches the screen as one of the four bounded reasons, the
// right one; and no detail ever becomes the reason.

import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAndValidateSnapshot, reasonOf, SnapshotValidationError, validateSnapshot } from '../src/validate.js';
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
  'a1-unknown-start.json',
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

function mutate(change: (snapshot: any) => void, fixture = 'a1-result.json'): any {
  const raw = readFixture(fixture) as any;
  change(raw);
  return raw;
}

function refusedAs(raw: unknown, reason: SnapshotValidationError['reason'], label: string): void {
  assert.throws(
    () => validateSnapshot(raw),
    (error: unknown) => error instanceof SnapshotValidationError && error.reason === reason,
    label,
  );
}

test('the four reasons fold the contract\'s issue codes, and shape never masquerades as inconsistency', () => {
  assert.equal(reasonOf([{ path: 'meta.contractVersion', code: 'major_too_new', message: '' }]), 'contractMajor');
  assert.equal(reasonOf([{ path: 'meta.contractVersion', code: 'major_too_old', message: '' }]), 'unknown');
  assert.equal(reasonOf([{ path: 'accounts[0].iban', code: 'forbidden_key', message: '' }]), 'unknown');
  assert.equal(reasonOf([{ path: 'transactions[0].evidenceText', code: 'iban_leak', message: '' }]), 'unknown');
  assert.equal(reasonOf([{ path: 'accounts', code: 'not_array', message: '' }]), 'malformed');
  assert.equal(reasonOf([{ path: 'accounts[0].name', code: 'not_string', message: '' }, { path: 'meta.snapshotId', code: 'empty_string', message: '' }]), 'malformed');
  // A count that disagrees because a malformed record was dropped is a
  // consequence of the shape fault, not a second reason.
  assert.equal(reasonOf([{ path: 'transactions[0].amount.amount', code: 'not_safe_integer', message: '' }, { path: 'meta.counts.transactions', code: 'count_wrong', message: '' }]), 'malformed');
  assert.equal(reasonOf([{ path: 'meta.counts.transactions', code: 'count_wrong', message: '' }, { path: 'transactions[0].amount.amount', code: 'not_safe_integer', message: '' }]), 'invariant');
  assert.equal(reasonOf([{ path: 'transactions[1].reversal.originalTransactionKey', code: 'unresolved_reference', message: '' }]), 'invariant');
  assert.equal(reasonOf([]), 'unknown');
});

test('a reconciliation state that contradicts its difference is refused', () => {
  refusedAs(
    mutate(s => {
      s.accounts[0].statementCoverage.bankClosingBalance.amount += 500;
      s.accounts[0].reconciliation.difference.amount = 500;
      // state stays `agrees` while the difference is not zero
    }),
    'invariant',
    'agrees with a non-zero difference',
  );
});

test('a difference that does not follow from the balances it compares is refused', () => {
  refusedAs(
    mutate(s => { s.accounts[0].reconciliation.difference.amount = 1; s.accounts[0].reconciliation.state = 'differs'; }),
    'invariant',
    'difference ≠ closing − ledger',
  );
});

test('reconciliation unavailable is a real state: no bank balance, no ledger figure, no difference', () => {
  assert.doesNotThrow(() => validateSnapshot(readFixture('a1-unknown-start.json')));
  refusedAs(
    mutate(s => { s.accounts[0].reconciliation = { state: 'unavailable' }; }),
    'invariant',
    'unavailable while the statement still states a closing balance',
  );
  refusedAs(
    mutate(s => { s.accounts[1].statementCoverage.bankClosingBalance = { amount: 1, currency: 'EUR' }; }, 'a1-unknown-start.json'),
    'invariant',
    'a closing balance beside an unavailable reconciliation',
  );
});

test('a coverage start is optional and is never synthesised: absent stays absent through validation', () => {
  const validated = validateSnapshot(readFixture('a1-unknown-start.json'));
  const card = validated.accounts.find(a => a.accountKey === 'acc-card');
  assert.ok(card);
  assert.equal('coverageStartDate' in card.statementCoverage, false);
  assert.equal(validated.accounts.find(a => a.accountKey === 'acc-daily')?.statementCoverage.coverageStartDate, '2025-01-01');
});

test('a money value that is not integer minor units is refused', () => {
  refusedAs(mutate(s => { s.transactions[0].amount.amount = 12.5; }), 'malformed', 'a fractional amount');
});

test('a currency that meta.currencies does not declare is refused', () => {
  refusedAs(mutate(s => { s.transactions[0].amount.currency = 'GBP'; }), 'invariant', 'an undeclared currency');
});

test('a reference to an account, category or counterparty that is not there is refused', () => {
  refusedAs(mutate(s => { s.transactions[0].accountKey = 'acc-missing'; }), 'invariant', 'account');
  refusedAs(mutate(s => { s.transactions[0].category.categoryId = 'cat-missing'; }), 'invariant', 'category');
  refusedAs(mutate(s => { s.transactions[0].counterparty.counterpartyKey = 'cp-missing'; }), 'invariant', 'counterparty');
});

test('a newer contract major is refused as such; an older one does not match the format', () => {
  refusedAs(mutate(s => { s.meta.contractVersion = '2.0'; }), 'contractMajor', 'major 2');
  refusedAs(mutate(s => { s.meta.contractVersion = '0.9'; }), 'unknown', 'major 0');
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

test('a transaction class outside the contract is refused, so every class has a word', () => {
  refusedAs(mutate(s => { s.transactions[0].transactionClass = 'crypto_transfer'; }), 'malformed', 'an unknown class');
});

test('excluded data crossing the boundary makes the file unreadable, not merely inconsistent (03 §13.8)', () => {
  refusedAs(mutate(s => { s.accounts[0].iban = 'NL00TEST0000000000'; }), 'unknown', 'a forbidden key');
  refusedAs(mutate(s => { s.transactions[0].evidenceText = 'Paid to NL91ABNA0417164300 yesterday'; }), 'unknown', 'an IBAN in evidence');
});

test('T2.1 — generatedAt must be RFC 3339 UTC; a local-offset or offset-less instant is refused', () => {
  refusedAs(mutate(s => { s.meta.generatedAt = '2026-03-05T06:00:00+01:00'; }), 'malformed', 'local offset');
  refusedAs(mutate(s => { s.meta.generatedAt = '2026-03-05T06:00:00'; }), 'malformed', 'no offset');
  assert.doesNotThrow(() => validateSnapshot(mutate(s => { s.meta.generatedAt = '2026-03-05T06:00:00+00:00'; })));
});

test('T2.2 — a transaction in a currency other than its account\'s is an invalid file, not a multi-currency result', () => {
  refusedAs(
    mutate(s => {
      s.meta.currencies = ['EUR', 'USD'];
      s.accounts.push({ ...s.accounts[1], accountKey: 'acc-x', name: 'X', displayIdentifier: 'US…0001', currency: 'USD', countsTowardAvailableFunds: false });
      s.meta.counts.accounts += 1;
      s.transactions[0].amount.currency = 'USD';
    }),
    'invariant',
    'currency differs from the account',
  );
});

test('T2.4 — a categorised transaction carries provenance, and a learned rule names itself (017 PC1)', () => {
  refusedAs(mutate(s => { delete s.transactions[0].category.source; }), 'malformed', 'no source');
  refusedAs(mutate(s => { s.transactions[0].category.source = 'rule'; }), 'malformed', 'an old token');
  refusedAs(mutate(s => { delete s.transactions[0].category.ruleKey; }), 'malformed', 'a rule without its key');
  refusedAs(mutate(s => { s.transactions[0].category.source = 'manual'; }), 'malformed', 'a manual decision carrying a rule key');
  assert.doesNotThrow(() =>
    validateSnapshot(mutate(s => { s.transactions[0].category = { state: 'categorised', categoryId: 'cat-groceries', source: 'automatic' }; })),
  );
});

test('T2.5 — an internal transfer carrying a category or a canonical counterparty is refused', () => {
  const transferIndex = (s: any): number => s.transactions.findIndex((t: any) => t.internalTransfer !== undefined);
  refusedAs(
    mutate(s => { s.transactions[transferIndex(s)].category = { state: 'categorised', categoryId: 'cat-groceries', source: 'manual' }; }),
    'invariant',
    'a categorised transfer',
  );
  refusedAs(
    mutate(s => { s.transactions[transferIndex(s)].counterparty = { state: 'identified', counterpartyKey: 'cp-superstore' }; }),
    'invariant',
    'a transfer with a counterparty',
  );
});

test('the three counterparty states are the contract\'s: a cash withdrawal never claims one (03 §13.14)', () => {
  const cashIndex = (s: any): number => s.transactions.findIndex((t: any) => t.transactionClass === 'cash_withdrawal');
  refusedAs(
    mutate(s => { s.transactions[cashIndex(s)].counterparty = { state: 'unresolved' }; s.meta.counts.unresolvedCounterparties += 1; s.meta.counts.counterpartyNotApplicable -= 1; }),
    'invariant',
    'a cash withdrawal awaiting a counterparty',
  );
  refusedAs(mutate(s => { s.transactions[0].counterparty = { state: 'pending' }; }), 'malformed', 'a fourth state');
});

test('every intended valid fixture carries a category state on every transaction, and a transfer carries none', () => {
  for (const name of VALID) {
    const snapshot = validateSnapshot(readFixture(name));
    for (const transaction of snapshot.transactions) {
      assert.ok(['categorised', 'uncategorised', 'not_applicable'].includes(transaction.category.state), `${name}: ${transaction.transactionKey}`);
      assert.equal(transaction.category.state === 'not_applicable', transaction.internalTransfer !== undefined, `${name}: ${transaction.transactionKey}`);
      if (transaction.category.state === 'categorised') {
        assert.equal(transaction.category.source === 'learned_rule', typeof transaction.category.ruleKey === 'string');
      }
    }
  }
});
