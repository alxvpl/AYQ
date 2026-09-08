// Reading back what was just written.
//
// `@actual-app/api` applies a mutation through the same message layer that
// carries sync, and that layer lands after the call that queued it has already
// resolved. Its own interface never notices — it is event-driven and redraws
// when the change arrives — but an engine that updates a transaction and then
// reads it in the next statement can get the value from before the write. It
// was measured, not assumed: a category set and then read back immediately came
// back empty, and the read after it came back correct.
//
// So a read-after-write here does not sleep and hope. It reads, checks the
// answer against what was written, and reads again until it agrees. The
// predicate is what makes it a fix rather than a race: nothing proceeds on an
// answer that does not yet reflect the change.

/** How long to keep asking before admitting the write did not take. */
const ATTEMPTS = 60;
const PAUSE_MS = 25;

export async function ayqSettle<T>(
  read: () => Promise<T>,
  settled: (value: T) => boolean,
  what = 'the write',
): Promise<T> {
  let value = await read();

  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    if (settled(value)) return value;
    await new Promise(resolve => setTimeout(resolve, PAUSE_MS));
    value = await read();
  }

  if (!settled(value)) {
    throw new Error(
      `${what} did not reach the budget within ` +
        `${(ATTEMPTS * PAUSE_MS) / 1000}s`,
    );
  }
  return value;
}
