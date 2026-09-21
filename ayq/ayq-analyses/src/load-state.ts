// AYQ Analyses — what the application holds, and how an outcome changes it.
//
// The renderer's snapshot state is one value, and every outcome of a load or
// a removal is applied to it by the two pure functions here, so the suite can
// prove each transition without a window: a refused candidate leaves the
// active snapshot in use (r003 §6.3, §11.5); a valid candidate that could not
// be saved changes nothing and says so (r003 §11.5); a removal that failed on
// disk keeps the state true to what is still held and says so (r003 §11.6).

import type { SnapshotIdentity, SnapshotLoadResult } from './preload.js';
import type { StringKey } from './strings.js';
import type { AyqAnalyticalSnapshot } from './types.js';

/**
 * `pending` is the launch read; `none` is no active copy; `candidateRefused`
 * is no active copy and a chosen file just refused; `activeRefused` is an
 * active copy that failed revalidation (r003 §6.2); `loaded` is the active
 * snapshot in use.
 */
export type LoadState =
  | { kind: 'pending' }
  | { kind: 'none' }
  | { kind: 'candidateRefused'; reason: string }
  | { kind: 'activeRefused'; reason: string; identity: SnapshotIdentity }
  | { kind: 'loaded'; snapshot: AyqAnalyticalSnapshot; identity: SnapshotIdentity };

/** What is said over the current surface, if anything: a refusal with its reason, or one failure sentence. */
export type Notice = { kind: 'refused'; reason: string } | { kind: 'sentence'; key: StringKey };

export interface Transition {
  load: LoadState;
  notice: Notice | null;
  /** True when the analytical context must return to its default (a new snapshot) or be dropped (nothing usable). */
  resetContext: boolean;
}

/** Whether the application holds a copy — usable or refused — that a failure must not disturb. */
export function holdsCopy(load: LoadState): boolean {
  return load.kind === 'loaded' || load.kind === 'activeRefused';
}

export function applyLoadOutcome(load: LoadState, result: SnapshotLoadResult): Transition {
  switch (result.status) {
    case 'cancelled':
      return { load, notice: null, resetContext: false };
    case 'failed':
      // Valid, but its copy could not be written or proven: the application
      // keeps what it held — a snapshot, a refused copy, or nothing — and says
      // so in the one sentence that is true in all three cases (r003 §11.5).
      return { load, notice: { kind: 'sentence', key: 'snapshot.load.failed' }, resetContext: false };
    case 'invalid':
      if (holdsCopy(load)) {
        // The copy is untouched and stays in use; the refusal is said over it (r003 §6.3).
        return { load, notice: { kind: 'refused', reason: result.reason }, resetContext: false };
      }
      // Nothing to keep on screen: the refusal is the state of the whole body.
      return { load: { kind: 'candidateRefused', reason: result.reason }, notice: null, resetContext: true };
    case 'loaded':
      return {
        load: { kind: 'loaded', snapshot: result.snapshot, identity: result.identity },
        notice: null,
        resetContext: true,
      };
  }
}

export function applyRemovalOutcome(load: LoadState, outcome: { removed: boolean }): Transition {
  if (outcome.removed) return { load: { kind: 'none' }, notice: null, resetContext: true };
  // The copy survives, so the screen keeps saying the application holds it
  // — identity included — and adds only the sentence (r003 §11.6).
  return { load, notice: { kind: 'sentence', key: 'snapshot.remove.failed' }, resetContext: false };
}
