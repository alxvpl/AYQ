// The catalogue is the only place user-facing text lives.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { catalogueKeys, hasString, translate } from '../src/strings.js';

const SOURCE = join(process.cwd(), 'src');

function sourceFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...sourceFiles(path));
    else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) found.push(path);
  }
  return found;
}

test('every key a component asks for is in the catalogue', () => {
  const used = new Set<string>();
  for (const path of sourceFiles(SOURCE)) {
    const text = readFileSync(path, 'utf8');
    for (const match of text.matchAll(/\bt\(\s*'([a-zA-Z][\w.]*)'/g)) used.add(match[1]);
    for (const match of text.matchAll(
      /'((?:rail|status|snapshot|settings|dialog|context|coverage|chart|explore|table|detail|class|evidence|exclusion|app)\.[\w.]+)'/g,
    )) {
      used.add(match[1]);
    }
  }
  assert.ok(used.size > 40, 'the scan should find the catalogue keys the interface uses');
  for (const key of used) assert.ok(hasString(key), `${key} is used but is not in the catalogue`);
});

test('a string with a count never reads "1 transactions"', () => {
  assert.equal(translate('detail.count', { n: 1 }, 'en'), '1 transaction');
  assert.equal(translate('detail.count', { n: 3 }, 'en'), '3 transactions');
  assert.equal(
    translate('exclusion.notIdentified', { n: 1, amount: '€33.00' }, 'en'),
    'Counterparty not identified: 1 transaction · €33.00',
  );
});

test('a sentence agrees with the number of accounts it names, though no number is printed (r002 §10.3, §6.6)', () => {
  const keys = ['explore.coverage.unknownStart', 'explore.empty.unknownStart', 'explore.comparison.reason.unknownStart'] as const;
  for (const key of keys) {
    const one = translate(key, { accounts: 'Everyday account', n: 1 }, 'en');
    const two = translate(key, { accounts: 'Everyday account and Card account', n: 2 }, 'en');
    assert.match(one, /Everyday account reaches\b/, `${key}: one account reaches`);
    assert.doesNotMatch(one, /\breach\b/, `${key}: one account never "reach"`);
    assert.match(two, /Card account reach\b/, `${key}: two accounts reach`);
    assert.doesNotMatch(two, /\breaches\b/, `${key}: two accounts never "reaches"`);
  }
  // The accepted wording, word for word, in both numbers.
  assert.equal(
    translate('explore.coverage.unknownStart', { accounts: 'Card account', n: 1 }),
    'This snapshot does not establish how far back Card account reaches, so earlier transactions may be missing.',
  );
  assert.equal(
    translate('explore.empty.unknownStart', { accounts: 'A and B', n: 2 }),
    'No matching transactions in what this snapshot holds. It does not establish how far back A and B reach, so there may be more.',
  );
  assert.equal(
    translate('explore.comparison.reason.unknownStart', { accounts: 'Card account', n: 1 }),
    'this snapshot does not establish how far back Card account reaches',
  );
  // Without the count the sentence cannot be formed: silence is a defect.
  assert.throws(() => translate('explore.coverage.unknownStart', { accounts: 'Card account' }), /needs the count n/);
});

test('the Settings counts take plural-selected forms, each by its own count (r002 §11.4)', () => {
  assert.equal(translate('settings.snapshot.holds', { accounts: 1, transactions: 1 }), '1 account · 1 transaction');
  assert.equal(translate('settings.snapshot.holds', { accounts: 1, transactions: 389 }), '1 account · 389 transactions');
  assert.equal(translate('settings.snapshot.holds', { accounts: 3, transactions: 1 }), '3 accounts · 1 transaction');
  assert.equal(translate('settings.snapshot.holds', { accounts: 3, transactions: 389 }), '3 accounts · 389 transactions');
  assert.throws(() => translate('settings.snapshot.holds', { accounts: 3 }), /needs the count transactions/);
});

test('the Settings wording is r002 §11.4 and §11.6, word for word', () => {
  assert.equal(translate('settings.snapshot.heading'), 'Snapshot');
  assert.equal(translate('settings.snapshot.taken', { datetime: '21 Sep 2026, 00:34', relative: '3 weeks ago' }), 'Taken 21 Sep 2026, 00:34 (3 weeks ago)');
  assert.equal(translate('settings.snapshot.none'), 'No snapshot loaded.');
  assert.equal(translate('settings.snapshot.refused'), 'This file cannot be read.');
  assert.equal(translate('settings.snapshot.remove'), 'Remove this snapshot');
  assert.equal(
    translate('settings.snapshot.remove.confirm'),
    'AYQ Analyses will delete its copy of this snapshot. If you no longer have the original file, this snapshot cannot be loaded again.',
  );
  assert.equal(translate('rail.settings'), 'Settings');
});

test('a missing key and a missing value are defects, not blank text', () => {
  assert.throws(() => translate('no.such.key' as never), /not in the catalogue/);
  assert.throws(() => translate('status.snapshot'), /is missing the value datetime/);
});

test('no internal identifier is ever catalogue text', () => {
  const forbidden = ['transactionKey', 'counterpartyKey', 'accountKey', 'ruleKey', 'snapshotId'];
  const catalogue = readFileSync(join(SOURCE, 'strings', 'en.json'), 'utf8');
  for (const token of forbidden) assert.ok(!catalogue.includes(token), `${token} must never be user-facing text`);
  assert.ok(catalogueKeys().length > 60);
});
