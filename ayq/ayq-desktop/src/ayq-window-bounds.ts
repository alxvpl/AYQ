// Where the window opens, and where it opened last time (04 A25).
//
// The first launch targets 1600 px wide, fitted to the work area when that is
// smaller. From then on the window opens where the person last left it: the
// normal (not maximised, not minimised) size and position are written when the
// window closes and read on the next launch. A saved position is never trusted
// blindly — a monitor may have been unplugged or rearranged since — so a window
// that would open off-screen, or with no title bar to take hold of, opens at
// the default instead, and one larger than the screen it lands on is fitted.
//
// Only this geometry is kept, in one small file of its own beside the budget
// (the data directory is where AYQ writes; nothing is written outside it). It
// is not a settings subsystem: the owner's interface choices stay in the AYQ
// store (04 A23), and nothing else is added here.
//
// Everything below the file access is pure, so the rules can be tested without
// Electron or a screen.

import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export type AyqRect = { x: number; y: number; width: number; height: number };

/** 04 A25: the width the first launch aims for. */
export const AYQ_WINDOW_DEFAULT_WIDTH = 1600;
/** The height the window has always opened at; A25 fixes only the width. */
export const AYQ_WINDOW_DEFAULT_HEIGHT = 820;
/** The smallest window the shell is laid out for. */
export const AYQ_WINDOW_MIN_WIDTH = 640;
export const AYQ_WINDOW_MIN_HEIGHT = 480;

/**
 * How much of the window's top edge must fall on a work area for a saved
 * position to count as reachable: enough of the title bar to take hold of and
 * drag back.
 */
const GRIP_WIDTH = 120;
const GRIP_HEIGHT = 32;

const FILE = 'ayq-window.json';

/** The default: 1600 × 820, fitted to the work area and centred on it. */
export function ayqDefaultBounds(workArea: AyqRect): AyqRect {
  const width = Math.min(AYQ_WINDOW_DEFAULT_WIDTH, workArea.width);
  const height = Math.min(AYQ_WINDOW_DEFAULT_HEIGHT, workArea.height);
  return {
    x: workArea.x + Math.floor((workArea.width - width) / 2),
    y: workArea.y + Math.floor((workArea.height - height) / 2),
    width,
    height,
  };
}

function overlap(a: AyqRect, b: AyqRect): AyqRect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  if (right <= x || bottom <= y) return null;
  return { x, y, width: right - x, height: bottom - y };
}

function isRect(value: unknown): value is AyqRect {
  if (typeof value !== 'object' || value === null) return false;
  const one = value as Record<string, unknown>;
  return ['x', 'y', 'width', 'height'].every(
    key => typeof one[key] === 'number' && Number.isFinite(one[key]),
  );
}

/**
 * Where the window opens.
 *
 * `saved` is what the last close wrote, or null on a first launch. It is used
 * when its title bar lands on one of the work areas the machine has now; it is
 * then fitted to that work area if it is larger, and never made smaller than
 * the minimum. Anything else — no file, a damaged one, a monitor that is gone —
 * falls back to the default on the primary work area.
 */
export function ayqOpeningBounds(
  saved: unknown,
  workAreas: readonly AyqRect[],
  primary: AyqRect,
): { bounds: AyqRect; restored: boolean } {
  if (!isRect(saved) || saved.width <= 0 || saved.height <= 0) {
    return { bounds: ayqDefaultBounds(primary), restored: false };
  }

  const grip: AyqRect = {
    x: saved.x,
    y: saved.y,
    width: Math.min(saved.width, GRIP_WIDTH),
    height: Math.min(saved.height, GRIP_HEIGHT),
  };
  // The work area the title bar is on: the one holding most of the grip.
  let home: AyqRect | null = null;
  let best = 0;
  for (const area of workAreas) {
    const shared = overlap(grip, area);
    const size = shared === null ? 0 : shared.width * shared.height;
    if (size > best) {
      best = size;
      home = area;
    }
  }
  if (home === null || best < grip.width * grip.height * 0.5) {
    return { bounds: ayqDefaultBounds(primary), restored: false };
  }

  const width = Math.min(
    Math.max(saved.width, AYQ_WINDOW_MIN_WIDTH),
    home.width,
  );
  const height = Math.min(
    Math.max(saved.height, AYQ_WINDOW_MIN_HEIGHT),
    home.height,
  );
  // Kept inside the work area it belongs to, so a window that had grown past
  // the edge of a smaller screen does not hang off it.
  const x = Math.min(Math.max(saved.x, home.x), home.x + home.width - width);
  const y = Math.min(Math.max(saved.y, home.y), home.y + home.height - height);
  return { bounds: { x, y, width, height }, restored: true };
}

/** What the last close wrote, or null if there is nothing usable. */
export function ayqReadWindowBounds(dataDir: string): unknown {
  try {
    return JSON.parse(readFileSync(join(dataDir, FILE), 'utf8')) as unknown;
  } catch {
    return null;
  }
}

/**
 * Records the window's normal bounds. Written beside and then moved over, so a
 * crash mid-write leaves the previous file rather than half of a new one.
 */
export function ayqWriteWindowBounds(dataDir: string, bounds: AyqRect): void {
  const target = join(dataDir, FILE);
  const next = `${target}.next`;
  const { x, y, width, height } = bounds;
  writeFileSync(next, `${JSON.stringify({ x, y, width, height })}\n`);
  renameSync(next, target);
}
