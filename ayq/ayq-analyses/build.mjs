import { build } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });

await build({
  entryPoints: ['src/main.ts'],
  outfile: 'dist/main.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external: ['electron'],
  sourcemap: false,
});

await build({
  entryPoints: ['src/preload.ts'],
  outfile: 'dist/preload.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron'],
  sourcemap: false,
});

await build({
  entryPoints: ['src/renderer.tsx'],
  outfile: 'dist/renderer.js',
  bundle: true,
  platform: 'browser',
  format: 'esm',
  target: ['chrome136'],
  sourcemap: false,
});

await cp('src/index.html', 'dist/index.html');
