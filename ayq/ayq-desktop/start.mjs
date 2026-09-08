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

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);

const flag = name => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? (argv[index + 1] ?? '') : null;
};

const env = { ...process.env };
const engine = flag('engine');
if (engine) env.AYQ_ENGINE_HOST = engine;
if (argv.includes('--smoke')) env.AYQ_SMOKE = '1';
const shot = flag('screenshot');
if (shot) env.AYQ_SMOKE_SCREENSHOT = shot;
const requireHost = flag('require-host');
if (requireHost) env.AYQ_SMOKE_REQUIRE_HOST = requireHost;

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
