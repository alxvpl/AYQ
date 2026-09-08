// The application icon, drawn rather than committed.
//
// electron-builder wants a 256×256 PNG. Rather than carry a binary in a
// repository that is otherwise all text, it is generated: a dark green field,
// a lighter rounded square, and the diagonal of the "A". Deterministic, so two
// builds of the same commit produce the same file.

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SIZE = 256;
const here = dirname(fileURLToPath(import.meta.url));

const BACKGROUND = [0x12, 0x2f, 0x27];
const MARK = [0x7f, 0xc4, 0xa8];

function inside(x, y) {
  // A rounded square, inset, with the corners cut by a radius.
  const inset = 34;
  const radius = 46;
  const left = inset;
  const right = SIZE - inset;
  if (x < left || x >= right || y < left || y >= right) return false;

  const corners = [
    [left + radius, left + radius],
    [right - radius, left + radius],
    [left + radius, right - radius],
    [right - radius, right - radius],
  ];
  for (const [cx, cy] of corners) {
    const outsideX = (cx < SIZE / 2 && x < cx) || (cx > SIZE / 2 && x > cx);
    const outsideY = (cy < SIZE / 2 && y < cy) || (cy > SIZE / 2 && y > cy);
    if (outsideX && outsideY) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy > radius * radius) return false;
    }
  }
  return true;
}

/** The counter-diagonal, cut out of the mark: the stroke of an A. */
function cut(x, y) {
  const span = 26;
  const distance = Math.abs(x + y - SIZE);
  return distance < span;
}

const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
let offset = 0;
for (let y = 0; y < SIZE; y += 1) {
  raw[offset] = 0;
  offset += 1;
  for (let x = 0; x < SIZE; x += 1) {
    const lit = inside(x, y) && !cut(x, y);
    const colour = lit ? MARK : BACKGROUND;
    raw[offset] = colour[0];
    raw[offset + 1] = colour[1];
    raw[offset + 2] = colour[2];
    raw[offset + 3] = 255;
    offset += 4;
  }
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([length, body, crc]);
}

let table = null;
function crc32(buffer) {
  if (table === null) {
    table = new Int32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      table[n] = c;
    }
  }
  let crc = -1;
  for (const byte of buffer) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return crc ^ -1;
}

const header = Buffer.alloc(13);
header.writeUInt32BE(SIZE, 0);
header.writeUInt32BE(SIZE, 4);
header[8] = 8; // bit depth
header[9] = 6; // truecolour with alpha
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', header),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const out = join(here, 'build', 'icon.png');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, png);
process.stdout.write(`ayq-desktop: ${out} (${png.length} bytes)\n`);
