// Who may be working on the budget at once.
//
// Ordinary requests share it and run side by side, as they always have. Backup
// and restore take it alone (030 §2): they wait for every request already in
// flight to finish, hold every new one until they are done, and only then close
// the budget. Without this a backup could capture the budget between two writes
// of one filing and the store after the second — two halves of two different
// moments, which is exactly the set 02 §5.9 says a backup never is.
//
// The checks are written inline and never behind a helper that is awaited: the
// moment between "the gate is open" and "I am through it" must contain no await,
// or a second caller can slip into it.

export type AyqGate = {
  /** Runs alongside other shared work, never alongside exclusive work. */
  shared<T>(work: () => Promise<T>): Promise<T>;
  /** Runs alone: after everything in flight, before anything that follows. */
  exclusive<T>(work: () => Promise<T>): Promise<T>;
};

export function ayqGate(): AyqGate {
  let working = 0;
  let alone: Promise<unknown> | null = null;
  const whenIdle: Array<() => void> = [];

  return {
    async shared<T>(work: () => Promise<T>): Promise<T> {
      while (alone !== null) {
        await alone.catch(() => undefined);
      }
      working += 1;
      try {
        return await work();
      } finally {
        working -= 1;
        if (working === 0) {
          for (const wake of whenIdle.splice(0)) wake();
        }
      }
    },

    async exclusive<T>(work: () => Promise<T>): Promise<T> {
      while (alone !== null) {
        await alone.catch(() => undefined);
      }
      const run = (async () => {
        try {
          if (working > 0) {
            await new Promise<void>(wake => whenIdle.push(wake));
          }
          return await work();
        } finally {
          alone = null;
        }
      })();
      alone = run;
      return run;
    },
  };
}
