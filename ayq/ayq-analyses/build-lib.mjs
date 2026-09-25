// The one description of how the application is bundled, used by build.mjs
// for dist/ and by the suite to build the same application into a scratch
// directory for tests that must run the real main process.
//
// Every build also writes the third-party notices of the delivered set
// (notices.mjs) and refuses to finish when bundled code comes from a package
// that is not a packaged dependency, or when a packaged dependency has no
// licence information (06_RELEASE r004 §5.6–§5.7).

import { build } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { bundledPackages, writeNotices } from './notices.mjs';

export async function buildApplication(outDir) {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  const main = await build({
    entryPoints: ['src/main.ts'],
    outfile: join(outDir, 'main.js'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    external: ['electron'],
    sourcemap: false,
    metafile: true,
  });

  const preload = await build({
    entryPoints: ['src/preload.ts'],
    outfile: join(outDir, 'preload.cjs'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    external: ['electron'],
    sourcemap: false,
    metafile: true,
  });

  const renderer = await build({
    entryPoints: ['src/renderer.tsx'],
    outfile: join(outDir, 'renderer.js'),
    bundle: true,
    platform: 'browser',
    format: 'esm',
    target: ['chrome136'],
    sourcemap: false,
    metafile: true,
  });

  await cp('src/index.html', join(outDir, 'index.html'));
  await cp('src/styles.css', join(outDir, 'styles.css'));

  const bundled = [main, preload, renderer].flatMap(result => bundledPackages(result.metafile));
  return { bundled: [...new Set(bundled)].sort(), notices: writeNotices(outDir, { bundled }) };
}
