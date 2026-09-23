// The words for what the engine reports as codes (04 A24).
//
// The engine says *why* — a filing reason, a match's evidence, a file it could
// not use, a request that failed — as a code with bounded parameters. This is
// the one place those codes become English, through the catalogue, so adding
// Dutch is a catalogue and nothing else. No screen words a code by itself, and
// no screen shows what the engine wrote in English: that stays in `detail`,
// for a developer.

import type {
  AyqErrorCode,
  AyqErrorParams,
  AyqFilingReason,
  AyqImportProblem,
  AyqMatchEvidence,
} from './ayq-ipc-contract.ts';
import { ayqCount, ayqList, ayqMonthName, ayqText } from './ayq-strings.ts';

/** Why AYQ's own classification filed a transaction where it did. */
export function ayqFilingReasonText(reason: AyqFilingReason): string {
  switch (reason.code) {
    case 'bank-charge':
      return ayqText('reason.filing.bank-charge');
    case 'bank-interest':
      return ayqText('reason.filing.bank-interest');
    case 'counterparty':
      return ayqText('reason.filing.counterparty', {
        counterparty: reason.counterparty,
      });
    case 'legacy':
    default:
      // An earlier AYQ's words, kept as evidence and never shown as they stand;
      // and anything a newer store might hold that this AYQ has no words for.
      return ayqText('reason.filing.legacy');
  }
}

/** One file an import could not use: its name, and why. */
export function ayqImportProblemText(problem: AyqImportProblem): string {
  return ayqText('reason.import.line', {
    file: problem.name,
    why: ayqText(`reason.import.${problem.code}`),
  });
}

/**
 * How the counterparty was identified — the resolver layer that decided
 * (`AyqCounterpartyLayer` in ayq-camt). Every value it can produce is here.
 */
export const AYQ_RESOLVED_BY = [
  'bank-transaction-code',
  'structured',
  'intermediary',
  'description',
  'alias',
  'unresolved',
] as const;

/** The payment class read off BkTxCd (`AyqPaymentKind` in ayq-camt). */
export const AYQ_PAYMENT_KINDS = [
  'card-terminal',
  'card-withdrawal',
  'direct-debit',
  'credit-transfer',
  'bank-fee',
  'interest',
  'reversal',
  'unknown',
] as const;

/**
 * How the counterparty was identified, in words.
 *
 * A value this AYQ does not know — one an older store kept, or a newer engine
 * produced — is never shown as it stands: the catalogue says it is not one it
 * describes (04 A24).
 */
export function ayqResolvedByText(value: string): string {
  const known = (AYQ_RESOLVED_BY as readonly string[]).includes(value);
  return known
    ? ayqText(`reason.resolvedBy.${value as (typeof AYQ_RESOLVED_BY)[number]}`)
    : ayqText('reason.resolvedBy.other');
}

/** What kind of payment the bank said it was, in words; the same fallback. */
export function ayqPaymentKindText(value: string): string {
  const known = (AYQ_PAYMENT_KINDS as readonly string[]).includes(value);
  return known
    ? ayqText(`reason.kind.${value as (typeof AYQ_PAYMENT_KINDS)[number]}`)
    : ayqText('reason.kind.other');
}

/** One thing an actual transaction and an expected payment agree on. */
export function ayqMatchEvidenceText(evidence: AyqMatchEvidence): string {
  return ayqText(`reason.match.${evidence}`);
}

/** Why a request failed, in the catalogue's words. */
export function ayqErrorText(error: {
  code: AyqErrorCode;
  params?: AyqErrorParams;
  problems?: AyqImportProblem[];
}): string {
  const params = error.params ?? {};
  switch (error.code) {
    case 'import-nothing-readable':
      return (error.problems ?? []).length === 0
        ? ayqText('error.import-nothing-readable.none')
        : ayqText('error.import-nothing-readable', {
            problems: ayqList((error.problems ?? []).map(ayqImportProblemText)),
          });
    case 'month-not-kept':
      return ayqText('error.month-not-kept', {
        month:
          typeof params.month === 'string' && /^\d{4}-\d{2}$/.test(params.month)
            ? ayqMonthName(params.month)
            : String(params.month ?? ''),
      });
    case 'store-newer':
    case 'store-copy-failed':
      return ayqText(`error.${error.code}`, {
        found: ayqCount(Number(params.found ?? 0)),
        known: ayqCount(Number(params.known ?? 0)),
      });
    case 'engine-timeout':
      return ayqText('error.engine-timeout', {
        minutes: ayqCount(Number(params.minutes ?? 0)),
      });
    case 'category-exists':
    case 'category-in-use':
      return ayqText(`error.${error.code}`, {
        name: String(params.name ?? ''),
      });
    default:
      return ayqText(`error.${error.code}`);
  }
}
