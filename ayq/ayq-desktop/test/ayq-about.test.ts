// What About says, and — more to the point — what the copy button may carry.
//
// 12 §12.4 is a privacy contract, and a contract nobody checks is a comment.
// The test below reads the string the engine actually composes and requires the
// safe fields to be in it and the forbidden ones not to be. It is written
// against a deliberately hostile fixture: the version, the SHA and the
// architecture are surrounded by a budget name, a Windows path, an IBAN, a
// counterparty, a category and a balance, and none of them may come out the
// other side.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  AYQ_ACTUAL_BASELINE,
  AYQ_AUTHOR,
  AYQ_COPYRIGHT,
  AYQ_PRODUCT_NAME,
  ayqAbout,
  ayqTechnicalInformation,
} from '../src/ayq-about.ts';

function about() {
  return ayqAbout({
    engineVersion: '26.9.0',
    electronVersion: '43.4.0',
    nodeVersion: '22.22.2',
    repositoryUrl: 'git+https://github.com/alxvpl/AYQ.git',
  });
}

test('About states the product, the author and the copyright exactly', () => {
  const said = about();
  assert.equal(said.productName, 'AYQ Personal Finances');
  assert.equal(said.productName, AYQ_PRODUCT_NAME);
  assert.equal(said.tagline, 'Local-first personal finance application for Windows');
  assert.equal(said.author, 'Plamen Alexandrov');
  assert.equal(said.author, AYQ_AUTHOR);
  // 01 §6.1 / 06 §3.6, word for word.
  assert.equal(said.copyright, '\u00a9 2026 Plamen Alexandrov. All rights reserved.');
  assert.equal(said.copyright, AYQ_COPYRIGHT);
});

test('the engine version and the baseline are the real ones', () => {
  const said = about();
  assert.equal(said.engine, 'Actual Budget 26.9.0');
  assert.equal(said.actualBaseline, 'db1b0ea9');
  assert.equal(said.actualBaseline, AYQ_ACTUAL_BASELINE);
});

test('a build with no stamp says so rather than looking like a release', () => {
  // Running the TypeScript directly never goes through esbuild, so there is no
  // compiled-in stamp and this *is* the unbuilt case. A packaged build carries
  // real values; the Windows workflow is what proves that, because it is the
  // only place a packaged build exists.
  const said = about();
  assert.equal(said.development, true);
  assert.equal(said.revision, null);
  assert.equal(said.buildDate, 'unbuilt');
  assert.equal(said.productVersion, '0.0.0-dev');
});

test('only links that are really declared are offered', () => {
  assert.deepEqual(
    ayqAbout({
      engineVersion: '26.9.0',
      electronVersion: null,
      nodeVersion: '22.22.2',
      repositoryUrl: null,
    }).links,
    [],
    'a link was invented for a manifest that declares none',
  );

  // The one the manifest declares, with git's own prefix and suffix off.
  assert.deepEqual(about().links, [
    { kind: 'repository', url: 'https://github.com/alxvpl/AYQ' },
  ]);

  // Anything that is not an https URL is not a link.
  assert.deepEqual(
    ayqAbout({
      engineVersion: '26.9.0',
      electronVersion: null,
      nodeVersion: '22.22.2',
      repositoryUrl: 'git@github.com:alxvpl/AYQ.git',
    }).links,
    [],
  );
});

test('the copied text carries every safe field (12 §12.4)', () => {
  const said = about();
  const copied = said.technicalInformation;

  for (const wanted of [
    said.productName,
    said.productVersion,
    said.buildNumber,
    said.buildDate,
    said.architecture,
    said.engine,
    said.actualBaseline,
    '43.4.0',
    '22.22.2',
  ]) {
    assert.ok(
      copied.includes(wanted),
      `the copied text left out ${wanted}, which a person reporting a fault needs`,
    );
  }

  // It is exactly what the engine composed, and the composer is one function.
  assert.equal(copied, ayqTechnicalInformation(said));
});

test('the copied text carries nothing about the money (12 §12.4)', () => {
  // A hostile About: every forbidden kind of value, placed in a field that
  // does reach the clipboard, so that a leak would have to be visible here.
  const hostile = {
    ...about(),
    productVersion: '0.2.0',
    revision: 'e93c77e546791439a85e0ef29fc2c7e9cfb1e2d9',
    architecture: 'Windows x64',
    buildNumber: '005',
    buildDate: '2026-09-16T09:00:00Z',
  };
  const copied = ayqTechnicalInformation(hostile);

  const forbidden: Array<[string, string]> = [
    ['a budget name', 'My Household Budget'],
    ['a filesystem path', 'C:\\Users\\plamen\\AppData\\Roaming\\AYQ'],
    ['a data directory', '/home/someone/.ayq'],
    ['an account id', '9f2c1f7a-4b6e-4f2a-9c1d-2b7e5a0d3f11'],
    ['an IBAN fragment', 'NL91ABNA0417164300'],
    ['a masked IBAN', 'AYQ NL\u20263579'],
    ['a machine name', 'DESKTOP-4K2L9QX'],
    ['a user name', 'plamen'],
    ['a counterparty', 'TESTMARKT'],
    ['a category', 'Groceries'],
    ['a rule', 'TESTMARKT -> Groceries'],
    ['a balance', '128450'],
    ['an amount in euro', '1284.50'],
  ];

  for (const [what, value] of forbidden) {
    assert.ok(
      !copied.includes(value),
      `the copied text carries ${what}, which 12 §12.4 forbids`,
    );
  }

  // And the shape is a fixed list of labelled lines, so a new field cannot
  // arrive by accident: it has to be added to `ayqTechnicalInformation`.
  const labels = copied
    .split('\n')
    .map(line => line.split(':')[0].trim())
    .filter(one => one !== '');
  assert.deepEqual(labels, [
    'Product',
    'Version',
    'Build',
    'Build date',
    'Architecture',
    'AYQ revision',
    'Engine',
    'Actual baseline',
    'Electron',
    'Node',
  ]);
});

test('a build with no revision copies a phrase, not an empty field', () => {
  const copied = about().technicalInformation;
  assert.match(copied, /AYQ revision\s*: not a release build/);
});

test('the copied text carries the exact build timestamp and the full revision (06 §3.7)', () => {
  // A stamped build, as the packaged application has one: the screen may
  // shorten these, the copy may not.
  const sha = 'e93c77e546791439a85e0ef29fc2c7e9cfb1e2d9';
  const copied = ayqTechnicalInformation({
    ...about(),
    revision: sha,
    buildDate: '2026-09-16T09:00:00Z',
  });
  assert.match(copied, /^AYQ revision\s*: e93c77e546791439a85e0ef29fc2c7e9cfb1e2d9$/m);
  assert.match(copied, /^Build date\s*: 2026-09-16T09:00:00Z$/m);
});

test('About answers facts, and no sentence a person reads (04 A24)', () => {
  // The licence notes, the local-first note and a link's name are words on a
  // screen, and words live in the client's catalogue so that a second
  // language never has to touch the engine. Composing them here is the class
  // of bypass this guards: the answer is a fixed set of fields, none of which
  // is prose.
  const said = about();
  assert.deepEqual(Object.keys(said).sort(), [
    'actualBaseline',
    'architecture',
    'author',
    'buildDate',
    'buildNumber',
    'copyright',
    'development',
    'electronVersion',
    'engine',
    'links',
    'nodeVersion',
    'productName',
    'productVersion',
    'revision',
    'tagline',
    'technicalInformation',
  ]);
  for (const [field, value] of Object.entries(said)) {
    if (typeof value !== 'string' || field === 'copyright') continue;
    // A sentence: words, a space, and a full stop at the end. The copyright
    // notice is the one fixed legal string 06 §3.6 spells out.
    assert.ok(
      !/\p{L}+ \p{L}+.*\.$/su.test(value),
      `About's ${field} is a sentence composed by the engine: ${value}`,
    );
  }
  for (const link of said.links) {
    assert.deepEqual(Object.keys(link).sort(), ['kind', 'url'], 'a link carries a label');
  }
});

test('the AYQ packages are not MIT, and Actual Budget keeps its MIT notice (06 §9)', () => {
  const here = new URL('.', import.meta.url);
  const read = (relative: string) => readFileSync(new URL(relative, here), 'utf8');
  for (const name of [
    'ayq-actual-bridge',
    'ayq-camt',
    'ayq-client',
    'ayq-desktop',
    'ayq-screen',
  ]) {
    const manifest = JSON.parse(read(`../../${name}/package.json`)) as {
      license?: string;
      private?: boolean;
    };
    assert.equal(manifest.license, 'UNLICENSED', `${name} declares ${manifest.license}`);
    const lock = JSON.parse(read(`../../${name}/package-lock.json`)) as {
      packages: Record<string, { license?: string }>;
    };
    assert.equal(
      lock.packages[''].license,
      'UNLICENSED',
      `${name}'s lockfile still describes it as ${lock.packages[''].license}`,
    );
  }

  // The installer carries Actual Budget's own MIT notice, unaltered, beside
  // the application — the notice About says ships with it.
  const desktop = JSON.parse(read('../package.json')) as {
    build: { copyright: string; extraResources?: Array<{ from: string; to: string }> };
  };
  assert.equal(desktop.build.copyright, '\u00a9 2026 Plamen Alexandrov. All rights reserved.');
  const shipped = (desktop.build.extraResources ?? []).find(one =>
    one.to.startsWith('licenses/'),
  );
  assert.ok(shipped, 'the installer ships no licence notice for Actual Budget');
  const notice = read(`../${shipped.from}`);
  assert.match(notice, /^Copyright James Long/);
  assert.match(notice, /Permission is hereby granted, free of charge/);
});
