// Четене на CAMT файлове — от папка, от единичен файл или направо от ZIP.
//
// Три неща, които при 212 реални файла имат значение и при две фикстури нямат:
// обхождането слиза в подпапки, ZIP архивът се чете в паметта без да се
// разархивира на диска, и кодировката се чете от самата XML декларация. Файл,
// обявен като ISO-8859-1 и прочетен като UTF-8, не гърми — просто дава
// повредени имена, което е точно видът тиха грешка, който спайкът изключва.
//
// Пътищата остават тук. Навън, в записите и в отчета, тръгва най-много
// базовото име, а в споделяемия отчет — само пореден номер.

import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';

import { ayqReadZip } from './ayq-zip.ts';

export type AyqLoadedFile = {
  /** Базовото име. Пълният път не пътува с файла. */
  name: string;
  /** Архивът, от който е дошъл, ако е дошъл от архив. */
  archive: string | null;
  content: string;
  /** Кодировката, обявена в XML декларацията, ако има такава. */
  declaredEncoding: string | null;
  bytes: number;
};

export type AyqFailedFile = {
  /** Пореден номер, а не име: имената на експортите носят номер на сметка. */
  index: number;
  reason: string;
};

const XML_DECLARATION_ENCODING = /<\?xml[^>]*\bencoding\s*=\s*["']([^"']+)["']/i;

/**
 * Декодира съдържанието според обявената в него кодировка.
 *
 * Декларацията се търси в първите 256 байта, разчетени като latin1 — там всеки
 * байт е валиден знак, така че сканирането не може да се спъне в съдържанието,
 * което тепърва ще се декодира.
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
      // Непозната кодировка: чете се като UTF-8 и се съобщава в отчета.
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

/** Чете един файл от диска според обявената му кодировка. */
export async function ayqReadCamtFile(path: string): Promise<AyqLoadedFile> {
  return ayqDecodeCamt(await readFile(path), basename(path));
}

/** Чете всички XML файлове в ZIP архив, без да пише нищо на диска. */
export async function ayqReadCamtZip(path: string): Promise<AyqLoadedFile[]> {
  const archive = basename(path);
  return ayqReadZip(await readFile(path))
    .filter(entry => isXml(entry.name))
    .map(entry =>
      ayqDecodeCamt(entry.content, basename(entry.name), archive),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Събира входа: папка (рекурсивно), единичен XML файл или ZIP архив.
 *
 * Подредбата е стабилна, за да е стабилен и отчетът между две пускания.
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
