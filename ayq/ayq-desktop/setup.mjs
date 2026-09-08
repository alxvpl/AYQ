// One command from a clean checkout to a runnable AYQ desktop.
//
//   node ayq/ayq-desktop/setup.mjs
//
// Installs dependencies and builds the engine's native SQLite for Electron's
// ABI, then refuses to finish unless the result actually loads under Electron.
//
// It uses `@electron/rebuild`, the same tool and the same version upstream
// Actual pins, driven the same way — `--only <module> --force
// --build-from-source`. There is deliberately no second dependency model: no
// .npmrc runtime/target/disturl block, no hand-rolled node-gyp invocation, no
// prebuilt-binary side channel. `better-sqlite3` publishes prebuilds for Node
// ABIs only, so a source build against Electron's headers is not a choice we
// are making but the only thing that exists.
//
// Determinism comes from three things: the Electron version is read from
// package.json rather than sniffed, that version must be exact, and the built
// binary is verified before this script reports success.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function run(command, args, label) {
  process.stdout.write(`\n[ayq-setup] ${label}\n`);
  const result = spawnSync(command, args, { cwd: here, stdio: 'inherit' });
  if (result.status !== 0) {
    process.stderr.write(`\n[ayq-setup] failed: ${label}\n`);
    process.exit(result.status ?? 1);
  }
}

const manifest = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8'));
const electronVersion = manifest.devDependencies?.electron;

// A range here would mean the ABI the native module is built for could drift
// from the ABI the app runs on, which is exactly the failure this script
// exists to prevent.
if (!/^\d+\.\d+\.\d+$/.test(electronVersion ?? '')) {
  process.stderr.write(
    `[ayq-setup] electron must be pinned to an exact version in package.json; ` +
      `found ${JSON.stringify(electronVersion)}.\n`,
  );
  process.exit(1);
}

run(
  npm,
  existsSync(join(here, 'package-lock.json')) ? ['ci'] : ['install'],
  'installing dependencies',
);

run(
  npm,
  [
    'exec',
    '--no',
    '--',
    'electron-rebuild',
    '--version',
    electronVersion,
    '--only',
    'better-sqlite3',
    '--force',
    '--build-from-source',
  ],
  `rebuilding better-sqlite3 for Electron ${electronVersion}`,
);

run(
  process.execPath,
  [join(here, 'verify-native.mjs')],
  'verifying the native module loads under Electron',
);

process.stdout.write(
  `\n[ayq-setup] ready. Electron ${electronVersion}; ` +
    `run \`npm start\` for the production path.\n`,
);
