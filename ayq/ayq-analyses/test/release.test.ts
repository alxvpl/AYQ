// Release identity (06_RELEASE r004 §3; owner release standard 045): one
// canonical metadata source — package.json "version" and "ayq.build" — and
// everything else derived from it.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { RELEASE, releaseIdentity, type ReleaseManifest } from '../src/release.js';

const ROOT = process.cwd();
const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as ReleaseManifest & {
  name: string;
  build: { win: Record<string, unknown>; nsis: Record<string, unknown> };
  scripts: Record<string, string>;
};

const base: ReleaseManifest = { productName: 'AYQ Analyses', version: '0.2.0', author: 'Plamen Alexandrov', license: 'UNLICENSED', ayq: { build: '001' } };

test('the manifest is the release: AYQ Analyses 0.2.0 (Build 001), proprietary, by Plamen Alexandrov', () => {
  assert.equal(manifest.version, '0.2.0');
  assert.equal(manifest.ayq.build, '001');
  assert.equal(manifest.license, 'UNLICENSED');
  assert.equal(manifest.author, 'Plamen Alexandrov');
  assert.deepEqual(RELEASE, {
    product: 'AYQ Analyses',
    version: '0.2.0',
    build: '001',
    identification: 'AYQ Analyses 0.2.0 (Build 001)',
    fileName: 'AYQ-Analyses-0.2.0-b001.exe',
    fileVersion: '0.2.0.1',
    author: 'Plamen Alexandrov',
    license: 'UNLICENSED',
  });
});

test('the file name is exactly <product>-<semver>-bNNN.exe, with nothing else in it (06 §3.5)', () => {
  assert.match(RELEASE.fileName, /^AYQ-Analyses-(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-b\d{3}\.exe$/);
  assert.doesNotMatch(RELEASE.fileName, /windows|x64|setup|[0-9a-f]{7,}|\s/i);
  assert.equal(releaseIdentity({ ...base, version: '1.10.2', ayq: { build: '009' } }).fileName, 'AYQ-Analyses-1.10.2-b009.exe');
});

test('the build is always three digits; anything else is refused (06 §3.1)', () => {
  for (const build of ['001', '009', '010', '999']) assert.equal(releaseIdentity({ ...base, ayq: { build } }).build, build);
  assert.equal(releaseIdentity({ ...base, ayq: { build: '010' } }).identification, 'AYQ Analyses 0.2.0 (Build 010)');
  assert.equal(releaseIdentity({ ...base, ayq: { build: '010' } }).fileVersion, '0.2.0.10');
  for (const build of ['1', '01', '0001', '01a', '', ' 001']) {
    assert.throws(() => releaseIdentity({ ...base, ayq: { build } }), /three digits/, JSON.stringify(build));
  }
  assert.throws(() => releaseIdentity({ ...base, ayq: undefined as unknown as { build: string } }), /three digits/);
});

test('the version is SemVer and the first-party licence is never MIT (06 §2.1, §9.2)', () => {
  for (const version of ['0.2', '0.2.0.1', 'v0.2.0', '0.02.0', '0.2.0-beta']) {
    assert.throws(() => releaseIdentity({ ...base, version }), /SemVer/, version);
  }
  assert.throws(() => releaseIdentity({ ...base, license: 'MIT' }), /UNLICENSED/);
});

test('no second source: no version, build or release name is written by hand anywhere that ships or packages', () => {
  // The one place is package.json. The build config names no artifact; the
  // packaging script takes the name, display name and file version from release.ts.
  assert.equal('artifactName' in manifest.build.win, false);
  assert.equal('uninstallDisplayName' in manifest.build.nsis, false);
  assert.equal(manifest.scripts.package, 'npm run build && node package.mjs');
  const packaging = readFileSync(join(ROOT, 'package.mjs'), 'utf8');
  assert.match(packaging, /releaseIdentity\(manifest\)/);
  assert.match(packaging, /artifactName: release\.fileName/);
  assert.match(packaging, /buildVersion: release\.fileVersion/);
  assert.match(packaging, /uninstallDisplayName: release\.identification/);

  const sources: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.(ts|tsx|mjs|json|css|html)$/.test(entry.name)) sources.push(path);
    }
  };
  walk(join(ROOT, 'src'));
  for (const file of ['package.mjs', 'build.mjs', 'build-lib.mjs', 'notices.mjs']) sources.push(join(ROOT, file));
  for (const path of sources) {
    const text = readFileSync(path, 'utf8');
    assert.doesNotMatch(text, /\b0\.2\.0\b|\bb001\b|Build 001|['"]001['"]/, `${path} writes the version or build by hand`);
  }
  // The lockfile's root record follows the manifest (npm's copy, not a source).
  const lock = JSON.parse(readFileSync(join(ROOT, 'package-lock.json'), 'utf8')) as { version: string; packages: Record<string, { version: string }> };
  assert.equal(lock.version, manifest.version);
  assert.equal(lock.packages[''].version, manifest.version);
});

test('the renderer and the main process take the identity from release.ts, which reads package.json', () => {
  const release = readFileSync(join(ROOT, 'src', 'release.ts'), 'utf8');
  assert.match(release, /import manifest from '\.\.\/package\.json' with \{ type: 'json' \}/);
  assert.match(release, /export const RELEASE: ReleaseIdentity = releaseIdentity\(manifest\)/);
  assert.match(readFileSync(join(ROOT, 'src', 'ui', 'settings.tsx'), 'utf8'), /import \{ RELEASE, type ReleaseIdentity \} from '\.\.\/release\.js'/);
});
