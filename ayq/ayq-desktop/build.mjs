// Builds the AYQ Electron host, and copies the built renderer in beside it.
//
// Three outputs, because they run in three different places: the main process
// and the engine are ESM on Node, and the preload has to be CommonJS because a
// sandboxed preload is not an ES module.

import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'dist');

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

const shared = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  sourcemap: true,
  logLevel: 'info',
};

await build({
  ...shared,
  entryPoints: [join(here, 'src/ayq-main.ts')],
  outfile: join(out, 'ayq-main.js'),
  format: 'esm',
  external: ['electron'],
});

await build({
  ...shared,
  entryPoints: [join(here, 'src/ayq-engine.ts')],
  outfile: join(out, 'ayq-engine.js'),
  format: 'esm',
  // The engine keeps its dependency external: @actual-app/api carries a native
  // SQLite binding and must be loaded from node_modules, not inlined.
  external: ['@actual-app/api'],
});

await build({
  ...shared,
  entryPoints: [join(here, 'src/ayq-preload.ts')],
  outfile: join(out, 'ayq-preload.cjs'),
  format: 'cjs',
  external: ['electron'],
});

// The renderer is built by ayq-client; the host only serves it.
await cp(join(here, '../ayq-client/dist'), join(out, 'client'), {
  recursive: true,
});

process.stdout.write('ayq-desktop: dist/ built\n');
