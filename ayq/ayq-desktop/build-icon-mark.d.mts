// Types for the mark reader, for the test that checks it. The module itself
// is plain JavaScript because the icon build runs before anything is compiled.

export type AyqMarkRect = {
  kind: 'rect';
  x: number;
  y: number;
  width: number;
  height: number;
  rx: number;
  fill: number[];
};
export type AyqMarkPolygon = {
  kind: 'polygon';
  points: number[][];
  fill: number[];
};
export type AyqMarkShape = AyqMarkRect | AyqMarkPolygon;
export type AyqMark = { size: number; shapes: AyqMarkShape[] };

export function ayqMarkSvg(): string;
export function ayqMarkShapes(): AyqMark;
export function ayqInRect(shape: AyqMarkRect, x: number, y: number): boolean;
export function ayqInPolygon(
  shape: AyqMarkPolygon,
  x: number,
  y: number,
): boolean;
export function ayqMarkAt(mark: AyqMark, x: number, y: number): number[] | null;
