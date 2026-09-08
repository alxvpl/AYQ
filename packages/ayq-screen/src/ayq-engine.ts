// The engine behind the screen.
//
// Runs `@actual-app/api` headless, joins the ledger to the provenance written
// beside the budget, and answers the contract. Nothing above this file knows
// that Actual exists.
//
// The join is the whole trick: Actual holds the money and the payee, the
// provenance holds the normalised key and the layer that produced it, and the
// two meet on `imported_id`.

import { readFile } from 'node:fs/promises';

import api from '@actual-app/api';

import type { AyqProvenanceRecord } from '../../ayq-actual-bridge/src/ayq-provenance.ts';
import type {
  AyqCounterpartyGroup,
  AyqEngine,
  AyqOverview,
  AyqRequest,
  AyqResponse,
  AyqTransactionRow,
} from './ayq-contract.ts';

export type AyqEngineOptions = {
  dataDir: string;
  budgetId: string;
  accountId: string;
  accountName: string;
  /** The provenance file written beside the budget at import time. */
  provenanceFile: string;
};

type LedgerRow = {
  importedId: string | null;
  date: string;
  amountCents: number;
  payee: string | null;
  raw: string | null;
  notes: string | null;
};

/** The most frequent value, ties broken alphabetically so runs are stable. */
function mostFrequent(values: string[]): string[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([value]) => value);
}

function groupOf(
  key: string,
  rows: LedgerRow[],
  provenance: (AyqProvenanceRecord | undefined)[],
): AyqCounterpartyGroup {
  const dates = rows.map(row => row.date).sort();
  const names = rows
    .map(row => row.payee)
    .filter((name): name is string => name !== null);
  const known = provenance.filter(
    (record): record is AyqProvenanceRecord => record !== undefined,
  );

  let inflow = 0;
  let outflow = 0;
  for (const row of rows) {
    if (row.amountCents >= 0) inflow += row.amountCents;
    else outflow += row.amountCents;
  }

  return {
    key,
    // The group's identity is the key; the label is the variant the bank used
    // most often, so real punctuation survives on structured counterparties.
    name: mostFrequent(names)[0] ?? key,
    transactions: rows.length,
    totalCents: inflow + outflow,
    inflowCents: inflow,
    outflowCents: outflow,
    firstDate: dates[0] ?? '',
    lastDate: dates.at(-1) ?? '',
    rawVariants: new Set(rows.map(row => row.raw ?? row.payee ?? '')).size,
    resolvedBy: mostFrequent(known.map(record => record.resolvedBy)),
    paymentKinds: mostFrequent(known.map(record => record.paymentKind)),
    intermediary: known.find(record => record.intermediary)?.intermediary ?? null,
    mandateId: known.find(record => record.mandateId)?.mandateId ?? null,
    iban: known.find(record => record.counterpartyIban)?.counterpartyIban ?? null,
  };
}

/**
 * Opens a budget and keeps it open for the life of the engine.
 *
 * The API is a singleton, so at most one engine may be open at a time.
 */
export async function ayqOpenEngine(
  options: AyqEngineOptions,
): Promise<AyqEngine> {
  const provenance: AyqProvenanceRecord[] = JSON.parse(
    await readFile(options.provenanceFile, 'utf8'),
  );
  const byImportedId = new Map(
    provenance.map(record => [record.importedId, record]),
  );

  await api.init({ dataDir: options.dataDir });
  await api.loadBudget(options.budgetId);

  const readLedger = async (from: string, to: string): Promise<LedgerRow[]> => {
    const payees = await api.getPayees();
    const names = new Map(payees.map(payee => [payee.id, payee.name]));
    const transactions = await api.getTransactions(options.accountId, from, to);

    return transactions.map(transaction => ({
      importedId: transaction.imported_id ?? null,
      date: transaction.date,
      amountCents: transaction.amount,
      payee: transaction.payee ? (names.get(transaction.payee) ?? null) : null,
      raw: transaction.imported_payee ?? null,
      notes: transaction.notes ?? null,
    }));
  };

  // A transaction with no provenance still has to group somewhere; the payee
  // name is the honest fallback, and the screen shows that no layer claimed it.
  const keyOf = (row: LedgerRow): string =>
    (row.importedId ? byImportedId.get(row.importedId)?.counterpartyKey : null) ??
    row.payee ??
    'unresolved';

  const ask = async (request: AyqRequest): Promise<AyqResponse> => {
    const rows = await readLedger(request.from, request.to);

    if (request.kind === 'transactions') {
      const selected = rows
        .filter(row => keyOf(row) === request.counterpartyKey)
        .sort((a, b) => b.date.localeCompare(a.date));

      return {
        kind: 'transactions',
        rows: selected.map((row): AyqTransactionRow => {
          const record = row.importedId
            ? byImportedId.get(row.importedId)
            : undefined;
          return {
            importedId: row.importedId,
            date: row.date,
            amountCents: row.amountCents,
            payee: row.payee,
            raw: row.raw,
            notes: row.notes,
            counterpartyKey: record?.counterpartyKey ?? null,
            bankTransactionCode: record?.bankTransactionCode ?? null,
            resolvedBy: record?.resolvedBy ?? null,
            paymentKind: record?.paymentKind ?? null,
          };
        }),
      };
    }

    const buckets = new Map<string, LedgerRow[]>();
    for (const row of rows) {
      const key = keyOf(row);
      const bucket = buckets.get(key);
      if (bucket) bucket.push(row);
      else buckets.set(key, [row]);
    }

    const groups = [...buckets.entries()]
      .map(([key, bucket]) =>
        groupOf(
          key,
          bucket,
          bucket.map(row =>
            row.importedId ? byImportedId.get(row.importedId) : undefined,
          ),
        ),
      )
      // Largest outflow first: the ledger's own order of interest.
      .sort((a, b) => a.totalCents - b.totalCents);

    let inflow = 0;
    let outflow = 0;
    for (const row of rows) {
      if (row.amountCents >= 0) inflow += row.amountCents;
      else outflow += row.amountCents;
    }

    const overview: AyqOverview = {
      accountName: options.accountName,
      period: { from: request.from, to: request.to },
      totals: {
        transactions: rows.length,
        counterparties: groups.length,
        rawVariants: new Set(rows.map(row => row.raw ?? row.payee ?? '')).size,
        inflowCents: inflow,
        outflowCents: outflow,
      },
      groups,
    };

    return { kind: 'overview', overview };
  };

  return {
    ask,
    close: async () => {
      await api.shutdown();
    },
  };
}
