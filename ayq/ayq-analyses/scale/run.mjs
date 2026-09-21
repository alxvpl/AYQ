// Bundles and runs the engine-side scale measurement (directive 039 W2).
// Usage: node scale/run.mjs [SHAPE ...]

import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';

await mkdir('dist-test/scale', { recursive: true });
await build({
  entryPoints: ['scale/measure-engine.ts'],
  outfile: 'dist-test/scale/measure-engine.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external: ['node:*'],
  loader: { '.json': 'json' },
  sourcemap: false,
});

const result = spawnSync(process.execPath, ['--expose-gc', '--max-old-space-size=8192', 'dist-test/scale/measure-engine.mjs', ...process.argv.slice(2)], {
  stdio: 'inherit',
});
process.exit(result.status ?? 1);
