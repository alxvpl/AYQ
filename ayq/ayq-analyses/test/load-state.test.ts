// The transitions of what the application holds (src/load-state.ts), proven
// without a window: the two failure sentences of r003 §11.5 and §11.6 and the
// container rule of r003 §6.3.

import assert from 'node:assert/strict';
import test from 'node:test';
import { applyLoadOutcome, applyRemovalOutcome, holdsCopy, type LoadState } from '../src/load-state.js';
import { translate } from '../src/strings.js';
import { loadFixture } from './helpers.js';

const snapshot = loadFixture('a1-result.json');
const identity = { fileName: 'march.json' };

const NOTHING: LoadState = { kind: 'none' };
const HELD: LoadState = { kind: 'loaded', snapshot, identity };
const REFUSED_COPY: LoadState = { kind: 'activeRefused', reason: 'contractMajor', identity };

test('the two failure sentences are r003 §11.5 and §11.6, word for word', () => {
  assert.equal(
    translate('snapshot.load.failed'),
    'This snapshot could not be loaded. AYQ Analyses did not change what it holds.',
  );
  assert.equal(translate('snapshot.remove.failed'), 'This snapshot could not be removed. AYQ Analyses still holds it.');
});

test('a valid candidate whose copy could not be written says so and changes nothing — on a first load, on a replacement, and while the held copy is refused', () => {
  for (const before of [NOTHING, HELD, REFUSED_COPY]) {
    const after = applyLoadOutcome(before, { status: 'failed' });
    assert.equal(after.load, before, `${before.kind}: what is held is unchanged`);
    assert.deepEqual(after.notice, { kind: 'sentence', key: 'snapshot.load.failed' });
    assert.equal(after.resetContext, false, `${before.kind}: the context on screen is untouched`);
  }
  // The sentence claims no previous snapshot, so it is true with nothing held.
  assert.doesNotMatch(translate('snapshot.load.failed'), /previous/i);
});

test('a failed removal keeps the state true to what is still held, identity included, and says so', () => {
  for (const before of [HELD, REFUSED_COPY]) {
    const after = applyRemovalOutcome(before, { removed: false });
    assert.equal(after.load, before, `${before.kind}: no transition to "No data loaded"`);
    assert.equal((after.load as { identity: { fileName: string } }).identity.fileName, 'march.json');
    assert.deepEqual(after.notice, { kind: 'sentence', key: 'snapshot.remove.failed' });
    assert.equal(after.resetContext, false);
  }
  const removed = applyRemovalOutcome(HELD, { removed: true });
  assert.deepEqual(removed.load, { kind: 'none' });
  assert.equal(removed.notice, null);
  assert.equal(removed.resetContext, true);
});

test('a refused candidate is said over a held copy and becomes the body when nothing is held (r003 §6.3)', () => {
  for (const before of [HELD, REFUSED_COPY]) {
    assert.ok(holdsCopy(before));
    const after = applyLoadOutcome(before, { status: 'invalid', reason: 'malformed' });
    assert.equal(after.load, before);
    assert.deepEqual(after.notice, { kind: 'refused', reason: 'malformed' });
    assert.equal(after.resetContext, false);
  }
  for (const before of [NOTHING, { kind: 'candidateRefused', reason: 'unknown' } as LoadState]) {
    assert.ok(!holdsCopy(before));
    const after = applyLoadOutcome(before, { status: 'invalid', reason: 'malformed' });
    assert.deepEqual(after.load, { kind: 'candidateRefused', reason: 'malformed' });
    assert.equal(after.notice, null);
    assert.equal(after.resetContext, true);
  }
});

test('a cancelled dialog changes nothing and says nothing; a proven candidate becomes the snapshot in use with a fresh context', () => {
  const cancelled = applyLoadOutcome(HELD, { status: 'cancelled' });
  assert.equal(cancelled.load, HELD);
  assert.equal(cancelled.notice, null);
  const loaded = applyLoadOutcome(REFUSED_COPY, { status: 'loaded', snapshot, identity: { fileName: 'april.json' } });
  assert.equal(loaded.load.kind, 'loaded');
  assert.equal(loaded.notice, null);
  assert.equal(loaded.resetContext, true);
});
