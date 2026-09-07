// AYQ CAMT парсър — camt.053 (и .052/.054) към беззагубен междинен банков запис.
//
// Произход: loot-core/src/server/transactions/import/xmlcamt2json.ts от Actual
// 26.9.0, HEAD db1b0ea. Копиран, не форкнат. Оригиналът дава пет полета
// (amount, date, payee_name, imported_payee, notes) и изхвърля контрагентния
// IBAN, BkTxCd, целия Refs блок, BIC, едната от двете дати, Sts, RvslInd, Purp
// и RtrInf. Тук нищо не се изхвърля.
//
// Три поведенчески разлики спрямо оригинала:
//   1. Един запис на <TxDtls>, а когато <TxDtls> липсва — един запис на <Ntry>.
//      Оригиналът също слиза в TxDtls, но само при масив; при единичен TxDtls
//      транзакционната и записовата половина се смесват.
//   2. Имената на страните се четат от <Dbtr>/<Cdtr>/<Nm> изрично. Оригиналът
//      търси <Nm> рекурсивно в поддървото и при страна без име взима името от
//      пощенския адрес.
//   3. Обходът тръгва от <Stmt>, не от сляпо търсене на <Ntry>, за да носи
//      всеки запис контекста на извлечението и собствената сметка.

import { createHash } from 'node:crypto';

import {
  ayqAttr,
  ayqChild,
  ayqChildren,
  ayqFindAll,
  ayqParseXml,
  ayqText,
  ayqTextAt,
  ayqTextList,
  type AyqXmlNode,
} from './ayq-xml.ts';
import type {
  AyqAgents,
  AyqAmount,
  AyqBankEntry,
  AyqBankTransactionCode,
  AyqBatch,
  AyqCamtFlavour,
  AyqCharge,
  AyqCurrencyExchange,
  AyqDate,
  AyqParty,
  AyqReferences,
  AyqReturnInformation,
  AyqStatementContext,
  AyqStructuredRemittance,
} from './ayq-types.ts';

export type AyqParseOptions = {
  /** Базовото име на файла, записва се в контекста на извлечението. */
  file?: string;
  /** Закача разпарснатото XML поддърво към всеки запис. Изключено по подразбиране. */
  keepRawNode?: boolean;
};

function emptyParty(): AyqParty {
  return {
    name: null,
    iban: null,
    otherAccountId: null,
    otherAccountScheme: null,
    accountCurrency: null,
    country: null,
    addressLines: [],
    organisationId: null,
    privateId: null,
  };
}

function toNumber(raw: string | null): number | null {
  if (raw === null) return null;
  const value = Number(raw.trim());
  return Number.isNaN(value) ? null : value;
}

/** Сума + валута + суровият низ. Знакът се прилага отделно. */
function readAmount(node: AyqXmlNode): AyqAmount | null {
  const raw = ayqText(node);
  if (raw === null) return null;
  return { value: toNumber(raw), currency: ayqAttr(node, 'Ccy'), raw };
}

function signedAmount(amount: AyqAmount | null, isDebit: boolean): AyqAmount {
  if (!amount) return { value: null, currency: null, raw: null };
  if (amount.value === null || !isDebit) return amount;
  return { ...amount, value: -amount.value };
}

function readDate(node: AyqXmlNode): AyqDate {
  const dateTime = ayqTextAt(node, 'DtTm');
  if (dateTime !== null) {
    return { date: dateTime.slice(0, 10), dateTime };
  }
  return { date: ayqTextAt(node, 'Dt'), dateTime: null };
}

function readBankTransactionCode(node: AyqXmlNode): AyqBankTransactionCode {
  const domain = ayqTextAt(node, 'Domn', 'Cd');
  const family = ayqTextAt(node, 'Domn', 'Fmly', 'Cd');
  const subFamily = ayqTextAt(node, 'Domn', 'Fmly', 'SubFmlyCd');
  return {
    domain,
    family,
    subFamily,
    proprietary: ayqTextAt(node, 'Prtry', 'Cd'),
    proprietaryIssuer: ayqTextAt(node, 'Prtry', 'Issr'),
    code:
      domain && family && subFamily ? `${domain}/${family}/${subFamily}` : null,
  };
}

function readReferences(node: AyqXmlNode): AyqReferences {
  const proprietary: Record<string, string> = {};
  for (const item of ayqChildren(node, 'Prtry')) {
    const type = ayqTextAt(item, 'Tp');
    const reference = ayqTextAt(item, 'Ref');
    if (type !== null && reference !== null) proprietary[type] = reference;
  }
  return {
    messageId: ayqTextAt(node, 'MsgId'),
    accountServicerReference: ayqTextAt(node, 'AcctSvcrRef'),
    paymentInformationId: ayqTextAt(node, 'PmtInfId'),
    instructionId: ayqTextAt(node, 'InstrId'),
    endToEndId: ayqTextAt(node, 'EndToEndId'),
    transactionId: ayqTextAt(node, 'TxId'),
    mandateId: ayqTextAt(node, 'MndtId'),
    chequeNumber: ayqTextAt(node, 'ChqNb'),
    clearingSystemReference: ayqTextAt(node, 'ClrSysRef'),
    proprietary,
  };
}

/**
 * Страна + сметката ѝ.
 *
 * Името се чете от <Nm> на самата страна, не рекурсивно: при страна без име,
 * но с пощенски адрес, рекурсивното търсене връща името на адреса.
 */
function readParty(partyNode: AyqXmlNode, accountNode: AyqXmlNode): AyqParty {
  const accountId = ayqChild(accountNode, 'Id');
  const other = ayqChild(accountId, 'Othr');
  return {
    name: ayqTextAt(partyNode, 'Nm'),
    iban: ayqTextAt(accountId, 'IBAN'),
    otherAccountId: ayqTextAt(other, 'Id'),
    otherAccountScheme:
      ayqTextAt(other, 'SchmeNm', 'Cd') ?? ayqTextAt(other, 'SchmeNm', 'Prtry'),
    accountCurrency: ayqTextAt(accountNode, 'Ccy'),
    country: ayqTextAt(partyNode, 'PstlAdr', 'Ctry'),
    addressLines: ayqTextList(ayqChild(partyNode, 'PstlAdr'), 'AdrLine'),
    organisationId: ayqTextAt(partyNode, 'Id', 'OrgId', 'Othr', 'Id'),
    privateId: ayqTextAt(partyNode, 'Id', 'PrvtId', 'Othr', 'Id'),
  };
}

function readAgents(node: AyqXmlNode): AyqAgents {
  return {
    debtorAgentBic: ayqTextAt(node, 'DbtrAgt', 'FinInstnId', 'BIC'),
    creditorAgentBic: ayqTextAt(node, 'CdtrAgt', 'FinInstnId', 'BIC'),
    intermediaryAgentBic: ayqTextAt(node, 'IntrmyAgt1', 'FinInstnId', 'BIC'),
  };
}

function readCurrencyExchange(node: AyqXmlNode): AyqCurrencyExchange | null {
  if (node === undefined) return null;
  const instructed = ayqChild(node, 'InstdAmt');
  const transaction = ayqChild(node, 'TxAmt');
  const counterValue = ayqChild(node, 'CntrValAmt');
  const proprietary = ayqChild(node, 'PrtryAmt');
  const exchange =
    ayqChild(counterValue, 'CcyXchg') ??
    ayqChild(instructed, 'CcyXchg') ??
    ayqChild(transaction, 'CcyXchg') ??
    ayqChild(proprietary, 'CcyXchg');

  const details: AyqCurrencyExchange = {
    instructedAmount: readAmount(ayqChild(instructed, 'Amt')),
    transactionAmount: readAmount(ayqChild(transaction, 'Amt')),
    counterValueAmount: readAmount(ayqChild(counterValue, 'Amt')),
    proprietaryAmount: readAmount(ayqChild(proprietary, 'Amt')),
    sourceCurrency: ayqTextAt(exchange, 'SrcCcy'),
    targetCurrency: ayqTextAt(exchange, 'TrgtCcy'),
    unitCurrency: ayqTextAt(exchange, 'UnitCcy'),
    exchangeRate: ayqTextAt(exchange, 'XchgRate'),
    contractId: ayqTextAt(exchange, 'CtrctId'),
    quotationDate: ayqTextAt(exchange, 'QtnDt'),
  };

  return Object.values(details).some(value => value !== null) ? details : null;
}

function readCharges(node: AyqXmlNode): AyqCharge[] {
  const charges: AyqCharge[] = [];
  for (const charge of ayqChildren(node, 'Chrgs')) {
    // Схемата допуска и вложен <Rcrd>; и двете форми се четат.
    const records = ayqChildren(charge, 'Rcrd');
    for (const record of records.length > 0 ? records : [charge]) {
      const amount = readAmount(ayqChild(record, 'Amt'));
      if (!amount) continue;
      const indicator = ayqTextAt(record, 'CdtDbtInd');
      charges.push({
        amount,
        bearer: ayqTextAt(record, 'Br'),
        partyBic: ayqTextAt(record, 'Pty', 'FinInstnId', 'BIC'),
        isDebit: indicator === null ? null : indicator === 'DBIT',
      });
    }
  }
  return charges;
}

function readReturnInformation(node: AyqXmlNode): AyqReturnInformation | null {
  if (node === undefined) return null;
  const originalCode = ayqChild(node, 'OrgnlBkTxCd');
  return {
    reasonCode: ayqTextAt(node, 'Rsn', 'Cd'),
    reasonProprietary: ayqTextAt(node, 'Rsn', 'Prtry'),
    originatorName: ayqTextAt(node, 'Orgtr', 'Nm'),
    additionalInformation: ayqTextList(node, 'AddtlInf'),
    originalBankTransactionCode:
      originalCode === undefined ? null : readBankTransactionCode(originalCode),
  };
}

function readStructuredRemittance(
  node: AyqXmlNode,
): AyqStructuredRemittance | null {
  const structured = ayqChild(node, 'Strd');
  if (structured === undefined) return null;
  const referenceInfo = ayqChild(structured, 'CdtrRefInf');
  return {
    creditorReference: ayqTextAt(referenceInfo, 'Ref'),
    creditorReferenceType:
      ayqTextAt(referenceInfo, 'Tp', 'CdOrPrtry', 'Cd') ??
      ayqTextAt(referenceInfo, 'Tp', 'CdOrPrtry', 'Prtry'),
    creditorReferenceIssuer: ayqTextAt(referenceInfo, 'Tp', 'Issr'),
    additionalInformation: ayqTextList(structured, 'AddtlRmtInf'),
  };
}

function readBatch(node: AyqXmlNode): AyqBatch | null {
  const batch = ayqChild(node, 'Btch');
  if (batch === undefined) return null;
  const indicator = ayqTextAt(batch, 'CdtDbtInd');
  return {
    messageId: ayqTextAt(batch, 'MsgId'),
    paymentInformationId: ayqTextAt(batch, 'PmtInfId'),
    numberOfTransactions: ayqTextAt(batch, 'NbOfTxs'),
    totalAmount: readAmount(ayqChild(batch, 'TtlAmt')),
    isDebit: indicator === null ? null : indicator === 'DBIT',
  };
}

function detectFlavour(schema: string | null): AyqCamtFlavour {
  if (schema === null) return 'unknown';
  if (schema.includes('camt.053')) return 'camt.053';
  if (schema.includes('camt.052')) return 'camt.052';
  if (schema.includes('camt.054')) return 'camt.054';
  return 'unknown';
}

function readStatementContext(
  statement: AyqXmlNode,
  header: AyqXmlNode,
  schema: string | null,
  file: string | null,
): AyqStatementContext {
  const account = ayqChild(statement, 'Acct');
  const accountId = ayqChild(account, 'Id');
  return {
    file,
    flavour: detectFlavour(schema),
    schema,
    groupMessageId: ayqTextAt(header, 'MsgId'),
    groupCreatedAt: ayqTextAt(header, 'CreDtTm'),
    statementId: ayqTextAt(statement, 'Id'),
    electronicSequenceNumber: ayqTextAt(statement, 'ElctrncSeqNb'),
    legalSequenceNumber: ayqTextAt(statement, 'LglSeqNb'),
    statementCreatedAt: ayqTextAt(statement, 'CreDtTm'),
    fromDate:
      ayqTextAt(statement, 'FrToDt', 'FrDtTm') ??
      ayqTextAt(statement, 'FrToDt', 'FrDt'),
    toDate:
      ayqTextAt(statement, 'FrToDt', 'ToDtTm') ??
      ayqTextAt(statement, 'FrToDt', 'ToDt'),
    accountIban: ayqTextAt(accountId, 'IBAN'),
    accountOtherId: ayqTextAt(accountId, 'Othr', 'Id'),
    accountCurrency: ayqTextAt(account, 'Ccy'),
    accountOwnerName: ayqTextAt(account, 'Ownr', 'Nm'),
    accountServicerBic: ayqTextAt(account, 'Svcr', 'FinInstnId', 'BIC'),
  };
}

/**
 * Ключ за дедупликация, стабилен между два експорта на един и същ ден.
 *
 * Името на файла нарочно не участва — ABN AMRO кръщава експортите с момента на
 * сваляне, така че един и същи ден идва под различно име при повторно теглене.
 */
function buildKey(parts: (string | number | null)[]): string {
  return createHash('sha1').update(parts.join(' ')).digest('hex').slice(0, 16);
}

/**
 * Разпарсва CAMT съобщение в беззагубени междинни записи — един на <TxDtls>,
 * или един на <Ntry>, когато <TxDtls> липсва.
 */
export async function ayqParseCamt(
  content: string,
  options: AyqParseOptions = {},
): Promise<AyqBankEntry[]> {
  const document = await ayqParseXml(content);
  const root = ayqChild(document, 'Document');
  const schema = ayqAttr(root, 'xmlns');

  // Контейнерът зависи от вида на съобщението: Stmt (053), Rpt (052),
  // Ntfctn (054). Търси се само коренът; самите записи се обхождат изрично.
  const statements = [
    ...ayqFindAll(root, 'Stmt'),
    ...ayqFindAll(root, 'Rpt'),
    ...ayqFindAll(root, 'Ntfctn'),
  ];
  const header = ayqFindAll(root, 'GrpHdr')[0];
  const file = options.file ?? null;

  const results: AyqBankEntry[] = [];

  statements.forEach((statement, statementIndex) => {
    const context = readStatementContext(statement, header, schema, file);

    ayqChildren(statement, 'Ntry').forEach((entry, entryIndex) => {
      const entryIndicator = ayqTextAt(entry, 'CdtDbtInd');
      const entryAmount = signedAmount(
        readAmount(ayqChild(entry, 'Amt')),
        entryIndicator === 'DBIT',
      );
      const reversal = ayqTextAt(entry, 'RvslInd');
      const entryCode = readBankTransactionCode(ayqChild(entry, 'BkTxCd'));
      const entryDetails = ayqChild(entry, 'NtryDtls');
      const transactions = ayqChildren(entryDetails, 'TxDtls');
      const entryExchange = readCurrencyExchange(ayqChild(entry, 'AmtDtls'));
      const entryCharges = readCharges(entry);
      const additionalEntryInformation = ayqTextAt(entry, 'AddtlNtryInf');

      // Няма <TxDtls> → един запис с празна транзакционна половина. Това е
      // случаят при 217 от 567-те измерени записа: BEA, GEA, такси, лихва.
      const slots: AyqXmlNode[] =
        transactions.length > 0 ? transactions : [undefined];

      slots.forEach((transaction, slotIndex) => {
        const transactionIndex = transactions.length > 0 ? slotIndex : -1;
        const indicator = ayqTextAt(transaction, 'CdtDbtInd') ?? entryIndicator;
        const isDebit = indicator === 'DBIT';

        const transactionAmount = readAmount(ayqChild(transaction, 'Amt'));
        const amount =
          transactionAmount !== null
            ? signedAmount(transactionAmount, isDebit)
            : entryAmount;

        const relatedParties = ayqChild(transaction, 'RltdPties');
        const references = readReferences(ayqChild(transaction, 'Refs'));
        const remittance = ayqChild(transaction, 'RmtInf');
        const remittanceUnstructured = ayqTextList(remittance, 'Ustrd');

        // Суровото описание: редовете на Ustrd, ако ги има, иначе
        // AddtlNtryInf. Без trim и без свиване на интервали — форматът на
        // картовите записи се разпознава точно по тях.
        const rawDescription =
          remittanceUnstructured.length > 0
            ? remittanceUnstructured.join('\n')
            : additionalEntryInformation;

        const transactionCode = ayqChild(transaction, 'BkTxCd');
        const code =
          transactionCode === undefined
            ? entryCode
            : readBankTransactionCode(transactionCode);

        const accountServicerReference =
          references.accountServicerReference ?? ayqTextAt(entry, 'AcctSvcrRef');

        results.push({
          statement: context,
          position: {
            statementIndex,
            entryIndex,
            transactionIndex,
            transactionCount: transactions.length,
          },
          ayqKey: buildKey([
            context.accountIban ?? context.accountOtherId,
            context.statementId,
            entryIndex,
            transactionIndex,
            accountServicerReference,
            references.endToEndId,
            entryAmount.raw,
            indicator,
          ]),
          amount,
          entryAmount,
          creditDebitIndicator:
            indicator === 'CRDT' || indicator === 'DBIT' ? indicator : null,
          reversalIndicator:
            reversal === null ? null : reversal === 'true' || reversal === '1',
          status: ayqTextAt(entry, 'Sts'),
          bookingDate: readDate(ayqChild(entry, 'BookgDt')),
          valueDate: readDate(ayqChild(entry, 'ValDt')),
          bankTransactionCode: code,
          entryBankTransactionCode: entryCode,
          references: { ...references, accountServicerReference },
          debtor: readParty(
            ayqChild(relatedParties, 'Dbtr'),
            ayqChild(relatedParties, 'DbtrAcct'),
          ),
          creditor: readParty(
            ayqChild(relatedParties, 'Cdtr'),
            ayqChild(relatedParties, 'CdtrAcct'),
          ),
          ultimateDebtor: readParty(
            ayqChild(relatedParties, 'UltmtDbtr'),
            undefined,
          ),
          ultimateCreditor: readParty(
            ayqChild(relatedParties, 'UltmtCdtr'),
            undefined,
          ),
          agents: readAgents(ayqChild(transaction, 'RltdAgts')),
          purposeCode: ayqTextAt(transaction, 'Purp', 'Cd'),
          purposeProprietary: ayqTextAt(transaction, 'Purp', 'Prtry'),
          returnInformation:
            readReturnInformation(ayqChild(transaction, 'RtrInf')) ??
            readReturnInformation(ayqChild(entry, 'RtrInf')),
          remittanceUnstructured,
          structuredRemittance: readStructuredRemittance(remittance),
          additionalEntryInformation,
          additionalTransactionInformation: ayqTextAt(
            transaction,
            'AddtlTxInf',
          ),
          entryReference: ayqTextAt(entry, 'NtryRef'),
          rawDescription,
          currencyExchange:
            readCurrencyExchange(ayqChild(transaction, 'AmtDtls')) ??
            entryExchange,
          charges: [...entryCharges, ...readCharges(transaction)],
          batch: readBatch(entryDetails),
          ...(options.keepRawNode ? { rawNode: { entry, transaction } } : {}),
        });
      });
    });
  });

  return results;
}
