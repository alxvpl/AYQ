// The application icon, drawn from the mark's vector master.
//
// electron-builder wants a 256×256 PNG. Rather than carry a binary in a
// repository that is otherwise all text, it is rasterised here from
// `ayq-client/src/ayq-brand/ayq-mark.svg` — the same drawing the About
// surface and the title bar show — with no SVG engine: the master keeps to
// rounded rectangles and polygons in flat colours, and this samples them. Deterministic, so two
// builds of the same commit produce the same file, and transparent outside
// the field so the taskbar shows the mark and not a tile.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

import { ayqMarkAt, ayqMarkShapes } from './build-icon-mark.mjs';

const SIZE = 256;
/** Samples per pixel edge: 4 × 4 = 16 per pixel, enough for a clean edge. */
const SAMPLES = 4;
const here = dirname(fileURLToPath(import.meta.url));

const mark = ayqMarkShapes();
const scale = mark.size / SIZE;

const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
let offset = 0;
for (let y = 0; y < SIZE; y += 1) {
  raw[offset] = 0;
  offset += 1;
  for (let x = 0; x < SIZE; x += 1) {
    // Average the covered samples: colour over the covered ones, alpha over all.
    let covered = 0;
    const sum = [0, 0, 0];
    for (let sy = 0; sy < SAMPLES; sy += 1) {
      for (let sx = 0; sx < SAMPLES; sx += 1) {
        const px = (x + (sx + 0.5) / SAMPLES) * scale;
        const py = (y + (sy + 0.5) / SAMPLES) * scale;
        const fill = ayqMarkAt(mark, px, py);
        if (fill === null) continue;
        covered += 1;
        sum[0] += fill[0];
        sum[1] += fill[1];
        sum[2] += fill[2];
      }
    }
    const all = SAMPLES * SAMPLES;
    raw[offset] = covered === 0 ? 0 : Math.round(sum[0] / covered);
    raw[offset + 1] = covered === 0 ? 0 : Math.round(sum[1] / covered);
    raw[offset + 2] = covered === 0 ? 0 : Math.round(sum[2] / covered);
    raw[offset + 3] = Math.round((covered / all) * 255);
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
