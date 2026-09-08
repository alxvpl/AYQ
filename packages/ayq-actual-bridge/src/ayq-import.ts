// Loading intermediate records into Actual, headless.
//
// Step 4 of the spike: prove that the stable Node API takes the records without
// the Actual UI, without a sync server, and without building the monorepo.
// `@actual-app/api` 26.9.0 installs from npm on its own (MIT, node >= 20).
//
// The API is a singleton with global state, so every function here opens and
// closes it around a single unit of work rather than leaving it running.

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import api from '@actual-app/api';

import type { AyqBankEntry } from '../../ayq-camt/src/ayq-types.ts';
import { ayqResolveCounterparty } from '../../ayq-camt/src/counterparty/ayq-resolve.ts';
import type { AyqResolveOptions } from '../../ayq-camt/src/counterparty/ayq-counterparty-types.ts';
import {
  ayqToActualTransaction,
  type AyqActualTransaction,
} from './ayq-actual-transaction.ts';
import {
  ayqProvenanceRecord,
  type AyqProvenanceRecord,
} from './ayq-provenance.ts';

export type AyqImportRequest = {
  /** Where the budget lives on disk. Nothing leaves this directory. */
  dataDir: string;
  budgetName: string;
  accountName: string;
  entries: AyqBankEntry[];
  resolve?: AyqResolveOptions;
  /** Opening balance in cents. */
  openingBalance?: number;
};

export type AyqImportResult = {
  budgetId: string;
  accountId: string;
  /** Records that produced a transaction. */
  prepared: number;
  /** Records with no usable date or amount, so nothing was sent. */
  skipped: number;
  added: number;
  updated: number;
  errors: unknown[];
  provenance: AyqProvenanceRecord[];
  /** Where the provenance file was written, when it was. */
  provenanceFile: string | null;
};

/**
 * Adds the account id Actual requires on every row.
 *
 * The mapping itself does not know which account it is filling — that is only
 * decided at import time — so the id is attached here rather than carried
 * through AyqActualTransaction.
 */
function withAccount(
  transactions: AyqActualTransaction[],
  accountId: string,
): Array<AyqActualTransaction & { account: string }> {
  return transactions.map(transaction => ({ ...transaction, account: accountId }));
}

/** Turns records into Actual transactions plus the provenance beside them. */
export function ayqPrepare(
  entries: AyqBankEntry[],
  options: AyqResolveOptions = {},
): {
  transactions: AyqActualTransaction[];
  provenance: AyqProvenanceRecord[];
  skipped: number;
} {
  const transactions: AyqActualTransaction[] = [];
  const provenance: AyqProvenanceRecord[] = [];
  let skipped = 0;

  for (const entry of entries) {
    const counterparty = ayqResolveCounterparty(entry, options);
    const transaction = ayqToActualTransaction(entry, counterparty);
    if (transaction === null) {
      skipped += 1;
      continue;
    }
    transactions.push(transaction);
    provenance.push(ayqProvenanceRecord(entry, counterparty));
  }

  return { transactions, provenance, skipped };
}

/**
 * Creates a budget, an account, and imports the records into it.
 *
 * Uses `runImport`, which is the API's way of building a budget from nothing —
 * no server, no existing file. The provenance is written next to the budget as
 * `ayq-provenance.json`, because Actual's schema has nowhere to keep it.
 */
export async function ayqImportToActual(
  request: AyqImportRequest,
): Promise<AyqImportResult> {
  const { transactions, provenance, skipped } = ayqPrepare(
    request.entries,
    request.resolve,
  );

  let accountId = '';
  let result: {
    errors?: unknown[];
    added?: string[];
    updated?: string[];
  } = {};

  await api.init({ dataDir: request.dataDir });
  try {
    await api.runImport(request.budgetName, async () => {
      accountId = await api.createAccount(
        { name: request.accountName, offbudget: false },
        request.openingBalance ?? 0,
      );
      result = await api.importTransactions(
        accountId,
        withAccount(transactions, accountId),
      );
    });

    const budgets = await api.getBudgets();
    const budget = budgets.find(item => item.name === request.budgetName);
    const budgetId = budget?.id ?? '';

    let provenanceFile: string | null = null;
    if (budgetId !== '') {
      provenanceFile = join(request.dataDir, budgetId, 'ayq-provenance.json');
      await writeFile(
        provenanceFile,
        `${JSON.stringify(provenance, null, 2)}\n`,
        'utf8',
      );
    }

    return {
      budgetId,
      accountId,
      prepared: transactions.length,
      skipped,
      added: result.added?.length ?? 0,
      updated: result.updated?.length ?? 0,
      errors: result.errors ?? [],
      provenance,
      provenanceFile,
    };
  } finally {
    await api.shutdown();
  }
}

export type AyqLedgerRow = {
  date: string;
  amount: number;
  payee: string | null;
  importedPayee: string | null;
  notes: string | null;
  importedId: string | null;
};

/**
 * Reads the ledger back out of a budget that is already on disk.
 *
 * This is the half that proves the import: the records go in through the API
 * and come back out of it, without the Actual UI ever running.
 */
export async function ayqReadLedger(
  dataDir: string,
  budgetId: string,
  accountId: string,
  from: string,
  to: string,
): Promise<AyqLedgerRow[]> {
  await api.init({ dataDir });
  try {
    await api.loadBudget(budgetId);
    const payees = await api.getPayees();
    const byId = new Map(payees.map(payee => [payee.id, payee.name]));
    const transactions = await api.getTransactions(accountId, from, to);

    return transactions.map(transaction => ({
      date: transaction.date,
      amount: transaction.amount,
      payee: transaction.payee ? (byId.get(transaction.payee) ?? null) : null,
      importedPayee: transaction.imported_payee ?? null,
      notes: transaction.notes ?? null,
      importedId: transaction.imported_id ?? null,
    }));
  } finally {
    await api.shutdown();
  }
}

/**
 * Imports into an account that already exists, so a second export of the same
 * period can be run through and shown to add nothing.
 */
export async function ayqImportAgain(
  dataDir: string,
  budgetId: string,
  accountId: string,
  entries: AyqBankEntry[],
  options: AyqResolveOptions = {},
): Promise<{ added: number; updated: number; errors: unknown[] }> {
  const { transactions } = ayqPrepare(entries, options);

  await api.init({ dataDir });
  try {
    await api.loadBudget(budgetId);
    const result = await api.importTransactions(
      accountId,
      withAccount(transactions, accountId),
    );
    return {
      added: result.added?.length ?? 0,
      updated: result.updated?.length ?? 0,
      errors: result.errors ?? [],
    };
  } finally {
    await api.shutdown();
  }
}
