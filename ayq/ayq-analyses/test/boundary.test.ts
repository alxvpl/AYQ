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

test('the preload surface is five bounded capabilities and nothing else', () => {
  const exposed = [...preload.matchAll(/ipcRenderer\.invoke\('([^']+)'\)/g)].map(match => match[1]);
  assert.deepEqual(exposed.sort(), [
    'analyses:active-snapshot',
    'analyses:open-notices',
    'analyses:open-snapshot',
    'analyses:presentation-context',
    'analyses:remove-snapshot',
  ]);
  assert.ok(!preload.includes('node:fs'));
  assert.ok(!preload.includes('require('));
  // What crosses is the validated snapshot and a display name — never a path.
  assert.ok(!/path/i.test(withoutComments(preload)), 'no path crosses the preload boundary');
});

test('the notices window is read-only: sandboxed, no preload, no script, no way out but the Chromium notices', () => {
  const start = mainCode.indexOf('function openNotices(');
  const body = mainCode.slice(start, mainCode.indexOf('\n}\n', start));
  assert.ok(start > 0, 'openNotices exists');
  assert.match(body, /contextIsolation: true/);
  assert.match(body, /nodeIntegration: false/);
  assert.match(body, /sandbox: true/);
  assert.match(body, /javascript: false/);
  assert.doesNotMatch(body, /preload/);
  assert.match(body, /setWindowOpenHandler\(\(\) => \(\{ action: 'deny' \}\)\)/);
  // Every navigation is stopped; the one link opens Electron's own Chromium notices file.
  assert.match(body, /'will-navigate', \(event, url\) => \{\s*event\.preventDefault\(\);/);
  assert.match(body, /LICENSES\.chromium\.html/);
  assert.match(body, /loadFile\(join\(here, 'notices\.html'\)\)/);
  assert.doesNotMatch(body, /loadURL|shell\.openExternal/);
  // The notices window takes no argument from the renderer: the channel only opens it.
  assert.match(mainCode, /ipcMain\.handle\(CHANNEL_NOTICES, \(\) => \{\s*openNotices\(\);\s*\}\)/);
});

test('the renderer reaches no filesystem and no path', () => {
  for (const forbidden of ['node:fs', 'readFile', 'writeFile', 'filePath', 'archiveDirectory', 'getPath', 'userData', 'readdir']) {
    assert.ok(!renderer.includes(forbidden), `${forbidden} must not be in the renderer`);
  }
  for (const path of componentFiles()) {
    const source = readFileSync(path, 'utf8');
    for (const forbidden of ['filePath', 'getPath', 'userData', 'node:fs']) {
      assert.ok(!source.includes(forbidden), `${forbidden} must not be in ${path}`);
    }
  }
});

test('the launch reads the one active copy through the validator, and nothing else is remembered (r002 §6.1)', () => {
  // The owner's decision: what he loads stays loaded. The main process reads
  // its own copy at startup and revalidates it; the renderer asks for it and
  // begins on it. No listing, no archive, no history — one copy, by a fixed
  // name, under the application's own per-user directory.
  const activeSnapshot = withoutComments(readFileSync(join(SOURCE, 'active-snapshot.ts'), 'utf8'));
  assert.match(mainCode, /readActiveSnapshot\(activeDirectory\(\)\)/);
  assert.match(mainCode, /app\.getPath\('userData'\)/);
  assert.deepEqual([...mainCode.matchAll(/getPath\('([^']+)'\)/g)].map(m => m[1]), ['userData']);
  assert.match(activeSnapshot, /parseAndValidateSnapshot\(/);
  assert.match(renderer, /useState<LoadState>\(\{ kind: 'pending' \}\)/);
  assert.match(renderer, /window\.ayqAnalyses\.activeSnapshot\(\)/);
  for (const forbidden of ['readdir', 'listSnapshots', 'archive', 'history']) {
    assert.ok(!mainCode.includes(forbidden), `${forbidden} must not be in the main process`);
    assert.ok(!activeSnapshot.includes(forbidden), `${forbidden} must not be in active-snapshot.ts`);
  }
  // No analytical context persists: the default context at every adoption.
  assert.match(renderer, /setContext\(transition\.load\.kind === 'loaded' \? defaultContext\(transition\.load\.snapshot\) : null\)/);
  for (const forbidden of ['localStorage', 'sessionStorage', 'indexedDB']) {
    assert.ok(!renderer.includes(forbidden), `${forbidden} must not be in the renderer`);
  }
});

test('every load and removal outcome reaches the screen through the one transition the suite proves (r003 §6.3, §11.5, §11.6)', () => {
  // The renderer applies load-state.ts and decides nothing of its own.
  assert.match(renderer, /apply\(applyLoadOutcome\(load, result\)\)/);
  assert.match(renderer, /apply\(applyRemovalOutcome\(load, await window\.ayqAnalyses\.removeSnapshot\(\)\)\)/);
  assert.ok(!renderer.includes("kind: 'candidateRefused'"), 'the renderer does not restate a transition');
  // A refused active copy never becomes a result.
  assert.match(renderer, /const snapshot = load\.kind === 'loaded' \? load\.snapshot : null/);
  // What is said over the surface is a catalogue sentence or the refused family, never a system error.
  const notice = renderer.slice(renderer.indexOf('function NoticeDialog'), renderer.indexOf('function NotInThisVersion'));
  assert.match(notice, /t\(notice\.key\)/);
  assert.match(notice, /t\(reasonKey\(notice\.reason\)\)/);
  assert.ok(!/error\.message|\.code\b/.test(notice));
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

test('A1 and A2 Stage 1 carry no adjacent increment', () => {
  // Fixed costs › Expected now is authorised by A2 P2 and lives in its own
  // module (fixed-costs.ts); the A1 engine and the renderer still read no
  // expectation, plan or forecast section, and no later increment exists.
  const names = readdirSync(SOURCE).concat(readdirSync(join(SOURCE, 'ui')));
  for (const forbidden of ['statements.ts', 'forecast.ts', 'saved.ts', 'paid-history.ts']) {
    assert.ok(!names.includes(forbidden), `${forbidden} belongs to a later increment`);
  }
  for (const path of [join(SOURCE, 'engine.ts'), join(SOURCE, 'renderer.tsx')]) {
    const source = withoutComments(readFileSync(path, 'utf8'));
    for (const forbidden of ['expectationRecords', 'expectedOccurrences', 'categoryPlans', 'forecast', 'backtest']) {
      assert.ok(!source.includes(forbidden), `${path}: ${forbidden} is out of scope for A1`);
    }
  }
});
