// The rule that decides whether history may invent a future expense (9 §9.1).
//
// Every case below is one the old rule got wrong, or one the new rule must not
// break. The detector is a pure function of occurrences, so all of it is proved
// on invented data with no budget anywhere near it — which is the point of
// keeping it out of `ayq-plan.ts`.
//
// Every counterparty, amount and date here is invented.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ayqDetectSeries,
  ayqSeriesStillHolds,
  type AyqSeriesOccurrence,
} from '../src/ayq-series.ts';

/** One outgoing payment. Cents are negative, as the ledger holds them. */
function paid(
  counterpartyKey: string,
  date: string,
  euro: number,
  mandateId: string | null = null,
): AyqSeriesOccurrence {
  return {
    counterpartyKey,
    name: counterpartyKey,
    date,
    amountCents: -Math.round(euro * 100),
    mandateId,
  };
}

test('an exact amount at a monthly rhythm qualifies', () => {
  const found = ayqDetectSeries([
    paid('TESTSTREAM', '2026-04-04', 9.99),
    paid('TESTSTREAM', '2026-05-04', 9.99),
    paid('TESTSTREAM', '2026-06-04', 9.99),
    paid('TESTSTREAM', '2026-07-04', 9.99),
  ]);

  assert.equal(found.length, 1);
  const [series] = found;
  assert.equal(series.counterpartyKey, 'TESTSTREAM');
  assert.equal(series.frequency, 'monthly');
  assert.equal(series.occurrences, 4);
  // The exact repeated amount, positive. Never an average of anything.
  assert.equal(series.amountCents, 999);
  assert.equal(series.firstDate, '2026-04-04');
  assert.equal(series.lastDate, '2026-07-04');
  // Last occurrence plus the representative interval, which is only reached
  // for once every interval has already passed the window test.
  assert.equal(series.nextExpectedDate, '2026-08-03');
});

test('a supermarket does not qualify, however regular the visits', () => {
  // The case the old rule got wrong: a weekly shop with a median interval of
  // seven days and a different total every time.
  const found = ayqDetectSeries([
    paid('TESTMARKT', '2026-05-02', 47.31),
    paid('TESTMARKT', '2026-05-09', 52.08),
    paid('TESTMARKT', '2026-05-16', 38.94),
    paid('TESTMARKT', '2026-05-23', 61.20),
    paid('TESTMARKT', '2026-05-30', 44.77),
  ]);

  assert.deepEqual(found, [], 'a varying amount was offered as an expectation');
});

test('the same amount at irregular dates does not qualify', () => {
  const found = ayqDetectSeries([
    paid('TESTFUEL', '2026-01-05', 60),
    paid('TESTFUEL', '2026-02-06', 60),
    // Three months later: this interval is in no window that the other two are.
    paid('TESTFUEL', '2026-05-14', 60),
    paid('TESTFUEL', '2026-06-13', 60),
  ]);

  assert.deepEqual(found, [], 'an irregular series was offered as an expectation');
});

test('a median that looks monthly does not rescue irregular intervals', () => {
  // Intervals of 3, 30, 31 and 90 days. The median is 30 and a half — exactly
  // the arithmetic that let build 004 through — and not one thing about this is
  // monthly.
  const found = ayqDetectSeries([
    paid('TESTSHOP', '2026-01-01', 25),
    paid('TESTSHOP', '2026-01-04', 25),
    paid('TESTSHOP', '2026-02-03', 25),
    paid('TESTSHOP', '2026-03-06', 25),
    paid('TESTSHOP', '2026-06-04', 25),
  ]);

  assert.deepEqual(found, []);
});

test('nearly the same amount is not the same amount', () => {
  const found = ayqDetectSeries([
    paid('TESTENERGY', '2026-03-01', 61.90),
    paid('TESTENERGY', '2026-04-01', 61.91),
    paid('TESTENERGY', '2026-05-01', 61.90),
  ]);

  // Three occurrences, a perfect monthly rhythm, and one cent of difference.
  // Condition 2 says exactly equal, and a cent is not exactly equal — the
  // amount that would be suggested would be one somebody was never charged.
  assert.deepEqual(found, []);
});

test('a mandate does not excuse an irregular rhythm', () => {
  const found = ayqDetectSeries([
    paid('TESTWATER', '2026-01-10', 42, 'NL99ZZZ000000000000'),
    paid('TESTWATER', '2026-03-22', 42, 'NL99ZZZ000000000000'),
    paid('TESTWATER', '2026-04-02', 42, 'NL99ZZZ000000000000'),
    paid('TESTWATER', '2026-09-30', 42, 'NL99ZZZ000000000000'),
  ]);

  // The bank's own word that this is a standing authorisation, and it says
  // nothing about *when*. A forecast is about dates.
  assert.deepEqual(found, []);
});

test('a mandate rides along on a series that qualifies on its own', () => {
  const found = ayqDetectSeries([
    paid('TESTGYM', '2026-04-01', 29.50, 'NL11ZZZ000000000000'),
    paid('TESTGYM', '2026-05-01', 29.50, 'NL11ZZZ000000000000'),
    paid('TESTGYM', '2026-06-01', 29.50, 'NL11ZZZ000000000000'),
  ]);

  assert.equal(found.length, 1);
  assert.equal(found[0].mandateId, 'NL11ZZZ000000000000');
});

test('two occurrences are a coincidence, three are a rhythm', () => {
  const twice = [
    paid('TESTNEWS', '2026-05-15', 12),
    paid('TESTNEWS', '2026-06-15', 12),
  ];
  assert.deepEqual(ayqDetectSeries(twice), []);

  assert.equal(
    ayqDetectSeries([...twice, paid('TESTNEWS', '2026-07-15', 12)]).length,
    1,
  );
});

test('two exact-amount series under one counterparty stay apart', () => {
  const found = ayqDetectSeries([
    // A monthly subscription.
    paid('TESTCLOUD', '2026-04-10', 4.99),
    paid('TESTCLOUD', '2026-05-10', 4.99),
    paid('TESTCLOUD', '2026-06-10', 4.99),
    // And one-off purchases from the same shop, at the same exact amount as
    // each other but on no rhythm at all.
    paid('TESTCLOUD', '2026-04-02', 89.00),
    paid('TESTCLOUD', '2026-04-19', 89.00),
    paid('TESTCLOUD', '2026-08-30', 89.00),
  ]);

  // One of them qualifies and the other does not, and neither contaminates the
  // other: no 47-euro average, and no rhythm borrowed from the subscription.
  assert.equal(found.length, 1);
  assert.equal(found[0].amountCents, 499);
  assert.equal(found[0].frequency, 'monthly');
});

test('two exact-amount series can both qualify, and are offered separately', () => {
  const found = ayqDetectSeries([
    paid('TESTTELCO', '2026-04-08', 19.95),
    paid('TESTTELCO', '2026-05-08', 19.95),
    paid('TESTTELCO', '2026-06-08', 19.95),
    paid('TESTTELCO', '2026-04-20', 7.50),
    paid('TESTTELCO', '2026-05-20', 7.50),
    paid('TESTTELCO', '2026-06-20', 7.50),
  ]);

  assert.equal(found.length, 2);
  assert.deepEqual(
    found.map(one => one.amountCents).sort((left, right) => left - right),
    [750, 1995],
  );
});

test('two charges on one day are not a rhythm', () => {
  const found = ayqDetectSeries([
    paid('TESTDOUBLE', '2026-05-01', 15),
    paid('TESTDOUBLE', '2026-05-01', 15),
    paid('TESTDOUBLE', '2026-05-01', 15),
  ]);
  // An interval of nought is in no cadence window, and a double charge is a
  // thing to notice rather than a thing to expect monthly.
  assert.deepEqual(found, []);
});

test('money coming in is not a future expense', () => {
  const found = ayqDetectSeries([
    { counterpartyKey: 'TESTPAY', name: 'TESTPAY', date: '2026-04-25', amountCents: 320_000, mandateId: null },
    { counterpartyKey: 'TESTPAY', name: 'TESTPAY', date: '2026-05-25', amountCents: 320_000, mandateId: null },
    { counterpartyKey: 'TESTPAY', name: 'TESTPAY', date: '2026-06-25', amountCents: 320_000, mandateId: null },
  ]);
  assert.deepEqual(found, []);
});

test('every cadence window is recognised, and only inside itself', () => {
  const cadences: Array<[string, number]> = [
    ['weekly', 7],
    ['fortnightly', 14],
    ['monthly', 30],
    ['quarterly', 91],
    ['half-yearly', 182],
    ['yearly', 365],
  ];

  for (const [frequency, step] of cadences) {
    const dates = [0, step, step * 2].map(offset => {
      const day = new Date('2026-01-01T00:00:00Z');
      day.setUTCDate(day.getUTCDate() + offset);
      return day.toISOString().slice(0, 10);
    });
    const found = ayqDetectSeries(dates.map(date => paid('TESTONE', date, 10)));
    assert.equal(found.length, 1, `${frequency} was not detected`);
    assert.equal(found[0].frequency, frequency);
  }
});

test('an offer is withdrawn when the history behind it no longer holds', () => {
  const series = ayqDetectSeries([
    paid('TESTSTREAM', '2026-04-04', 9.99),
    paid('TESTSTREAM', '2026-05-04', 9.99),
    paid('TESTSTREAM', '2026-06-04', 9.99),
  ]);

  // The record that series supports still holds.
  assert.equal(
    ayqSeriesStillHolds(series, {
      counterpartyKey: 'TESTSTREAM',
      amountCents: 999,
      recurrence: { frequency: 'monthly' },
    }),
    true,
  );

  // A build-004 record for the same counterparty at an averaged amount does
  // not: nobody was ever charged 1047, and that is the figure it was taking
  // out of the forecast.
  assert.equal(
    ayqSeriesStillHolds(series, {
      counterpartyKey: 'TESTSTREAM',
      amountCents: 1047,
      recurrence: { frequency: 'monthly' },
    }),
    false,
  );

  // Nor does one with no counterparty at all: condition 1 cannot be met by a
  // record that never had an identity.
  assert.equal(
    ayqSeriesStillHolds(series, {
      counterpartyKey: null,
      amountCents: 999,
      recurrence: { frequency: 'monthly' },
    }),
    false,
  );
});
