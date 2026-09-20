// The boundaries A1 must not weaken, asserted against the source that ships.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE = join(process.cwd(), 'src');
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const main = readFileSync(join(SOURCE, 'main.ts'), 'utf8');
const mainCode = withoutComments(main);
const preload = readFileSync(join(SOURCE, 'preload.ts'), 'utf8');
const renderer = readFileSync(join(SOURCE, 'renderer.tsx'), 'utf8');

test('the Electron security baseline is intact', () => {
  assert.match(main, /contextIsolation:\s*true/);
  // No application menu (PC1), and the sandbox is not loosened to remove it.
  assert.match(mainCode, /Menu\.setApplicationMenu\(null\)/);
  assert.match(main, /nodeIntegration:\s*false/);
  assert.match(main, /sandbox:\s*true/);
  assert.match(main, /setWindowOpenHandler\(\(\) => \(\{ action: 'deny' \}\)\)/);
  assert.match(main, /will-navigate/);
});

test('the preload surface is two read-only capabilities and nothing else', () => {
  const exposed = [...preload.matchAll(/ipcRenderer\.invoke\('([^']+)'\)/g)].map(match => match[1]);
    assert.deepEqual(exposed.sort(), ['analyses:open-snapshot', 'analyses:presentation-context']);
  assert.ok(!preload.includes('node:fs'));
  assert.ok(!preload.includes('require('));
});

test('the renderer reaches no filesystem and no path', () => {
  for (const forbidden of ['node:fs', 'readFile', 'writeFile', 'filePath', 'archiveDirectory']) {
    assert.ok(!renderer.includes(forbidden), `${forbidden} must not be in the renderer`);
  }
});

test('every launch begins unloaded: no archive is read at startup', () => {
  // D2/009 §3: the active snapshot is session state. Nothing restores it, and
  // A1 keeps no archive at all.
  assert.match(renderer, /useState<LoadState>\(\{ kind: 'none' \}\)/);
  for (const forbidden of ['readdir', 'listSnapshots', 'getPath', 'archive']) {
    assert.ok(!mainCode.includes(forbidden), `${forbidden} must not be in the main process`);
  }
});

test('a refused replacement leaves no previous result beside it', () => {
  const branch = renderer.slice(renderer.indexOf("result.status === 'invalid'"));
  assert.match(branch, /setLoad\(\{ kind: 'invalid'/);
  assert.match(branch, /setContext\(null\)/);
});

function componentFiles(): string[] {
  const found = [join(SOURCE, 'renderer.tsx')];
  for (const entry of readdirSync(join(SOURCE, 'ui'))) found.push(join(SOURCE, 'ui', entry));
  return found;
}

test('no user-facing literal lives in a component', () => {
  const textNode = />\s*[A-Za-z][A-Za-z ,.'’-]{3,}\s*</g;
  for (const path of componentFiles()) {
    const source = readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const matches = [...source.matchAll(textNode)].map(match => match[0]);
    assert.deepEqual(matches, [], `${path} carries interface text outside the catalogue`);
  }
});

test('no punctuation-bearing composition lives in a component (PC5)', () => {
  // A separator between two values is part of a displayed string and belongs
  // in the catalogue: neither a template literal that joins values with a
  // separator nor a JSX string expression carrying one may appear.
  const composedTemplate = /`[^`]*\$\{[^`]*[·—–:][^`]*`/g;
  const jsxSeparator = /\{\s*'[^']*[·—–:,][^']*'\s*\}/g;
  for (const path of componentFiles()) {
    const source = readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const found = [...source.matchAll(composedTemplate), ...source.matchAll(jsxSeparator)].map(match => match[0]);
    assert.deepEqual(found, [], `${path} composes interface text outside the catalogue`);
  }
});

test('A1 carries no adjacent increment', () => {
  const names = readdirSync(SOURCE).concat(readdirSync(join(SOURCE, 'ui')));
  for (const forbidden of ['statements.ts', 'forecast.ts', 'fixed-costs.ts', 'saved.ts']) {
    assert.ok(!names.includes(forbidden), `${forbidden} belongs to a later increment`);
  }
  for (const path of [join(SOURCE, 'engine.ts'), join(SOURCE, 'renderer.tsx')]) {
    const source = withoutComments(readFileSync(path, 'utf8'));
    for (const forbidden of ['expectationRecords', 'expectedOccurrences', 'categoryPlans', 'forecast', 'backtest']) {
      assert.ok(!source.includes(forbidden), `${path}: ${forbidden} is out of scope for A1`);
    }
  }
});
