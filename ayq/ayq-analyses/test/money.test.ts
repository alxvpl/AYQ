// The exact money formatter: every visible figure starts from integer minor
// units and the currency's exponent, and comes back as the same integer.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  currencyExponent,
  exactDecimalString,
  formatMoney,
  formatSignedMoney,
  minorUnitsFromDecimalString,
  minorUnitsFromFormatted,
} from '../src/money.js';
import { loadFixture } from './helpers.js';

const FIXTURES = [
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

const LOCALES = ['en-US', 'nl-NL', 'de-DE'];

test('the currency exponent comes from the currency, not from the locale', () => {
  assert.equal(currencyExponent('EUR'), 2);
  assert.equal(currencyExponent('USD'), 2);
  assert.equal(currencyExponent('JPY'), 0);
});

test('the decimal point is placed by moving digits, never by dividing', () => {
  assert.equal(exactDecimalString(24625, 2), '246.25');
  assert.equal(exactDecimalString(-1500, 2), '-15.00');
  assert.equal(exactDecimalString(7, 2), '0.07');
  assert.equal(exactDecimalString(1234, 0), '1234');
});

test('every fixture amount round-trips through the display path, in every tested locale', () => {
  for (const name of FIXTURES) {
    const snapshot = loadFixture(name);
    const amounts: Array<{ amount: number; currency: string }> = [];
    for (const account of snapshot.accounts) {
      amounts.push(
        account.openingBalance,
        account.ledgerBalance,
        account.statementCoverage.closingBalance,
        account.reconciliation.ledgerBalanceAtCoverageDate,
        account.reconciliation.statementClosingBalance,
        account.reconciliation.difference,
      );
    }
    for (const transaction of snapshot.transactions) amounts.push(transaction.amount);

    for (const { amount, currency } of amounts) {
      for (const locale of LOCALES) {
        assert.equal(
          minorUnitsFromFormatted(amount, currency, locale),
          BigInt(amount),
          `${name}: ${amount} ${currency} in ${locale}`,
        );
        // A negative amount carries a minus sign, and the change of a refund
        // is signed rather than coloured.
        assert.equal(minorUnitsFromFormatted(-amount, currency, locale), BigInt(-amount));
      }
    }
  }
});

test('a value beyond float safety still prints and reads back exactly', () => {
  const beyondSafe = 9007199254740993n * 100n + 87n;
  assert.equal(exactDecimalString(beyondSafe, 2), '9007199254740993.87');
  assert.equal(minorUnitsFromDecimalString('9007199254740993.87', 2), beyondSafe);
  for (const locale of LOCALES) {
    assert.equal(minorUnitsFromFormatted(beyondSafe, 'EUR', locale), beyondSafe);
    assert.equal(minorUnitsFromFormatted(-beyondSafe, 'EUR', locale), -beyondSafe);
  }
  // The same value as a Number would already have lost a unit before it was
  // ever formatted, which is why the display path takes bigint.
  assert.throws(() => exactDecimalString(Number(beyondSafe), 2), RangeError);
});

test('the locale changes the presentation and nothing else', () => {
  const dutch = formatMoney(24625, 'EUR', 'nl-NL');
  const american = formatMoney(24625, 'EUR', 'en-US');
  assert.notEqual(dutch, american);
  assert.equal(minorUnitsFromFormatted(24625, 'EUR', 'nl-NL'), minorUnitsFromFormatted(24625, 'EUR', 'en-US'));
  assert.ok(dutch.includes(',')); // comma decimal
  assert.ok(american.includes('.')); // point decimal
});

test('a change carries its sign', () => {
  assert.ok(formatSignedMoney(6025, 'EUR', 'en-US').startsWith('+'));
  assert.ok(formatSignedMoney(-6025, 'EUR', 'en-US').startsWith('-'));
});

test('a money value that is not an integer number of minor units is refused', () => {
  assert.throws(() => exactDecimalString(12.34, 2), RangeError);
});
