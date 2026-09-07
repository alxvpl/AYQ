// AYQ — беззагубен междинен банков запис (intermediate bank record).
//
// Един запис на <TxDtls>, не на <Ntry>. Когато <Ntry> няма <TxDtls>, се получава
// точно един запис с празна транзакционна половина, но с пълния <Ntry> контекст —
// това е случаят при 217 от 567-те измерени записа (BEA/GEA/такси/лихва).
//
// Правило: нищо от банката не се изхвърля и нищо не се пренаписва. Нормализацията
// е отделен слой (виж src/counterparty), който чете този запис и не го променя.

/** Схемата, от която е дошъл записът. */
export type AyqCamtFlavour = 'camt.053' | 'camt.052' | 'camt.054' | 'unknown';

/** Сума както банката я дава: числото, валутата и суровият низ непокътнат. */
export type AyqAmount = {
  /** Знаково число. Знакът идва от CdtDbtInd, не от текста. */
  value: number | null;
  /** ISO 4217 от атрибута Ccy, ако присъства. */
  currency: string | null;
  /** Суровият текст на елемента, точно както е в XML-а. */
  raw: string | null;
};

/** Дата, запазена и като ден, и като пълен момент, ако банката дава DtTm. */
export type AyqDate = {
  /** YYYY-MM-DD. */
  date: string | null;
  /** Пълният ISO момент, когато банката е дала <DtTm>; иначе null. */
  dateTime: string | null;
};

/**
 * <BkTxCd> — банково авторитетната класификация. Присъства при всичките 567
 * измерени записа, включително при тези без <TxDtls>. Затова веригата за
 * разпознаване на контрагента тръгва оттук, а не от IBAN.
 */
export type AyqBankTransactionCode = {
  domain: string | null; // Domn/Cd              напр. PMNT
  family: string | null; // Domn/Fmly/Cd         напр. CCRD
  subFamily: string | null; // Domn/Fmly/SubFmlyCd  напр. POSD
  proprietary: string | null; // Prtry/Cd
  proprietaryIssuer: string | null; // Prtry/Issr
  /** "PMNT/CCRD/POSD" — само когато и трите части са налични. */
  code: string | null;
};

/** <Refs> — цялата група, не само EndToEndId. */
export type AyqReferences = {
  messageId: string | null; // MsgId
  accountServicerReference: string | null; // AcctSvcrRef
  paymentInformationId: string | null; // PmtInfId
  instructionId: string | null; // InstrId
  endToEndId: string | null; // EndToEndId
  transactionId: string | null; // TxId
  /** MndtId — SEPA мандатът; ключът към абонаментите и директните дебити. */
  mandateId: string | null;
  chequeNumber: string | null; // ChqNb
  clearingSystemReference: string | null; // ClrSysRef
  proprietary: Record<string, string>; // Prtry/{Tp,Ref}
};

/** Страна по транзакцията заедно със сметката ѝ. */
export type AyqParty = {
  name: string | null;
  /** Контрагентен IBAN. Липсва при 38 % от измерените записи — затова не е котва. */
  iban: string | null;
  /** Othr/Id — сметка без IBAN (8 случая в измерването). */
  otherAccountId: string | null;
  otherAccountScheme: string | null;
  accountCurrency: string | null;
  country: string | null;
  /** AdrLine, ред по ред, непокътнати. */
  addressLines: string[];
  /** Id/OrgId/Othr/Id. */
  organisationId: string | null;
  /** Id/PrvtId/Othr/Id. */
  privateId: string | null;
};

/** <RltdAgts> — BIC на банките на двете страни. */
export type AyqAgents = {
  debtorAgentBic: string | null;
  creditorAgentBic: string | null;
  intermediaryAgentBic: string | null;
};

/** <AmtDtls> + <CcyXchg> — валутните операции. */
export type AyqCurrencyExchange = {
  instructedAmount: AyqAmount | null; // InstdAmt
  transactionAmount: AyqAmount | null; // TxAmt
  counterValueAmount: AyqAmount | null; // CntrValAmt
  proprietaryAmount: AyqAmount | null; // PrtryAmt
  sourceCurrency: string | null; // CcyXchg/SrcCcy
  targetCurrency: string | null; // CcyXchg/TrgtCcy
  unitCurrency: string | null; // CcyXchg/UnitCcy
  /** Низ, за да не се губи точност при закръгляне. */
  exchangeRate: string | null; // CcyXchg/XchgRate
  contractId: string | null; // CcyXchg/CtrctId
  quotationDate: string | null; // CcyXchg/QtnDt
};

/** <Chrgs> — банкови такси, начислени върху записа. */
export type AyqCharge = {
  amount: AyqAmount;
  bearer: string | null; // Br
  partyBic: string | null; // Pty/FinInstnId/BIC
  isDebit: boolean | null; // CdtDbtInd
};

/** <RtrInf> — сторно/връщане. */
export type AyqReturnInformation = {
  reasonCode: string | null; // Rsn/Cd
  reasonProprietary: string | null; // Rsn/Prtry
  originatorName: string | null; // Orgtr/Nm
  additionalInformation: string[]; // AddtlInf, ред по ред
  originalBankTransactionCode: AyqBankTransactionCode | null; // OrgnlBkTxCd
};

/** <RmtInf/Strd> — структурираната референция на кредитора. */
export type AyqStructuredRemittance = {
  creditorReference: string | null; // CdtrRefInf/Ref
  creditorReferenceType: string | null; // CdtrRefInf/Tp/CdOrPrtry
  creditorReferenceIssuer: string | null; // CdtrRefInf/Tp/Issr
  additionalInformation: string[]; // AddtlRmtInf
};

/** <NtryDtls/Btch> — batch контекст. Няма го в измерената сметка, но е част от схемата. */
export type AyqBatch = {
  messageId: string | null; // MsgId
  paymentInformationId: string | null; // PmtInfId
  numberOfTransactions: string | null; // NbOfTxs
  totalAmount: AyqAmount | null; // TtlAmt
  isDebit: boolean | null; // CdtDbtInd
};

/** Контекстът на извлечението, в което живее записът. */
export type AyqStatementContext = {
  /** Само базовото име на файла — пътища не се записват. */
  file: string | null;
  flavour: AyqCamtFlavour;
  /** URN на схемата от xmlns на <Document>. */
  schema: string | null;
  groupMessageId: string | null; // GrpHdr/MsgId
  groupCreatedAt: string | null; // GrpHdr/CreDtTm
  statementId: string | null; // Stmt/Id
  electronicSequenceNumber: string | null; // ElctrncSeqNb
  legalSequenceNumber: string | null; // LglSeqNb
  statementCreatedAt: string | null; // Stmt/CreDtTm
  fromDate: string | null; // FrToDt/FrDtTm
  toDate: string | null; // FrToDt/ToDtTm
  /** Собствената сметка. */
  accountIban: string | null;
  accountOtherId: string | null;
  accountCurrency: string | null;
  accountOwnerName: string | null;
  accountServicerBic: string | null;
};

/** Позицията на записа в източника — прави го проследим до конкретния <Ntry>. */
export type AyqEntryPosition = {
  /** Индекс на <Stmt> във файла, от 0. */
  statementIndex: number;
  /** Индекс на <Ntry> в извлечението, от 0. */
  entryIndex: number;
  /** Индекс на <TxDtls> в записа, от 0. -1 когато <TxDtls> изобщо липсва. */
  transactionIndex: number;
  /** Брой <TxDtls> в този <Ntry>. 0 при 217-те записа без структурирани данни. */
  transactionCount: number;
};

/**
 * Беззагубеният междинен банков запис.
 *
 * Всичко, което ABN AMRO дава в camt.053 за една транзакция, стои тук в
 * банковата си форма. Нищо не е слято, нищо не е съкратено, нищо не е
 * интерпретирано. Слоят за нормализация чете това и произвежда отделен обект.
 */
export type AyqBankEntry = {
  statement: AyqStatementContext;
  position: AyqEntryPosition;

  /** Стабилен ключ за дедупликация в рамките на един импорт. */
  ayqKey: string;

  /** Сумата на транзакцията (TxDtls/Amt, ако има; иначе Ntry/Amt), със знак. */
  amount: AyqAmount;
  /** Сумата на целия <Ntry>, винаги. Различава се от amount само при batch. */
  entryAmount: AyqAmount;
  /** CRDT/DBIT, както банката го дава. */
  creditDebitIndicator: 'CRDT' | 'DBIT' | null;
  /** RvslInd — записът сторнира предишен. 1 попадение в измерването. */
  reversalIndicator: boolean | null;
  /** Sts — BOOK/PDNG/INFO. */
  status: string | null;

  /** BookgDt и ValDt поотделно, никога слети. И двете при всичките 567 записа. */
  bookingDate: AyqDate;
  valueDate: AyqDate;

  bankTransactionCode: AyqBankTransactionCode;
  /** BkTxCd на ниво <Ntry>, когато <TxDtls> носи собствен различен код. */
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

  /** RmtInf/Ustrd — ред по ред, точно както са в XML-а. */
  remittanceUnstructured: string[];
  structuredRemittance: AyqStructuredRemittance | null;
  /** AddtlNtryInf — непокътнато. Единственият носител на име при BEA/GEA. */
  additionalEntryInformation: string | null;
  /** AddtlTxInf — непокътнато. */
  additionalTransactionInformation: string | null;
  /** NtryRef. */
  entryReference: string | null;

  /**
   * Суровото описание, непокътнато: редовете на RmtInf/Ustrd, ако ги има,
   * иначе AddtlNtryInf. Слепени с \n, без trim, без свиване на интервали.
   * Това е низът, който разборът на описанието получава — и единственото
   * място, където се крие името на търговеца при картовите плащания.
   */
  rawDescription: string | null;

  currencyExchange: AyqCurrencyExchange | null;
  charges: AyqCharge[];
  batch: AyqBatch | null;

  /** Разпарснатото XML поддърво, когато е поискано с { keepRawNode: true }. */
  rawNode?: { entry: unknown; transaction: unknown };
};
