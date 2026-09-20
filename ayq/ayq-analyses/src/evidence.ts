// AYQ Analyses — the reversal explanation in the evidence view.
//
// A reversal appears under the counterparty of the transaction it reverses,
// and the pane says which transaction that is, in human facts, and — when the
// original is not part of the current population — why (r003 §6.7, r03 §9).
// The sentences are selected here, outside any component, so the selection
// can be asserted deterministically.

import { formatDate } from './format.js';
import { formatMoney } from './money.js';
import type { StringKey, StringParams } from './strings.js';
import type { Contribution, CoverageFacts, OriginalOutsideReason } from './types.js';

export type Translate = (key: StringKey, params?: StringParams) => string;

const OUTSIDE_KEYS: Record<Exclude<OriginalOutsideReason, 'period'>, StringKey> = {
  accounts: 'evidence.reversesOutsideAccounts',
  filter: 'evidence.reversesOutsideFilter',
  selection: 'evidence.reversesOutsideSelection',
};

/**
 * The lines that explain a reversal, in order: the original it reverses, then
 * the reason that original is outside the current population, if it is.
 *
 * The original is named by date, amount and canonical counterparty. When the
 * original has no canonical counterparty it is named by date and amount alone
 * (011 §4): no placeholder word stands in for the missing name, and the
 * outside-population sentence follows exactly as it does otherwise.
 */
export function reversalEvidence(
  contribution: Contribution,
  coverage: CoverageFacts,
  t: Translate,
  locale: string,
): string[] {
  const original = contribution.original;
  if (original === null) return [];

  const date = formatDate(original.transaction.bookingDate, locale);
  const amount = formatMoney(original.transaction.amount.amount, original.transaction.amount.currency, locale);

  const lines = [
    original.counterpartyName === null
      ? t('evidence.reversesNoCounterparty', { date, amount })
      : t('evidence.reverses', { date, amount, counterparty: original.counterpartyName }),
  ];

  if (original.outsideReason === 'period') {
    lines.push(
      t('evidence.reversesOutsidePeriod', {
        from: formatDate(coverage.fromDate, locale),
        to: formatDate(coverage.toDate, locale),
      }),
    );
  } else if (original.outsideReason !== null) {
    lines.push(t(OUTSIDE_KEYS[original.outsideReason]));
  }

  return lines;
}
