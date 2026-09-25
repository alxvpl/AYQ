// AYQ Personal Finances — release identity (06_RELEASE r005 §3).
//
// package.json is the one canonical release-metadata source: its "version"
// (SemVer) and "ayq.build" (three digits). The installer's file name is derived
// here from those two fields and nothing else, so no version or build is
// written by hand anywhere that packages. About takes the same two fields
// through ayq-build-info.mjs.
//
// Plain JavaScript because packaging runs it directly; its types are in
// ayq-release.d.mts for the test that checks it.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const BUILD = /^\d{3}$/;

// The owner-facing product name (06 §3.11–12). The manifest's productName is
// the short token the file name uses (06 §3.5: `AYQ`).
const PRODUCT = 'AYQ Personal Finances';

export function releaseIdentity(source) {
  if (!SEMVER.test(source.version)) {
    throw new Error(`version ${source.version} is not SemVer major.minor.patch`);
  }
  const build = source.ayq?.build;
  if (typeof build !== 'string' || !BUILD.test(build)) {
    throw new Error(`ayq.build ${String(build)} is not three digits`);
  }
  return {
    product: PRODUCT,
    version: source.version,
    build,
    identification: `${PRODUCT} ${source.version} (Build ${build})`,
    // "<product>-<semver>-bNNN.exe" — nothing else in the name (06 §3.5).
    fileName: `${source.productName}-${source.version}-b${build}.exe`,
  };
}

/** The identity of this build, from the manifest beside this file. */
export function ayqRelease() {
  return releaseIdentity(
    JSON.parse(readFileSync(join(here, 'package.json'), 'utf8')),
  );
}
