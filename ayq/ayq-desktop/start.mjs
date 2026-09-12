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
import { copyFileSync, mkdirSync } from 'node:fs';
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
// `--show-more` presses the ledger's own "Show more" and requires more rows.
if (has('show-more')) env.AYQ_SMOKE_SHOW_MORE = '1';
// `--plan "name|amount|frequency|date"` opens Upcoming and adds that planned
// payment through the form, then requires the table to list it.
// `--expect-plan "name"` demands, on a later launch, that it is still listed.
const plan = flag('plan');
if (plan) env.AYQ_SMOKE_PLAN = plan;
const expectPlan = flag('expect-plan');
if (expectPlan) env.AYQ_SMOKE_EXPECT_PLAN = expectPlan;
// `--match` requires Upcoming to be offering a match, accepts the first one,
// and requires the offer to go away — which it only does if the engine stored it.
if (has('match')) env.AYQ_SMOKE_MATCH = '1';
// `--seed-store <file>` copies an invented AYQ store into the data directory
// before the application launches, so a smoke run can start from the state a
// person would be in after months of use rather than from an empty budget.
// 03 §7.14 makes that necessary: a record typed today expects nothing
// yesterday, so arrears cannot be produced by typing.
const seedStore = flag('seed-store');
if (seedStore) {
  const target = env.AYQ_DATA_DIR;
  if (!target) {
    process.stderr.write('--seed-store needs AYQ_DATA_DIR to be set\n');
    process.exit(2);
  }
  mkdirSync(target, { recursive: true });
  copyFileSync(seedStore, join(target, 'ayq-store.json'));
  process.stdout.write(`[ayq-start] seeded ${join(target, 'ayq-store.json')}\n`);
}

// `--accounts agrees` / `--accounts differs` opens the Accounts screen and
// requires it to state the case named — 03 §8's two, asked for by name so that
// a run reading whatever the screen happened to say cannot pass on both.
const accounts = flag('accounts');
if (accounts) env.AYQ_SMOKE_ACCOUNTS = accounts;

// `--register` opens the Register and requires it to draw, to show what is
// being filtered and let it be cleared in one action, to state which set its
// totals describe, and to open the evidence behind a row. It prints how long
// the table took, measured by the screen itself.
if (has('register')) env.AYQ_SMOKE_REGISTER = '1';

// `--import-once` imports the file once instead of twice. The second import is
// the duplicate-protection check, which a step of its own proves on a small
// fixture; a run that only wants a budget to work in should not pay for it
// again on fifty thousand records.
if (has('import-once')) env.AYQ_SMOKE_IMPORT_ONCE = '1';

// `--review` opens Review, files one counterparty *without* learning a rule and
// requires Settings to hold no rule afterwards, then learns a rule for the next
// one and requires it to be there, keyed on that counterparty — 03 §4.1's two
// decisions, proved by their consequences rather than by their labels. Then it
// takes the rule away again (04 A7) and reads what Settings → Categories says it
// will and will not do.
if (has('review')) env.AYQ_SMOKE_REVIEW = '1';

// `--today` opens Today and requires available funds to be first and the
// largest figure on the screen — both measured on the drawn window — the
// reliability boundary stated beside them, Import reachable from there, and
// the waiting list to hold only queues that have something in them (04 A21).
if (has('today')) env.AYQ_SMOKE_TODAY = '1';

// `--shell` measures the shell on the real window: the rail's width and order,
// one scroller at the window's right edge, and the table header and the detail
// pane staying put while the rows move (04 A20, A22).
if (has('shell')) env.AYQ_SMOKE_SHELL = '1';

// `--grounds` opens AYQ's own Fluent screen and requires each of the three
// grounds of 04 A23 to be applied when it is chosen; it leaves the window on
// dark. `--expect-ground <name>` requires a later launch to open in that one,
// which is the setting outliving the process rather than the window redrawing.
if (has('grounds')) env.AYQ_SMOKE_GROUNDS = '1';
const expectGround = flag('expect-ground');
if (expectGround) env.AYQ_SMOKE_EXPECT_GROUND = expectGround;

// `--conformance` requires the Upcoming screen to show what 03 r004 says it
// must: arrears that do not expire, a suggestion that brings none with it, and
// an ambiguous match that waits for a person.
if (has('conformance')) env.AYQ_SMOKE_CONFORMANCE = '1';

// `--plan-sheet "Category:amount"` opens Plan, sets that category's monthly
// plan through the sheet, and requires the row's own Left column — which the
// engine computed — to come back showing it.
const planSheet = flag('plan-sheet');
if (planSheet) env.AYQ_SMOKE_PLAN_SHEET = planSheet;

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
