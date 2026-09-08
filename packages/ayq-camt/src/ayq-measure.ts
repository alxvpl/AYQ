// Структурно броене върху набор CAMT файлове.
//
// Възпроизвежда таблиците от AYQ_camt_measurement-r001.md и добавя числото,
// заради което съществува стъпка 3: колко различни имена остават след
// нормализацията в сравнение с петте полета на Actual.
//
// Изходът е само броения. Имена, суми и IBAN-и не влизат в него — данните са
// реални лични банкови записи и остават на машината.

import type { AyqBankEntry } from './ayq-types.ts';
import { ayqToLegacyTransaction } from './ayq-legacy.ts';
import { ayqResolveCounterparty } from './counterparty/ayq-resolve.ts';
import type {
  AyqCounterpartyLayer,
  AyqPaymentKind,
  AyqResolveOptions,
} from './counterparty/ayq-counterparty-types.ts';

export type AyqMeasurement = {
  files: number;
  statements: number;
  /** Брой <Ntry>. */
  entries: number;
  /** Брой междинни записа — един на <TxDtls>, или един на <Ntry> без такъв. */
  records: number;
  /** <Ntry> с поне един <TxDtls>. Измереното в r001: 350. */
  withTxDtls: number;
  /** <Ntry> без <TxDtls> изобщо. Измереното в r001: 217. */
  withoutTxDtls: number;
  /** Междинни записи, произлезли от <TxDtls>. Различава се от withTxDtls само при batch. */
  recordsWithTxDtls: number;
  /** <Ntry>, носили повече от един <TxDtls>. Измереното в r001: 0. */
  batched: number;

  /** Наличност на полетата, които оригиналният парсър изхвърля. */
  present: Record<string, number>;

  /** BkTxCd, подредено по брой. */
  bankTransactionCodes: Record<string, number>;
  /** Разбивка на записите без <TxDtls> по BkTxCd. */
  withoutTxDtlsByCode: Record<string, number>;

  paymentKinds: Record<AyqPaymentKind, number>;
  resolvedBy: Record<AyqCounterpartyLayer, number>;

  /** Колко различни имена дават петте полета на Actual. */
  distinctLegacyPayees: number;
  /** Колко различни ключа дава нормализацията на AYQ. */
  distinctCounterpartyKeys: number;
  /** Същото, само за картовите и банкоматните записи. */
  cardRecords: number;
  distinctLegacyPayeesOnCards: number;
  distinctCounterpartyKeysOnCards: number;
};

function bump(counter: Record<string, number>, key: string): void {
  counter[key] = (counter[key] ?? 0) + 1;
}

function sortByCount(counter: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(counter).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
  );
}

export function ayqMeasure(
  entries: AyqBankEntry[],
  fileCount: number,
  options: AyqResolveOptions = {},
): AyqMeasurement {
  const present: Record<string, number> = {
    counterpartyIban: 0,
    counterpartyName: 0,
    remittanceUnstructured: 0,
    bankTransactionCode: 0,
    endToEndId: 0,
    mandateId: 0,
    accountServicerReference: 0,
    instructionId: 0,
    counterpartyBic: 0,
    bookingDate: 0,
    valueDate: 0,
    bothDates: 0,
    status: 0,
    reversalIndicator: 0,
    purpose: 0,
    returnInformation: 0,
    additionalEntryInformation: 0,
    otherAccountId: 0,
    currencyExchange: 0,
    charges: 0,
  };

  const bankTransactionCodes: Record<string, number> = {};
  const withoutTxDtlsByCode: Record<string, number> = {};
  const paymentKinds: Record<string, number> = {};
  const resolvedBy: Record<string, number> = {};

  const legacyPayees = new Set<string>();
  const counterpartyKeys = new Set<string>();
  const legacyPayeesOnCards = new Set<string>();
  const counterpartyKeysOnCards = new Set<string>();

  const statements = new Set<string>();
  let withTxDtls = 0;
  let withoutTxDtls = 0;
  let recordsWithTxDtls = 0;
  let batched = 0;
  let cardRecords = 0;

  for (const entry of entries) {
    statements.add(
      `${entry.statement.file ?? ''}#${entry.position.statementIndex}`,
    );

    // Тези три броят <Ntry>, не междинни записи: критерият 350/217 е за
    // <Ntry>. При batch един <Ntry> дава няколко записа, така че броенето по
    // записи би дало число над 350 — и то тъкмо когато batch се появи, тоест
    // тъкмо когато числото трябва да е вярно. Първият запис на всеки <Ntry>
    // има transactionIndex 0, а при липсващ <TxDtls> — -1.
    if (entry.position.transactionIndex <= 0) {
      if (entry.position.transactionCount > 0) withTxDtls += 1;
      else withoutTxDtls += 1;
      if (entry.position.transactionCount > 1) batched += 1;
    }
    if (entry.position.transactionCount > 0) recordsWithTxDtls += 1;

    const isDebit = entry.creditDebitIndicator === 'DBIT';
    const party = isDebit ? entry.creditor : entry.debtor;
    const agentBic = isDebit
      ? entry.agents.creditorAgentBic
      : entry.agents.debtorAgentBic;

    if (party.iban !== null) present.counterpartyIban += 1;
    if (party.name !== null) present.counterpartyName += 1;
    if (party.otherAccountId !== null) present.otherAccountId += 1;
    if (entry.remittanceUnstructured.length > 0) present.remittanceUnstructured += 1;
    if (entry.bankTransactionCode.code !== null) present.bankTransactionCode += 1;
    if (entry.references.endToEndId !== null) present.endToEndId += 1;
    if (entry.references.mandateId !== null) present.mandateId += 1;
    if (entry.references.accountServicerReference !== null) {
      present.accountServicerReference += 1;
    }
    if (entry.references.instructionId !== null) present.instructionId += 1;
    if (agentBic !== null) present.counterpartyBic += 1;
    if (entry.bookingDate.date !== null) present.bookingDate += 1;
    if (entry.valueDate.date !== null) present.valueDate += 1;
    if (entry.bookingDate.date !== null && entry.valueDate.date !== null) {
      present.bothDates += 1;
    }
    if (entry.status !== null) present.status += 1;
    if (entry.reversalIndicator === true) present.reversalIndicator += 1;
    if (entry.purposeCode !== null || entry.purposeProprietary !== null) {
      present.purpose += 1;
    }
    if (entry.returnInformation !== null) present.returnInformation += 1;
    if (entry.additionalEntryInformation !== null) {
      present.additionalEntryInformation += 1;
    }
    if (entry.currencyExchange !== null) present.currencyExchange += 1;
    if (entry.charges.length > 0) present.charges += 1;

    const code = entry.bankTransactionCode.code ?? 'липсва';
    bump(bankTransactionCodes, code);
    if (entry.position.transactionCount === 0) bump(withoutTxDtlsByCode, code);

    const counterparty = ayqResolveCounterparty(entry, options);
    bump(paymentKinds, counterparty.kind);
    bump(resolvedBy, counterparty.resolvedBy);

    const legacy = ayqToLegacyTransaction(entry);
    if (legacy.payee_name !== null) legacyPayees.add(legacy.payee_name);
    if (counterparty.key !== null) counterpartyKeys.add(counterparty.key);

    const isCard =
      counterparty.kind === 'card-terminal' ||
      counterparty.kind === 'card-withdrawal';
    if (isCard) {
      cardRecords += 1;
      if (legacy.payee_name !== null) legacyPayeesOnCards.add(legacy.payee_name);
      if (counterparty.key !== null) counterpartyKeysOnCards.add(counterparty.key);
    }
  }

  return {
    files: fileCount,
    statements: statements.size,
    entries: entries.filter(entry => entry.position.transactionIndex <= 0).length,
    records: entries.length,
    withTxDtls,
    withoutTxDtls,
    recordsWithTxDtls,
    batched,
    present,
    bankTransactionCodes: sortByCount(bankTransactionCodes),
    withoutTxDtlsByCode: sortByCount(withoutTxDtlsByCode),
    paymentKinds: sortByCount(paymentKinds) as Record<AyqPaymentKind, number>,
    resolvedBy: sortByCount(resolvedBy) as Record<AyqCounterpartyLayer, number>,
    distinctLegacyPayees: legacyPayees.size,
    distinctCounterpartyKeys: counterpartyKeys.size,
    cardRecords,
    distinctLegacyPayeesOnCards: legacyPayeesOnCards.size,
    distinctCounterpartyKeysOnCards: counterpartyKeysOnCards.size,
  };
}
