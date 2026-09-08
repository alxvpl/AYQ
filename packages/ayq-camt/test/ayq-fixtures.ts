import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export function fixturePath(name: string): string {
  return fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
}

export async function readFixture(name: string): Promise<string> {
  return readFile(fixturePath(name), 'utf8');
}

/**
 * Pads with spaces to exactly 32,500 bytes — the way ABN AMRO delivers each of
 * the 212 daily files.
 */
export function padLikeAbn(content: string, size = 32_500): string {
  const bytes = Buffer.byteLength(content, 'utf8');
  if (bytes >= size) return content;
  return content + ' '.repeat(size - bytes);
}
