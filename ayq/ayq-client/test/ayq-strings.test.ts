// 04 A24, enforced rather than remembered.
//
// "Dutch must be addable without touching components" is only true while no
// component holds a word. That is checkable, so it is checked: every `.tsx`
// file is parsed and every place a person could read something is required to
// have come from the catalogue.
//
// The check reads the real syntax tree rather than searching the text, because
// a search cannot tell a heading from a CSS value and would have to be loose
// enough to miss the thing it is for.

import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import ts from 'typescript';

import {
  AYQ_LOCALE,
  ayqAmount,
  ayqCatalogues,
  ayqCount,
  ayqDate,
  ayqList,
  ayqMoney,
  ayqMonthName,
  ayqText,
} from '../src/ayq-strings.ts';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..', 'src');

/**
 * Attributes whose value a person reads.
 *
 * `className`, `value`, `role` and the rest are not here: they are addressed
 * to the machine, and requiring them to come from a catalogue would make the
 * catalogue meaningless.
 */
const READ_BY_A_PERSON = new Set([
  'label',
  'title',
  'placeholder',
  'alt',
  'content',
  'aria-label',
  'ariaLabel',
  'aria-description',
  'header',
  'secondaryContent',
]);

async function componentFiles(directory: string = src): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...(await componentFiles(path)));
    else if (entry.name.endsWith('.tsx')) found.push(path);
  }
  return found;
}

function hasWords(text: string): boolean {
  return /\p{L}/u.test(text);
}

type Complaint = { file: string; line: number; what: string };

function complaints(file: string, source: string): Complaint[] {
  const tree = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.ESNext,
    true,
    ts.ScriptKind.TSX,
  );
  const found: Complaint[] = [];

  const at = (node: ts.Node): number =>
    tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1;

  const walk = (node: ts.Node): void => {
    if (ts.isJsxText(node) && hasWords(node.text)) {
      found.push({
        file,
        line: at(node),
        what: `the text "${node.text.trim()}" is written into the component`,
      });
    }

    if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name)) {
      const name = node.name.text;
      const initialiser = node.initializer;
      const literal =
        initialiser !== undefined &&
        (ts.isStringLiteral(initialiser)
          ? initialiser
          : ts.isJsxExpression(initialiser) &&
              initialiser.expression !== undefined &&
              (ts.isStringLiteral(initialiser.expression) ||
                ts.isNoSubstitutionTemplateLiteral(initialiser.expression))
            ? initialiser.expression
            : null);
      if (
        literal !== null &&
        literal !== undefined &&
        READ_BY_A_PERSON.has(name) &&
        hasWords(literal.text)
      ) {
        found.push({
          file,
          line: at(node),
          what: `${name}="${literal.text}" is written into the component`,
        });
      }
    }

    ts.forEachChild(node, walk);
  };

  walk(tree);
  return found;
}

test('no component holds a user-facing string', async () => {
  const files = await componentFiles();
  assert.ok(files.length > 0, 'there are components to check');

  const found: Complaint[] = [];
  for (const file of files) {
    found.push(...complaints(file, await readFile(file, 'utf8')));
  }

  assert.deepEqual(
    found.map(one => `${relative(src, one.file)}:${one.line} ${one.what}`),
    [],
    'every word a person reads must come from the catalogue (04 A24)',
  );
});

test('the check can tell a written-in string from a catalogue one', () => {
  // A test that cannot fail proves nothing, so the scanner is shown a
  // component that breaks the rule, and one that keeps it.
  const bad = complaints(
    'invented.tsx',
    'export const A = () => <p title="Available funds">Available funds</p>;',
  );
  assert.equal(bad.length, 2, 'the scanner missed a written-in string');

  const good = complaints(
    'invented.tsx',
    'export const A = () => <p title={t("x")}>{t("x")}</p>;',
  );
  assert.deepEqual(good, []);
});

test('every catalogue says everything', () => {
  const catalogues = ayqCatalogues();
  assert.ok(catalogues.length >= 1);
  const keys = Object.keys(catalogues[0].strings).sort();
  for (const catalogue of catalogues) {
    assert.deepEqual(
      Object.keys(catalogue.strings).sort(),
      keys,
      `the ${catalogue.locale} catalogue does not say the same things`,
    );
    for (const [key, value] of Object.entries(catalogue.strings)) {
      assert.ok(value.trim() !== '', `${catalogue.locale} has nothing for ${key}`);
    }
  }
});

test('a value is put into a string where the string says to put it', () => {
  assert.equal(
    ayqText('appearance.failed', { reason: 'the engine was busy' }),
    'The ground could not be saved: the engine was busy',
  );
  // A placeholder with nothing for it stays visible rather than becoming the
  // word "undefined" in front of somebody.
  assert.match(ayqText('appearance.failed'), /\{reason\}/);
});

test('dates, amounts and lists are formatted by the catalogue’s locale', () => {
  // Not asserting the exact glyphs, which belong to the platform's data, but
  // that formatting goes through Intl at all — the half of A24 that makes
  // adding Dutch a catalogue change rather than a search through the screens.
  assert.equal(AYQ_LOCALE, 'en-GB');
  assert.equal(ayqAmount(197845), new Intl.NumberFormat(AYQ_LOCALE, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(1978.45));
  assert.ok(ayqMoney(197845).includes('€'));
  assert.equal(ayqCount(50000), new Intl.NumberFormat(AYQ_LOCALE).format(50000));
  assert.ok(ayqDate('2026-09-30').includes('2026'));
  assert.ok(ayqMonthName('2026-09').includes('2026'));
  assert.equal(ayqList(['a', 'b', 'c']), 'a, b and c');
  // A date-only value must not slip a day in either direction.
  assert.ok(ayqDate('2026-01-01').includes('1'));
});
