import { build } from 'esbuild';
import { mkdir, readdir, rm } from 'node:fs/promises';

await rm('dist-test', { recursive: true, force: true });
await mkdir('dist-test', { recursive: true });

const names = (await readdir('test')).filter(name => name.endsWith('.test.ts'));

await Promise.all(
  names.map(name =>
    build({
      entryPoints: [`test/${name}`],
      outfile: `dist-test/${name.replace(/\.ts$/, '.mjs')}`,
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node22',
      external: ['node:*', 'esbuild', 'electron'],
      loader: { '.json': 'json' },
      sourcemap: false,
    }),
  ),
);

console.log(`bundled ${names.length} test files`);
