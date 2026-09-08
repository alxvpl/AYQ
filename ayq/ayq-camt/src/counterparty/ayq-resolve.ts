// The chain of evidence for the counterparty.
//
// The order is fixed and starts at BkTxCd, because it is present on all 567
// measured entries while a counterparty IBAN is missing on 38 % of them.
// BkTxCd does not pronounce a name (except when the counterparty is the bank
// itself) — it decides which layer is worth asking, and in what order.
//
//   1. bank-transaction-code — always classifies; on fees and interest it also
//                              decides.
//   2. structured           — RltdPties plus the counterparty IBAN.
//   3. intermediary         — when the structured name is a payment
//                              intermediary, acceptance stops here: the IBAN
//                              is the PSP's, not the merchant's.
//   4. description          — parsing the free text.
//   5. alias                — the manual table has the last word.
//
// Every layer leaves a trace, including when it passes. The layer that made
// the call is recorded.

import type { AyqBankEntry } from '../ayq-types.ts';
import {
  ayqNormaliseKey,
  ayqParseCardDescription,
  ayqParseSepaDescription,
} from './ayq-description.ts';
import {
  AYQ_BANK_NAMES,
  ayqMatchIntermediaryName,
} from './ayq-intermediaries.ts';
import type {
  AyqCounterparty,
  AyqEvidence,
  AyqPaymentKind,
  AyqResolveOptions,
} from './ayq-counterparty-types.ts';

/**
 * BkTxCd to payment kind. The codes are ISO 20022 external codes; listed are
 * the ones that actually occur in the measured account, plus close relatives.
 */
const KIND_BY_CODE: Record<string, AyqPaymentKind> = {
  'PMNT/CCRD/POSD': 'card-terminal',
  'PMNT/CCRD/POSP': 'card-terminal',
  'PMNT/CCRD/CWDL': 'card-withdrawal',
  'PMNT/CCRD/CDPT': 'card-withdrawal',
  'PMNT/RDDT/ESDD': 'direct-debit',
  'PMNT/RDDT/UPDD': 'direct-debit',
  'PMNT/RDDT/PMDD': 'direct-debit',
  'PMNT/RDDT/BBDD': 'direct-debit',
  'PMNT/ICDT/ESCT': 'credit-transfer',
  'PMNT/ICDT/DMCT': 'credit-transfer',
  'PMNT/ICDT/AUTT': 'credit-transfer',
  'PMNT/ICDT/STDO': 'credit-transfer',
  'PMNT/RCDT/ESCT': 'credit-transfer',
  'PMNT/RCDT/DMCT': 'credit-transfer',
  'PMNT/RCDT/AUTT': 'credit-transfer',
  'PMNT/MDOP/COMM': 'bank-fee',
  'PMNT/MCOP/COMM': 'bank-fee',
  'ACMT/ACOP/INTR': 'interest',
  'ACMT/MDOP/INTR': 'interest',
};

/** Fallback classification by family, when the exact sub-code is unknown. */
const KIND_BY_FAMILY: Record<string, AyqPaymentKind> = {
  CCRD: 'card-terminal',
  RDDT: 'direct-debit',
  ICDT: 'credit-transfer',
  RCDT: 'credit-transfer',
};

export function ayqClassify(entry: AyqBankEntry): AyqPaymentKind {
  if (entry.reversalIndicator === true || entry.returnInformation !== null) {
    return 'reversal';
  }
  const code =
    entry.bankTransactionCode.code ?? entry.entryBankTransactionCode.code;
  if (code !== null && code in KIND_BY_CODE) return KIND_BY_CODE[code];

  const family =
    entry.bankTransactionCode.family ?? entry.entryBankTransactionCode.family;
  if (family !== null && family in KIND_BY_FAMILY) return KIND_BY_FAMILY[family];

  return 'unknown';
}

function bankName(entry: AyqBankEntry): string | null {
  const bic = entry.statement.accountServicerBic;
  if (bic === null) return null;
  return AYQ_BANK_NAMES[bic.slice(0, 8)] ?? AYQ_BANK_NAMES[bic] ?? bic;
}

function describeCode(entry: AyqBankEntry): string {
  return (
    entry.bankTransactionCode.code ??
    entry.entryBankTransactionCode.code ??
    entry.bankTransactionCode.proprietary ??
    'absent'
  );
}

/**
 * Resolves the counterparty of one intermediate record.
 *
 * The record is not modified. The result is a separate object carrying both
 * the decision and the path to it.
 */
export function ayqResolveCounterparty(
  entry: AyqBankEntry,
  options: AyqResolveOptions = {},
): AyqCounterparty {
  const trail: AyqEvidence[] = [];
  const kind = ayqClassify(entry);
  const isDebit = entry.creditDebitIndicator === 'DBIT';

  // -- 1. BkTxCd ---------------------------------------------------------
  // Always classifies. Pronounces a name only when the bank is the counterparty.
  if (kind === 'bank-fee' || kind === 'interest') {
    const name = bankName(entry) ?? entry.additionalEntryInformation;
    trail.push({
      layer: 'bank-transaction-code',
      source: `BkTxCd ${describeCode(entry)}`,
      name,
      iban: null,
      accepted: name !== null,
      note:
        kind === 'bank-fee'
          ? 'Bank charge — the counterparty is the bank itself.'
          : 'Interest — the counterparty is the bank itself.',
    });
    if (name !== null) {
      return finish(
        entry,
        trail,
        {
          name,
          key: ayqNormaliseKey(name),
          iban: null,
          intermediary: null,
          resolvedBy: 'bank-transaction-code',
          kind,
        },
        options,
      );
    }
  } else {
    trail.push({
      layer: 'bank-transaction-code',
      source: `BkTxCd ${describeCode(entry)}`,
      name: null,
      iban: null,
      accepted: false,
      note: `Classified as ${kind}; sets the order of the layers that follow.`,
    });
  }

  // -- 2. structured -----------------------------------------------------
  // On a debit the counterparty is the creditor; on a credit, the debtor.
  const party = isDebit ? entry.creditor : entry.debtor;
  const structuredName = party.name;
  const structuredIban = party.iban;
  const hasStructured = structuredName !== null || structuredIban !== null;

  // -- 3. intermediary ---------------------------------------------------
  // Checked before acceptance: if the name or the IBAN belongs to an
  // intermediary, the structured layer must not decide — it points at the PSP.
  const normalisedStructured = ayqNormaliseKey(structuredName);
  const intermediaryByName = ayqMatchIntermediaryName(
    normalisedStructured,
    options.intermediaryNames,
  );
  const intermediaryByIban =
    structuredIban !== null &&
    (options.intermediaryIbans ?? []).includes(structuredIban)
      ? structuredIban
      : null;
  const intermediary =
    intermediaryByName ?? (intermediaryByIban ? 'known intermediary' : null);

  if (hasStructured) {
    trail.push({
      layer: 'structured',
      source: isDebit
        ? 'RltdPties/Cdtr + CdtrAcct/Id/IBAN'
        : 'RltdPties/Dbtr + DbtrAcct/Id/IBAN',
      name: structuredName,
      iban: structuredIban,
      accepted: intermediary === null,
      note:
        intermediary === null
          ? 'Structured data from the bank.'
          : 'Passed over: the party is a payment intermediary.',
    });
  } else {
    trail.push({
      layer: 'structured',
      source: 'RltdPties',
      name: null,
      iban: null,
      accepted: false,
      note: 'The entry has no TxDtls — no structured counterparty data.',
    });
  }

  if (intermediary !== null) {
    trail.push({
      layer: 'intermediary',
      source: intermediaryByName !== null ? 'RltdPties/Nm' : 'CdtrAcct/Id/IBAN',
      name: intermediary,
      iban: structuredIban,
      accepted: false,
      note: "The IBAN is the intermediary's; the merchant is sought in the free text.",
    });
  } else if (hasStructured && structuredName !== null) {
    return finish(
      entry,
      trail,
      {
        name: structuredName,
        key: normalisedStructured,
        iban: structuredIban,
        intermediary: null,
        resolvedBy: 'structured',
        kind,
      },
      options,
    );
  }

  // -- 4. description ----------------------------------------------------
  // The card marker lives in AddtlNtryInf. When the entry also has
  // RmtInf/Ustrd the raw description comes from there, so both are tried.
  const fromRemittance = ayqParseCardDescription(entry.rawDescription);
  const card =
    fromRemittance ?? ayqParseCardDescription(entry.additionalEntryInformation);
  if (card !== null && card.merchant !== null) {
    trail.push({
      layer: 'description',
      source: `${card.marker} in ${
        fromRemittance !== null && entry.remittanceUnstructured.length > 0
          ? 'RmtInf/Ustrd'
          : 'AddtlNtryInf'
      }`,
      name: card.merchant,
      iban: null,
      accepted: true,
      note:
        'The merchant was extracted from the free text; terminal, date, time ' +
        'and card number were separated out, because they make every entry unique.',
    });
    return finish(
      entry,
      trail,
      {
        name: card.merchant,
        key: ayqNormaliseKey(card.merchant),
        iban: null,
        intermediary: card.intermediary ?? intermediary,
        resolvedBy: 'description',
        kind,
      },
      options,
    );
  }

  const sepa = ayqParseSepaDescription(entry.rawDescription);
  // Behind an intermediary the name in the text is the PSP's again; the
  // merchant sits in the remittance description.
  const sepaCandidate =
    intermediary !== null ? (sepa?.remittance ?? null) : (sepa?.name ?? null);
  if (sepaCandidate !== null) {
    trail.push({
      layer: 'description',
      source:
        intermediary !== null
          ? 'RmtInf/Ustrd -> Omschrijving'
          : 'RmtInf/Ustrd -> Naam',
      name: sepaCandidate,
      iban: sepa?.iban ?? null,
      accepted: true,
      note:
        intermediary !== null
          ? "Paid through an intermediary — the merchant's name is in the description."
          : 'The name was taken from the free text of the transfer.',
    });
    return finish(
      entry,
      trail,
      {
        name: sepaCandidate,
        key: ayqNormaliseKey(sepaCandidate),
        iban: sepa?.iban ?? structuredIban,
        intermediary,
        resolvedBy: 'description',
        kind,
      },
      options,
    );
  }

  trail.push({
    layer: 'description',
    source: 'rawDescription',
    name: null,
    iban: null,
    accepted: false,
    note: 'The free text matches no known form.',
  });

  // No name, but there may be an IBAN — on its own it is still a grouping key.
  if (structuredIban !== null && intermediary === null) {
    return finish(
      entry,
      trail,
      {
        name: null,
        key: structuredIban,
        iban: structuredIban,
        intermediary: null,
        resolvedBy: 'structured',
        kind,
      },
      options,
    );
  }

  // Only the intermediary's name is left. It is kept, because it is the only
  // one there is, but the decision is not credited to the structured layer —
  // otherwise every payment through a PSP would look resolved while the
  // merchant is in fact unknown.
  if (intermediary !== null) {
    trail.push({
      layer: 'intermediary',
      source: 'RltdPties/Nm',
      name: intermediary,
      iban: structuredIban,
      accepted: false,
      note:
        'No merchant found; the entry stays grouped under the intermediary ' +
        'until an alias is added.',
    });
    return finish(
      entry,
      trail,
      {
        name: structuredName,
        key: normalisedStructured,
        iban: null,
        intermediary,
        resolvedBy: 'unresolved',
        kind,
      },
      options,
    );
  }

  return finish(
    entry,
    trail,
    {
      name: structuredName,
      key: normalisedStructured,
      iban: structuredIban,
      intermediary: null,
      resolvedBy: structuredName === null ? 'unresolved' : 'structured',
      kind,
    },
    options,
  );
}

/**
 * The last layer: the manual alias table.
 *
 * Matches on IBAN, on the SEPA mandate, then on the normalised key — in that
 * order, because the IBAN and the mandate are more specific than a name.
 */
function finish(
  entry: AyqBankEntry,
  trail: AyqEvidence[],
  resolved: Omit<AyqCounterparty, 'trail' | 'mandateId'>,
  options: AyqResolveOptions,
): AyqCounterparty {
  const mandateId =
    entry.references.mandateId ??
    ayqParseSepaDescription(entry.rawDescription)?.mandateId ??
    null;

  const aliases = options.aliases ?? [];
  const alias =
    aliases.find(item => item.iban && item.iban === resolved.iban) ??
    aliases.find(item => item.mandateId && item.mandateId === mandateId) ??
    aliases.find(item => item.key && item.key === resolved.key);

  if (alias) {
    trail.push({
      layer: 'alias',
      source: alias.iban
        ? 'alias by IBAN'
        : alias.mandateId
          ? 'alias by mandate'
          : 'alias by key',
      name: alias.name,
      iban: resolved.iban,
      accepted: true,
      note: 'The manual alias has the last word.',
    });
    return {
      ...resolved,
      name: alias.name,
      key: ayqNormaliseKey(alias.name),
      mandateId,
      resolvedBy: 'alias',
      trail,
    };
  }

  return { ...resolved, mandateId, trail };
}
