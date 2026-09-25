// The reversal explanation of the evidence view (P3, 010 §4 / 011 §4; PC3,
// 014 §3 / 015 §4).
//
// A reversal whose original has a canonical counterparty names it by date,
// amount and counterparty. A reversal whose original has none names it by
// date and amount alone — no placeholder — and receives the same
// outside-population sentence as any other reversal. The amount named is the
// original's own positive A1 money-out contribution, never its bank sign.

import assert from 'node:assert/strict';
import test from 'node:test';
import { analyse } from '../src/engine.js';
import { reversalEvidence } from '../src/evidence.js';
import { formatDate } from '../src/format.js';
import { formatMoney } from '../src/money.js';
import { translate } from '../src/strings.js';
import { validateSnapshot } from '../src/validate.js';
import { account, context, loadFixture, snapshot, transaction } from './helpers.js';
import type { AnalysisResult, Contribution } from '../src/types.js';

const FEBRUARY = { fromDate: '2026-02-01', toDate: '2026-02-28' } as const;
const LOCALE = 'en';
const t = (key: Parameters<typeof translate>[0], params?: Parameters<typeof translate>[1]) => translate(key, params, LOCALE);

function contributionOf(result: AnalysisResult, transactionKey: string): Contribution {
  const found = result.contributions.find(x => x.transactionKey === transactionKey);
  assert.ok(found, `${transactionKey} should contribute`);
  return found;
}

test('a reversal of an original with no canonical counterparty is explained by date and amount alone', () => {
  const held = snapshot({
    accounts: [account({ key: 'acc-a', from: '2025-01-01', to: '2026-03-04' })],
    transactions: [
      // The originals sit in January, outside the February period, so the
      // outside-period sentence must follow in every case.
      transaction({ key: 'cash', date: '2026-01-15', amount: -10000, class: 'cash_withdrawal', counterparty: null, category: null }),
      transaction({ key: 'cash-rev', date: '2026-02-03', amount: 2500, counterparty: null, category: null, reversalOf: 'cash' }),
      transaction({ key: 'unknown', date: '2026-01-16', amount: -8000, class: 'credit_transfer', counterparty: null, category: null }),
      transaction({ key: 'unknown-rev', date: '2026-02-04', amount: 1500, counterparty: null, category: null, reversalOf: 'unknown' }),
      transaction({ key: 'named', date: '2026-01-17', amount: -6000, counterparty: 'cp-b' }),
      transaction({ key: 'named-rev', date: '2026-02-05', amount: 6000, counterparty: null, category: null, reversalOf: 'named' }),
    ],
  });
  assert.doesNotThrow(() => validateSnapshot(held));
  const result = analyse(held, context({ ...FEBRUARY }));

  const outside = t('evidence.reversesOutsidePeriod', {
    from: formatDate('2026-02-01', LOCALE),
    to: formatDate('2026-02-28', LOCALE),
  });

  // Not applicable: the original is a cash withdrawal with no counterparty.
  const cash = contributionOf(result, 'cash-rev');
  assert.equal(cash.subject.kind, 'excluded');
  assert.equal(cash.original?.counterpartyName, null);
  assert.deepEqual(reversalEvidence(cash, result.coverage, t, LOCALE), [
    t('evidence.reversesNoCounterparty', {
      date: formatDate('2026-01-15', LOCALE),
      amount: formatMoney(10000, 'EUR', LOCALE),
    }),
    outside,
  ]);

  // Not identified: the original should have had a counterparty and has none.
  const unknown = contributionOf(result, 'unknown-rev');
  const lines = reversalEvidence(unknown, result.coverage, t, LOCALE);
  assert.equal(lines.length, 2);
  assert.equal(lines[0], `Reverses ${formatDate('2026-01-16', LOCALE)}, ${formatMoney(8000, 'EUR', LOCALE)}`);
  // The original's contribution is positive money-out, supplied by the engine
  // from the one contribution function; the sentence carries no minus sign.
  assert.equal(unknown.original?.moneyOutMinor, 8000n);
  assert.ok(!lines[0].includes('-'), lines[0]);
  assert.equal(lines[1], outside);
  // No placeholder word, no dangling separator, no internal identifier.
  assert.ok(!lines[0].endsWith(','));
  for (const forbidden of ['undefined', 'null', '(none)', '—', 'unknown']) {
    assert.ok(!lines[0].includes(forbidden), `${forbidden} must not appear`);
  }

  // The ordinary case keeps its three-part sentence.
  const named = contributionOf(result, 'named-rev');
  assert.deepEqual(reversalEvidence(named, result.coverage, t, LOCALE), [
    t('evidence.reverses', {
      date: formatDate('2026-01-17', LOCALE),
      amount: formatMoney(6000, 'EUR', LOCALE),
      counterparty: 'Beta Energy',
    }),
    outside,
  ]);
});

test('a contribution that is not a reversal has no reversal explanation', () => {
  const held = snapshot({
    accounts: [account({ key: 'acc-a', from: '2025-01-01', to: '2026-03-04' })],
    transactions: [transaction({ key: 'spend', date: '2026-02-03', amount: -4500 })],
  });
  const result = analyse(held, context({ ...FEBRUARY }));
  assert.deepEqual(reversalEvidence(contributionOf(result, 'spend'), result.coverage, t, LOCALE), []);
});

test('screenshot 10 — the reversal-detail fixture explains the refund under Superstore with the original outside the period', () => {
  const held = loadFixture('a1-reversal-detail.json');
  const result = analyse(held, {
    fromDate: '2026-02-01',
    toDate: '2026-02-28',
    comparison: 'none',
    accountKeys: held.accounts.map(x => x.accountKey),
    categoryKeys: [...held.categories.map(x => x.categoryId), null],
  });
  const refund = contributionOf(result, 'f09-rev');
  assert.equal(refund.subject.kind, 'counterparty');
  assert.equal(refund.amountMinor, -9900n);
  assert.equal(refund.original?.moneyOutMinor, 9900n);
  assert.deepEqual(reversalEvidence(refund, result.coverage, t, LOCALE), [
    `Reverses ${formatDate('2026-01-20', LOCALE)}, ${formatMoney(9900, 'EUR', LOCALE)}, Superstore`,
    t('evidence.reversesOutsidePeriod', { from: formatDate('2026-02-01', LOCALE), to: formatDate('2026-02-28', LOCALE) }),
  ]);
});
