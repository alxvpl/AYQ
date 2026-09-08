// Reading CAMT files — from a directory, a single file, or straight from a ZIP.
//
// Three things that matter across 212 real files and not across two fixtures:
// the traversal descends into subdirectories, a ZIP archive is read in memory
// rather than extracted to disk, and the encoding is taken from the XML
// declaration itself. A file declared as ISO-8859-1 and read as UTF-8 does not
// crash — it just yields mangled names, which is exactly the kind of silent
// error this spike must rule out.
//
// Paths stay here. What travels outward, into the records and the report, is
// at most the base name — and in the shareable report, only an ordinal.

import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';

import { ayqReadZip } from './ayq-zip.ts';

export type AyqLoadedFile = {
  /** The base name. The full path does not travel with the file. */
  name: string;
  /** The archive it came from, when it came from one. */
  archive: string | null;
  content: string;
  /** The encoding declared in the XML declaration, when there is one. */
  declaredEncoding: string | null;
  bytes: number;
};

export type AyqFailedFile = {
  /** An ordinal rather than a name: export file names carry an account number. */
  index: number;
  reason: string;
};

const XML_DECLARATION_ENCODING = /<\?xml[^>]*\bencoding\s*=\s*["']([^"']+)["']/i;

/**
 * Decodes content according to the encoding it declares.
 *
 * The declaration is looked for in the first 256 bytes read as latin1 — there
 * every byte is a valid character, so the scan cannot trip over the content it
 * is about to decode.
 */
export function ayqDecodeCamt(
  buffer: Buffer,
  name: string,
  archive: string | null = null,
): AyqLoadedFile {
  const head = buffer.subarray(0, 256).toString('latin1');
  const declared = head.match(XML_DECLARATION_ENCODING)?.[1] ?? null;

  let content: string;
  if (declared === null || /^utf-?8$/i.test(declared)) {
    content = buffer.toString('utf8');
  } else {
    try {
      content = new TextDecoder(declared).decode(buffer);
    } catch {
      // An unknown encoding: read as UTF-8 and reported in the audit output.
      content = buffer.toString('utf8');
    }
  }

  return {
    name,
    archive,
    content,
    declaredEncoding: declared,
    bytes: buffer.byteLength,
  };
}

function isXml(name: string): boolean {
  return extname(name).toLowerCase() === '.xml';
}

function isZip(name: string): boolean {
  return extname(name).toLowerCase() === '.zip';
}

/** Reads one file from disk according to the encoding it declares. */
export async function ayqReadCamtFile(path: string): Promise<AyqLoadedFile> {
  return ayqDecodeCamt(await readFile(path), basename(path));
}

/** Reads every XML file in a ZIP archive, writing nothing to disk. */
export async function ayqReadCamtZip(path: string): Promise<AyqLoadedFile[]> {
  const archive = basename(path);
  return ayqReadZip(await readFile(path))
    .filter(entry => isXml(entry.name))
    .map(entry => ayqDecodeCamt(entry.content, basename(entry.name), archive))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Collects the input: a directory (recursively), a single XML file, or a ZIP.
 *
 * The ordering is stable so that the report is stable between two runs.
 */
export async function ayqLoadTargets(
  targets: string[],
): Promise<AyqLoadedFile[]> {
  const files: AyqLoadedFile[] = [];

  const walk = async (target: string): Promise<void> => {
    const info = await stat(target);

    if (!info.isDirectory()) {
      if (isZip(target)) files.push(...(await ayqReadCamtZip(target)));
      else files.push(await ayqReadCamtFile(target));
      return;
    }

    for (const name of (await readdir(target)).sort()) {
      const child = join(target, name);
      const childInfo = await stat(child);
      if (childInfo.isDirectory()) await walk(child);
      else if (isXml(name) || isZip(name)) await walk(child);
    }
  };

  for (const target of targets) await walk(target);
  return files;
}
