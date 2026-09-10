// Matching an expected payment to an actual transaction.
//
// 03 §7.3 calls this a core part of the model, and 03 §4.3–§4.4 decide how it
// has to behave: every match records who made it, a person's match outranks
// automation, and automation may revise its own earlier work and never
// somebody else's.
//
// The rule for applying one without asking is deliberately narrow (03 §7.5 —
// the cautious reading is the one that does not quietly mark a bill paid). The
// counterparty or the mandate has to agree, the amount has to be exact, and the
// date has to be close. Anything less is offered and waits.
//
// The comparison itself is pure and lives at the top of this file, so what
// counts as a match is provable rather than a matter of watching it work.

import type {
  AyqMatchCandidate,
  AyqMatchProposal,
  AyqPlanOccurrence,
} from '../../ayq-client/src/ayq-ipc-contract.ts';

import { ayqDaysBetween } from './ayq-dates.ts';

/** Within this many days, a match may be applied without asking. */
export const AYQ_MATCH_WINDOW_DAYS = 7;

/** Within this many, it may be offered. */
export const AYQ_MATCH_OFFER_DAYS = 14;

/** How far the amount may differ for a match to be worth offering, as a share. */
export const AYQ_MATCH_AMOUNT_TOLERANCE = 0.1;

/** The signed cents an occurrence would appear as in the ledger. */
function signed(occurrence: AyqPlanOccurrence): number {
  return occurrence.kind === 'income'
    ? occurrence.amountCents
    : -occurrence.amountCents;
}

/**
 * What one candidate has in common with one expected payment.
 *
 * The strings are the evidence a person reads before agreeing. "It looked
 * right" is not a reason anybody can check afterwards.
 */
function evidenceFor(
  occurrence: AyqPlanOccurrence,
  candidate: AyqMatchCandidate,
  recordKey: string | null,
  recordMandate: string | null,
): {
  evidence: string[];
  identified: boolean;
  exact: boolean;
  daysApart: number;
} | null {
  const expected = signed(occurrence);
  // Money going the other way is not this payment, whatever else agrees.
  if (Math.sign(expected) !== Math.sign(candidate.amountCents)) return null;

  const daysApart = Math.abs(
    ayqDaysBetween(occurrence.effectiveDate, candidate.date),
  );
  if (daysApart > AYQ_MATCH_OFFER_DAYS) return null;

  const evidence: string[] = [];
  const keyAgrees =
    recordKey !== null && candidate.counterpartyKey === recordKey;
  const mandateAgrees =
    recordMandate !== null && candidate.mandateId === recordMandate;
  if (keyAgrees) evidence.push('the same counterparty');
  if (mandateAgrees) evidence.push('the same SEPA mandate');

  const exact = candidate.amountCents === expected;
  if (exact) evidence.push('the same amount');
  else {
    const off = Math.abs(candidate.amountCents - expected);
    if (off > Math.abs(expected) * AYQ_MATCH_AMOUNT_TOLERANCE) return null;
    evidence.push('an amount within a tenth of it');
  }

  evidence.push(
    daysApart === 0
      ? 'the same day'
      : daysApart === 1
        ? 'one day apart'
        : `${daysApart} days apart`,
  );

  // Something has to identify it. Amount and date alone match any two payments
  // of the same size in the same week, which is most of a supermarket month.
  const identified = keyAgrees || mandateAgrees;
  if (!identified && !exact) return null;

  return { evidence, identified, exact, daysApart };
}

export type AyqMatchInput = {
  /** Only those still expected: unmatched, not dismissed. */
  occurrences: AyqPlanOccurrence[];
  /** The counterparty key and mandate of the record behind each occurrence. */
  recordKeys: Map<string, { key: string | null; mandateId: string | null }>;
  candidates: AyqMatchCandidate[];
  /** Transaction ids already matched to something. */
  taken: Set<string>;
  /** `${recordId} ${dueDate}` → transaction ids a person has already refused. */
  refused: Map<string, Set<string>>;
};

/**
 * Every match worth putting to somebody, best first.
 *
 * One transaction can only be one payment, so a transaction already proposed
 * for an earlier occurrence is not proposed again. Occurrences are taken in
 * date order, which makes the pairing deterministic: the same budget and the
 * same statement give the same answer every time, which a person correcting a
 * match afterwards depends on.
 */
export function ayqProposeMatches(input: AyqMatchInput): AyqMatchProposal[] {
  const used = new Set(input.taken);
  const proposals: AyqMatchProposal[] = [];

  const inOrder = [...input.occurrences].sort((left, right) =>
    left.effectiveDate < right.effectiveDate ? -1 : 1,
  );

  for (const occurrence of inOrder) {
    const record = input.recordKeys.get(occurrence.recordId);
    const refused =
      input.refused.get(`${occurrence.recordId} ${occurrence.dueDate}`) ??
      new Set<string>();

    let best: AyqMatchProposal | null = null;
    for (const candidate of input.candidates) {
      if (used.has(candidate.transactionId)) continue;
      if (refused.has(candidate.transactionId)) continue;

      const found = evidenceFor(
        occurrence,
        candidate,
        record?.key ?? null,
        record?.mandateId ?? null,
      );
      if (found === null) continue;

      const proposal: AyqMatchProposal = {
        recordId: occurrence.recordId,
        dueDate: occurrence.dueDate,
        recordName: occurrence.name,
        expectedDate: occurrence.effectiveDate,
        expectedAmountCents: occurrence.amountCents,
        transactionId: candidate.transactionId,
        transactionDate: candidate.date,
        transactionPayee: candidate.payee,
        transactionAmountCents: candidate.amountCents,
        daysApart: found.daysApart,
        evidence: found.evidence,
        // The narrow rule, and all three parts of it are required.
        confident:
          found.identified &&
          found.exact &&
          found.daysApart <= AYQ_MATCH_WINDOW_DAYS,
      };

      if (best === null || better(proposal, best)) best = proposal;
    }

    if (best !== null) {
      used.add(best.transactionId);
      proposals.push(best);
    }
  }

  return proposals;
}

/** A confident match beats an offer; then the nearer date; then the name. */
function better(one: AyqMatchProposal, than: AyqMatchProposal): boolean {
  if (one.confident !== than.confident) return one.confident;
  if (one.daysApart !== than.daysApart) return one.daysApart < than.daysApart;
  return one.transactionId < than.transactionId;
}
