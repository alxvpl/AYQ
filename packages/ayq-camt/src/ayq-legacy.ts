// Петте полета на Actual, произведени от междинния запис.
//
// Служи за две неща: доказва, че разширението е добавка, а не подмяна — старият
// изход продължава да излиза — и дава базата за сравнение, срещу която се мери
// колко имена свива нормализацията.
//
// Възпроизвежда поведението на xmlcamt2json.ts от Actual 26.9.0 (HEAD db1b0ea),
// включително резервното използване на AddtlNtryInf като име. Единствената
// разлика е, че името на страната идва от <Nm> на самата страна, а не от
// рекурсивно търсене в поддървото.

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
    // Actual предпочита ValDt пред BookgDt и пази само едната дата.
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
