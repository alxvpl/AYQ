// The AYQ mark, read from its vector master.
//
// `ayq-client/src/ayq-brand/ayq-mark.svg` is the only drawing of the mark.
// This module reads it for the places that cannot load an SVG file as one —
// the icon build, which has no SVG engine and rasterises the shapes itself —
// so that the icon on the taskbar and the mark in the window can never drift
// apart.
//
// Only the vocabulary the master promises is understood: a rounded rectangle
// (`rect` with `rx`) and a filled polygon, in document order, flat fills. The
// first rect is the field, and everything after it is clipped to the field.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** The master, as text. */
export function ayqMarkSvg() {
  return readFileSync(
    join(here, '..', 'ayq-client', 'src', 'ayq-brand', 'ayq-mark.svg'),
    'utf8',
  );
}

function attribute(tag, name) {
  const found = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return found ? found[1] : null;
}

function colour(hex) {
  const value = hex.replace('#', '');
  return [0, 2, 4].map(at => parseInt(value.slice(at, at + 2), 16));
}

/**
 * The shapes of the mark in drawing order, in the master's 96-unit space.
 *
 * Each is `{ kind: 'rect', x, y, width, height, rx, fill }` or
 * `{ kind: 'polygon', points: [[x, y], ...], fill }`, with `fill` as RGB.
 */
export function ayqMarkShapes() {
  const svg = ayqMarkSvg();
  const size = Number(
    attribute(svg.match(/<svg[^>]*>/)[0], 'viewBox').split(/\s+/)[2],
  );
  const shapes = [];
  for (const tag of svg.match(/<(rect|polygon)\b[^>]*\/>/g) ?? []) {
    const fill = colour(attribute(tag, 'fill'));
    if (tag.startsWith('<rect')) {
      shapes.push({
        kind: 'rect',
        x: Number(attribute(tag, 'x')),
        y: Number(attribute(tag, 'y')),
        width: Number(attribute(tag, 'width')),
        height: Number(attribute(tag, 'height')),
        rx: Number(attribute(tag, 'rx') ?? 0),
        fill,
      });
    } else {
      shapes.push({
        kind: 'polygon',
        points: attribute(tag, 'points')
          .trim()
          .split(/\s+/)
          .map(pair => pair.split(',').map(Number)),
        fill,
      });
    }
  }
  if (shapes.length === 0 || shapes[0].kind !== 'rect') {
    throw new Error('the mark must begin with its field, a rounded rect');
  }
  return { size, shapes };
}

/** Whether a point lies in a rounded rectangle. */
export function ayqInRect(shape, x, y) {
  const { x: left, y: top, width, height, rx } = shape;
  const right = left + width;
  const bottom = top + height;
  if (x < left || x >= right || y < top || y >= bottom) return false;
  const r = Math.min(rx, width / 2, height / 2);
  const cx = x < left + r ? left + r : x > right - r ? right - r : x;
  const cy = y < top + r ? top + r : y > bottom - r ? bottom - r : y;
  if (cx === x && cy === y) return true;
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

/** Whether a point lies in a polygon (even-odd). */
export function ayqInPolygon(shape, x, y) {
  const { points } = shape;
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * The colour of one point of the mark, or null outside the field.
 *
 * Shapes are drawn in order, the later over the earlier, all clipped to the
 * field, which is what the SVG does when a browser draws it.
 */
export function ayqMarkAt(mark, x, y) {
  const [field, ...rest] = mark.shapes;
  if (!ayqInRect(field, x, y)) return null;
  let fill = field.fill;
  for (const shape of rest) {
    const hit =
      shape.kind === 'rect'
        ? ayqInRect(shape, x, y)
        : ayqInPolygon(shape, x, y);
    if (hit) fill = shape.fill;
  }
  return fill;
}
