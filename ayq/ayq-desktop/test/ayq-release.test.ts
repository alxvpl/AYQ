// Release identity (06_RELEASE r005 §3): one canonical metadata source —
// package.json "version" and "ayq.build" — and the installer's file name
// derived from it.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { ayqRelease, releaseIdentity } from '../ayq-release.mjs';

const here = new URL('..', import.meta.url);
const manifest = JSON.parse(
  readFileSync(new URL('package.json', here), 'utf8'),
) as {
  productName: string;
  version: string;
  ayq: { build: string };
  scripts: Record<string, string>;
  build: { win: Record<string, unknown> };
};

const base = { productName: 'AYQ', version: '0.4.1', ayq: { build: '013' } };

test('the manifest is the release: AYQ Personal Finances 0.4.1 (Build 013)', () => {
  assert.deepEqual(ayqRelease(), {
    product: 'AYQ Personal Finances',
    version: '0.4.1',
    build: '013',
    identification: 'AYQ Personal Finances 0.4.1 (Build 013)',
    fileName: 'AYQ-0.4.1-b013.exe',
  });
});

test('the file name is exactly <product>-<semver>-bNNN.exe, with nothing else in it (06 §3.5)', () => {
  const { fileName } = ayqRelease();
  assert.match(
    fileName,
    /^AYQ-(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-b\d{3}\.exe$/,
  );
  assert.doesNotMatch(fileName, /windows|x64|setup|build-|[0-9a-f]{7,}|\s/i);
  assert.equal(
    releaseIdentity({ ...base, version: '1.10.2', ayq: { build: '009' } })
      .fileName,
    'AYQ-1.10.2-b009.exe',
  );
});

test('the build is always three digits and the version SemVer; anything else is refused', () => {
  for (const build of ['1', '01', '0001', '01a', '', ' 013', 13]) {
    assert.throws(
      () => releaseIdentity({ ...base, ayq: { build } }),
      /three digits/,
      JSON.stringify(build),
    );
  }
  assert.throws(() => releaseIdentity({ productName: 'AYQ', version: '0.4.1' }), /three digits/);
  for (const version of ['0.4', '0.4.1.13', 'v0.4.1', '0.04.1', '0.4.1-beta']) {
    assert.throws(() => releaseIdentity({ ...base, version }), /SemVer/, version);
  }
});

test('no second source: the build config names no artifact and packaging takes the name from ayq-release.mjs', () => {
  assert.equal('artifactName' in manifest.build.win, false);
  assert.equal(
    manifest.scripts.package,
    'npm run build && npm run icon && node package.mjs',
  );
  const packaging = readFileSync(new URL('package.mjs', here), 'utf8');
  assert.match(packaging, /import \{ ayqRelease \} from '\.\/ayq-release\.mjs'/);
  assert.match(packaging, /artifactName: release\.fileName/);
  // One build number is packaged once (06 §3.6).
  assert.match(packaging, /if \(existsSync\(join\(out, release\.fileName\)\)\)/);
  // Nothing that packages or stamps the build writes the version or build.
  for (const file of ['package.mjs', 'ayq-release.mjs', 'ayq-build-info.mjs', 'build.mjs']) {
    const text = readFileSync(new URL(file, here), 'utf8');
    assert.doesNotMatch(
      text,
      /\b0\.4\.1\b|\bb0\d\d\b|Build 0\d\d|['"]0\d\d['"]/,
      `${file} writes the version or build by hand`,
    );
  }
});

test('the Windows workflow checks and uploads the exact manifest-derived installer, not the old *-setup.exe naming', () => {
  const workflow = readFileSync(
    new URL('../../.github/workflows/ayq-desktop-windows.yml', here),
    'utf8',
  );
  assert.doesNotMatch(workflow, /-setup\.exe|build-\(\\d\{3\}\)/);
  assert.match(workflow, /\$\{\{ steps\.delivery\.outputs\.file \}\}/);
});
