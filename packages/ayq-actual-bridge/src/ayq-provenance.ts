// What Actual has no field for.
//
// The base evaluation found it in §4 and the measurement confirmed it: Actual's
// transaction schema has `imported_description` and `financial_id` but no
// counterparty account, no bank transaction code and no SEPA mandate. Rather
// than smuggle those into the notes, they travel beside the budget as a
// provenance record keyed by the same `imported_id` the transaction carries.
//
// This is also where the counterparty decision is recorded, so a name in the
// ledger can always be traced back to the layer that produced it.

import type { AyqBankEntry } from '../../ayq-camt/src/ayq-types.ts';
import type { AyqCounterparty } from '../../ayq-camt/src/counterparty/ayq-counterparty-types.ts';

export type AyqProvenanceRecord = {
  /** The same key the Actual transaction carries. */
  importedId: string;
  /** The record's own key, stable across re-exports. */
  ayqKey: string;

  /** The grouping key the ledger's payee was derived from. */
  counterpartyKey: string | null;
  /** The layer that decided the name. */
  resolvedBy: string;
  paymentKind: string;
  intermediary: string | null;

  counterpartyIban: string | null;
  counterpartyOtherAccount: string | null;
  counterpartyAgentBic: string | null;

  bankTransactionCode: string | null;
  mandateId: string | null;
  endToEndId: string | null;
  instructionId: string | null;

  /** Both dates, because Actual keeps only one. */
  bookingDate: string | null;
  valueDate: string | null;

  status: string | null;
  reversal: boolean | null;
  purpose: string | null;
  returnReason: string | null;

  currency: string | null;
  /** Present only on foreign-currency operations. */
  instructedAmount: string | null;
  instructedCurrency: string | null;
  exchangeRate: string | null;
};

export function ayqProvenanceRecord(
  entry: AyqBankEntry,
  counterparty: AyqCounterparty,
): AyqProvenanceRecord {
  const isDebit = entry.creditDebitIndicator === 'DBIT';
  const party = isDebit ? entry.creditor : entry.debtor;
  const agentBic = isDebit
    ? entry.agents.creditorAgentBic
    : entry.agents.debtorAgentBic;

  return {
    importedId: entry.references.accountServicerReference ?? entry.ayqKey,
    ayqKey: entry.ayqKey,

    counterpartyKey: counterparty.key,
    resolvedBy: counterparty.resolvedBy,
    paymentKind: counterparty.kind,
    intermediary: counterparty.intermediary,

    counterpartyIban: party.iban,
    counterpartyOtherAccount: party.otherAccountId,
    counterpartyAgentBic: agentBic,

    bankTransactionCode: entry.bankTransactionCode.code,
    mandateId: counterparty.mandateId,
    endToEndId: entry.references.endToEndId,
    instructionId: entry.references.instructionId,

    bookingDate: entry.bookingDate.date,
    valueDate: entry.valueDate.date,

    status: entry.status,
    reversal: entry.reversalIndicator,
    purpose: entry.purposeCode ?? entry.purposeProprietary,
    returnReason:
      entry.returnInformation?.reasonCode ??
      entry.returnInformation?.reasonProprietary ??
      null,

    currency: entry.amount.currency,
    instructedAmount: entry.currencyExchange?.instructedAmount?.raw ?? null,
    instructedCurrency:
      entry.currencyExchange?.instructedAmount?.currency ?? null,
    exchangeRate: entry.currencyExchange?.exchangeRate ?? null,
  };
}
