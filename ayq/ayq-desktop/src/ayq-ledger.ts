// Reading the budget: the ledger, one transaction, the accounts, the summary.
//
// One AQL query answers the list. Actual's own query language joins the payee,
// the account and the category, so what comes back is already close to the row
// the screen draws — no fetch per account, no second pass to look up names.
//
// The ordering is the engine's: date descending, then Actual's own intra-day
// `sort_order`, with the id breaking the last tie so two reads of an unchanged
// budget return the same list in the same order.

import api from '@actual-app/api';

import type {
  AyqAccountSummary,
  AyqLedger,
  AyqLedgerFilter,
  AyqLedgerRow,
  AyqSummary,
  AyqTransactionDetail,
} from '../../ayq-client/src/ayq-ipc-contract.ts';
import { ayqReadStore } from './ayq-store.ts';

/** How many rows the screen is given when it does not ask for a number. */
export const AYQ_LEDGER_LIMIT = 500;

/** What the query hands back, before it is narrowed to what the screen needs. */
type AyqQueriedRow = {
  id: string;
  date: string;
  amount: number;
  cleared: boolean;
  sort_order: number | null;
  notes: string | null;
  imported_payee: string | null;
  imported_id: string | null;
  payee: string | null;
  account: string | null;
  accountId: string | null;
  category: string | null;
  categoryId: string | null;
};

function selection() {
  return api
    .q('transactions')
    .select([
      'id',
      'date',
      'amount',
      'cleared',
      'sort_order',
      'notes',
      'imported_payee',
      'imported_id',
      { payee: 'payee.name' },
      { account: 'account.name' },
      { accountId: 'account.id' },
      { category: 'category.name' },
      { categoryId: 'category.id' },
    ]);
}

/**
 * Every transaction the filter's cheap half admits.
 *
 * Account and dates are handed to the engine, which indexes them. Search,
 * category state and counterparty are decided here, because two of the three
 * need the AYQ store and none of them is a column.
 */
async function queried(filter: AyqLedgerFilter): Promise<AyqQueriedRow[]> {
  const conditions: Record<string, unknown>[] = [];
  if (filter.accountId) conditions.push({ account: filter.accountId });
  if (filter.from) conditions.push({ date: { $gte: filter.from } });
  if (filter.to) conditions.push({ date: { $lte: filter.to } });

  let query = selection();
  for (const condition of conditions) query = query.filter(condition);

  const answer = (await api.aqlQuery(query)) as { data?: AyqQueriedRow[] };
  return answer.data ?? [];
}

function compareRows(left: AyqQueriedRow, right: AyqQueriedRow): number {
  if (left.date !== right.date) return left.date < right.date ? 1 : -1;
  const leftOrder = left.sort_order ?? 0;
  const rightOrder = right.sort_order ?? 0;
  if (leftOrder !== rightOrder) return rightOrder - leftOrder;
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function toRow(row: AyqQueriedRow): AyqLedgerRow {
  return {
    id: String(row.id),
    date: String(row.date),
    payee: row.payee ?? null,
    amountCents: Number(row.amount ?? 0),
    account: row.account ?? '',
    accountId: String(row.accountId ?? ''),
    category: row.category ?? null,
    categoryId: row.categoryId ?? null,
    cleared: row.cleared === true,
  };
}

/** The ledger, filtered, newest first. */
export async function ayqLedger(
  dataDir: string,
  filter: AyqLedgerFilter = {},
): Promise<AyqLedger> {
  const store = ayqReadStore(dataDir);
  const needle = (filter.search ?? '').trim().toLowerCase();

  const matching = (await queried(filter)).filter(row => {
    if (filter.uncategorised === true && row.categoryId) return false;

    if (filter.counterpartyKey) {
      const key = row.imported_id
        ? (store.provenance[row.imported_id]?.counterpartyKey ?? null)
        : null;
      if (key !== filter.counterpartyKey) return false;
    }

    if (needle !== '') {
      // The counterparty first, then what the bank said: a person searching
      // for a shop should find it under either name.
      const haystack = [row.payee, row.imported_payee, row.notes, row.category]
        .filter(part => typeof part === 'string')
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(needle)) return false;
    }

    return true;
  });

  matching.sort(compareRows);
  const limit = filter.limit ?? AYQ_LEDGER_LIMIT;
  const rows = matching.slice(0, limit).map(toRow);

  return { rows, total: matching.length, shown: rows.length };
}

/** One transaction, with what the bank said and what AYQ made of it. */
export async function ayqDetail(
  dataDir: string,
  transactionId: string,
): Promise<AyqTransactionDetail> {
  const answer = (await api.aqlQuery(
    selection().filter({ id: transactionId }),
  )) as { data?: AyqQueriedRow[] };

  const found = (answer.data ?? [])[0];
  if (!found) throw new Error(`no transaction ${transactionId} in this budget`);

  const store = ayqReadStore(dataDir);
  return {
    row: toRow(found),
    importedPayee: found.imported_payee ?? null,
    notes: found.notes ?? null,
    importedId: found.imported_id ?? null,
    provenance: found.imported_id
      ? (store.provenance[found.imported_id] ?? null)
      : null,
  };
}

/** Every account, with the balance the engine's spreadsheet computed. */
export async function ayqAccounts(): Promise<AyqAccountSummary[]> {
  const counts = (await api.aqlQuery(
    api.q('transactions').groupBy('account').select([
      { accountId: 'account.id' },
      { count: { $count: 'id' } },
    ]),
  )) as { data?: Array<{ accountId: string; count: number }> };

  const byAccount = new Map(
    (counts.data ?? []).map(row => [String(row.accountId), Number(row.count)]),
  );

  const accounts: AyqAccountSummary[] = [];
  for (const account of await api.getAccounts()) {
    accounts.push({
      id: account.id,
      name: account.name,
      balanceCents: (await api.getAccountBalance(account.id)) ?? 0,
      transactionCount: byAccount.get(account.id) ?? 0,
    });
  }
  return accounts;
}

/** Counted through the engine's own query language. */
export async function ayqTransactionCount(): Promise<number> {
  const counted = (await api.aqlQuery(
    api.q('transactions').calculate({ $count: 'id' }),
  )) as { data?: number };
  return Number(counted.data ?? 0);
}

/**
 * The figures worth seeing above a ledger.
 *
 * The month is the newest transaction's, not today's: a statement imported in
 * September is usually August's, and a summary of a month with nothing in it
 * tells nobody anything.
 */
export async function ayqSummary(dataDir: string): Promise<AyqSummary> {
  const store = ayqReadStore(dataDir);
  const accounts = await ayqAccounts();
  const all = await queried({});
  all.sort(compareRows);

  const month = all[0]?.date?.slice(0, 7) ?? null;
  let income = 0;
  let expense = 0;
  let uncategorised = 0;
  const counterparties = new Set<string>();

  for (const row of all) {
    if (!row.categoryId) uncategorised += 1;
    const key = row.imported_id
      ? store.provenance[row.imported_id]?.counterpartyKey
      : null;
    counterparties.add(key ?? row.payee ?? row.id);

    if (month !== null && row.date.startsWith(month)) {
      const amount = Number(row.amount ?? 0);
      if (amount >= 0) income += amount;
      else expense += amount;
    }
  }

  const lastImport = store.imports[store.imports.length - 1] ?? null;

  return {
    accounts,
    totalBalanceCents: accounts.reduce(
      (total, account) => total + account.balanceCents,
      0,
    ),
    month,
    monthIncomeCents: income,
    monthExpenseCents: expense,
    transactionCount: all.length,
    uncategorisedCount: uncategorised,
    counterpartyCount: counterparties.size,
    lastImportAt: lastImport?.at ?? null,
  };
}
