// The contract fixtures F01–F27 (016 §9; 017 PC3), each a deterministic
// mutation of the synthetic baseline, plus the version, minimisation, money
// and package-surface checks 016 §10 requires. All values are invented.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import test from 'node:test';
import {
  CONTRACT_MAJOR,
  CONTRACT_MINOR,
  ContractValidationError,
  FORBIDDEN_KEYS,
  parseContractVersion,
  validateAnalyticalSnapshot,
} from '../src/index.ts';
import { baseline, baselineJson, clone, setAt } from '../fixtures/synthetic.ts';

function refused(input: unknown, code: string, pathPart?: string): ContractValidationError {
  let error: unknown = null;
  try {
    validateAnalyticalSnapshot(input);
  } catch (caught) {
    error = caught;
  }
  assert.ok(error instanceof ContractValidationError, 'expected a ContractValidationError');
  const hit = error.issues.find(issue => issue.code === code && (pathPart === undefined || issue.path.includes(pathPart)));
  assert.ok(hit, `expected issue ${code}${pathPart ? ` at ${pathPart}` : ''}; got ${error.issues.map(i => `${i.code}@${i.path}`).join(', ')}`);
  return error;
}

test('F01 — the synthetic baseline is a valid 1.0 snapshot and round-trips to the same content', () => {
  const snapshot = validateAnalyticalSnapshot(baselineJson());
  assert.deepEqual(snapshot, baseline());
});

test('F02 — B1 known start: coverageStartDate present and not after lastStatementDate', () => {
  const snapshot = validateAnalyticalSnapshot(baselineJson());
  assert.equal(snapshot.accounts[0].statementCoverage.coverageStartDate, '2025-01-01');
  const late = baselineJson();
  setAt(late, 'accounts.0.statementCoverage.coverageStartDate', '2026-03-05');
  refused(late, 'start_after_end');
});

test('F03 — B1 UNKNOWN_START: coverageStartDate absent, the snapshot valid, nothing derived', () => {
  const snapshot = validateAnalyticalSnapshot(baselineJson());
  assert.equal(snapshot.accounts[1].statementCoverage.coverageStartDate, undefined);
  assert.equal('coverageStartDate' in snapshot.accounts[1].statementCoverage, false);
  // A null is not the absence the contract means.
  const nulled = baselineJson();
  setAt(nulled, 'accounts.1.statementCoverage.coverageStartDate', null);
  refused(nulled, 'not_string', 'coverageStartDate');
});

test('F04 — B2 not applicable: a cash withdrawal has no counterparty by nature', () => {
  const snapshot = validateAnalyticalSnapshot(baselineJson());
  assert.deepEqual(snapshot.transactions[3].counterparty, { state: 'not_applicable' });
  const wrong = baselineJson();
  setAt(wrong, 'transactions.3.counterparty', { state: 'identified', counterpartyKey: 'cp-superstore' });
  refused(wrong, 'cash_withdrawal_counterparty');
  const alsoWrong = baselineJson();
  setAt(alsoWrong, 'transactions.3.counterparty', { state: 'unresolved' });
  refused(alsoWrong, 'cash_withdrawal_counterparty');
});

test('F05 — B2 unresolved: a non-cash transaction expected to have a counterparty, distinct from not applicable', () => {
  const snapshot = validateAnalyticalSnapshot(baselineJson());
  assert.deepEqual(snapshot.transactions[4].counterparty, { state: 'unresolved' });
  assert.equal(snapshot.meta.counts.unresolvedCounterparties, 1);
  assert.equal(snapshot.meta.counts.counterpartyNotApplicable, 1);
  const carrying = baselineJson();
  setAt(carrying, 'transactions.4.counterparty', { state: 'unresolved', counterpartyKey: 'cp-energy' });
  refused(carrying, 'unexpected', 'counterparty.counterpartyKey');
});

test('F06 — reconciliation unavailable: no bank closing balance, and never one beside it', () => {
  const snapshot = validateAnalyticalSnapshot(baselineJson());
  assert.deepEqual(snapshot.accounts[1].reconciliation, { state: 'unavailable' });
  assert.equal(snapshot.accounts[1].statementCoverage.bankClosingBalance, undefined);
  const withClosing = baselineJson();
  setAt(withClosing, 'accounts.1.statementCoverage.bankClosingBalance', { amount: 1, currency: 'EUR' });
  refused(withClosing, 'closing_with_unavailable');
});

test('F07 — unknown absolute balance: the account remains valid and carries no amount', () => {
  const snapshot = validateAnalyticalSnapshot(baselineJson());
  assert.deepEqual(snapshot.accounts[1].absoluteBalance, { state: 'unknown' });
  const withAmount = baselineJson();
  setAt(withAmount, 'accounts.1.absoluteBalance', { state: 'unknown', amount: { amount: 0, currency: 'EUR' } });
  refused(withAmount, 'unexpected', 'absoluteBalance.amount');
});

test('F08 — reconciliation agrees: closing minus ledger is zero', () => {
  const snapshot = validateAnalyticalSnapshot(baselineJson());
  assert.equal(snapshot.accounts[0].reconciliation.state, 'agrees');
  const nonzero = baselineJson();
  setAt(nonzero, 'accounts.0.reconciliation.difference', { amount: 1, currency: 'EUR' });
  refused(nonzero, 'difference_wrong');
  const claims = baselineJson();
  setAt(claims, 'accounts.0.reconciliation.ledgerBalanceAtCoverageDate', { amount: 249999, currency: 'EUR' });
  setAt(claims, 'accounts.0.reconciliation.difference', { amount: 1, currency: 'EUR' });
  refused(claims, 'agrees_nonzero');
});

test('F09 — reconciliation differs: a non-zero difference equal to closing minus ledger', () => {
  const differs = baselineJson();
  setAt(differs, 'accounts.0.reconciliation', {
    state: 'differs',
    ledgerBalanceAtCoverageDate: { amount: 248500, currency: 'EUR' },
    difference: { amount: 1500, currency: 'EUR' },
  });
  const snapshot = validateAnalyticalSnapshot(differs);
  assert.equal(snapshot.accounts[0].reconciliation.state, 'differs');
  const zero = baselineJson();
  setAt(zero, 'accounts.0.reconciliation', {
    state: 'differs',
    ledgerBalanceAtCoverageDate: { amount: 250000, currency: 'EUR' },
    difference: { amount: 0, currency: 'EUR' },
  });
  refused(zero, 'differs_zero');
  const noClosing = baselineJson();
  setAt(noClosing, 'accounts.0.statementCoverage.bankClosingBalance', undefined);
  refused(noClosing, 'closing_missing');
});

test('F10 — a masked identifier is accepted; a full identifier is refused', () => {
  validateAnalyticalSnapshot(baselineJson());
  for (const full of ['NL91ABNA0417164300', 'NL91 ABNA 0417 1643 00', 'NL…041716430', 'nl…0001', '0001']) {
    const unmasked = baselineJson();
    setAt(unmasked, 'accounts.0.displayIdentifier', full);
    refused(unmasked, 'not_masked');
  }
});

test('F11 — safe integer money accepted; fractional and unsafe integers refused', () => {
  validateAnalyticalSnapshot(baselineJson());
  const fractional = baselineJson();
  setAt(fractional, 'transactions.0.amount.amount', -45.5);
  refused(fractional, 'not_safe_integer');
  const unsafe = baselineJson();
  setAt(unsafe, 'transactions.0.amount.amount', 9007199254740993);
  refused(unsafe, 'not_safe_integer');
  const text = baselineJson();
  setAt(text, 'transactions.0.amount.amount', '-4550');
  refused(text, 'not_safe_integer');
  const lower = baselineJson();
  setAt(lower, 'transactions.0.amount.currency', 'eur');
  refused(lower, 'not_currency');
});

test('F12 — reference integrity failures are refused', () => {
  const cases: Array<[string, unknown, string]> = [
    ['transactions.0.accountKey', 'acc-nowhere', 'unresolved_reference'],
    ['transactions.0.counterparty.counterpartyKey', 'cp-nowhere', 'unresolved_reference'],
    ['transactions.0.category.categoryId', 'cat-nowhere', 'unresolved_reference'],
    ['categories.0.categoryGroupId', 'grp-nowhere', 'unresolved_reference'],
    ['categoryPlans.0.categoryId', 'cat-nowhere', 'unresolved_reference'],
    ['expectationRecords.0.counterpartyKey', 'cp-nowhere', 'unresolved_reference'],
    ['expectedOccurrences.0.recordKey', 'rec-nowhere', 'unresolved_reference'],
    ['expectedOccurrences.0.match.transactionKey', 'tx-nowhere', 'unresolved_reference'],
    ['forecast.basisAccountKeys', ['acc-nowhere'], 'unresolved_reference'],
    ['transactions.5.internalTransfer.counterAccountKey', 'acc-nowhere', 'unresolved_reference'],
  ];
  for (const [path, value, code] of cases) {
    const broken = baselineJson();
    setAt(broken, path, value);
    refused(broken, code, path.split('.').slice(-1)[0]);
  }
  const duplicate = baselineJson();
  setAt(duplicate, 'transactions.1.transactionKey', 'tx-01');
  refused(duplicate, 'duplicate', 'transactionKey');
});

test('F13 — a one-time expectation has a date and no recurrence', () => {
  const snapshot = validateAnalyticalSnapshot(baselineJson());
  assert.deepEqual(snapshot.expectationRecords[1].schedule, { type: 'one_time', date: '2026-04-01' });
  const mixed = baselineJson();
  setAt(mixed, 'expectationRecords.1.schedule', { type: 'one_time', date: '2026-04-01', frequency: 'monthly' });
  refused(mixed, 'unexpected', 'schedule.frequency');
});

test('F14 — a recurring expectation is a series with frequency, interval and anchor', () => {
  const snapshot = validateAnalyticalSnapshot(baselineJson());
  assert.deepEqual(snapshot.expectationRecords[0].schedule, {
    type: 'recurring',
    frequency: 'monthly',
    interval: 1,
    anchorDate: '2026-01-10',
  });
  const zero = baselineJson();
  setAt(zero, 'expectationRecords.0.schedule.interval', 0);
  refused(zero, 'not_positive_integer');
  const odd = baselineJson();
  setAt(odd, 'expectationRecords.0.schedule.frequency', 'fortnightly');
  refused(odd, 'not_allowed', 'schedule.frequency');
});

test('F15 — an occurrence may override the category it inherits', () => {
  const snapshot = validateAnalyticalSnapshot(baselineJson());
  assert.deepEqual(snapshot.expectedOccurrences[2].categoryOverride, { state: 'categorised', categoryId: 'cat-eating' });
  assert.equal(snapshot.expectedOccurrences[0].categoryOverride, undefined);
});

test('F16 — no accountKey exists on an expectation record or an occurrence in 1.0', () => {
  const onRecord = baselineJson();
  setAt(onRecord, 'expectationRecords.0.accountKey', 'acc-everyday');
  refused(onRecord, 'not_in_contract', 'expectationRecords[0].accountKey');
  const onOccurrence = baselineJson();
  setAt(onOccurrence, 'expectedOccurrences.0.accountKey', 'acc-everyday');
  refused(onOccurrence, 'not_in_contract', 'expectedOccurrences[0].accountKey');
});

test('F17 — forecast available: a sealed, ordered, single-currency series within the horizon', () => {
  const snapshot = validateAnalyticalSnapshot(baselineJson());
  assert.equal(snapshot.forecast.state, 'available');
  const unordered = baselineJson();
  setAt(unordered, 'forecast.series', [
    { date: '2026-04-30', projectedPosition: { amount: 1, currency: 'EUR' } },
    { date: '2026-03-31', projectedPosition: { amount: 1, currency: 'EUR' } },
  ]);
  refused(unordered, 'not_ordered');
  const beyond = baselineJson();
  setAt(beyond, 'forecast.series', [{ date: '2027-04-01', projectedPosition: { amount: 1, currency: 'EUR' } }]);
  refused(beyond, 'after_horizon');
  const mixed = baselineJson();
  setAt(mixed, 'forecast.series', [{ date: '2026-03-31', projectedPosition: { amount: 1, currency: 'USD' } }]);
  refused(mixed, 'currency_mismatch');
  const recipe = baselineJson();
  setAt(recipe, 'forecast.horizonMonths', 6);
  refused(recipe, 'not_allowed', 'horizonMonths');
});

test('F18 — forecast unavailable: a bounded reason and no result', () => {
  const unavailable = baselineJson();
  setAt(unavailable, 'forecast', {
    state: 'unavailable',
    kind: 'canonical_ayq_forecast',
    asOfDate: '2026-03-05',
    horizonMonths: 12,
    horizonEnd: '2027-03-04',
    basisAccountKeys: ['acc-everyday'],
    unavailableReason: 'available funds unknown',
  });
  const snapshot = validateAnalyticalSnapshot(unavailable);
  assert.equal(snapshot.forecast.state, 'unavailable');
  const long = clone(unavailable);
  setAt(long, 'forecast.unavailableReason', 'x'.repeat(129));
  refused(long, 'too_long', 'unavailableReason');
  const withSeries = clone(unavailable);
  setAt(withSeries, 'forecast.series', []);
  refused(withSeries, 'unexpected', 'forecast.series');
});

test('F19 — a higher minor with an additive unknown field is accepted and the field ignored', () => {
  const later = baselineJson();
  setAt(later, 'meta.contractVersion', '1.3');
  setAt(later, 'meta.laterField', { anything: true });
  setAt(later, 'transactions.0.laterHint', 'ignored');
  const snapshot = validateAnalyticalSnapshot(later);
  assert.equal(snapshot.meta.contractVersion, '1.3');
  assert.equal('laterField' in snapshot.meta, false);
  assert.equal('laterHint' in snapshot.transactions[0], false);
});

test('F20 — a higher major is refused; a lower major is refused; a malformed version is refused', () => {
  const higher = baselineJson();
  setAt(higher, 'meta.contractVersion', '2.0');
  refused(higher, 'major_too_new');
  const lower = baselineJson();
  setAt(lower, 'meta.contractVersion', '0.9');
  refused(lower, 'major_too_old');
  for (const bad of ['1', '1.0.0', 'v1.0', '', 1]) {
    const malformed = baselineJson();
    setAt(malformed, 'meta.contractVersion', bad);
    refused(malformed, 'not_version');
  }
  assert.deepEqual(parseContractVersion('1.0'), { major: 1, minor: 0 });
  assert.equal(parseContractVersion('1.0.0'), null);
  assert.equal(CONTRACT_MAJOR, 1);
  assert.equal(CONTRACT_MINOR, 0);
});

test('F21 — forbidden raw-identifier fields are refused at any depth, even under unknown additive content', () => {
  const samples: Array<[string, string]> = [
    ['iban', 'transactions.0.iban'],
    ['mandateId', 'transactions.0.mandateId'],
    ['endToEndId', 'transactions.0.endToEndId'],
    ['acctSvcrRef', 'transactions.0.acctSvcrRef'],
    ['bic', 'accounts.0.bic'],
    ['bkTxCd', 'transactions.0.bkTxCd'],
    ['description', 'transactions.0.description'],
    ['actualId', 'accounts.0.actualId'],
    ['knownDescriptors', 'counterparties.0.knownDescriptors'],
    ['isTransfer', 'transactions.0.isTransfer'],
    ['transferPairKey', 'transactions.0.transferPairKey'],
    ['IBAN', 'meta.extra.nested.IBAN'],
  ];
  for (const [key, path] of samples) {
    const leaking = baselineJson();
    if (path.startsWith('meta.extra')) {
      setAt(leaking, 'meta.contractVersion', '1.4');
      setAt(leaking, 'meta.extra', { nested: { IBAN: 'NL00' } });
    } else setAt(leaking, path, 'x');
    refused(leaking, 'forbidden_key', key);
  }
  assert.ok(FORBIDDEN_KEYS.includes('iban') && FORBIDDEN_KEYS.includes('bktxcd'));
});

test('F22 — evidenceText is bounded, single-line and carries no obvious full IBAN', () => {
  const long = baselineJson();
  setAt(long, 'transactions.0.evidenceText', 'é'.repeat(257));
  refused(long, 'too_long', 'evidenceText');
  const exact = baselineJson();
  setAt(exact, 'transactions.0.evidenceText', 'é'.repeat(256));
  validateAnalyticalSnapshot(exact);
  const newline = baselineJson();
  setAt(newline, 'transactions.0.evidenceText', 'line one\nline two');
  refused(newline, 'line_break');
  const iban = baselineJson();
  setAt(iban, 'transactions.0.evidenceText', 'Paid to NL91 ABNA 0417 1643 00 thanks');
  refused(iban, 'iban_leak');
  const empty = baselineJson();
  setAt(empty, 'transactions.0.evidenceText', '');
  validateAnalyticalSnapshot(empty);
});

test('F23 — categorisation provenance: manual, learned_rule with a ruleKey, automatic, uncategorised', () => {
  const snapshot = validateAnalyticalSnapshot(baselineJson());
  assert.equal(snapshot.transactions[0].category.state === 'categorised' && snapshot.transactions[0].category.source, 'learned_rule');
  assert.equal(snapshot.transactions[1].category.state === 'categorised' && snapshot.transactions[1].category.source, 'manual');
  assert.equal(snapshot.transactions[2].category.state === 'categorised' && snapshot.transactions[2].category.source, 'automatic');
  assert.equal(snapshot.transactions[3].category.state, 'uncategorised');
  const ruleless = baselineJson();
  setAt(ruleless, 'transactions.0.category', { state: 'categorised', categoryId: 'cat-groceries', source: 'learned_rule' });
  refused(ruleless, 'not_string', 'ruleKey');
  const invented = baselineJson();
  setAt(invented, 'transactions.1.category.ruleKey', 'rule-x');
  refused(invented, 'unexpected', 'ruleKey');
  const fourth = baselineJson();
  setAt(fourth, 'transactions.1.category.source', 'rule');
  refused(fourth, 'not_allowed', 'category.source');
  const legacy = baselineJson();
  setAt(legacy, 'transactions.1.categorisation', { source: 'manual' });
  refused(legacy, 'not_in_contract', 'categorisation');
});

test('F24 — internal-transfer consistency: two sides, opposite signs, each the other\'s counter, no spending category', () => {
  const snapshot = validateAnalyticalSnapshot(baselineJson());
  assert.equal(snapshot.transactions[5].internalTransfer?.pairKey, 'pair-0220');
  const sameAccount = baselineJson();
  setAt(sameAccount, 'transactions.6.accountKey', 'acc-everyday');
  refused(sameAccount, 'pair_inconsistent');
  const selfCounter = baselineJson();
  setAt(selfCounter, 'transactions.5.internalTransfer.counterAccountKey', 'acc-everyday');
  refused(selfCounter, 'same_account');
  const categorised = baselineJson();
  setAt(categorised, 'transactions.5.category', { state: 'categorised', categoryId: 'cat-groceries', source: 'manual' });
  refused(categorised, 'transfer_categorised');
  const withCounterparty = baselineJson();
  setAt(withCounterparty, 'transactions.5.counterparty', { state: 'identified', counterpartyKey: 'cp-superstore' });
  refused(withCounterparty, 'transfer_with_counterparty');
  const orphanNotApplicable = baselineJson();
  setAt(orphanNotApplicable, 'transactions.0.category', { state: 'not_applicable' });
  refused(orphanNotApplicable, 'not_applicable_without_transfer');
  const three = baselineJson();
  setAt(three, 'transactions.0.internalTransfer', { pairKey: 'pair-0220', counterAccountKey: 'acc-card' });
  setAt(three, 'transactions.0.category', { state: 'not_applicable' });
  refused(three, 'pair_too_many');
});

test('F25 — a reversal references another transaction of the same snapshot', () => {
  const snapshot = validateAnalyticalSnapshot(baselineJson());
  assert.equal(snapshot.transactions[7].reversal?.originalTransactionKey, 'tx-03');
  const dangling = baselineJson();
  setAt(dangling, 'transactions.7.reversal.originalTransactionKey', 'tx-nowhere');
  refused(dangling, 'unresolved_reference', 'originalTransactionKey');
  const self = baselineJson();
  setAt(self, 'transactions.7.reversal.originalTransactionKey', 'tx-08');
  refused(self, 'self_reference');
});

test('F26 — an occurrence dated on the snapshot\'s own day may be expected (017 PC3; 03 §7.26)', () => {
  const today = baselineJson();
  setAt(today, 'expectedOccurrences.1.expectedDate', '2026-03-05');
  setAt(today, 'expectedOccurrences.1.state', 'expected');
  const snapshot = validateAnalyticalSnapshot(today);
  assert.equal(snapshot.expectedOccurrences[1].state, 'expected');
});

test('F27 — an occurrence dated on the snapshot\'s own day, or later, is never overdue (017 PC3; 03 §7.26)', () => {
  const today = baselineJson();
  setAt(today, 'expectedOccurrences.1.expectedDate', '2026-03-05');
  refused(today, 'overdue_not_past');
  const future = baselineJson();
  setAt(future, 'expectedOccurrences.1.expectedDate', '2026-03-06');
  refused(future, 'overdue_not_past');
  // And an occurrence before its record's stateSince is history, not an expectation.
  const early = baselineJson();
  setAt(early, 'expectedOccurrences.1.expectedDate', '2026-01-04');
  refused(early, 'before_state_since');
});

test('meta invariants — currencies, the reliability boundary and every count are checked against the content', () => {
  const currency = baselineJson();
  setAt(currency, 'meta.currencies', ['EUR', 'USD']);
  refused(currency, 'currencies_mismatch');
  const boundary = baselineJson();
  setAt(boundary, 'meta.coverage.reliabilityBoundary', '2026-03-04');
  refused(boundary, 'boundary_wrong');
  const basis = baselineJson();
  setAt(basis, 'meta.coverage.reliabilityBoundaryBasis', ['acc-everyday']);
  refused(basis, 'basis_wrong');
  const noFunds = baselineJson();
  setAt(noFunds, 'accounts.0.countsTowardAvailableFunds', false);
  setAt(noFunds, 'accounts.1.countsTowardAvailableFunds', false);
  refused(noFunds, 'boundary_without_funds');
  setAt(noFunds, 'meta.coverage.reliabilityBoundary', undefined);
  setAt(noFunds, 'meta.coverage.reliabilityBoundaryBasis', []);
  validateAnalyticalSnapshot(noFunds);
  for (const name of ['accounts', 'transactions', 'counterparties', 'categories', 'expectedOccurrences', 'uncategorisedTransactions', 'unresolvedCounterparties', 'counterpartyNotApplicable']) {
    const wrong = baselineJson();
    setAt(wrong, `meta.counts.${name}`, 99);
    refused(wrong, 'count_wrong', name);
  }
});

test('occurrence and match invariants — match exists exactly when matched; the matched transaction resolves', () => {
  const matchless = baselineJson();
  setAt(matchless, 'expectedOccurrences.0.match', undefined);
  refused(matchless, 'matched_without_match');
  const extra = baselineJson();
  setAt(extra, 'expectedOccurrences.2.match', { transactionKey: 'tx-01', source: 'manual', matchedOn: '2026-03-01' });
  refused(extra, 'match_without_matched');
});

test('generatedAt must be RFC 3339 UTC; dates must be real calendar dates', () => {
  for (const bad of ['2026-03-05T06:00:00+02:00', '2026-03-05 06:00:00Z', '2026-03-05']) {
    const wrong = baselineJson();
    setAt(wrong, 'meta.generatedAt', bad);
    refused(wrong, 'not_rfc3339_utc');
  }
  const feb30 = baselineJson();
  setAt(feb30, 'transactions.0.bookingDate', '2026-02-30');
  refused(feb30, 'not_date');
});

test('the package surface is what 016 §8 names, and nothing from the fixtures is part of it', async () => {
  const api = await import('../src/index.js');
  assert.equal(typeof api.validateAnalyticalSnapshot, 'function');
  assert.equal(typeof api.ContractValidationError, 'function');
  assert.equal(api.CONTRACT_MAJOR, 1);
  assert.equal(api.CONTRACT_MINOR, 0);
  assert.equal('baseline' in api, false);
});

// T1 (overnight directive 004 §4): an issue names a transaction by its position
// in the transaction order, and that position is carried, never searched for.
// A search inside the per-transaction loop made validation quadratic (040:
// 6.8 s at 250 000 transactions). Neither guard below is a wall-clock limit.

/** The baseline plus n ordinary transactions, still a valid snapshot. */
function scaled(n: number): unknown {
  const snapshot = baselineJson() as { transactions: Record<string, unknown>[]; meta: { counts: Record<string, number> } };
  const template = snapshot.transactions[0];
  for (let i = 0; i < n; i += 1) snapshot.transactions.push({ ...clone(template), transactionKey: `tx-scale-${i}` });
  snapshot.meta.counts.transactions += n;
  return snapshot;
}

test('the validator never searches the transaction arrays for a position (T1)', () => {
  const source = readFileSync(new URL('../src/validate.ts', import.meta.url), 'utf8');
  const search = /\b(?:transactionOrder|transactionList)\s*\.\s*(?:indexOf|lastIndexOf|findIndex|findLastIndex|includes|find|findLast)\s*\(/g;
  assert.deepEqual(source.match(search) ?? [], []);
});

test('validation time grows linearly: four times the transactions takes well under eight times as long (T1)', () => {
  const small = scaled(40_000);
  const large = scaled(160_000);
  assert.equal(validateAnalyticalSnapshot(small).transactions.length, 40_008);
  assert.equal(validateAnalyticalSnapshot(large).transactions.length, 160_008);
  let smallMs = Infinity;
  let largeMs = Infinity;
  for (let run = 0; run < 3; run += 1) {
    let t0 = performance.now();
    validateAnalyticalSnapshot(small);
    smallMs = Math.min(smallMs, performance.now() - t0);
    t0 = performance.now();
    validateAnalyticalSnapshot(large);
    largeMs = Math.min(largeMs, performance.now() - t0);
  }
  const ratio = largeMs / smallMs;
  assert.ok(ratio < 8, `4× the transactions took ${ratio.toFixed(1)}× as long; linear is ≈ 4×, the quadratic scan measured ≈ 11× at this size`);
});
