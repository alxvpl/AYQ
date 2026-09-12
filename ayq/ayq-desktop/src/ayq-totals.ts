// What a transaction counts as, and how much of it is spending.
//
// 03 §9 decides the meaning and this module is the whole of it, in one place,
// because §9.3 requires Register, Reports and Plan to say the same thing about
// the same transaction — and three copies of a rule are three chances to drift.
//
// The rule the sign alone used to decide:
//
//   - money that moved between two of the owner's own accounts is neither
//     (03 §7.6), and that decision is made before this one;
//   - a credit AYQ holds bank evidence of a reversal for reduces the expense it
//     reverses and is never income (§9.1, §9.2);
//   - any other credit is income — including one for the same amount as an
//     expense, in the same category, from the same shop (§9.5);
//   - a debit is spending.
//
// The evidence is the reversal classification the importer wrote into the
// provenance, which came from `RvslInd` or `RtrInf` (§9.4, §2.6). Nothing here
// looks at the amount to decide whether something is a reversal — only at what
// the bank said — because §9.5 says the amount cannot answer that question.

import type { AyqProvenance } from '../../ayq-client/src/ayq-ipc-contract.ts';

/**
 * What one transaction counts as.
 *
 * `spending` and `reversal` are two directions of the same thing: both belong
 * to a category's total and neither is income. They are named apart so that a
 * caller can say which it is looking at without reading the sign back.
 */
export type AyqMoneyKind = 'transfer' | 'reversal' | 'income' | 'spending';

/** The classification the importer recorded, and the only evidence (§9.4). */
export const AYQ_REVERSAL_KIND = 'reversal';

export function ayqHasReversalEvidence(
  provenance: AyqProvenance | undefined,
): boolean {
  return provenance?.kind === AYQ_REVERSAL_KIND;
}

/**
 * What this row counts as.
 *
 * `hasReversalEvidence` is asked of the caller rather than read here, because
 * the provenance lives beside the budget and the caller is the one holding the
 * store open.
 *
 * A reversal the bank booked as a debit is *not* what §9 decided. §9.1 is about
 * a reversal of an expense, which arrives as a credit; a debit carrying the
 * same evidence reverses something that came in, and 03 does not say what that
 * does to the totals. It stays what it has always been — spending — rather
 * than being settled here by implication (00 §1, 03 §9.6).
 */
export function ayqMoneyKind(
  amountCents: number,
  isTransfer: boolean,
  hasReversalEvidence: boolean,
): AyqMoneyKind {
  if (isTransfer) return 'transfer';
  if (amountCents > 0) return hasReversalEvidence ? 'reversal' : 'income';
  return 'spending';
}

/**
 * What the row adds to spending, stated positive — negative for a reversal,
 * which is the whole of §9.1.
 */
export function ayqSpendingCents(
  kind: AyqMoneyKind,
  amountCents: number,
): number {
  if (kind === 'transfer' || kind === 'income') return 0;
  return -amountCents;
}

/** What the row adds to income. Never a reversal (§9.2). */
export function ayqIncomeCents(
  kind: AyqMoneyKind,
  amountCents: number,
): number {
  return kind === 'income' ? amountCents : 0;
}
