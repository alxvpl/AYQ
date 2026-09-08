// The gate between "the rebuild command exited 0" and "the engine will run".
//
// Runs the Electron binary as Node — the same ABI the utilityProcess engine
// gets — and loads the native SQLite binding through the same package the
// engine loads it through. If the binding was built for the wrong ABI, or the
// rebuild silently skipped it, this fails here rather than in a window that
// then has to be diagnosed from a null dereference three layers up.
//
// It also prints both ABIs, so a mismatch is legible rather than inferred.

import { spawnSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));

// Requiring the module is not enough. `better-sqlite3` binds lazily: its
// entry point loads cleanly on any ABI and only reaches for the `.node` when a
// database is opened. A gate that stops at `require` reports success while the
// engine is still broken — which is exactly what this one did before it was
// made to open a database.
const probe = `
const Database = require('better-sqlite3');
const abi = process.versions.modules;
try {
  const db = new Database(':memory:');
  const answer = db.prepare('select 1 as ok').get();
  db.close();
  if (answer.ok !== 1) throw new Error('the database answered ' + JSON.stringify(answer));
  console.log('[ayq-verify] opened a database on ABI ' + abi);
  process.exit(0);
} catch (error) {
  console.error('[ayq-verify] ABI ' + abi + ': ' + String(error.message).split('\\n')[0]);
  process.exit(1);
}
`;

const nodeAbi = process.versions.modules;
// Written to disk rather than passed with -e: the probe has to resolve
// `better-sqlite3` from this package, which it can only do from a real file
// inside it.
const probePath = join(here, 'node_modules', '.ayq-verify-native.cjs');
writeFileSync(probePath, probe, 'utf8');

const result = spawnSync(require('electron'), [probePath], {
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  cwd: here,
});
rmSync(probePath, { force: true });

if (result.status !== 0) {
  process.stderr.write(
    `\n[ayq-verify] The native module does not load under Electron.\n` +
      `[ayq-verify] This Node is ABI ${nodeAbi}; Electron's differs, which is ` +
      `the whole reason the rebuild exists.\n` +
      `[ayq-verify] Run \`node setup.mjs\` and read the rebuild output above.\n`,
  );
  process.exit(result.status ?? 1);
}

process.stdout.write(
  `[ayq-verify] ok — the engine's SQLite opens under Electron, not merely ` +
    `this Node (ABI ${nodeAbi}).\n`,
);
