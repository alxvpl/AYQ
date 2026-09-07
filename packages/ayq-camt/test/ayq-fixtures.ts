import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export function fixturePath(name: string): string {
  return fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
}

export async function readFixture(name: string): Promise<string> {
  return readFile(fixturePath(name), 'utf8');
}

/**
 * Допълва до точно 32 500 байта с интервали — така ABN AMRO доставя всеки от
 * 212-те дневни файла.
 */
export function padLikeAbn(content: string, size = 32_500): string {
  const bytes = Buffer.byteLength(content, 'utf8');
  if (bytes >= size) return content;
  return content + ' '.repeat(size - bytes);
}
