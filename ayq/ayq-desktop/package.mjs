// AYQ Personal Finances — the Windows installer (06_RELEASE r005 §3).
//
// The installer's file name comes from ayq-release.mjs, which reads it from
// package.json — the one canonical release-metadata source. The build config
// in package.json names no artifact. After electron-builder has run, the
// result is checked before anyone may call it a candidate:
// - one build number is packaged once: if release/ already holds this exact
//   file name, packaging stops, because a second run would be different bytes
//   under the same name (06 §3.6);
// - exactly one installer lands in release/, named exactly
//   <product>-<semver>-bNNN.exe.
// Any difference stops the packaging with an error.

import { Arch, Platform, build } from 'electron-builder';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ayqRelease } from './ayq-release.mjs';

const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
const release = ayqRelease();
const out = join(process.cwd(), manifest.build.directories.output);

if (existsSync(join(out, release.fileName))) {
  throw new Error(
    `${join(out, release.fileName)} exists: ${release.identification} was already packaged; advance ayq.build`,
  );
}

const config = {
  ...manifest.build,
  // The one exact release file name (06 §3.5), from the manifest.
  win: { ...manifest.build.win, artifactName: release.fileName },
};

await build({
  targets: Platform.WINDOWS.createTarget(['nsis'], Arch.x64),
  config,
  publish: 'never',
});

const installers = readdirSync(out).filter(
  name => name.endsWith('.exe') && !name.includes('__uninstaller'),
);
if (installers.length !== 1 || installers[0] !== release.fileName) {
  throw new Error(
    `expected exactly ${release.fileName} in ${out}, found ${installers.join(', ') || 'nothing'}`,
  );
}

const bytes = readFileSync(join(out, release.fileName));
const sha = createHash('sha256').update(bytes).digest('hex').toUpperCase();
console.log(
  `${release.identification}: ${release.fileName} — ${bytes.length} bytes, SHA-256 ${sha}`,
);
