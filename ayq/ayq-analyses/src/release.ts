// AYQ Analyses — release identity (06_RELEASE r004 §3; owner release standard).
//
// package.json is the one canonical release-metadata source: its "version"
// (SemVer) and "ayq.build" (three digits). Everything that shows or names the
// release — the installer file name, Settings → About, the installer's own
// display name and file version — is derived here from those two fields and
// nothing else. No version or build is written anywhere by hand.

import manifest from '../package.json' with { type: 'json' };

export interface ReleaseManifest {
  productName: string;
  version: string;
  author: string;
  license: string;
  ayq: { build: string };
}

export interface ReleaseIdentity {
  /** "AYQ Analyses". */
  product: string;
  /** SemVer major.minor.patch. */
  version: string;
  /** Three digits, "NNN". */
  build: string;
  /** "<product> <version> (Build NNN)". */
  identification: string;
  /** "<Product-Name>-<version>-bNNN.exe" — nothing else in the name (06 §3.5). */
  fileName: string;
  /** The Windows file version: the SemVer with the build as its fourth part. */
  fileVersion: string;
  /** The rights holder named by the manifest, from Canon. */
  author: string;
  /** First-party licence value in the manifest; never MIT (06 §9.2). */
  license: string;
}

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const BUILD = /^\d{3}$/;

export function releaseIdentity(source: ReleaseManifest): ReleaseIdentity {
  if (!SEMVER.test(source.version)) throw new Error(`version ${source.version} is not SemVer major.minor.patch`);
  const build = source.ayq?.build;
  if (typeof build !== 'string' || !BUILD.test(build)) throw new Error(`ayq.build ${String(build)} is not three digits`);
  if (source.license !== 'UNLICENSED') throw new Error(`the first-party licence must be UNLICENSED, not ${source.license}`);
  const product = source.productName;
  return {
    product,
    version: source.version,
    build,
    identification: `${product} ${source.version} (Build ${build})`,
    fileName: `${product.replace(/ /g, '-')}-${source.version}-b${build}.exe`,
    fileVersion: `${source.version}.${Number(build)}`,
    author: source.author,
    license: source.license,
  };
}

/** The identity of this build, from the manifest it is built from. */
export const RELEASE: ReleaseIdentity = releaseIdentity(manifest);
