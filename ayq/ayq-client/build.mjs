// Builds the AYQ renderer.
//
// Bundled for the browser, not for Node: the renderer has no Node globals and
// no module resolution at runtime. Anything it needs must already be in the
// bundle or come through the bridge.

import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'dist');

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

await build({
  entryPoints: [join(here, 'src/ayq-app.ts')],
  outfile: join(out, 'ayq-client.js'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'chrome120',
  jsx: 'automatic',
  // React reads this to choose its development or production build. The
  // renderer has no `process`, so the value is baked in rather than looked up
  // — and `ayq-boundary.test.ts` requires that nothing reads `process` at all.
  define: { 'process.env.NODE_ENV': '"production"' },
  sourcemap: true,
  logLevel: 'info',
});

await cp(join(here, 'src/ayq-client.html'), join(out, 'ayq-client.html'));

process.stdout.write('ayq-client: dist/ built\n');
