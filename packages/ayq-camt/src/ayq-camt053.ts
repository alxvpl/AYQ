// AYQ CAMT parser — camt.053 (and .052/.054) to a lossless intermediate record.
//
// Origin: loot-core/src/server/transactions/import/xmlcamt2json.ts from Actual
// 26.9.0, HEAD db1b0ea. Copied, not forked. The original yields five fields
// (amount, date, payee_name, imported_payee, notes) and discards the
// counterparty IBAN, BkTxCd, the whole Refs block, the BIC, one of the two
// dates, Sts, RvslInd, Purp and RtrInf. Here nothing is discarded.
//
// Three behavioural differences from the original:
//   1. One record per <TxDtls>, and one per <Ntry> when <TxDtls> is absent.
//      The original also descends into TxDtls, but only for an array; with a
//      single TxDtls the transaction and entry halves get mixed together.
//   2. Party names are read from <Dbtr>/<Cdtr>/<Nm> explicitly. The original
//      searches for <Nm> recursively and, for a party without a name, picks up
//      the name from the postal address.
//   3. Traversal starts at <Stmt> rather than a blind search for <Ntry>, so
//      every record carries the statement context and the account it belongs to.

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
  /** The file's base name, recorded in the statement context. */
  file?: string;
  /** Attaches the parsed XML subtree to every record. Off by default. */
  keepRawNode?: boolean;
};

function toNumber(raw: string | null): number | null {
  if (raw === null) return null;
  const value = Number(raw.trim());
  return Number.isNaN(value) ? null : value;
}

/** Amount plus currency plus the raw string. The sign is applied separately. */
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
 * A party and its account.
 *
 * The name is read from the party's own <Nm>, not recursively: for a party
 * with no name but with a postal address, a recursive search returns the name
 * from the address.
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
    // The schema also allows a nested <Rcrd>; both forms are read.
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
 * A deduplication key, stable across two exports of the same day.
 *
 * The file name is deliberately left out — ABN AMRO names exports after the
 * moment of download, so the same day arrives under a different name when it
 * is fetched again.
 */
function buildKey(parts: (string | number | null)[]): string {
  return createHash('sha1').update(parts.join(' ')).digest('hex').slice(0, 16);
}

/**
 * Parses a CAMT message into lossless intermediate records — one per
 * <TxDtls>, or one per <Ntry> when <TxDtls> is absent.
 */
export async function ayqParseCamt(
  content: string,
  options: AyqParseOptions = {},
): Promise<AyqBankEntry[]> {
  const document = await ayqParseXml(content);
  const root = ayqChild(document, 'Document');
  const schema = ayqAttr(root, 'xmlns');

  // The container depends on the message kind: Stmt (053), Rpt (052),
  // Ntfctn (054). Only the root is searched for; the entries are walked
  // explicitly.
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

      // No <TxDtls> means one record with an empty transaction half. That is
      // the case for 217 of the 567 measured entries: card, ATM, fees,
      // interest.
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

        // The raw description: the Ustrd lines when present, otherwise
        // AddtlNtryInf. Never trimmed, whitespace never collapsed — the card
        // format is recognised by exactly those runs of spaces.
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
