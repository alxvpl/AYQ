import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ayqCanonicalName,
  ayqNormaliseKey,
  ayqParseCardDescription,
  ayqParseSepaDescription,
} from '../src/counterparty/ayq-description.ts';

test('a card string is taken apart into its constituents', () => {
  const parsed = ayqParseCardDescription(
    'BEA, Betaalpas   ALBERT HEIJN 1234,PAS421 NR:00A1B2, 31.05.26/23:10   AMSTERDAM',
  );
  assert.equal(parsed?.marker, 'BEA');
  assert.equal(parsed?.method, 'Betaalpas');
  assert.equal(parsed?.merchant, 'ALBERT HEIJN 1234');
  assert.equal(parsed?.card, '421');
  assert.equal(parsed?.terminal, '00A1B2');
  assert.equal(parsed?.timestamp, '31.05.26/23:10');
  assert.equal(parsed?.location, 'AMSTERDAM');
});

test('the older field ordering is taken apart too', () => {
  const parsed = ayqParseCardDescription(
    'BEA   NR:00A1B2   31.05.26/23:10   ALBERT HEIJN 1234,PAS421',
  );
  assert.equal(parsed?.merchant, 'ALBERT HEIJN 1234');
  assert.equal(parsed?.terminal, '00A1B2');
});

test('an ATM withdrawal is recognised as GEA', () => {
  const parsed = ayqParseCardDescription(
    'GEA, Betaalpas   GELDMAAT WESTERSTRAAT 7,PAS421 NR:00C3D4, 31.05.26/09:02   AMSTERDAM',
  );
  assert.equal(parsed?.marker, 'GEA');
  assert.equal(parsed?.merchant, 'GELDMAAT WESTERSTRAAT 7');
});

test('the acquirer prefix is stripped and recorded', () => {
  const parsed = ayqParseCardDescription(
    'BEA, Apple Pay   CCV*TESTWINKEL ONLINE,PAS421 NR:00Z9Y8, 01.06.26/14:44   www.testwinkel.example',
  );
  assert.equal(parsed?.method, 'Apple Pay');
  assert.equal(parsed?.merchant, 'TESTWINKEL ONLINE');
  assert.equal(parsed?.intermediary, 'CCV');
  assert.equal(parsed?.location, 'www.testwinkel.example');
});

test('text that is not a card entry returns null', () => {
  assert.equal(ayqParseCardDescription('Salaris mei 2026'), null);
  assert.equal(ayqParseCardDescription(null), null);
});

test('SEPA with slash tags', () => {
  const parsed = ayqParseSepaDescription(
    '/TRTP/SEPA OVERBOEKING/IBAN/NL00TEST0987654321/BIC/INGBNL2A/NAME/TESTENERGIE NEDERLAND/EREF/E2E-1/REMI/Factuur 2026/05',
  );
  assert.equal(parsed?.scheme, 'SEPA OVERBOEKING');
  assert.equal(parsed?.name, 'TESTENERGIE NEDERLAND');
  assert.equal(parsed?.iban, 'NL00TEST0987654321');
  assert.equal(parsed?.bic, 'INGBNL2A');
  assert.equal(parsed?.reference, 'E2E-1');
  // A value containing a slash is joined back together, not cut short.
  assert.equal(parsed?.remittance, 'Factuur 2026/05');
});

test('SEPA with Dutch labels', () => {
  const parsed = ayqParseSepaDescription(
    'SEPA Incasso algemeen doorlopend Incassant: NL00ZZZ123456780000 Naam: TESTENERGIE NEDERLAND B.V. Machtiging: MANDAAT-4471902 Omschrijving: Termijnbedrag mei 2026',
  );
  assert.equal(parsed?.name, 'TESTENERGIE NEDERLAND B.V.');
  assert.equal(parsed?.creditorId, 'NL00ZZZ123456780000');
  assert.equal(parsed?.mandateId, 'MANDAAT-4471902');
  assert.equal(parsed?.remittance, 'Termijnbedrag mei 2026');
});

test('normalisation collapses branch and order numbers', () => {
  assert.equal(ayqNormaliseKey('Albert Heijn 1234'), 'ALBERT HEIJN');
  assert.equal(ayqNormaliseKey('ALBERT HEIJN 5678'), 'ALBERT HEIJN');
  assert.equal(
    ayqNormaliseKey('Boekhandel De Testberg bestelling 20260531 77'),
    'BOEKHANDEL DE TESTBERG BESTELLING',
  );
});

test('normalisation strips diacritics without breaking the word', () => {
  assert.equal(ayqNormaliseKey('Café Zürich'), 'CAFE ZURICH');
  assert.equal(ayqNormaliseKey('Jansen & Zn.'), 'JANSEN & ZN');
  assert.equal(ayqNormaliseKey('   '), null);
  assert.equal(ayqNormaliseKey(null), null);
});

test('the canonical name keeps the shop and drops the branch', () => {
  // Grouping and naming follow the same rule, so a ledger cannot show two
  // names for one key.
  for (const [raw, expected] of [
    ['ALBERT HEIJN 1234', 'ALBERT HEIJN'],
    ['ALBERT HEIJN 5678', 'ALBERT HEIJN'],
    ['TESTFUEL 22', 'TESTFUEL'],
    // Punctuation and casing survive, which the normalised key cannot do.
    ['TESTENERGIE NEDERLAND B.V.', 'TESTENERGIE NEDERLAND B.V.'],
    ['Koffiehuis de Test', 'Koffiehuis de Test'],
    // A name that is only a number keeps it rather than becoming nothing.
    ['12345', '12345'],
  ] as Array<[string, string]>) {
    assert.equal(ayqCanonicalName(raw), expected, raw);
  }

  assert.equal(ayqCanonicalName(null), null);
  assert.equal(ayqCanonicalName('   '), null);

  // The two agree on identity even when they disagree on presentation.
  assert.equal(
    ayqNormaliseKey(ayqCanonicalName('ALBERT HEIJN 1234')),
    ayqNormaliseKey(ayqCanonicalName('ALBERT HEIJN 9012')),
  );
});
