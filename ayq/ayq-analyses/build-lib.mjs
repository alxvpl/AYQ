// The one description of how the application is bundled, used by build.mjs
// for dist/ and by the suite to build the same application into a scratch
// directory for tests that must run the real main process.

import { build } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

export async function buildApplication(outDir) {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  await build({
    entryPoints: ['src/main.ts'],
    outfile: join(outDir, 'main.js'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    external: ['electron'],
    sourcemap: false,
  });

  await build({
    entryPoints: ['src/preload.ts'],
    outfile: join(outDir, 'preload.cjs'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    external: ['electron'],
    sourcemap: false,
  });

  await build({
    entryPoints: ['src/renderer.tsx'],
    outfile: join(outDir, 'renderer.js'),
    bundle: true,
    platform: 'browser',
    format: 'esm',
    target: ['chrome136'],
    sourcemap: false,
  });

  await cp('src/index.html', join(outDir, 'index.html'));
  await cp('src/styles.css', join(outDir, 'styles.css'));
}
