// The application icon is the mark (06 §3.6): rasterised from the vector
// master, transparent outside the field, and the same bytes every time.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

import { ayqMarkAt, ayqMarkShapes } from '../build-icon-mark.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const icon = join(here, '..', 'build', 'icon.png');

function built(): Buffer {
  execFileSync(process.execPath, [join(here, '..', 'build-icon.mjs')], {
    stdio: 'ignore',
  });
  return readFileSync(icon);
}

/** The raw RGBA rows of the one-IDAT, filter-0 PNG the build writes. */
function pixels(png: Buffer): {
  size: number;
  at(x: number, y: number): number[];
} {
  const size = png.readUInt32BE(16);
  let offset = 8;
  const data: Buffer[] = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('latin1', offset + 4, offset + 8);
    if (type === 'IDAT')
      data.push(png.subarray(offset + 8, offset + 8 + length));
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(data));
  return {
    size,
    at: (x, y) => {
      const row = y * (size * 4 + 1) + 1;
      return [...raw.subarray(row + x * 4, row + x * 4 + 4)];
    },
  };
}

test('the master keeps to the vocabulary the icon build understands', () => {
  const mark = ayqMarkShapes();
  assert.equal(mark.size, 96);
  assert.equal(mark.shapes[0].kind, 'rect');
  assert.ok(mark.shapes.length >= 3, 'the mark has more than a field');
  assert.equal(
    ayqMarkAt(mark, 0.5, 0.5),
    null,
    'the corner is outside the field',
  );
  assert.deepEqual(
    ayqMarkAt(mark, 48, 48),
    [0x10, 0xf5, 0xfa],
    'the aperture is at the centre',
  );
});

test('the icon is 256 px, transparent outside the field, the mark inside, and deterministic', () => {
  const first = built();
  const second = built();
  assert.ok(first.equals(second), 'two builds of one master differ');

  const { size, at } = pixels(first);
  assert.equal(size, 256);
  assert.equal(at(0, 0)[3], 0, 'the corner is not transparent');
  assert.equal(at(128, 128)[3], 255);
  assert.deepEqual(
    at(128, 128).slice(0, 3),
    [0x10, 0xf5, 0xfa],
    'the centre is not the aperture',
  );
  assert.deepEqual(
    at(200, 40).slice(0, 3),
    [0x0a, 0x8a, 0xd4],
    'the field is not the field',
  );
});
