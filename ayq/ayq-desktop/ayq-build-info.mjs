// The build information the About screen shows, computed at build time.
//
// 12 §12.2: none of this is hard-coded. The revision comes from git, the date
// from the clock at the moment the bundle is built, the version and the build
// number from the package manifest, and the architecture from the machine the
// package is produced for. A packaged CI build therefore carries real values
// or it carries nothing — there is no third state where it carries a plausible
// invention.
//
// It is baked into the bundles as a compile-time constant rather than read from
// disk at runtime, because the packaged application's files live inside an asar
// archive and a build stamp that can go missing is a build stamp that will.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { releaseIdentity } from './ayq-release.mjs';

const here = dirname(fileURLToPath(import.meta.url));

/** The commit this was built from, or null when git cannot say. */
function revision() {
  // CI checkouts are detached and shallow; both still answer HEAD. A build from
  // a tarball with no `.git` at all answers nothing, and nothing is what is
  // then reported — 12 §12.2 asks for a clearly non-release fallback rather
  // than a convincing-looking wrong SHA.
  for (const [command, args] of [
    ['git', ['rev-parse', 'HEAD']],
    ['git', ['rev-parse', '--verify', 'HEAD']],
  ]) {
    try {
      const said = execFileSync(command, args, {
        cwd: here,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      if (/^[0-9a-f]{40}$/.test(said)) return said;
    } catch {
      // Not a repository, or no git. Fall through to the next attempt.
    }
  }
  return process.env.GITHUB_SHA && /^[0-9a-f]{40}$/.test(process.env.GITHUB_SHA)
    ? process.env.GITHUB_SHA
    : null;
}

export function ayqBuildInfo() {
  const manifest = JSON.parse(
    readFileSync(join(here, 'package.json'), 'utf8'),
  );

  const sha = revision();
  return {
    productVersion: String(manifest.version),
    buildNumber: String(manifest.ayq?.build ?? ''),
    // "<product> <version> (Build NNN)" (06 §3.11), from the same function the
    // installer's file name comes from, so About and the file cannot disagree
    // and the form is written in one place only.
    identification: releaseIdentity(manifest).identification,
    // ISO 8601 in UTC, to the second. The instant the bundle was built, which
    // for a packaged build is the instant CI built the artefact.
    buildDate: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    revision: sha,
    architecture: process.env.AYQ_BUILD_ARCH ?? process.arch,
    platform: process.env.AYQ_BUILD_PLATFORM ?? process.platform,
    // A build with no revision is not a release, and says so rather than
    // looking like one.
    development: sha === null,
  };
}
