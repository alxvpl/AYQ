// Counterparties: who the money went to, as something a person can look at.
//
// Until now a counterparty was a technical key in a provenance record — the
// thing that made six visits to one supermarket one line in the backlog and
// one rule. It is also the most useful object in a personal ledger: it is what
// a person means when they ask where the money goes, what recurs, and what
// they are still paying for.
//
// This file counts them. Every figure here is read from the budget through
// Actual's own query language and totalled here, on the engine side; the
// renderer is handed numbers and formats them.
//
// Grouping is by the canonical key — `ayqCanonicalKey`, which applies aliases —
// so a merchant the bank printed two ways is one counterparty the moment a
// person says it is, in every view at once.

import api from '@actual-app/api';

import type {
  AyqCounterparty,
  AyqCounterpartyDetail,
  AyqCounterpartyFilter,
  AyqCounterpartyList,
  AyqCounterpartyVariant,
  AyqLedgerRow,
  AyqRecurring,
} from '../../ayq-client/src/ayq-ipc-contract.ts';

import { ayqAliasMap, ayqCanonicalKey } from './ayq-aliases.ts';
import { ayqLedger } from './ayq-ledger.ts';
import { ayqRecurring } from './ayq-recurring.ts';
import { ayqReadStore, ayqRowKey, type AyqStore } from './ayq-store.ts';

/** How many counterparties the workspace is given when it does not ask. */
export const AYQ_COUNTERPARTY_LIMIT = 200;

/** How many transactions a counterparty's detail lists. */
const AYQ_RECENT = 25;

/** How many raw name variants one row carries. A list, not a transcript. */
const AYQ_NAMES = 12;

type AyqCounterpartyRow = {
  id: string;
  date: string;
  amount: number;
  imported_id: string | null;
  payee: string | null;
};

async function rows(): Promise<AyqCounterpartyRow[]> {
  const answer = (await api.aqlQuery(
    api
      .q('transactions')
      // The opening balance is Actual's way of recording where an account
      // started. It is not somebody the money went to.
      .filter({ starting_balance_flag: false })
      .select(['id', 'date', 'amount', 'imported_id', { payee: 'payee.name' }]),
  )) as { data?: AyqCounterpartyRow[] };
  return answer.data ?? [];
}

type Bucket = {
  key: string;
  name: string;
  /** The date and id of the row the name came from, so the pick is stable. */
  namedAt: string;
  namedId: string;
  transactions: number;
  outgoingCents: number;
  firstDate: string;
  lastDate: string;
};

/**
 * Every counterparty in the budget, with what the engine counts about it.
 *
 * The display name is the payee of the counterparty's newest transaction, with
 * the id breaking a same-day tie, so two reads of an unchanged budget name it
 * the same way. It is the newest rather than the commonest because a merchant
 * that renamed itself should be listed under the name it uses now.
 */
function gather(
  store: AyqStore,
  all: AyqCounterpartyRow[],
): Map<string, Bucket> {
  const byKey = new Map<string, Bucket>();

  for (const row of all) {
    const provenance = store.provenance[ayqRowKey(row)];
    // Precedence lines 1 and 2, then line 3: a transaction AYQ did not import
    // has no provenance, and the payee Actual holds is the only identity there
    // is for it. Line 4 — no name at all — is left out entirely.
    const key =
      ayqCanonicalKey(store, provenance?.counterpartyKey) ?? row.payee ?? null;
    if (!key) continue;

    const date = String(row.date);
    const id = String(row.id);
    const amount = Number(row.amount ?? 0);
    const outgoing = amount < 0 ? -amount : 0;

    const found = byKey.get(key);
    if (!found) {
      byKey.set(key, {
        key,
        name: row.payee ?? key,
        namedAt: date,
        namedId: id,
        transactions: 1,
        outgoingCents: outgoing,
        firstDate: date,
        lastDate: date,
      });
      continue;
    }

    found.transactions += 1;
    found.outgoingCents += outgoing;
    if (date < found.firstDate) found.firstDate = date;
    if (date > found.lastDate) found.lastDate = date;
    if (
      date > found.namedAt ||
      (date === found.namedAt && id > found.namedId)
    ) {
      found.name = row.payee ?? found.name;
      found.namedAt = date;
      found.namedId = id;
    }
  }

  return byKey;
}

function decorate(
  store: AyqStore,
  bucket: Bucket,
  recurringKeys: Set<string>,
): AyqCounterparty {
  const rule = store.rules.find(one => one.counterpartyKey === bucket.key);
  return {
    key: bucket.key,
    name: bucket.name,
    transactions: bucket.transactions,
    outgoingCents: bucket.outgoingCents,
    firstDate: bucket.firstDate,
    lastDate: bucket.lastDate,
    categoryName: rule?.categoryName ?? null,
    recurring: recurringKeys.has(bucket.key),
    aliases: store.aliases.filter(alias => alias.counterpartyKey === bucket.key)
      .length,
  };
}

/**
 * The counterparties, biggest spend first.
 *
 * Ordered by what they cost rather than alphabetically, because a list of
 * counterparties is read to find out where the money goes. Searching narrows on
 * the name and on the key, so a shop is findable under either.
 *
 * A page at a time, like the ledger: six years of statements is a few hundred
 * counterparties, and the screen says how many of how many it is showing.
 */
export async function ayqCounterparties(
  dataDir: string,
  filter: AyqCounterpartyFilter = {},
): Promise<AyqCounterpartyList> {
  const store = ayqReadStore(dataDir);
  const recurringKeys = new Set(
    (await ayqRecurring(dataDir)).map(one => one.key),
  );
  const buckets = gather(store, await rows());

  const needle = (filter.search ?? '').trim().toLowerCase();
  const matching = [...buckets.values()]
    .filter(
      bucket =>
        needle === '' ||
        bucket.name.toLowerCase().includes(needle) ||
        bucket.key.toLowerCase().includes(needle),
    )
    .map(bucket => decorate(store, bucket, recurringKeys))
    .sort((left, right) => {
      if (left.outgoingCents !== right.outgoingCents) {
        return right.outgoingCents - left.outgoingCents;
      }
      if (left.transactions !== right.transactions) {
        return right.transactions - left.transactions;
      }
      return left.key.localeCompare(right.key);
    });

  const limit = filter.limit ?? AYQ_COUNTERPARTY_LIMIT;
  const page = matching.slice(0, limit);
  return { rows: page, total: matching.length, shown: page.length };
}

/**
 * One counterparty, and the evidence for it.
 *
 * The variants are the imported name keys the automatic resolver decided for
 * these transactions, with the raw names it pronounced under each. One of them
 * is the counterparty's own key; any others are here because a person said so,
 * and each is marked accordingly. A variant is what an alias is written
 * against, which is why it is the unit shown rather than the raw string: the
 * raw strings that normalise to one key move together, and a screen that
 * offered them separately would be offering a choice AYQ cannot honour.
 */
export async function ayqCounterpartyDetail(
  dataDir: string,
  key: string,
): Promise<AyqCounterpartyDetail> {
  const store = ayqReadStore(dataDir);
  const all = await rows();
  const buckets = gather(store, all);
  const bucket = buckets.get(key);

  const recurring: AyqRecurring | null =
    (await ayqRecurring(dataDir)).find(one => one.key === key) ?? null;

  const counterparty: AyqCounterparty = bucket
    ? decorate(store, bucket, new Set(recurring === null ? [] : [key]))
    : {
        key,
        name: key,
        transactions: 0,
        outgoingCents: 0,
        firstDate: '',
        lastDate: '',
        categoryName:
          store.rules.find(one => one.counterpartyKey === key)?.categoryName ??
          null,
        recurring: false,
        aliases: store.aliases.filter(alias => alias.counterpartyKey === key)
          .length,
      };

  const aliases = ayqAliasMap(store);
  type Variant = {
    key: string;
    names: Array<{ name: string; date: string }>;
    transactions: number;
    firstDate: string;
    lastDate: string;
  };
  const byVariant = new Map<string, Variant>();

  for (const row of all) {
    const provenance = store.provenance[ayqRowKey(row)];
    const resolvedKey = provenance?.counterpartyKey ?? null;
    if (resolvedKey === null) continue;
    if (ayqCanonicalKey(store, resolvedKey) !== key) continue;

    const date = String(row.date);
    const name = provenance?.counterpartyName ?? null;
    const found = byVariant.get(resolvedKey);
    if (!found) {
      byVariant.set(resolvedKey, {
        key: resolvedKey,
        names: name === null ? [] : [{ name, date }],
        transactions: 1,
        firstDate: date,
        lastDate: date,
      });
      continue;
    }
    found.transactions += 1;
    if (date < found.firstDate) found.firstDate = date;
    if (date > found.lastDate) found.lastDate = date;
    if (name !== null && !found.names.some(one => one.name === name)) {
      found.names.push({ name, date });
    }
  }

  const variants: AyqCounterpartyVariant[] = [...byVariant.values()]
    .map(variant => ({
      key: variant.key,
      names: variant.names
        .sort((left, right) =>
          left.date === right.date
            ? left.name.localeCompare(right.name)
            : left.date < right.date
              ? 1
              : -1,
        )
        .slice(0, AYQ_NAMES)
        .map(one => one.name),
      transactions: variant.transactions,
      firstDate: variant.firstDate,
      lastDate: variant.lastDate,
      aliased: aliases.has(variant.key),
    }))
    .sort((left, right) => {
      // The counterparty's own key first; then the biggest of what was moved in.
      if (left.aliased !== right.aliased) return left.aliased ? 1 : -1;
      if (left.transactions !== right.transactions) {
        return right.transactions - left.transactions;
      }
      return left.key.localeCompare(right.key);
    });

  const ledger = await ayqLedger(dataDir, {
    counterpartyKey: key,
    limit: AYQ_RECENT,
  });
  const recent: AyqLedgerRow[] = ledger.rows;

  return { counterparty, variants, recurring, recent };
}
