// Launches AYQ desktop.
//
// A script rather than an inline environment assignment, because AYQ targets
// Windows first and `VAR=value command` is not a thing in cmd.
//
//   node start.mjs                  engine in Electron's utilityProcess
//   node start.mjs --engine node    engine in a Node fork (development only)
//   node start.mjs --smoke          launch, verify, screenshot, exit
//
// `--require-host "<name>"` makes the smoke fail unless that engine host is
// the one that answered, so the production acceptance test cannot be satisfied
// by the development fallback.
//
// `--import <file>` answers the smoke run's file picker with that file and
// requires a second import of it to add nothing, and the ledger on screen to
// match. Only fictional fixtures are ever named here: a real statement stays on
// the machine it came from.
//
// `--require-empty` demands the opposite: a budget with nothing in it.
//
// `--hold <ms>` keeps the window open after the checks pass, which is how a
// second launch can be made to overlap the first.

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);

const flag = name => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? (argv[index + 1] ?? '') : null;
};

const has = name => argv.includes(`--${name}`);

const env = { ...process.env };
const engine = flag('engine');
if (engine) env.AYQ_ENGINE_HOST = engine;
if (argv.includes('--smoke')) env.AYQ_SMOKE = '1';
const shot = flag('screenshot');
if (shot) env.AYQ_SMOKE_SCREENSHOT = shot;
const requireHost = flag('require-host');
if (requireHost) env.AYQ_SMOKE_REQUIRE_HOST = requireHost;
// Resolved here rather than left relative: the engine that opens it runs in a
// process forked twice over, and its working directory is nobody's business.
const importFile = flag('import');
if (importFile) env.AYQ_SMOKE_IMPORT = resolve(importFile);
// `--require-empty` fails the smoke unless the budget it opened holds nothing:
// a fresh AYQ has no demo account and no invented entries to hold.
if (has('require-empty')) env.AYQ_SMOKE_REQUIRE_EMPTY = '1';
// `--categorise <name>` files the newest transaction from the ledger itself;
// `--expect-category <name>` demands, on a later launch, that it is still
// filed — which proves a restart rather than a redraw.
const categorise = flag('categorise');
if (categorise) env.AYQ_SMOKE_CATEGORISE = categorise;
const expectCategory = flag('expect-category');
if (expectCategory) env.AYQ_SMOKE_EXPECT_CATEGORY = expectCategory;
// `--hold <ms>` keeps a finished smoke run on screen, so a second launch can be
// started while this one still holds the budget.
const hold = flag('hold');
if (hold) env.AYQ_SMOKE_HOLD_MS = hold;

const build = spawnSync(process.execPath, [join(here, 'build.mjs')], {
  stdio: 'inherit',
  cwd: here,
});
if (build.status !== 0) process.exit(build.status ?? 1);

const clientBuild = spawnSync(
  process.execPath,
  [join(here, '..', 'ayq-client', 'build.mjs')],
  { stdio: 'inherit' },
);
if (clientBuild.status !== 0) process.exit(clientBuild.status ?? 1);

// Rebuilt after the client, because the host copies the client's dist into its
// own. Cheap enough to just run twice rather than order it cleverly.
spawnSync(process.execPath, [join(here, 'build.mjs')], {
  stdio: 'inherit',
  cwd: here,
});

const electronArgs = [join(here, 'dist', 'ayq-main.js')];
// Running as root has no usable Chromium sandbox; a normal desktop user does.
if (process.getuid?.() === 0) electronArgs.unshift('--no-sandbox');

const run = spawnSync(require('electron'), electronArgs, {
  stdio: 'inherit',
  env,
});
process.exit(run.status ?? 1);
