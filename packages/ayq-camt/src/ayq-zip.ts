// A minimal ZIP reader, just enough to read the ABN AMRO export straight from
// the archive, with no manual extraction and nothing written to disk.
//
// Deliberately without a new dependency: the archive holds 212 small XML files
// stored or deflated, and deflate is already in `node:zlib`. Anything outside
// those two forms — zip64, encryption, an unknown method — is not guessed at
// but reported as an error. A clear refusal beats a silent partial read.

import { inflateRawSync } from 'node:zlib';

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_FILE_HEADER = 0x02014b50;
const LOCAL_FILE_HEADER = 0x04034b50;

const METHOD_STORED = 0;
const METHOD_DEFLATE = 8;

const ZIP64_MARKER_16 = 0xffff;
const ZIP64_MARKER_32 = 0xffffffff;

export type AyqZipEntry = {
  name: string;
  content: Buffer;
};

/** Finds the end-of-central-directory record, searching backwards. */
function findEndOfCentralDirectory(archive: Buffer): number {
  // The archive comment is at most 65,535 bytes; the search reaches that far.
  const earliest = Math.max(0, archive.length - 22 - 0xffff);
  for (let offset = archive.length - 22; offset >= earliest; offset -= 1) {
    if (archive.readUInt32LE(offset) === END_OF_CENTRAL_DIRECTORY) return offset;
  }
  return -1;
}

/**
 * Reads a ZIP archive and returns the content of every file.
 *
 * The archive is held in memory only — nothing is written to disk.
 */
export function ayqReadZip(archive: Buffer): AyqZipEntry[] {
  const end = findEndOfCentralDirectory(archive);
  if (end < 0) {
    throw new Error('not a ZIP archive: no end-of-central-directory record');
  }

  const entryCount = archive.readUInt16LE(end + 10);
  const directoryOffset = archive.readUInt32LE(end + 16);
  if (entryCount === ZIP64_MARKER_16 || directoryOffset === ZIP64_MARKER_32) {
    throw new Error('zip64 archives are not supported — extract manually');
  }

  const entries: AyqZipEntry[] = [];
  let cursor = directoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (archive.readUInt32LE(cursor) !== CENTRAL_FILE_HEADER) {
      throw new Error(`corrupt ZIP: unexpected record #${index + 1}`);
    }

    const flags = archive.readUInt16LE(cursor + 8);
    const method = archive.readUInt16LE(cursor + 10);
    const compressedSize = archive.readUInt32LE(cursor + 20);
    const nameLength = archive.readUInt16LE(cursor + 28);
    const extraLength = archive.readUInt16LE(cursor + 30);
    const commentLength = archive.readUInt16LE(cursor + 32);
    const localOffset = archive.readUInt32LE(cursor + 42);
    const name = archive
      .subarray(cursor + 46, cursor + 46 + nameLength)
      .toString('utf8');

    cursor += 46 + nameLength + extraLength + commentLength;

    // Directories are stored with a trailing slash and carry no content.
    if (name.endsWith('/')) continue;

    if ((flags & 0x1) !== 0) {
      throw new Error(`encrypted entry in the archive: ${name}`);
    }
    if (method !== METHOD_STORED && method !== METHOD_DEFLATE) {
      throw new Error(`unknown compression method ${method} for ${name}`);
    }

    if (archive.readUInt32LE(localOffset) !== LOCAL_FILE_HEADER) {
      throw new Error(`corrupt ZIP: no local header for ${name}`);
    }
    // The local header carries its own name and extra lengths; they are read
    // from there rather than from the central directory.
    const localNameLength = archive.readUInt16LE(localOffset + 26);
    const localExtraLength = archive.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const data = archive.subarray(dataStart, dataStart + compressedSize);

    entries.push({
      name,
      content:
        method === METHOD_STORED ? Buffer.from(data) : inflateRawSync(data),
    });
  }

  return entries;
}
