// Records to Actual transactions, with nothing that opens a database.
//
// This step is pure: it resolves the counterparty, maps the record, and keeps
// the provenance beside it. It is separate from `ayq-import.ts` because the
// desktop engine runs the same pipeline against a budget that is already open,
// and must not pull in a module that calls `api.init`. One pipeline, two
// callers — not two implementations.

import type { AyqBankEntry } from '../../ayq-camt/src/ayq-types.ts';
import { ayqResolveCounterparty } from '../../ayq-camt/src/counterparty/ayq-resolve.ts';
import type { AyqResolveOptions } from '../../ayq-camt/src/counterparty/ayq-counterparty-types.ts';

import {
  ayqToActualTransaction,
  type AyqActualTransaction,
} from './ayq-actual-transaction.ts';
import {
  ayqProvenanceRecord,
  type AyqProvenanceRecord,
} from './ayq-provenance.ts';

export type AyqPrepared = {
  transactions: AyqActualTransaction[];
  provenance: AyqProvenanceRecord[];
  /** Records with no usable date or amount, so nothing was sent. */
  skipped: number;
  /** Records dropped because this batch already carried the same import key. */
  repeated: number;
};

/**
 * Turns records into Actual transactions plus the provenance beside them.
 *
 * Repeats within the batch are dropped here, and that is not belt and braces.
 * Actual deduplicates an import against the transactions a budget already
 * holds, matching on `imported_id` — it does not deduplicate a batch against
 * itself, so twenty-eight rows carrying fourteen distinct keys arrive as
 * twenty-eight transactions. A ZIP of daily exports is exactly that case: the
 * days overlap, and the same entry appears in two files. The first occurrence
 * wins, which makes the outcome depend on the records and not on the order the
 * files happened to be read in — every copy carries the same key.
 */
export function ayqPrepare(
  entries: AyqBankEntry[],
  options: AyqResolveOptions = {},
): AyqPrepared {
  const transactions: AyqActualTransaction[] = [];
  const provenance: AyqProvenanceRecord[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  let repeated = 0;

  for (const entry of entries) {
    const counterparty = ayqResolveCounterparty(entry, options);
    const transaction = ayqToActualTransaction(entry, counterparty);
    if (transaction === null) {
      skipped += 1;
      continue;
    }

    const key = transaction.imported_id;
    if (key !== undefined) {
      if (seen.has(key)) {
        repeated += 1;
        continue;
      }
      seen.add(key);
    }

    transactions.push(transaction);
    provenance.push(ayqProvenanceRecord(entry, counterparty));
  }

  return { transactions, provenance, skipped, repeated };
}

/**
 * Adds the account id Actual requires on every row.
 *
 * The mapping itself does not know which account it is filling — that is only
 * decided at import time — so the id is attached here rather than carried
 * through AyqActualTransaction.
 */
export function ayqWithAccount(
  transactions: AyqActualTransaction[],
  accountId: string,
): Array<AyqActualTransaction & { account: string }> {
  return transactions.map(transaction => ({
    ...transaction,
    account: accountId,
  }));
}
