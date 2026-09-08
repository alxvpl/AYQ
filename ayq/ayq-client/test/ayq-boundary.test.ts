// The boundary, enforced rather than promised.
//
// `ayq-client` must not reach the engine except through the contract. That is
// easy to state and easy to violate by accident six months from now, so it is
// a test: the renderer's sources and its built bundle are read and checked for
// any way out.

import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { transform } from 'esbuild';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..', 'src');
const dist = join(here, '..', 'dist');

/** Anything that would put engine or host code inside the renderer. */
const FORBIDDEN = [
  '@actual-app/api',
  '@actual-app/core',
  'loot-core',
  'better-sqlite3',
  'electron',
  'node:',
];

async function sourceFiles(): Promise<string[]> {
  const names = await readdir(src);
  return names.filter(name => name.endsWith('.ts')).map(name => join(src, name));
}

/** Every static import or dynamic import specifier in a source file. */
function specifiers(source: string): string[] {
  const found: string[] = [];
  const patterns = [
    /\bfrom\s+['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) found.push(match[1]);
  }
  return found;
}

test('the renderer imports nothing but its own sources', async () => {
  const files = await sourceFiles();
  assert.ok(files.length >= 3, 'the renderer has sources to check');

  for (const file of files) {
    const source = await readFile(file, 'utf8');
    for (const specifier of specifiers(source)) {
      assert.ok(
        specifier.startsWith('./') || specifier.startsWith('../'),
        `${file} imports ${specifier}; the renderer may only import its own files`,
      );
      assert.ok(
        !specifier.includes('..'),
        `${file} imports ${specifier}; the renderer may not reach outside its package`,
      );
    }
  }
});

test('no engine or host module is named anywhere in the renderer', async () => {
  for (const file of await sourceFiles()) {
    const source = await readFile(file, 'utf8');
    for (const specifier of specifiers(source)) {
      for (const banned of FORBIDDEN) {
        assert.ok(
          !specifier.includes(banned),
          `${file} pulls in ${banned}`,
        );
      }
    }
  }
});

test('the contract file has no imports at all', async () => {
  const source = await readFile(join(src, 'ayq-ipc-contract.ts'), 'utf8');
  assert.deepEqual(
    specifiers(source),
    [],
    'the contract is shared by both sides and must stay free of dependencies',
  );
});

test('the built bundle carries no engine or host code', async () => {
  const source = await readFile(join(dist, 'ayq-client.js'), 'utf8');
  // Comments are stripped first: this file's own prose names the modules it
  // forbids, and a check that cannot tell prose from a reference is worthless.
  const { code: bundle } = await transform(source, {
    minifyWhitespace: true,
    legalComments: 'none',
  });

  // The renderer is allowed to *name* the engine — it displays which version
  // answered — so the check is for the engine having been pulled in, not for
  // the string appearing. If `@actual-app/api` were bundled, its surface would
  // be here; none of these identifiers exist anywhere in the renderer.
  for (const banned of [
    'loot-core',
    'better-sqlite3',
    'aqlQuery',
    'runImport',
    'loadBudget',
    'importTransactions',
    'getAccountBalance',
  ]) {
    assert.ok(!bundle.includes(banned), `the bundle contains ${banned}`);
  }

  // Nothing external survived as an import either: the renderer is one bundle,
  // so there should be no import statement in it at all. The check reads the
  // unminified source and anchors to the start of a line, because esbuild puts
  // any surviving import there — and because "Imported from" is a perfectly
  // good column heading that a looser check would flag.
  const statements = [...source.matchAll(/^\s*import\b[^\n]*/gm)].map(match =>
    match[0].trim(),
  );
  assert.deepEqual(
    statements,
    [],
    'the bundle still imports something from outside itself',
  );
  // `require` and `process` would mean Node crept into a renderer that has
  // neither at runtime.
  assert.ok(!/\brequire\s*\(/.test(bundle), 'the bundle calls require()');
  assert.ok(
    !/\bprocess\.(env|version|platform)\b/.test(bundle),
    'the bundle reads process',
  );

  // And the one door it is allowed is present.
  assert.ok(bundle.includes('window.ayq'), 'the bundle uses the bridge');
});
