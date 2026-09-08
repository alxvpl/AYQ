// The contract between the AYQ screen and the engine behind it.
//
// Step 5 of the spike. This file is the point of the exercise: the screen never
// touches `@actual-app/api`, it asks these questions and receives these answers.
// Today a small localhost HTTP host carries them; in the product the same
// requests travel over Electron IPC to the forked engine process, which is the
// boundary Actual itself already uses in production (§11.2, §12.2 of the base
// evaluation). Swapping the transport must not change a line of this file.
//
// Everything is serialisable on purpose. Amounts are integer cents, as Actual
// stores them; formatting is the screen's business.

/** One counterparty, as the ledger groups them. */
export type AyqCounterpartyGroup = {
  /** The normalised key. This is the group's identity. */
  key: string;
  /** The name to show: the most frequent variant the bank used. */
  name: string;
  transactions: number;
  /** Signed total in cents. */
  totalCents: number;
  inflowCents: number;
  outflowCents: number;
  firstDate: string;
  lastDate: string;
  /** How many distinct raw strings the bank used for this one counterparty. */
  rawVariants: number;
  /** Which layers decided, most frequent first. */
  resolvedBy: string[];
  paymentKinds: string[];
  intermediary: string | null;
  mandateId: string | null;
  iban: string | null;
};

/** One transaction as the screen shows it. */
export type AyqTransactionRow = {
  importedId: string | null;
  date: string;
  amountCents: number;
  /** The resolved counterparty. */
  payee: string | null;
  /** What the bank said, untouched. */
  raw: string | null;
  notes: string | null;
  counterpartyKey: string | null;
  bankTransactionCode: string | null;
  resolvedBy: string | null;
  paymentKind: string | null;
};

/** What the screen shows before anything is selected. */
export type AyqOverview = {
  accountName: string;
  period: { from: string; to: string };
  totals: {
    transactions: number;
    counterparties: number;
    /** Distinct raw strings across the whole period. */
    rawVariants: number;
    inflowCents: number;
    outflowCents: number;
  };
  groups: AyqCounterpartyGroup[];
};

export type AyqRequest =
  | { kind: 'overview'; from: string; to: string }
  | { kind: 'transactions'; from: string; to: string; counterpartyKey: string };

export type AyqResponse =
  | { kind: 'overview'; overview: AyqOverview }
  | { kind: 'transactions'; rows: AyqTransactionRow[] }
  | { kind: 'error'; message: string };

/**
 * What any transport must provide. The HTTP host implements it today; an
 * Electron IPC bridge will implement the same thing tomorrow.
 */
export type AyqEngine = {
  ask(request: AyqRequest): Promise<AyqResponse>;
  close(): Promise<void>;
};
