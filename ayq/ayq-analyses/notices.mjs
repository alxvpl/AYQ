// AYQ Analyses — third-party notices from the actual delivered set
// (06_RELEASE r004 §3.11, §5.6–§5.7; DS r007 §11.4).
//
// What the installer delivers, and therefore what the notices cover:
// - the production dependency closure of package.json, which electron-builder
//   packs into app.asar as node_modules (the packaging script checks the
//   packed set against this one and refuses to deliver on any difference);
// - the code esbuild bundles into dist/, which must come only from that set;
// - Electron, whose licence is installed as LICENSE.electron.txt, and
//   Chromium with its components, whose notices Electron installs as
//   LICENSES.chromium.html beside the executable.
//
// Nothing is claimed that is not packaged, and nothing packaged is left out.
// A package that ships no licence file is presented with its own declared
// licence, author and repository and the standard text of that licence; a
// package with neither a licence file nor a standard text available here
// stops the build — missing legal information is a delivery blocker.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const LICENCE_FILE = /^(licen[cs]e|copying|notice)(\.[a-z]+|-[a-z0-9-]+(\.[a-z]+)?)?$/i;

/** Standard licence texts, for a package that declares a licence but ships no file. */
const STANDARD_TEXT = {
  MIT: `Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`,
};

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

/** Node's resolution, bounded to the package root: nearest node_modules first. */
function resolvePackage(name, from, root) {
  let dir = resolve(from);
  const top = resolve(root);
  for (;;) {
    const candidate = join(dir, 'node_modules', name);
    if (existsSync(join(candidate, 'package.json'))) return candidate;
    if (dir === top) return null;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function declaredLicence(manifest) {
  if (typeof manifest.license === 'string') return manifest.license;
  if (manifest.license && typeof manifest.license.type === 'string') return manifest.license.type;
  if (Array.isArray(manifest.licenses)) return manifest.licenses.map(l => l.type ?? l).join(' OR ');
  return null;
}

function authorOf(manifest) {
  const a = manifest.author;
  if (typeof a === 'string') return a;
  if (a && typeof a.name === 'string') return a.name;
  return null;
}

function repositoryOf(manifest) {
  const r = manifest.repository;
  const url = typeof r === 'string' ? r : r?.url;
  return typeof url === 'string' ? url.replace(/^git\+/, '') : (manifest.homepage ?? null);
}

/**
 * The production dependency closure of the manifest at `root`: what
 * electron-builder packs. Returned sorted by name and version.
 */
export function productionPackages(root = '.') {
  const manifest = readJson(join(root, 'package.json'));
  const found = new Map();
  const queue = [
    ...Object.keys(manifest.dependencies ?? {}).map(name => ({ name, from: root, optional: false })),
    ...Object.keys(manifest.optionalDependencies ?? {}).map(name => ({ name, from: root, optional: true })),
  ];
  while (queue.length > 0) {
    const { name, from, optional } = queue.shift();
    const dir = resolvePackage(name, from, root);
    if (dir === null) {
      if (optional) continue;
      throw new Error(`production dependency ${name} (required from ${relative(root, from) || '.'}) is not installed`);
    }
    if (found.has(dir)) continue;
    const pkg = readJson(join(dir, 'package.json'));
    found.set(dir, pkg);
    for (const dep of Object.keys(pkg.dependencies ?? {})) queue.push({ name: dep, from: dir, optional: false });
    for (const dep of Object.keys(pkg.optionalDependencies ?? {})) queue.push({ name: dep, from: dir, optional: true });
    // An installed peer dependency is packed as well (electron-builder
    // collects it); an absent one is not.
    for (const dep of Object.keys(pkg.peerDependencies ?? {})) queue.push({ name: dep, from: dir, optional: true });
  }
  return [...found.entries()]
    .map(([dir, pkg]) => ({ dir, name: pkg.name, version: pkg.version, manifest: pkg }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.version < b.version ? -1 : 1));
}

/** One package's notice: its licence files, or its declared licence's standard text. */
export function noticeOf(entry) {
  const licence = declaredLicence(entry.manifest);
  const files = readdirSync(entry.dir).filter(name => LICENCE_FILE.test(name)).sort();
  const texts = files.map(file => ({ file, text: readFileSync(join(entry.dir, file), 'utf8').trim() })).filter(t => t.text !== '');
  const base = {
    name: entry.name,
    version: entry.version,
    licence,
    author: authorOf(entry.manifest),
    repository: repositoryOf(entry.manifest),
  };
  if (texts.length > 0) return { ...base, source: 'file', texts };
  if (licence !== null && STANDARD_TEXT[licence] !== undefined) {
    return { ...base, source: 'standard', texts: [{ file: null, text: STANDARD_TEXT[licence] }] };
  }
  throw new Error(`${entry.name}@${entry.version} ships no licence file and declares no licence with a standard text here (${licence}): a delivery blocker`);
}

function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fill(template, values) {
  return template.replace(/\{(\w+)\}/g, (_m, key) => {
    if (values[key] === undefined) throw new Error(`notice text is missing ${key}`);
    return values[key];
  });
}

/**
 * Writes dist/notices.html (the read-only page About opens) and
 * dist/notices.json (the same set, for verification), and returns the set.
 * `bundled` lists the package names esbuild put into dist/; each must be a
 * packaged dependency.
 */
export function writeNotices(outDir, { root = '.', bundled = [] } = {}) {
  const catalogue = readJson(join(root, 'src', 'strings', 'en.json'));
  const t = (key, values = {}) => {
    const entry = catalogue[key];
    if (typeof entry !== 'string') throw new Error(`notices text ${key} is not in the catalogue`);
    return fill(entry, values);
  };

  const packages = productionPackages(root);
  const names = new Set(packages.map(p => p.name));
  const outside = [...new Set(bundled)].filter(name => !names.has(name));
  if (outside.length > 0) throw new Error(`bundled code from packages that are not packaged dependencies: ${outside.join(', ')}`);
  const notices = packages.map(noticeOf);

  const electronDir = join(root, 'node_modules', 'electron');
  const electronVersion = readJson(join(electronDir, 'package.json')).version;
  const electronLicence = readFileSync(join(electronDir, 'dist', 'LICENSE'), 'utf8').trim();
  const chromiumPath = join(electronDir, 'dist', 'LICENSES.chromium.html');
  if (!existsSync(chromiumPath)) throw new Error('Electron ships no LICENSES.chromium.html: a delivery blocker');
  const chromiumSha = createHash('sha256').update(readFileSync(chromiumPath)).digest('hex');

  const sections = notices.map(n => {
    const lines = [`<h3>${escapeHtml(t('notices.component', { name: n.name, version: n.version, licence: n.licence ?? '' }))}</h3>`];
    if (n.source === 'standard') {
      lines.push(
        `<p>${escapeHtml(
          n.author !== null
            ? t('notices.noFile.author', { licence: n.licence, author: n.author, repository: n.repository ?? '' })
            : t('notices.noFile.noAuthor', { licence: n.licence, repository: n.repository ?? '' }),
        )}</p>`,
      );
    }
    for (const text of n.texts) lines.push(`<pre>${escapeHtml(text.text)}</pre>`);
    return `<section>${lines.join('\n')}</section>`;
  });

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>${escapeHtml(t('settings.about.notices'))}</title>
<style>
body { font-family: 'Segoe UI', system-ui, sans-serif; margin: 24px; line-height: 1.4; }
pre { white-space: pre-wrap; font-size: 12px; }
h3 { margin: 24px 0 4px; font-size: 14px; }
</style>
</head>
<body>
<h1>${escapeHtml(t('settings.about.notices'))}</h1>
<p>${escapeHtml(t('notices.intro'))}</p>
<h2>${escapeHtml(t('notices.chromium.heading'))}</h2>
<p>${escapeHtml(t('notices.chromium.body'))}</p>
<p><a href="chromium-notices.html">${escapeHtml(t('notices.chromium.open'))}</a></p>
<h2>${escapeHtml(t('notices.electron.heading', { version: electronVersion }))}</h2>
<pre>${escapeHtml(electronLicence)}</pre>
<h2>${escapeHtml(t('notices.components.heading', { n: String(notices.length) }))}</h2>
${sections.join('\n')}
</body>
</html>
`;
  writeFileSync(join(outDir, 'notices.html'), html);

  const record = {
    packages: notices.map(n => ({
      name: n.name,
      version: n.version,
      licence: n.licence,
      source: n.source,
      files: n.texts.map(x => x.file).filter(Boolean),
      sha256: sha256(n.texts.map(x => x.text).join('\n')),
    })),
    electron: { version: electronVersion, licenceSha256: sha256(electronLicence) },
    chromium: { file: 'LICENSES.chromium.html', sha256: chromiumSha },
  };
  writeFileSync(join(outDir, 'notices.json'), `${JSON.stringify(record, null, 2)}\n`);
  return record;
}

/** The package names an esbuild metafile's inputs come from. */
export function bundledPackages(metafile) {
  const names = new Set();
  for (const input of Object.keys(metafile.inputs)) {
    // The innermost node_modules names the package the code belongs to.
    const matches = [...input.split('\\').join('/').matchAll(/(?:^|\/)node_modules\/((?:@[^/]+\/)?[^/]+)\//g)];
    if (matches.length > 0) names.add(matches[matches.length - 1][1]);
  }
  return [...names].sort();
}
