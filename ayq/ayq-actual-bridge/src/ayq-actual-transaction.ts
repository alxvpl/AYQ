// Mapping the intermediate bank record onto an Actual transaction.
//
// Step 4 of the spike. Actual stores amounts as integer cents and has no field
// for a counterparty account, a bank transaction code or a SEPA mandate — as
// the base evaluation noted in §4. So the mapping is deliberately narrow: what
// Actual models goes into the transaction, and everything else stays in the
// intermediate record and travels alongside as provenance.
//
// Nothing here reads the raw XML again; it works from AyqBankEntry only.

import type { AyqBankEntry } from '../../ayq-camt/src/ayq-types.ts';
import { ayqToLegacyTransaction } from '../../ayq-camt/src/ayq-legacy.ts';
import { ayqCanonicalName } from '../../ayq-camt/src/counterparty/ayq-description.ts';
import type { AyqCounterparty } from '../../ayq-camt/src/counterparty/ayq-counterparty-types.ts';

/** A transaction in the shape `@actual-app/api` accepts. */
export type AyqActualTransaction = {
  /** YYYY-MM-DD. */
  date: string;
  /** Signed integer cents. */
  amount: number;
  /** The resolved counterparty — the point of the whole exercise. */
  payee_name?: string;
  /** What the bank actually said, kept verbatim. */
  imported_payee?: string;
  notes?: string;
  /** Stable across re-exports of the same day, so re-import deduplicates. */
  imported_id?: string;
  cleared?: boolean;
};

const DECIMAL = /^([+-]?)(\d+)(?:[.,](\d+))?$/;

/**
 * Converts a decimal string to integer cents without going through a float.
 *
 * The bank gives the amount as text and Actual wants cents; multiplying the
 * parsed double by 100 turns 23.45 into 2344.9999999999995 and leans on
 * rounding to hide it. Parsing the digits directly avoids the question. A
 * third decimal is rounded half away from zero.
 */
export function ayqDecimalToCents(raw: string | null): number | null {
  if (raw === null) return null;
  const match = raw.trim().replace(/\s/g, '').match(DECIMAL);
  if (!match) return null;

  const [, sign, whole, fraction = ''] = match;
  const thousandths =
    Number(whole) * 1000 + Number(`${fraction}000`.slice(0, 3));
  const cents = Math.round(thousandths / 10);
  return sign === '-' ? -cents : cents;
}

/**
 * The signed amount in cents.
 *
 * The sign comes from CdtDbtInd, not from the text: the bank writes the
 * amount unsigned and states the direction separately.
 */
export function ayqEntryCents(entry: AyqBankEntry): number | null {
  const magnitude = ayqDecimalToCents(entry.amount.raw);
  if (magnitude === null) {
    // No raw text (an amount the bank did not give): fall back to the number.
    return entry.amount.value === null
      ? null
      : Math.round(entry.amount.value * 100);
  }
  const size = Math.abs(magnitude);
  return entry.creditDebitIndicator === 'DBIT' ? -size : size;
}

/**
 * Maps one intermediate record onto an Actual transaction.
 *
 * Two choices worth stating, both reversible because the record keeps
 * everything:
 *
 *   - The date is `BookgDt` first, `ValDt` second. Actual's own CAMT importer
 *     prefers `ValDt`; the booking date is what the statement shows and what a
 *     person recognises. Both dates stay in the record.
 *   - `payee_name` is the resolved counterparty and `imported_payee` is what
 *     the bank said. That is exactly the split Actual defines, and it is what
 *     turns 201 distinct card names into one payee per merchant.
 */
export function ayqToActualTransaction(
  entry: AyqBankEntry,
  counterparty: AyqCounterparty,
): AyqActualTransaction | null {
  const date = entry.bookingDate.date ?? entry.valueDate.date;
  const amount = ayqEntryCents(entry);
  if (date === null || amount === null) return null;

  const legacy = ayqToLegacyTransaction(entry);
  const transaction: AyqActualTransaction = {
    date,
    amount,
    cleared: entry.status === null ? undefined : entry.status === 'BOOK',
  };

  // The canonical name, not the variant the terminal printed: "ALBERT HEIJN
  // 1234" and "ALBERT HEIJN 5678" are one shop, and a ledger that lists them
  // as two counterparties is the problem this whole exercise exists to solve.
  // The variant survives as `imported_payee`.
  const payee = ayqCanonicalName(counterparty.name) ?? legacy.payee_name;
  if (payee !== null && payee !== undefined) transaction.payee_name = payee;
  if (legacy.payee_name !== null) transaction.imported_payee = legacy.payee_name;
  if (legacy.notes !== null) transaction.notes = legacy.notes;

  // The bank's own reference is the strongest deduplication key; the record's
  // own key is the fallback, and is just as stable across re-exports.
  transaction.imported_id =
    entry.references.accountServicerReference ?? entry.ayqKey;

  return transaction;
}
