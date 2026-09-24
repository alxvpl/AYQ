import { build } from 'esbuild';
import { mkdir, readdir, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';

// Electron 43 has no install script: its binary is fetched on first use. Do
// that once here, before the test files run in parallel, so no two of them
// race to fetch and extract it (a fresh CI checkout).
createRequire(import.meta.url)('electron');

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
      // react-dom/server (the Fixed costs markup tests) is CommonJS and
      // requires Node built-ins; an ESM bundle needs a real require for that.
      banner: { js: "import { createRequire as __ayqCreateRequire } from 'node:module'; const require = __ayqCreateRequire(import.meta.url);" },
    }),
  ),
);

console.log(`bundled ${names.length} test files`);
