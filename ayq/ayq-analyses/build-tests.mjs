import { build } from 'esbuild';
import { mkdir, rm } from 'node:fs/promises';

await rm('dist-test', { recursive: true, force: true });
await mkdir('dist-test', { recursive: true });

await build({
  entryPoints: ['test/analysis.test.ts'],
  outfile: 'dist-test/analysis.test.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: false,
});
