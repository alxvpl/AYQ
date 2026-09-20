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
    for (const match of text.matchAll(/'((?:rail|status|snapshot|context|coverage|explore|table|detail|class|evidence|exclusion|app)\.[\w.]+)'/g)) {
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
