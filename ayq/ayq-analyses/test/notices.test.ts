// Third-party notices from the actual delivered set (06_RELEASE r004
// §3.11, §5.6–§5.7): the completeness gate. The real build is run into a
// scratch directory and what it writes is checked against the dependency set
// electron-builder packs and the code esbuild bundles.

import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApplication, type NoticeRecord } from '../build-lib.mjs';
// @ts-expect-error — plain JavaScript build helpers, no declarations.
import { noticeOf, productionPackages } from '../notices.mjs';


const ROOT = process.cwd();
const out = mkdtempSync(join(tmpdir(), 'ayq-notices-'));
const built: { bundled: string[]; notices: NoticeRecord } = await buildApplication(out);
const html = readFileSync(join(out, 'notices.html'), 'utf8');
const record = JSON.parse(readFileSync(join(out, 'notices.json'), 'utf8')) as NoticeRecord;
test.after(() => rmSync(out, { recursive: true, force: true }));

test('every packaged dependency has its notice, and nothing unpackaged is claimed', () => {
  const packaged = (productionPackages(ROOT) as Array<{ name: string; version: string }>).map(p => `${p.name}@${p.version}`).sort();
  const noticed = record.packages.map(p => `${p.name}@${p.version}`).sort();
  assert.deepEqual(noticed, packaged);
  assert.ok(noticed.length >= 90, `the packaged set is the whole production closure (${noticed.length})`);
  assert.ok(!noticed.some(n => n.startsWith('ayq-analyses@') || n.startsWith('electron@')), 'no first-party package and no devDependency is claimed');
  assert.deepEqual(record, built.notices);
});

test('everything bundled into dist/ comes from a packaged dependency', () => {
  const names = new Set(record.packages.map(p => p.name));
  assert.ok(built.bundled.length > 10);
  for (const name of built.bundled) assert.ok(names.has(name), `${name} is bundled but not a packaged dependency`);
  for (const expected of ['react', 'react-dom', 'echarts', 'zrender', '@fluentui/react-components']) {
    assert.ok(built.bundled.includes(expected), `${expected} is in the bundle`);
  }
});

test('each notice carries licence text: the package\'s own files, or its declared licence\'s standard text', () => {
  for (const p of record.packages) {
    assert.ok(p.licence !== null && p.licence !== '', `${p.name} declares a licence`);
    assert.match(p.sha256, /^[0-9a-f]{64}$/);
    if (p.source === 'file') assert.ok(p.files.length > 0, `${p.name} names its licence files`);
    else assert.equal(p.licence, 'MIT', `${p.name} uses a standard text only for a licence this build carries`);
  }
  const standard = record.packages.filter(p => p.source === 'standard').map(p => p.name).sort();
  assert.deepEqual(standard, ['@fluentui/react-icons', 'embla-carousel', 'embla-carousel-autoplay', 'embla-carousel-fade']);
});

test('the page shows every component with its licence, Electron\'s licence and the way to the Chromium notices', () => {
  for (const p of record.packages) assert.ok(html.includes(`<h3>${p.name} ${p.version} — ${p.licence}</h3>`), p.name);
  const electronLicence = readFileSync(join(ROOT, 'node_modules', 'electron', 'dist', 'LICENSE'), 'utf8').trim();
  assert.equal(record.electron.licenceSha256, createHash('sha256').update(electronLicence).digest('hex'));
  assert.ok(html.includes('Copyright (c) Electron contributors') || html.includes('Electron contributors'));
  const chromium = readFileSync(join(ROOT, 'node_modules', 'electron', 'dist', 'LICENSES.chromium.html'));
  assert.equal(record.chromium.sha256, createHash('sha256').update(chromium).digest('hex'));
  assert.match(html, /<a href="chromium-notices\.html">Open the Chromium licences<\/a>/);
  // A read-only page: no script, and a policy that forbids one.
  assert.doesNotMatch(html, /<script/i);
  assert.match(html, /Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"/);
  assert.match(html, /<title>Third-party licenses \/ Notices<\/title>/);
});

test('a package with no licence file and no standard text here stops the build: missing notices block delivery', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ayq-notice-case-'));
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'invented-package', version: '1.0.0', license: 'LicenseRef-Invented' }));
    assert.throws(
      () => noticeOf({ dir, name: 'invented-package', version: '1.0.0', manifest: { license: 'LicenseRef-Invented' } }),
      /delivery blocker/,
    );
    writeFileSync(join(dir, 'LICENSE'), 'Invented licence text.');
    assert.equal(noticeOf({ dir, name: 'invented-package', version: '1.0.0', manifest: { license: 'LicenseRef-Invented' } }).source, 'file');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
