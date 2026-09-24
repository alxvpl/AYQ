// AYQ Analyses — the Windows installer (06_RELEASE r004 §3).
//
// The release name, the installer's display name and the Windows file
// version all come from release.ts, which reads them from package.json — the
// one canonical release-metadata source. Nothing here writes a version or a
// build by hand. After electron-builder has run, the result is checked
// before anyone may call it a candidate:
// - exactly one installer, named exactly <product>-<semver>-bNNN.exe;
// - the node_modules packed into app.asar are exactly the set whose notices
//   dist/notices.json carries (notices.mjs);
// - the packed package.json carries the same version and build.
// Any difference stops the packaging with an error.

import { Arch, Platform, build } from 'electron-builder';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import manifest from './package.json' with { type: 'json' };
import { releaseIdentity } from './src/release.ts';

const require = createRequire(import.meta.url);
const asar = require('@electron/asar');
const release = releaseIdentity(manifest);

const config = {
  ...manifest.build,
  // The one exact release file name (06 §3.5), from the manifest.
  artifactName: release.fileName,
  // The executable's FileVersion: the SemVer with the build as its fourth part.
  buildVersion: release.fileVersion,
  nsis: { ...manifest.build.nsis, uninstallDisplayName: release.identification },
};

await build({ targets: Platform.WINDOWS.createTarget(['nsis'], Arch.x64), config, publish: 'never' });

const out = join(process.cwd(), manifest.build.directories.output);
const installers = readdirSync(out).filter(name => name.endsWith('.exe') && !name.includes('__uninstaller'));
if (installers.length !== 1 || installers[0] !== release.fileName) {
  throw new Error(`expected exactly ${release.fileName} in ${out}, found ${installers.join(', ') || 'nothing'}`);
}

const archive = join(out, 'win-unpacked', 'resources', 'app.asar');
const entries = asar.listPackage(archive).map(p => p.split('\\').join('/'));
// Every packed package's own manifest: <…/node_modules/(@scope/)name/package.json>,
// nested packages included; a package.json deeper inside a package is not one.
const packed = entries
  .filter(entry => /\/node_modules\/(@[^/]+\/)?[^/@][^/]*\/package\.json$/.test(entry))
  .map(entry => JSON.parse(asar.extractFile(archive, entry.slice(1).split('/').join('\\')).toString('utf8')))
  .map(pkg => `${pkg.name}@${pkg.version}`);
const notices = JSON.parse(readFileSync(join('dist', 'notices.json'), 'utf8'));
const noticed = notices.packages.map(pkg => `${pkg.name}@${pkg.version}`);
const missing = [...new Set(packed)].filter(x => !noticed.includes(x));
const extra = noticed.filter(x => !packed.includes(x));
if (missing.length > 0 || extra.length > 0) {
  throw new Error(`packed dependencies and notices differ — packed without notice: ${missing.join(', ') || 'none'}; noticed but not packed: ${extra.join(', ') || 'none'}`);
}

const packedManifest = JSON.parse(asar.extractFile(archive, 'package.json').toString('utf8'));
if (packedManifest.version !== release.version || packedManifest.ayq?.build !== release.build) {
  throw new Error(`the packed package.json says ${packedManifest.version} / ${packedManifest.ayq?.build}, not ${release.version} / ${release.build}`);
}

const installer = join(out, release.fileName);
const sha = createHash('sha256').update(readFileSync(installer)).digest('hex').toUpperCase();
console.log(`${release.identification}: ${release.fileName} — ${readFileSync(installer).length} bytes, SHA-256 ${sha}`);
console.log(`packed dependencies ${noticed.length}, each with its notice; packed identity ${packedManifest.version} (Build ${packedManifest.ayq.build})`);
