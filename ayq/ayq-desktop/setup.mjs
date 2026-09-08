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
const isWindows = process.platform === 'win32';

// On Windows `npm` is `npm.cmd`, a batch file. Since the fix for
// CVE-2024-27980, Node refuses to execute a `.cmd` without a command shell:
// the spawn fails with EINVAL *before* the process exists, so there is no
// output and no exit code to explain it. That is precisely what the first
// Windows CI run produced — "installing dependencies" followed by "failed",
// with nothing in between.
//
// So npm is invoked through ComSpec explicitly rather than through whatever
// the platform happens to do with a bare name. `/d` skips any AutoRun script,
// `/s` makes cmd strip exactly the outer quote pair, `/c` runs the line and
// exits; `windowsVerbatimArguments` stops Node re-quoting what is already
// quoted for cmd.
function npmInvocation(args) {
  if (!isWindows) return { command: 'npm', args, options: {} };

  const line = ['npm', ...args].map(quoteForCmd).join(' ');
  return {
    command: process.env.ComSpec || 'cmd.exe',
    args: ['/d', '/s', '/c', `"${line}"`],
    options: { windowsVerbatimArguments: true },
  };
}

// Everything this script passes is a plain token, but quoting is not left to
// that assumption: an unquoted `&` or a space would let cmd read one argument
// as two commands.
function quoteForCmd(argument) {
  return /^[A-Za-z0-9_@:.,+=/\\-]+$/.test(argument) ? argument : `"${argument}"`;
}

function run(command, args, label, options = {}) {
  process.stdout.write(`\n[ayq-setup] ${label}\n`);
  process.stdout.write(`[ayq-setup] > ${command} ${args.join(' ')}\n`);

  const result = spawnSync(command, args, {
    cwd: here,
    stdio: 'inherit',
    ...options,
  });

  // A spawn that never started reports nothing on stdio, so the error object
  // is the only account of what happened. Printing it is not optional: without
  // it CI shows `failed: installing dependencies` and no cause at all.
  if (result.error) {
    process.stderr.write(
      `\n[ayq-setup] failed to start: ${label}\n` +
        `[ayq-setup] ${result.error.stack ?? String(result.error)}\n` +
        `[ayq-setup] platform ${process.platform}, ComSpec ${
          process.env.ComSpec ?? '(unset)'
        }\n`,
    );
    process.exit(1);
  }

  if (result.signal) {
    process.stderr.write(
      `\n[ayq-setup] failed: ${label} — killed by ${result.signal}\n`,
    );
    process.exit(1);
  }

  if (result.status !== 0) {
    process.stderr.write(
      `\n[ayq-setup] failed: ${label} — exit code ${result.status}\n`,
    );
    process.exit(result.status ?? 1);
  }
}

function runNpm(args, label) {
  const { command, args: spawnArgs, options } = npmInvocation(args);
  run(command, spawnArgs, label, options);
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

runNpm(
  existsSync(join(here, 'package-lock.json')) ? ['ci'] : ['install'],
  'installing dependencies',
);

runNpm(
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
