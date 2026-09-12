// Builds the renderer's tests so that Node can run them.
//
// Node strips types from `.ts` by itself, but it does not know JSX — and the
// interface is written in it (04 A15). Rather than keep the components out of
// the tests, or test them through a copy written another way, each test file
// is bundled exactly as the product is: the same esbuild, the same JSX
// transform, the same React build.
//
// The runner is given `--test-force-exit`, and for one reason: React's
// scheduler opens a `MessageChannel` when it is loaded and never closes it, so
// a test file that has finished still holds a handle and Node waits for it.
//
// `jsdom` stays external because it is a Node library with its own native
// edges; `esbuild` and `typescript` because two of the tests read the source
// with them. Everything else — React, Fluent, the renderer's own files — is
// bundled in, so a test exercises the code as it ships.

import { mkdir, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const from = join(here, 'test');
const out = join(here, 'dist-test');

const files = (await readdir(from)).filter(
  name => name.endsWith('.test.ts') || name.endsWith('.test.tsx'),
);

if (files.length === 0) {
  process.stderr.write('ayq-client: no tests to build\n');
  process.exit(1);
}

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

// Each test is bundled from a shim that loads the DOM before anything else.
//
// Not a convenience: `react-dom` decides at load time whether the browser has
// an `input` event, by reading the global `document`. Loaded without one it
// decides no, caches that for the life of the process, and `onChange` stops
// firing for every text input — which made a form look untestable when what was
// missing was a document. The shim is the entry point, so the import that
// installs the window is evaluated before the import that reads it.
const shims = join(out, 'entry');
await mkdir(shims, { recursive: true });
const entries = [];
for (const name of files) {
  const shim = join(shims, `${name.replace(/\.tsx?$/, '')}.ts`);
  await writeFile(
    shim,
    `import '${join(from, 'ayq-dom-first.ts').split('\\').join('/')}';\n` +
      `import '${join(from, name).split('\\').join('/')}';\n`,
    'utf8',
  );
  entries.push(shim);
}

await build({
  entryPoints: entries,
  outdir: out,
  outExtension: { '.js': '.mjs' },
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  jsx: 'automatic',
  // React's development build, on purpose: it is the one whose `act` waits
  // for a render to settle, and a test that asserts on a half-rendered tree
  // is worse than no test. The shipped bundle is built the other way.
  define: { 'process.env.NODE_ENV': '"development"' },
  external: ['jsdom', 'esbuild', 'typescript'],
  sourcemap: 'inline',
  logLevel: 'warning',
});

// Flattened, so the runner's glob finds them beside the shim directory rather
// than inside it.
for (const name of await readdir(join(out, 'entry'))) {
  if (name.endsWith('.mjs') || name.endsWith('.mjs.map')) {
    await rename(join(out, 'entry', name), join(out, name));
  }
}
await rm(join(out, 'entry'), { recursive: true, force: true });

process.stdout.write(`ayq-client: dist-test/ built (${entries.length} files)\n`);
