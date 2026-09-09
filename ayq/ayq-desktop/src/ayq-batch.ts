// One call for many transactions, instead of many calls for one each.
//
// `api.updateTransaction` sends a batch of exactly one. That is fine for a
// person filing a transaction by hand and wrong for the rule that follows it:
// a supermarket in six years of statements is thousands of rows, and thousands
// of round trips is minutes of a person watching nothing happen.
//
// Actual's own handler behind that call takes a list, so this hands it the
// list. The handle comes from `api.init`, which the engine already holds; it is
// lent here rather than imported, because the module that opens the budget must
// not be imported by the modules that use it.

/** What `api.init` returns, narrowed to the one method this needs. */
type AyqSend = (name: string, args?: unknown) => Promise<unknown>;

let send: AyqSend | null = null;

/** Lent by the engine once the budget is open. */
export function ayqUseSend(lend: AyqSend): void {
  send = lend;
}

/**
 * Sets the category on many transactions at once.
 *
 * Chunked, because one message carrying every row of a decade is a message
 * nobody has measured. A thousand at a time is well inside what the handler
 * takes in a single database transaction, and keeps the number of round trips
 * proportional to the work rather than to the rows.
 */
export async function ayqSetCategories(
  updates: Array<{ id: string; category: string | null }>,
): Promise<void> {
  if (updates.length === 0) return;
  if (!send) throw new Error('the budget is not open');

  for (let at = 0; at < updates.length; at += 1000) {
    await send('transactions-batch-update', {
      updated: updates.slice(at, at + 1000),
    });
  }
}
