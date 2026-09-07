// Минимален ZIP писач — само за тестовете, за да има истински архив, който
// четецът да разчете. Поддържа двата метода, които четецът поддържа: store и
// deflate. В `src/` няма писач и не му е мястото там.

import { crc32 } from 'node:zlib';
import { deflateRawSync } from 'node:zlib';

export type AyqZipInput = {
  name: string;
  content: Buffer | string;
  /** true записва без компресия (метод 0). */
  stored?: boolean;
};

export function buildZip(inputs: AyqZipInput[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const input of inputs) {
    const name = Buffer.from(input.name, 'utf8');
    const raw = Buffer.isBuffer(input.content)
      ? input.content
      : Buffer.from(input.content, 'utf8');
    const method = input.stored ? 0 : 8;
    const data = method === 0 ? raw : deflateRawSync(raw);
    const checksum = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // нужна версия
    local.writeUInt16LE(0, 6); // флагове
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // версия на записващия
    central.writeUInt16LE(20, 6); // нужна версия
    central.writeUInt16LE(0, 8); // флагове
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += local.length + name.length + data.length;
  }

  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(inputs.length, 8);
  end.writeUInt16LE(inputs.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, directory, end]);
}
