// What this build of AYQ is, and what may be said about it out loud.
//
// 12 asks for an About tab in Settings — not a rail destination, and not a
// version number sitting in the chrome of every other screen. A person looks
// for this once, when something has gone wrong and somebody needs to know which
// build they are running.
//
// ## Nothing here is invented
//
// The revision, the build date, the version and the architecture are compiled
// in by `ayq-build-info.mjs` from git, the clock, the manifest and the machine
// (§12.2). A build that has no git to ask reports none of them and marks itself
// as development, which is the honest state — a plausible-looking SHA in an
// About box is worse than no SHA, because somebody will act on it.
//
// The engine version is read back from the API that is actually loaded rather
// than restated from the manifest, for the same reason.
//
// What About *says* in sentences — the licence notes, the local-first note, a
// link's name — is not here: those are words on a screen and live in the
// client's catalogue (04 A24). This answers facts.
//
// ## The copy button has a privacy contract (§12.4)
//
// `technicalInformation` is exactly what reaches the clipboard, and it is built
// here, in one place, out of a fixed list of fields. That is what makes the
// contract testable: a test can assert the safe fields are present and that no
// budget name, path, account id, balance, counterparty, category or amount ever
// is. Building the string on the renderer would put it out of that test's
// reach, and putting a `dataDir` in it would leak a person's user name to
// whatever they pasted it into.

import { readFileSync } from 'node:fs';

import type { AyqAbout } from '../../ayq-client/src/ayq-ipc-contract.ts';

/**
 * The upstream Actual commit this repository's `packages/` tree is based on.
 *
 * A declared constant and not a measurement: it is the baseline the fork was
 * taken from, it does not change when AYQ is rebuilt, and nothing in the tree
 * can be asked for it at runtime.
 */
export const AYQ_ACTUAL_BASELINE = 'db1b0ea9';

export const AYQ_PRODUCT_NAME = 'AYQ Personal Finances';
export const AYQ_TAGLINE =
  'Local-first personal finance application for Windows';
export const AYQ_AUTHOR = 'Plamen Alexandrov';
export const AYQ_COPYRIGHT = '© 2026 Plamen Alexandrov. All rights reserved.';

/** What the build stamped into the bundle, when there was a build. */
type AyqCompiledBuild = {
  productVersion: string;
  buildNumber: string;
  buildDate: string;
  revision: string | null;
  architecture: string;
  platform: string;
  development: boolean;
};

declare const __AYQ_BUILD__: AyqCompiledBuild | undefined;

/**
 * The build stamp, or a fallback that cannot be mistaken for a release.
 *
 * Running the TypeScript directly — which the engine tests do — never goes
 * through esbuild, so the constant is simply not there. That is a development
 * run and says so.
 */
function compiled(): AyqCompiledBuild {
  if (typeof __AYQ_BUILD__ !== 'undefined' && __AYQ_BUILD__ !== undefined) {
    return __AYQ_BUILD__;
  }
  return {
    productVersion: '0.0.0-dev',
    buildNumber: 'dev',
    buildDate: 'unbuilt',
    revision: null,
    architecture: process.arch,
    platform: process.platform,
    development: true,
  };
}

/**
 * The product version and delivery number this build was compiled with.
 *
 * For a check that wants to compare what About *draws* with what the build was
 * made from, without reaching for the manifest — which lives inside the asar in
 * a packaged application and is not the same question anyway.
 */
export function ayqCompiledIdentity(): {
  productVersion: string;
  buildNumber: string;
} {
  const build = compiled();
  return {
    productVersion: build.productVersion,
    buildNumber: build.buildNumber,
  };
}

/** Windows x64, said the way a person says it rather than the way node does. */
function architecture(platform: string, arch: string): string {
  const named =
    platform === 'win32'
      ? 'Windows'
      : platform === 'darwin'
        ? 'macOS'
        : platform === 'linux'
          ? 'Linux'
          : platform;
  return `${named} ${arch === 'x64' ? 'x64' : arch}`;
}

/**
 * Project links, and only ones that really exist.
 *
 * Read from the manifest rather than written here, so there is no way for this
 * file to acquire a URL nobody configured. An absent or non-http value produces
 * no link at all rather than a dead one.
 */
function links(repositoryUrl: string | null): Array<{ kind: 'repository'; url: string }> {
  if (repositoryUrl === null) return [];
  const cleaned = repositoryUrl
    .replace(/^git\+/, '')
    .replace(/\.git$/, '');
  if (!/^https:\/\//.test(cleaned)) return [];
  return [{ kind: 'repository', url: cleaned }];
}

export type AyqAboutInput = {
  /** The version of `@actual-app/api` actually loaded. */
  engineVersion: string;
  /** Electron's own version, when running under Electron. */
  electronVersion: string | null;
  nodeVersion: string;
  /** The repository URL the manifest declares, if it declares one. */
  repositoryUrl: string | null;
};

export function ayqAbout(input: AyqAboutInput): AyqAbout {
  const build = compiled();
  const arch = architecture(build.platform, build.architecture);

  const about: AyqAbout = {
    productName: AYQ_PRODUCT_NAME,
    tagline: AYQ_TAGLINE,
    author: AYQ_AUTHOR,
    copyright: AYQ_COPYRIGHT,
    productVersion: build.productVersion,
    buildNumber: build.buildNumber,
    buildDate: build.buildDate,
    architecture: arch,
    revision: build.revision,
    engine: `Actual Budget ${input.engineVersion}`,
    actualBaseline: AYQ_ACTUAL_BASELINE,
    electronVersion: input.electronVersion,
    nodeVersion: input.nodeVersion,
    development: build.development,
    links: links(input.repositoryUrl),
    technicalInformation: '',
  };

  about.technicalInformation = ayqTechnicalInformation(about);
  return about;
}

/**
 * Exactly what the copy button puts on the clipboard. 12 §12.4.
 *
 * A fixed list of fields, every one of them a fact about the *application*.
 * There is deliberately no branch here that could add a budget name, a path, an
 * account, a balance, a counterparty, a category or an amount: the only way for
 * one to appear would be for somebody to add a line to this function, and the
 * test that pins this reads what comes out.
 */
export function ayqTechnicalInformation(about: AyqAbout): string {
  return [
    `Product        : ${about.productName}`,
    `Version        : ${about.productVersion}`,
    `Build          : ${about.buildNumber}`,
    `Build date     : ${about.buildDate}`,
    `Architecture   : ${about.architecture}`,
    `AYQ revision   : ${about.revision ?? 'not a release build'}`,
    `Engine         : ${about.engine}`,
    `Actual baseline: ${about.actualBaseline}`,
    `Electron       : ${about.electronVersion ?? 'not under Electron'}`,
    `Node           : ${about.nodeVersion}`,
  ].join('\n');
}

/** The repository URL the manifest declares, if it declares a real one. */
export function ayqRepositoryUrl(manifestPath: string): string | null {
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      repository?: { url?: string } | string;
    };
    const declared =
      typeof manifest.repository === 'string'
        ? manifest.repository
        : (manifest.repository?.url ?? null);
    return declared ?? null;
  } catch {
    return null;
  }
}
