// Actual's five fields, produced from the intermediate record.
//
// Serves two purposes: it proves the extension is additive rather than a
// replacement — the old output still comes out — and it gives the baseline the
// normalisation is measured against.
//
// Reproduces the behaviour of xmlcamt2json.ts from Actual 26.9.0 (HEAD
// db1b0ea), including the fallback to AddtlNtryInf as a name. The only
// difference is that the party name comes from the party's own <Nm> rather
// than from a recursive search of the subtree.

import type { AyqBankEntry } from './ayq-types.ts';

export type AyqLegacyTransaction = {
  amount: number | null;
  date: string | null;
  payee_name: string | null;
  imported_payee: string | null;
  notes: string | null;
  imported_id?: string;
};

export function ayqToLegacyTransaction(
  entry: AyqBankEntry,
): AyqLegacyTransaction {
  const isDebit = entry.creditDebitIndicator === 'DBIT';
  const party = isDebit ? entry.creditor : entry.debtor;

  let payeeName: string | null = party.name;
  if (payeeName === null && entry.additionalEntryInformation !== null) {
    payeeName = entry.additionalEntryInformation;
  }

  let notes: string | null =
    entry.remittanceUnstructured.length > 0
      ? entry.remittanceUnstructured.join(' ')
      : null;
  if (
    notes === null &&
    entry.additionalEntryInformation !== null &&
    entry.additionalEntryInformation !== payeeName
  ) {
    notes = entry.additionalEntryInformation;
  }
  if (payeeName === null && notes === null && entry.entryReference !== null) {
    notes = entry.entryReference;
  }
  if (payeeName !== null && notes !== null && payeeName.includes(notes)) {
    notes = null;
  }

  const transaction: AyqLegacyTransaction = {
    amount: entry.amount.value,
    // Actual prefers ValDt over BookgDt and keeps only one of the two dates.
    date: entry.valueDate.date ?? entry.bookingDate.date,
    payee_name: payeeName,
    imported_payee: payeeName,
    notes,
  };
  if (entry.references.accountServicerReference !== null) {
    transaction.imported_id = entry.references.accountServicerReference;
  }
  return transaction;
}
