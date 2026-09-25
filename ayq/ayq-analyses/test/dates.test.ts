// Periods, presets and comparison dates.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  comparisonPeriod,
  periodShape,
  presetMatching,
  previousPeriod,
  resolvePreset,
  sameLastYearPeriod,
  utcCalendarDate,
} from '../src/dates.js';
import { commitPeriodDate, defaultContext } from '../src/context.js';
import { context } from './helpers.js';
import { account, snapshot, transaction } from './helpers.js';

test('case 2 — month, quarter and year presets resolve to the correct first and last day', () => {
  assert.deepEqual(resolvePreset('thisMonth', '2026-02-14'), { fromDate: '2026-02-01', toDate: '2026-02-28' });
  assert.deepEqual(resolvePreset('thisMonth', '2024-02-14'), { fromDate: '2024-02-01', toDate: '2024-02-29' });
  assert.deepEqual(resolvePreset('lastMonth', '2026-01-09'), { fromDate: '2025-12-01', toDate: '2025-12-31' });
  assert.deepEqual(resolvePreset('thisQuarter', '2026-05-20'), { fromDate: '2026-04-01', toDate: '2026-06-30' });
  assert.deepEqual(resolvePreset('lastQuarter', '2026-01-05'), { fromDate: '2025-10-01', toDate: '2025-12-31' });
  assert.deepEqual(resolvePreset('thisYear', '2026-07-01'), { fromDate: '2026-01-01', toDate: '2026-12-31' });
  assert.deepEqual(resolvePreset('lastYear', '2026-07-01'), { fromDate: '2025-01-01', toDate: '2025-12-31' });
});

test('the preset anchor is the UTC calendar date of generatedAt, not the machine clock', () => {
  // An instant late in the UTC day resolves on that UTC day wherever the
  // machine stands, and a snapshot opened a year later resolves inside its own
  // data rather than against today.
  assert.equal(utcCalendarDate('2026-03-01T23:30:00Z'), '2026-03-01');
  assert.equal(utcCalendarDate('2026-03-01T23:30:00+02:00'), '2026-03-01');
  assert.equal(utcCalendarDate('2026-03-02T00:30:00+02:00'), '2026-03-01');

  const held = snapshot({
    generatedAt: '2026-03-05T06:00:00Z',
    accounts: [account({ key: 'acc-a', from: '2025-01-01', to: '2026-03-04' })],
    transactions: [transaction({ key: 't1', date: '2026-02-03', amount: -1000 })],
  });
  const resolved = defaultContext(held);
  assert.equal(resolved.fromDate, '2026-02-01');
  assert.equal(resolved.toDate, '2026-02-28');
  assert.notEqual(resolved.toDate, new Date().toISOString().slice(0, 10));
});

test('the default context after a load is Last month, no comparison, everything selected', () => {
  const held = snapshot({
    generatedAt: '2026-01-08T12:00:00Z',
    accounts: [
      account({ key: 'acc-a', from: '2025-01-01', to: '2026-01-07' }),
      account({ key: 'acc-b', from: '2025-01-01', to: '2026-01-07' }),
    ],
    transactions: [],
  });
  const january = defaultContext(held);
  // generatedAt in January resolves to the previous December, across the year.
  assert.equal(january.fromDate, '2025-12-01');
  assert.equal(january.toDate, '2025-12-31');
  assert.equal(january.comparison, 'none');
  assert.deepEqual([...january.accountKeys], ['acc-a', 'acc-b']);
  assert.equal(january.categoryKeys.length, 3);
  assert.ok(january.categoryKeys.includes(null));

  const leap = defaultContext(
    snapshot({
      generatedAt: '2024-03-04T00:00:00Z',
      accounts: [account({ key: 'acc-a', from: '2023-01-01', to: '2024-03-03' })],
      transactions: [],
    }),
  );
  // generatedAt in March of a leap year resolves to a February of 29 days.
  assert.equal(leap.fromDate, '2024-02-01');
  assert.equal(leap.toDate, '2024-02-29');
});

test('a whole month, quarter or year shifts back one unit; anything else shifts by its own length', () => {
  assert.equal(periodShape({ fromDate: '2026-02-01', toDate: '2026-02-28' }), 'month');
  assert.equal(periodShape({ fromDate: '2026-04-01', toDate: '2026-06-30' }), 'quarter');
  assert.equal(periodShape({ fromDate: '2026-01-01', toDate: '2026-12-31' }), 'year');
  assert.equal(periodShape({ fromDate: '2026-02-03', toDate: '2026-02-20' }), 'custom');

  assert.deepEqual(previousPeriod({ fromDate: '2026-02-01', toDate: '2026-02-28' }), {
    fromDate: '2026-01-01',
    toDate: '2026-01-31',
  });
  assert.deepEqual(previousPeriod({ fromDate: '2026-04-01', toDate: '2026-06-30' }), {
    fromDate: '2026-01-01',
    toDate: '2026-03-31',
  });
  assert.deepEqual(previousPeriod({ fromDate: '2026-01-01', toDate: '2026-12-31' }), {
    fromDate: '2025-01-01',
    toDate: '2025-12-31',
  });
  // Ten days ending on the day before the requested period begins.
  assert.deepEqual(previousPeriod({ fromDate: '2026-02-11', toDate: '2026-02-20' }), {
    fromDate: '2026-02-01',
    toDate: '2026-02-10',
  });
});

test('case 11 — sameLastYear clamps 29 February and states the clamp', () => {
  const clamped = sameLastYearPeriod({ fromDate: '2024-02-01', toDate: '2024-02-29' });
  assert.equal(clamped.fromDate, '2023-02-01');
  assert.equal(clamped.toDate, '2023-02-28');
  assert.deepEqual(clamped.clamped, { requestedDate: '2023-02-29', clampedDate: '2023-02-28', year: 2023 });

  const plain = comparisonPeriod({ fromDate: '2026-02-01', toDate: '2026-02-28' }, 'sameLastYear');
  assert.equal(plain.fromDate, '2025-02-01');
  assert.equal(plain.toDate, '2025-02-28');
  assert.equal(plain.clamped, null);
});

test('PC6a — the preset trigger names the preset whose dates these are, else Custom, from the dates alone', () => {
  const anchor = '2026-03-05';
  assert.equal(presetMatching({ fromDate: '2026-02-01', toDate: '2026-02-28' }, anchor), 'lastMonth');
  assert.equal(presetMatching({ fromDate: '2026-03-01', toDate: '2026-03-31' }, anchor), 'thisMonth');
  assert.equal(presetMatching({ fromDate: '2025-10-01', toDate: '2025-12-31' }, anchor), 'lastQuarter');
  assert.equal(presetMatching({ fromDate: '2025-01-01', toDate: '2025-12-31' }, anchor), 'lastYear');
  // The same dates typed by hand name the same preset: there is no origin.
  assert.equal(presetMatching({ fromDate: '2026-02-01', toDate: '2026-02-27' }, anchor), 'custom');
  assert.equal(presetMatching({ fromDate: '2025-06-01', toDate: '2025-06-30' }, anchor), 'custom');
  // F01's default context after a load reads Last month.
  const held = snapshot({
    generatedAt: '2026-03-05T06:00:00Z',
    accounts: [account({ key: 'acc-a', from: '2025-01-01', to: '2026-03-04' })],
    transactions: [transaction({ key: 't1', date: '2026-02-03', amount: -1000 })],
  });
  const resolved = defaultContext(held);
  assert.equal(presetMatching({ fromDate: resolved.fromDate, toDate: resolved.toDate }, utcCalendarDate(held.meta.generatedAt)), 'lastMonth');
});

test('PC6c — a date commits only when complete and valid, moves the other bound when it crosses it, and never touches the comparison', () => {
  const base = context({ fromDate: '2026-02-01', toDate: '2026-02-28', comparison: 'previous' });
  // An empty or invalid draft commits nothing. (A year typed digit by digit
  // passes through 0002, 0020 and 0202 — each a calendar date — and is never
  // judged on the way because the field commits only on blur or Enter.)
  for (const draft of ['', 'not a date', '2025-13-01', '2025-06-31']) {
    assert.equal(commitPeriodDate(base, 'toDate', draft), null, draft);
    assert.equal(commitPeriodDate(base, 'fromDate', draft), null, draft);
  }
  // A complete date commits, in either direction, without changing the mode.
  assert.deepEqual(commitPeriodDate(base, 'fromDate', '2025-06-01'), { ...base, fromDate: '2025-06-01' });
  assert.deepEqual(commitPeriodDate({ ...base, fromDate: '2025-06-01' }, 'toDate', '2025-06-30'), {
    ...base,
    fromDate: '2025-06-01',
    toDate: '2025-06-30',
  });
  // A from after to moves to; a to before from moves from.
  assert.deepEqual(commitPeriodDate(base, 'fromDate', '2026-03-10'), { ...base, fromDate: '2026-03-10', toDate: '2026-03-10' });
  assert.deepEqual(commitPeriodDate(base, 'toDate', '2026-01-15'), { ...base, fromDate: '2026-01-15', toDate: '2026-01-15' });
  // An unchanged date is not a change.
  assert.equal(commitPeriodDate(base, 'fromDate', '2026-02-01'), null);
});
