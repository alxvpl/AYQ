// The gate backup and restore take the budget alone through (030 §2).
//
// A backup that ran beside a filing could capture the budget before the filing
// wrote it and the store after — so the one property that matters is ordering,
// and ordering is what is pinned here, without timers that happen to line up.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ayqGate } from '../src/ayq-gate.ts';

/** A promise and the function that settles it, for work that ends on cue. */
function held(): { promise: Promise<void>; release(): void } {
  let release = (): void => undefined;
  const promise = new Promise<void>(resolve => {
    release = resolve;
  });
  return { promise, release };
}

/** Lets every queued continuation run. */
async function settle(): Promise<void> {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
}

test('exclusive work waits for shared work already in flight', async () => {
  const gate = ayqGate();
  const said: string[] = [];
  const first = held();

  const shared = gate.shared(async () => {
    said.push('shared began');
    await first.promise;
    said.push('shared ended');
  });
  await settle();
  const alone = gate.exclusive(async () => {
    said.push('exclusive ran');
  });
  await settle();
  assert.deepEqual(
    said,
    ['shared began'],
    'the exclusive work ran beside a write',
  );

  first.release();
  await Promise.all([shared, alone]);
  assert.deepEqual(said, ['shared began', 'shared ended', 'exclusive ran']);
});

test('shared work that arrives during exclusive work waits for it', async () => {
  const gate = ayqGate();
  const said: string[] = [];
  const hold = held();

  const alone = gate.exclusive(async () => {
    said.push('exclusive began');
    await hold.promise;
    said.push('exclusive ended');
  });
  await settle();
  const later = gate.shared(async () => {
    said.push('shared ran');
  });
  await settle();
  assert.deepEqual(
    said,
    ['exclusive began'],
    'a request ran while the budget was held',
  );

  hold.release();
  await Promise.all([alone, later]);
  assert.deepEqual(said, ['exclusive began', 'exclusive ended', 'shared ran']);
});

test('two exclusive pieces of work never overlap', async () => {
  const gate = ayqGate();
  let inside = 0;
  let most = 0;
  const work = async (): Promise<void> => {
    inside += 1;
    most = Math.max(most, inside);
    await settle();
    inside -= 1;
  };
  await Promise.all([
    gate.exclusive(work),
    gate.exclusive(work),
    gate.exclusive(work),
  ]);
  assert.equal(most, 1);
});

test('shared work still runs side by side, as it always has', async () => {
  const gate = ayqGate();
  let inside = 0;
  let most = 0;
  const work = async (): Promise<void> => {
    inside += 1;
    most = Math.max(most, inside);
    await settle();
    inside -= 1;
  };
  await Promise.all([gate.shared(work), gate.shared(work), gate.shared(work)]);
  assert.equal(most, 3);
});

test('a failed exclusive piece of work opens the gate again', async () => {
  const gate = ayqGate();
  await assert.rejects(
    gate.exclusive(async () => {
      throw new Error('the backup failed');
    }),
  );
  assert.equal(await gate.shared(async () => 'answered'), 'answered');
});
