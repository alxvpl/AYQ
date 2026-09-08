// A counterparty is not a string but a resolved object with a chain of
// evidence.
//
// The reason is measured: 201 card and ATM entries produce 201 distinct names,
// because the string carries the terminal, the date, the time and the card
// number. Conversely, 38 % of entries have no counterparty IBAN at all. So
// neither the name nor the IBAN is the anchor — the anchor is BkTxCd, which is
// always present.
//
// Every layer leaves a trace even when it does not decide. The layer that made
// the call is recorded, so every name can be explained, challenged and fixed.

/** A layer that may pronounce a counterparty name. */
export type AyqCounterpartyLayer =
  /** The bank itself is the counterparty — a fee or interest. Read off BkTxCd. */
  | 'bank-transaction-code'
  /** RltdPties plus the counterparty IBAN. Works on the 350 structured entries. */
  | 'structured'
  /** A recognised payment intermediary: the IBAN is its own. Never decides. */
  | 'intermediary'
  /** Parsing the free text. The only option on card entries. */
  | 'description'
  /** The user's alias table. Has the last word. */
  | 'alias'
  /** No layer pronounced a name. */
  | 'unresolved';

/** The kind of payment per BkTxCd — it decides which layer is asked, and when. */
export type AyqPaymentKind =
  | 'card-terminal' // PMNT/CCRD/POSD — "BEA", 198 of the 217 unstructured
  | 'card-withdrawal' // PMNT/CCRD/CWDL — "GEA", ATM
  | 'direct-debit' // PMNT/RDDT/* — SEPA mandate, 157 entries
  | 'credit-transfer' // PMNT/ICDT/*, PMNT/RCDT/*
  | 'bank-fee' // PMNT/MDOP/COMM — the bank is the counterparty
  | 'interest' // ACMT/ACOP/INTR — the bank is the counterparty
  | 'reversal' // a reversal, seen through RvslInd or RtrInf
  | 'unknown'; // XTND/NTAV/NTAV and everything uncovered

/** What one layer saw, and why it accepted or passed. */
export type AyqEvidence = {
  layer: AyqCounterpartyLayer;
  /** The field the layer read, named as in the schema. */
  source: string;
  name: string | null;
  iban: string | null;
  /** Whether this layer pronounced the final name. */
  accepted: boolean;
  /** One sentence — readable in the interface without documentation. */
  note: string;
};

/** The resolved counterparty. */
export type AyqCounterparty = {
  /** The display name, as the layer pronounced it. */
  name: string | null;
  /**
   * The normalised grouping key: upper case, no diacritics, no punctuation,
   * no trailing branch or order number. This is the field things group by.
   */
  key: string | null;
  /** The counterparty IBAN, when known and when it is not an intermediary's. */
  iban: string | null;
  /** The recognised intermediary, when the IBAN belongs to one. */
  intermediary: string | null;
  /** The SEPA mandate when there is one — the key to subscriptions. */
  mandateId: string | null;
  /** The layer that made the call. */
  resolvedBy: AyqCounterpartyLayer;
  kind: AyqPaymentKind;
  /** The whole chain in execution order, including the layers that passed. */
  trail: AyqEvidence[];
};

/** A manual alias. Matches on IBAN, on mandate, or on the normalised key. */
export type AyqAlias = {
  iban?: string;
  mandateId?: string;
  key?: string;
  /** The final name. */
  name: string;
};

export type AyqResolveOptions = {
  aliases?: AyqAlias[];
  /**
   * Intermediaries beyond the built-in list — strings looked for inside the
   * name, case-insensitively.
   */
  intermediaryNames?: string[];
  /** IBANs known to belong to an intermediary rather than to a merchant. */
  intermediaryIbans?: string[];
};
