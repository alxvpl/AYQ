// Matching an expected payment to an actual transaction.
//
// 03 §7.3 calls this a core part of the model, and 03 §4.3–§4.4 decide how it
// has to behave: every match records who made it, a person's match outranks
// automation, and automation may revise its own earlier work and never
// somebody else's.
//
// The rule for applying one without asking is deliberately narrow (03 §7.16).
// The counterparty or the mandate has to agree, the amount has to be exact, the
// date has to be close — and the pair has to be the only one of its kind, with
// exactly one occurrence and exactly one transaction qualifying. Anything less
// is offered and waits.
//
// That last condition is the one that is easy to leave out and expensive to
// leave out. Two identical direct debits a day apart, or one payment that could
// settle either of two months' rent, are precisely the cases where picking is a
// judgement rather than a deduction — and 03 §7.5 says the cautious reading is
// the one that does not quietly mark a bill paid.
//
// The comparison itself is pure and lives at the top of this file, so what
// counts as a match is provable rather than a matter of watching it work.

import type {
  AyqMatchCandidate,
  AyqMatchEvidence,
  AyqMatchProposal,
  AyqPlanOccurrence,
} from '../../ayq-client/src/ayq-ipc-contract.ts';

import { ayqAddDays, ayqDaysBetween } from './ayq-dates.ts';

/** Within this many days, a match may be applied without asking. */
export const AYQ_MATCH_WINDOW_DAYS = 7;

/** One closed range of transaction dates, both ends inclusive. */
export type AyqMatchWindow = { from: string; through: string };

/**
 * The automatic matching date window of one expected payment: every
 * transaction date on which a match may be applied without asking, centred on
 * the date the payment is expected — its effective date, which is the moved
 * date when it was rescheduled.
 *
 * This is the one source of that window. The matcher qualifies a pair by it
 * below, and the analytical snapshot states its end and whether statement
 * coverage spans it (A2 specification r001 §5.4–§5.5), so the two cannot come
 * to disagree and nothing outside this file repeats its width.
 */
export function ayqAutomaticMatchWindow(expectedDate: string): AyqMatchWindow {
  return {
    from: ayqAddDays(expectedDate, -AYQ_MATCH_WINDOW_DAYS),
    through: ayqAddDays(expectedDate, AYQ_MATCH_WINDOW_DAYS),
  };
}

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
 * The codes are the evidence a person reads before agreeing — worded by the
 * catalogue (04 A24). "It looked right" is not a reason anybody can check
 * afterwards. How far apart the dates are travels as `daysApart`, a number,
 * and the renderer says it once.
 */
function evidenceFor(
  occurrence: AyqPlanOccurrence,
  candidate: AyqMatchCandidate,
  recordKey: string | null,
  recordMandate: string | null,
): {
  evidence: AyqMatchEvidence[];
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

  const evidence: AyqMatchEvidence[] = [];
  const keyAgrees =
    recordKey !== null && candidate.counterpartyKey === recordKey;
  const mandateAgrees =
    recordMandate !== null && candidate.mandateId === recordMandate;
  if (keyAgrees) evidence.push('same-counterparty');
  if (mandateAgrees) evidence.push('same-mandate');

  const exact = candidate.amountCents === expected;
  if (exact) evidence.push('same-amount');
  else {
    const off = Math.abs(candidate.amountCents - expected);
    if (off > Math.abs(expected) * AYQ_MATCH_AMOUNT_TOLERANCE) return null;
    evidence.push('amount-within-tenth');
  }

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
 * Whether a pair meets the three conditions an automatic match is built on:
 * identified, the exact amount, and a transaction date inside the expected
 * payment's automatic matching window.
 */
function qualifies(
  found: { identified: boolean; exact: boolean },
  window: AyqMatchWindow,
  candidate: AyqMatchCandidate,
): boolean {
  return (
    found.identified &&
    found.exact &&
    candidate.date >= window.from &&
    candidate.date <= window.through
  );
}

/**
 * How many qualifying pairs each occurrence and each transaction is in.
 *
 * Counted over every pair before anything is assigned, not over what survives
 * the assignment below: §7.16 asks how many candidates there *are*, and the
 * greedy pass would hide the second one by having already spent it.
 */
function ambiguity(input: AyqMatchInput): {
  perOccurrence: Map<string, number>;
  perTransaction: Map<string, number>;
} {
  const perOccurrence = new Map<string, number>();
  const perTransaction = new Map<string, number>();

  for (const occurrence of input.occurrences) {
    const key = `${occurrence.recordId} ${occurrence.dueDate}`;
    const record = input.recordKeys.get(occurrence.recordId);
    const refused = input.refused.get(key) ?? new Set<string>();
    const window = ayqAutomaticMatchWindow(occurrence.effectiveDate);

    for (const candidate of input.candidates) {
      // A transaction already spoken for, or one a person has said is not this
      // payment, is not a candidate at all and does not make anything ambiguous.
      if (input.taken.has(candidate.transactionId)) continue;
      if (refused.has(candidate.transactionId)) continue;

      const found = evidenceFor(
        occurrence,
        candidate,
        record?.key ?? null,
        record?.mandateId ?? null,
      );
      if (found === null || !qualifies(found, window, candidate)) continue;

      perOccurrence.set(key, (perOccurrence.get(key) ?? 0) + 1);
      perTransaction.set(
        candidate.transactionId,
        (perTransaction.get(candidate.transactionId) ?? 0) + 1,
      );
    }
  }

  return { perOccurrence, perTransaction };
}

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
  const { perOccurrence, perTransaction } = ambiguity(input);

  const inOrder = [...input.occurrences].sort((left, right) =>
    left.effectiveDate < right.effectiveDate ? -1 : 1,
  );

  for (const occurrence of inOrder) {
    const record = input.recordKeys.get(occurrence.recordId);
    const refused =
      input.refused.get(`${occurrence.recordId} ${occurrence.dueDate}`) ??
      new Set<string>();
    const window = ayqAutomaticMatchWindow(occurrence.effectiveDate);

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
        // The narrow rule of §7.16, and every part of it is required: the three
        // conditions above, and being the only pair that meets them.
        confident:
          qualifies(found, window, candidate) &&
          (perOccurrence.get(`${occurrence.recordId} ${occurrence.dueDate}`) ??
            0) === 1 &&
          (perTransaction.get(candidate.transactionId) ?? 0) === 1,
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
