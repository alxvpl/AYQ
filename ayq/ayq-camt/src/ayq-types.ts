// AYQ — the lossless intermediate bank record.
//
// One record per <TxDtls>, not per <Ntry>. When an <Ntry> carries no <TxDtls>,
// exactly one record is produced, with an empty transaction half but the full
// entry context — that is the shape of 217 of the 567 measured entries
// (card payments, ATM withdrawals, fees, interest).
//
// Rule: nothing the bank gives is discarded and nothing is rewritten.
// Normalisation is a separate layer (see src/counterparty) that reads this
// record and never modifies it.

/** The schema the record came from. */
export type AyqCamtFlavour = 'camt.053' | 'camt.052' | 'camt.054' | 'unknown';

/** An amount as the bank gives it: the number, the currency, the raw string. */
export type AyqAmount = {
  /** Signed number. The sign comes from CdtDbtInd, never from the text. */
  value: number | null;
  /** ISO 4217, from the Ccy attribute when present. */
  currency: string | null;
  /** The element's raw text, exactly as it appears in the XML. */
  raw: string | null;
};

/** A date kept both as a day and as a full instant when the bank gives DtTm. */
export type AyqDate = {
  /** YYYY-MM-DD. */
  date: string | null;
  /** The full ISO instant when the bank gave <DtTm>; otherwise null. */
  dateTime: string | null;
};

/**
 * <BkTxCd> — the bank's authoritative classification. Present on all 567
 * measured entries, including those without <TxDtls>. That is why counterparty
 * resolution starts here rather than at the IBAN.
 */
export type AyqBankTransactionCode = {
  domain: string | null; // Domn/Cd              e.g. PMNT
  family: string | null; // Domn/Fmly/Cd         e.g. CCRD
  subFamily: string | null; // Domn/Fmly/SubFmlyCd  e.g. POSD
  proprietary: string | null; // Prtry/Cd
  proprietaryIssuer: string | null; // Prtry/Issr
  /** "PMNT/CCRD/POSD" — only when all three parts are present. */
  code: string | null;
};

/** <Refs> — the whole group, not just EndToEndId. */
export type AyqReferences = {
  messageId: string | null; // MsgId
  accountServicerReference: string | null; // AcctSvcrRef
  paymentInformationId: string | null; // PmtInfId
  instructionId: string | null; // InstrId
  endToEndId: string | null; // EndToEndId
  transactionId: string | null; // TxId
  /** MndtId — the SEPA mandate; the key to subscriptions and direct debits. */
  mandateId: string | null;
  chequeNumber: string | null; // ChqNb
  clearingSystemReference: string | null; // ClrSysRef
  proprietary: Record<string, string>; // Prtry/{Tp,Ref}
};

/** A party to the transaction together with its account. */
export type AyqParty = {
  name: string | null;
  /** Counterparty IBAN. Missing on 38 % of measured entries — never an anchor. */
  iban: string | null;
  /** Othr/Id — an account without an IBAN (8 cases in the measurement). */
  otherAccountId: string | null;
  otherAccountScheme: string | null;
  accountCurrency: string | null;
  country: string | null;
  /** AdrLine, line by line, untouched. */
  addressLines: string[];
  /** Id/OrgId/Othr/Id. */
  organisationId: string | null;
  /** Id/PrvtId/Othr/Id. */
  privateId: string | null;
  /**
   * Id/PrvtId/Othr/SchmeNm — the scheme the private identifier belongs to.
   *
   * Found by the coverage audit on the real export, 8 occurrences on the
   * creditor. There is deliberately no matching field for the organisation
   * identifier: fields are added when the data shows them, and the audit
   * reports the next one that appears.
   */
  privateIdScheme: string | null;
};

/** <RltdAgts> — the BICs of both parties' banks. */
export type AyqAgents = {
  debtorAgentBic: string | null;
  creditorAgentBic: string | null;
  intermediaryAgentBic: string | null;
};

/** <AmtDtls> + <CcyXchg> — foreign-currency operations. */
export type AyqCurrencyExchange = {
  instructedAmount: AyqAmount | null; // InstdAmt
  transactionAmount: AyqAmount | null; // TxAmt
  counterValueAmount: AyqAmount | null; // CntrValAmt
  proprietaryAmount: AyqAmount | null; // PrtryAmt
  sourceCurrency: string | null; // CcyXchg/SrcCcy
  targetCurrency: string | null; // CcyXchg/TrgtCcy
  unitCurrency: string | null; // CcyXchg/UnitCcy
  /** A string, so no precision is lost to rounding. */
  exchangeRate: string | null; // CcyXchg/XchgRate
  contractId: string | null; // CcyXchg/CtrctId
  quotationDate: string | null; // CcyXchg/QtnDt
};

/** <Chrgs> — bank charges levied on the entry. */
export type AyqCharge = {
  amount: AyqAmount;
  bearer: string | null; // Br
  partyBic: string | null; // Pty/FinInstnId/BIC
  isDebit: boolean | null; // CdtDbtInd
};

/** <RtrInf> — reversal and return information. */
export type AyqReturnInformation = {
  reasonCode: string | null; // Rsn/Cd
  reasonProprietary: string | null; // Rsn/Prtry
  originatorName: string | null; // Orgtr/Nm
  additionalInformation: string[]; // AddtlInf, line by line
  originalBankTransactionCode: AyqBankTransactionCode | null; // OrgnlBkTxCd
};

/** <RmtInf/Strd> — the creditor's structured reference. */
export type AyqStructuredRemittance = {
  creditorReference: string | null; // CdtrRefInf/Ref
  creditorReferenceType: string | null; // CdtrRefInf/Tp/CdOrPrtry
  creditorReferenceIssuer: string | null; // CdtrRefInf/Tp/Issr
  additionalInformation: string[]; // AddtlRmtInf
};

/**
 * <NtryDtls/Btch> — batch context. Absent from the measured account, but part
 * of the schema and the case that would silently collapse amounts.
 */
export type AyqBatch = {
  messageId: string | null; // MsgId
  paymentInformationId: string | null; // PmtInfId
  numberOfTransactions: string | null; // NbOfTxs
  totalAmount: AyqAmount | null; // TtlAmt
  isDebit: boolean | null; // CdtDbtInd
};

/** The statement the record lives in. */
export type AyqStatementContext = {
  /** The file's base name only — paths are never recorded. */
  file: string | null;
  flavour: AyqCamtFlavour;
  /** The schema URN from the <Document> xmlns. */
  schema: string | null;
  groupMessageId: string | null; // GrpHdr/MsgId
  groupCreatedAt: string | null; // GrpHdr/CreDtTm
  statementId: string | null; // Stmt/Id
  electronicSequenceNumber: string | null; // ElctrncSeqNb
  legalSequenceNumber: string | null; // LglSeqNb
  statementCreatedAt: string | null; // Stmt/CreDtTm
  fromDate: string | null; // FrToDt/FrDtTm
  toDate: string | null; // FrToDt/ToDtTm
  /** The account being reported on. */
  accountIban: string | null;
  accountOtherId: string | null;
  accountCurrency: string | null;
  accountOwnerName: string | null;
  accountServicerBic: string | null;
  /**
   * The balance the bank stated at the start of the statement, signed.
   * Null when the statement carries none.
   */
  openingBalance: AyqAmount | null;
  /** The balance the bank stated at the end of the statement, signed. */
  closingBalance: AyqAmount | null;
};

/** Where the record sits in the source — traceable back to the exact <Ntry>. */
export type AyqEntryPosition = {
  /** Index of the <Stmt> in the file, from 0. */
  statementIndex: number;
  /** Index of the <Ntry> in the statement, from 0. */
  entryIndex: number;
  /** Index of the <TxDtls> in the entry, from 0. -1 when <TxDtls> is absent. */
  transactionIndex: number;
  /** Number of <TxDtls> in this <Ntry>. 0 for the 217 unstructured entries. */
  transactionCount: number;
};

/**
 * The lossless intermediate bank record.
 *
 * Everything ABN AMRO gives in camt.053 for one transaction sits here in its
 * banking form. Nothing is merged, shortened or interpreted. The normalisation
 * layer reads this and produces a separate object.
 */
export type AyqBankEntry = {
  statement: AyqStatementContext;
  position: AyqEntryPosition;

  /** A stable key for deduplication within an import. */
  ayqKey: string;

  /** The transaction amount (TxDtls/Amt when present, else Ntry/Amt), signed. */
  amount: AyqAmount;
  /** The whole <Ntry> amount, always. Differs from `amount` only in a batch. */
  entryAmount: AyqAmount;
  /** CRDT/DBIT, as the bank gives it. */
  creditDebitIndicator: 'CRDT' | 'DBIT' | null;
  /** RvslInd — the entry reverses an earlier one. 1 hit in the measurement. */
  reversalIndicator: boolean | null;
  /** Sts — BOOK/PDNG/INFO. */
  status: string | null;

  /** BookgDt and ValDt kept apart, never merged. Both present on all 567. */
  bookingDate: AyqDate;
  valueDate: AyqDate;

  bankTransactionCode: AyqBankTransactionCode;
  /** The <Ntry>-level BkTxCd, when the <TxDtls> carries a different one. */
  entryBankTransactionCode: AyqBankTransactionCode;

  references: AyqReferences;

  debtor: AyqParty;
  creditor: AyqParty;
  ultimateDebtor: AyqParty;
  ultimateCreditor: AyqParty;
  agents: AyqAgents;

  purposeCode: string | null; // Purp/Cd
  purposeProprietary: string | null; // Purp/Prtry
  returnInformation: AyqReturnInformation | null;

  /** RmtInf/Ustrd — line by line, exactly as in the XML. */
  remittanceUnstructured: string[];
  structuredRemittance: AyqStructuredRemittance | null;
  /** AddtlNtryInf, untouched. The only carrier of a name on card entries. */
  additionalEntryInformation: string | null;
  /** AddtlTxInf, untouched. */
  additionalTransactionInformation: string | null;
  /** NtryRef. */
  entryReference: string | null;

  /**
   * The raw description, untouched: the RmtInf/Ustrd lines when present,
   * otherwise AddtlNtryInf. Joined with \n, never trimmed, whitespace never
   * collapsed. This is the string the description parser receives — and the
   * only place a merchant name hides on card payments.
   */
  rawDescription: string | null;

  currencyExchange: AyqCurrencyExchange | null;
  charges: AyqCharge[];
  batch: AyqBatch | null;

  /** The parsed XML subtree, when requested with { keepRawNode: true }. */
  rawNode?: { entry: unknown; transaction: unknown };
};
