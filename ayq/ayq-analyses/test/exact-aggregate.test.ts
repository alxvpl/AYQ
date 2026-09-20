// Exact arithmetic survives aggregation (011 §6, r004 §8.11 item 10).
//
// Each snapshot amount is a safe JSON integer on its own; the validator admits
// nothing else. The sum of two such amounts can still exceed
// Number.MAX_SAFE_INTEGER, and the engine must carry that sum exactly through
// the row, the headline, the comparison and the delta, and the formatter must
// print and read it back without losing a unit.

import assert from 'node:assert/strict';
import test from 'node:test';
import { analyse } from '../src/engine.js';
import { chartGeometry } from '../src/geometry.js';
import { formatMoney, minorUnitsFromFormatted } from '../src/money.js';
import { DEFAULT_SORT, sortRows } from '../src/sort.js';
import { validateSnapshot } from '../src/validate.js';
import { account, context, snapshot, transaction } from './helpers.js';

const FEBRUARY = { fromDate: '2026-02-01', toDate: '2026-02-28' } as const;
const LOCALES = ['en-US', 'nl-NL', 'de-DE'];

/** The largest amount a snapshot may carry: safe on its own, and twice it is not. */
const LARGEST_SAFE = Number.MAX_SAFE_INTEGER;

test('two individually safe money-out amounts aggregate exactly beyond the safe integer range', () => {
  const held = snapshot({
    accounts: [
      account({ key: 'acc-a', from: '2025-01-01', to: '2026-03-04', ledger: 0, statement: 0 }),
    ],
    transactions: [
      transaction({ key: 'big-1', date: '2026-02-03', amount: -LARGEST_SAFE }),
      transaction({ key: 'big-2', date: '2026-02-04', amount: -LARGEST_SAFE }),
      transaction({ key: 'small', date: '2026-02-05', amount: -1 }),
    ],
  });
  // Every input passes the validator: each amount is a safe integer.
  assert.doesNotThrow(() => validateSnapshot(held));
  assert.ok(Number.isSafeInteger(held.transactions[0].amount.amount));

  const result = analyse(held, context({ ...FEBRUARY }));
  const expected = BigInt(LARGEST_SAFE) * 2n + 1n;
  assert.ok(expected > BigInt(Number.MAX_SAFE_INTEGER));

  // Row, headline and drill-down are all the same exact bigint.
  assert.equal(result.state, 'result');
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].moneyOutMinor, expected);
  assert.equal(result.totalMinor, expected);
  assert.equal(
    result.rows[0].contributions.reduce((sum, x) => sum + x.amountMinor, 0n),
    expected,
  );
  assert.equal(typeof result.totalMinor, 'bigint');

  // A Number would already have lost the unit.
  assert.notEqual(BigInt(Number(expected)), expected);

  // The one formatter prints the exact aggregate and reads it back, in every
  // tested locale.
  assert.equal(formatMoney(expected, 'EUR', 'en-US'), '€180,143,985,094,819.83');
  for (const locale of LOCALES) {
    assert.equal(minorUnitsFromFormatted(expected, 'EUR', locale), expected);
  }
});

test('a comparison and its delta beyond the safe range are exact as well', () => {
  const held = snapshot({
    accounts: [
      account({ key: 'acc-a', from: '2025-01-01', to: '2026-03-04', ledger: 0, statement: 0 }),
    ],
    transactions: [
      transaction({ key: 'now-1', date: '2026-02-03', amount: -LARGEST_SAFE }),
      transaction({ key: 'now-2', date: '2026-02-04', amount: -LARGEST_SAFE }),
      transaction({ key: 'then-1', date: '2026-01-10', amount: -LARGEST_SAFE }),
      transaction({ key: 'then-2', date: '2026-01-11', amount: -LARGEST_SAFE }),
      transaction({ key: 'then-3', date: '2026-01-12', amount: -3 }),
    ],
  });
  assert.doesNotThrow(() => validateSnapshot(held));

  const result = analyse(held, context({ ...FEBRUARY, comparison: 'previous' }));
  const current = BigInt(LARGEST_SAFE) * 2n;
  const previous = BigInt(LARGEST_SAFE) * 2n + 3n;
  assert.equal(result.totalMinor, current);
  assert.equal(result.comparison?.totalMinor, previous);
  assert.equal(result.deltaMinor, -3n);
  assert.equal(result.rows[0].previousMinor, previous);
  assert.equal(result.rows[0].changeMinor, -3n);
});

test('rows beyond the safe range still order exactly, without subtraction through Number', () => {
  const held = snapshot({
    accounts: [
      account({ key: 'acc-a', from: '2025-01-01', to: '2026-03-04', ledger: 0, statement: 0 }),
    ],
    transactions: [
      transaction({ key: 'a-1', date: '2026-02-03', amount: -LARGEST_SAFE, counterparty: 'cp-a' }),
      transaction({ key: 'a-2', date: '2026-02-04', amount: -LARGEST_SAFE, counterparty: 'cp-a' }),
      transaction({ key: 'b-1', date: '2026-02-03', amount: -LARGEST_SAFE, counterparty: 'cp-b' }),
      transaction({ key: 'b-2', date: '2026-02-04', amount: -LARGEST_SAFE, counterparty: 'cp-b' }),
      transaction({ key: 'b-3', date: '2026-02-05', amount: -1, counterparty: 'cp-b' }),
    ],
  });
  const result = analyse(held, context({ ...FEBRUARY }));
  // The two rows differ by one minor unit, which a Number cannot tell apart at
  // this magnitude; the exact comparator can.
  const descending = sortRows(result.rows, DEFAULT_SORT).map(row => row.counterpartyKey);
  assert.deepEqual(descending, ['cp-b', 'cp-a']);
  const ascending = sortRows(result.rows, { column: 'moneyOut', direction: 'ascending' }).map(row => row.counterpartyKey);
  assert.deepEqual(ascending, ['cp-a', 'cp-b']);
});

test('chart geometry is exact within the safe range and bounded, ordered and signed beyond it', () => {
  // Within the safe range the bar length is the value itself.
  assert.deepEqual(chartGeometry([10750n, 10000n, -2000n]), [10750, 10000, -2000]);

  // Beyond it every length is a safe Number, sign and order survive, and the
  // proportion is kept by one common divisor.
  const huge = BigInt(LARGEST_SAFE) * 2n + 1n;
  const lengths = chartGeometry([huge, huge / 2n, -huge, 5n]);
  for (const length of lengths) assert.ok(Number.isSafeInteger(length));
  assert.ok(lengths[0] > lengths[1] && lengths[1] > lengths[3] && lengths[3] >= 0);
  assert.ok(lengths[2] < 0 && lengths[2] === -lengths[0]);
  assert.ok(Math.abs(lengths[0] / lengths[1] - 2) < 0.001);
});
