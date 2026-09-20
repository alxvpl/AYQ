// UNKNOWN_START and reconciliation-unavailable (010 §3, §5; 03 §8.7, §13.3).
//
// An account without a proven coverage start has an end and no beginning.
// The engine qualifies a Result, replaces the empty sentence, narrows
// Insufficient to end-side reasoning and refuses the comparison; it never
// invents a start. An account whose bank stated no closing balance has an
// unavailable reconciliation, never an agreement of nought.

import assert from 'node:assert/strict';
import test from 'node:test';
import { analyse } from '../src/engine.js';
import { translate } from '../src/strings.js';
import { validateSnapshot } from '../src/validate.js';
import { account, context, snapshot, transaction } from './helpers.js';

const FEBRUARY = { fromDate: '2026-02-01', toDate: '2026-02-28' } as const;

function two() {
  return snapshot({
    accounts: [
      account({ key: 'acc-a', from: '2025-01-01', to: '2026-03-04' }),
      account({ key: 'acc-b', from: null, to: '2026-02-28', reconciliation: 'unavailable' }),
    ],
    transactions: [
      transaction({ key: 'a1', date: '2026-02-03', amount: -1000 }),
      transaction({ key: 'b1', account: 'acc-b', date: '2026-02-10', amount: -2000, counterparty: 'cp-b' }),
      transaction({ key: 'p1', date: '2026-01-12', amount: -500 }),
    ],
  });
}

test('the helper builds what the contract admits: an absent start and an unavailable reconciliation', () => {
  assert.doesNotThrow(() => validateSnapshot(two()));
});

test('a Result over a mixed selection stands, qualified by the accounts whose start is not established', () => {
  const result = analyse(two(), context({ ...FEBRUARY, accountKeys: ['acc-a', 'acc-b'] }));
  assert.equal(result.state, 'result');
  assert.equal(result.totalMinor, 3000n);
  assert.equal(result.coverage.status, 'full');
  assert.equal(result.coverage.startLimit, null, 'no start limit is named for an account with no start');
  assert.deepEqual(result.coverage.unknownStartAccountKeys, ['acc-b']);
  // The proven-start account contributes its ordinary behaviour.
  const alone = analyse(two(), context({ ...FEBRUARY, accountKeys: ['acc-a'] }));
  assert.deepEqual(alone.coverage.unknownStartAccountKeys, []);
});

test('the limited marker outranks the unknown-start marker on the button; the flyout carries both', () => {
  const held = snapshot({
    accounts: [
      account({ key: 'acc-a', from: '2026-02-10', to: '2026-03-04' }),
      account({ key: 'acc-b', from: null, to: '2026-02-20' }),
    ],
    transactions: [transaction({ key: 'a1', date: '2026-02-12', amount: -1000 })],
  });
  const result = analyse(held, context({ ...FEBRUARY, accountKeys: ['acc-a', 'acc-b'] }));
  assert.equal(result.coverage.status, 'limited');
  assert.deepEqual(result.coverage.startLimit, { date: '2026-02-10', accountKeys: ['acc-a'] });
  assert.deepEqual(result.coverage.endLimit, { date: '2026-02-20', accountKeys: ['acc-b'] });
  assert.deepEqual(result.coverage.unknownStartAccountKeys, ['acc-b']);
});

test('a period that merely reaches back before an unproven start is the empty form, never Insufficient', () => {
  const result = analyse(two(), context({ fromDate: '2025-06-01', toDate: '2025-06-30', accountKeys: ['acc-b'] }));
  assert.equal(result.state, 'empty');
  assert.equal(result.coverage.status, 'full');
  assert.deepEqual(result.coverage.unknownStartAccountKeys, ['acc-b']);
  assert.equal(
    translate('explore.empty.unknownStart', { accounts: 'acc-b' }),
    'No matching transactions in what this snapshot holds. It does not establish how far back acc-b reach, so there may be more.',
  );
});

test('Insufficient is concluded from the end side only', () => {
  const after = analyse(two(), context({ fromDate: '2026-03-01', toDate: '2026-03-31', accountKeys: ['acc-b'] }));
  assert.equal(after.state, 'insufficient');
  assert.equal(after.totalMinor, null);
  // A proven-start account whose period lies entirely before its start is no
  // longer Insufficient either: the rule is one rule, and it is end-side.
  const before = analyse(two(), context({ fromDate: '2024-06-01', toDate: '2024-06-30', accountKeys: ['acc-a'] }));
  assert.equal(before.state, 'empty');
  assert.equal(before.coverage.status, 'limited');
  assert.deepEqual(before.coverage.startLimit, { date: '2025-01-01', accountKeys: ['acc-a'] });
});

test('one selected account without a proven start refuses the comparison, with its own reason', () => {
  const result = analyse(two(), context({ ...FEBRUARY, comparison: 'previous', accountKeys: ['acc-a', 'acc-b'] }));
  assert.equal(result.state, 'result');
  assert.equal(result.comparison?.unavailable, 'unknownStart');
  assert.equal(result.comparison?.totalMinor, null);
  assert.equal(result.deltaMinor, null);
  assert.deepEqual(result.comparison?.coverage.unknownStartAccountKeys, ['acc-b']);
  assert.equal(
    translate('explore.comparison.unavailable', {
      reason: translate('explore.comparison.reason.unknownStart', { accounts: 'acc-b' }),
    }),
    'Comparison unavailable — this snapshot does not establish how far back acc-b reach',
  );
  // With only the proven-start account selected, the comparison is ordinary.
  const alone = analyse(two(), context({ ...FEBRUARY, comparison: 'previous', accountKeys: ['acc-a'] }));
  assert.equal(alone.comparison?.unavailable, null);
  assert.equal(alone.comparison?.totalMinor, 500n);
  assert.equal(alone.deltaMinor, 500n);
});

test('an unavailable reconciliation is stated as such and carries no difference', () => {
  const result = analyse(two(), context({ ...FEBRUARY, accountKeys: ['acc-a', 'acc-b'] }));
  const facts = [...result.reconciliation].sort((a, b) => (a.accountKey < b.accountKey ? -1 : 1));
  assert.equal(facts[0].state, 'agrees');
  assert.equal(facts[1].state, 'unavailable');
  assert.equal('differenceMinor' in facts[1], false);
  assert.equal(
    translate('coverage.flyout.reconciliation.line', {
      account: 'acc-b',
      text: translate('coverage.flyout.reconciliation.unavailable'),
    }),
    'acc-b — No statement balance to compare with',
  );
});

test('the four 010 sentences and the button form are in the catalogue, word for word', () => {
  assert.equal(translate('coverage.button.unknownStart', { date: '4 Mar 2026' }), 'Data through 4 Mar 2026 · start unknown');
  assert.equal(
    translate('explore.coverage.unknownStart', { accounts: 'Card account' }),
    'This snapshot does not establish how far back Card account reach, so earlier transactions may be missing.',
  );
  assert.equal(
    translate('coverage.flyout.account.unknownStart', { account: 'Card account', lastStatementDate: '28 Feb 2026' }),
    'Card account: through 28 Feb 2026. How far back it reaches is not established.',
  );
  assert.equal(translate('evidence.provenance.automatic'), 'Category set automatically by AYQ');
});
