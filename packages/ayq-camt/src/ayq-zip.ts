// Минимален ZIP четец, колкото да се прочете експортът на ABN AMRO направо от
// архива, без ръчно разархивиране и без нищо да се записва на диска.
//
// Нарочно без нова зависимост: архивът съдържа 212 малки XML файла, записани
// със store или deflate, а deflate вече е в `node:zlib`. Всичко извън тези две
// форми — zip64, шифроване, непознат метод — не се гадае, а се съобщава с
// грешка. По-добре ясен отказ, отколкото тихо непълно четене.

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

/** Намира записа за край на централната директория, търсейки отзад напред. */
function findEndOfCentralDirectory(archive: Buffer): number {
  // Коментарът на архива е най-много 65 535 байта; толкова назад стига търсенето.
  const earliest = Math.max(0, archive.length - 22 - 0xffff);
  for (let offset = archive.length - 22; offset >= earliest; offset -= 1) {
    if (archive.readUInt32LE(offset) === END_OF_CENTRAL_DIRECTORY) return offset;
  }
  return -1;
}

/**
 * Разчита ZIP архив и връща съдържанието на всеки файл.
 *
 * Архивът се държи само в паметта — нищо не се пише на диска.
 */
export function ayqReadZip(archive: Buffer): AyqZipEntry[] {
  const end = findEndOfCentralDirectory(archive);
  if (end < 0) {
    throw new Error('не е ZIP архив: липсва край на централната директория');
  }

  const entryCount = archive.readUInt16LE(end + 10);
  const directoryOffset = archive.readUInt32LE(end + 16);
  if (entryCount === ZIP64_MARKER_16 || directoryOffset === ZIP64_MARKER_32) {
    throw new Error('zip64 архивите не се поддържат — разархивирайте ръчно');
  }

  const entries: AyqZipEntry[] = [];
  let cursor = directoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (archive.readUInt32LE(cursor) !== CENTRAL_FILE_HEADER) {
      throw new Error(`повреден ZIP: неочакван запис №${index + 1}`);
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

    // Папките се записват с наклонена черта накрая и нямат съдържание.
    if (name.endsWith('/')) continue;

    if ((flags & 0x1) !== 0) {
      throw new Error(`шифрован запис в архива: ${name}`);
    }
    if (method !== METHOD_STORED && method !== METHOD_DEFLATE) {
      throw new Error(`непознат метод на компресия ${method} за ${name}`);
    }

    if (archive.readUInt32LE(localOffset) !== LOCAL_FILE_HEADER) {
      throw new Error(`повреден ZIP: липсва локален запис за ${name}`);
    }
    // Дължините в локалния запис са свои и се четат оттам, а не от директорията.
    const localNameLength = archive.readUInt16LE(localOffset + 26);
    const localExtraLength = archive.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const data = archive.subarray(dataStart, dataStart + compressedSize);

    entries.push({
      name,
      content: method === METHOD_STORED ? Buffer.from(data) : inflateRawSync(data),
    });
  }

  return entries;
}
