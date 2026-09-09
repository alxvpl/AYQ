// Who is this counterparty? The explicit answer, when the automatic one is
// wrong.
//
// The importer resolves a name from the statement through a chain of layers —
// the bank transaction code, the structured party, the free text — and records
// what it decided as provenance. It is right most of the time and it cannot be
// right always: a shop that renames itself, a franchise that bills under a
// holding company, and a bank that prints one merchant two ways all produce two
// counterparties where a person sees one.
//
// An alias is the person saying so, once, explicitly:
//
//     one imported name variant  ->  one canonical counterparty
//
// It is not fuzzy matching, not a similarity score and not a list of merchants
// AYQ was taught in advance. It matches one key, exactly.
//
// ## The precedence, stated exactly
//
// For any transaction, the counterparty it belongs to is decided in this order,
// and the first line that answers wins:
//
//   1. an alias whose `variantKey` equals the counterparty key the automatic
//      resolver recorded in provenance for that transaction — the person's own
//      decision, and the last word;
//   2. that recorded counterparty key itself — whatever layer of the resolver
//      pronounced it at import time;
//   3. the payee Actual holds, for a transaction AYQ has no provenance for;
//   4. nothing: the transaction belongs to no counterparty and is left out of
//      the counterparty views entirely.
//
// Rule 1 is what "a user-created alias outranks automatic name resolution"
// means concretely, and it is applied when the ledger is read — so it holds for
// transactions imported long before the alias existed, and for transactions
// imported long after, without either being a special case.
//
// ## What an alias does not do
//
// It never rewrites provenance. The key the resolver decided, the name it
// pronounced and the string the bank printed all stay exactly as they were
// imported, which is why removing an alias can put the payee back.
//
// It never touches a category. An alias answers who; a category rule answers
// where it belongs; a person's own filing outranks both and is never
// overwritten by either.

import api from '@actual-app/api';

import {
  ayqCanonicalName,
  ayqNormaliseKey,
} from '../../ayq-camt/src/counterparty/ayq-description.ts';
import type { AyqAliasRecord } from '../../ayq-client/src/ayq-ipc-contract.ts';

import { ayqSetPayees } from './ayq-batch.ts';
import { ayqSettle } from './ayq-settle.ts';
import {
  ayqId,
  ayqReadStore,
  ayqRowKey,
  ayqWriteStore,
  type AyqStore,
} from './ayq-store.ts';

export function ayqAliases(dataDir: string): AyqAliasRecord[] {
  return ayqReadStore(dataDir).aliases;
}

/** The alias table as a lookup, by the variant key it matches on. */
export function ayqAliasMap(store: AyqStore): Map<string, AyqAliasRecord> {
  return new Map(store.aliases.map(alias => [alias.variantKey, alias]));
}

/**
 * Line 1 and line 2 of the precedence, in one function.
 *
 * Given the counterparty key the resolver recorded, this is the counterparty
 * the transaction actually belongs to. Everything that groups by counterparty —
 * the ledger's filter, the rules, the recurring view, the backlog, the
 * counterparties workspace — reads through here, so there is exactly one answer
 * to the question and no view can disagree with another about it.
 */
export function ayqCanonicalKey(
  store: AyqStore,
  resolvedKey: string | null | undefined,
): string | null {
  if (!resolvedKey) return null;
  return (
    store.aliases.find(alias => alias.variantKey === resolvedKey)
      ?.counterpartyKey ?? resolvedKey
  );
}

type AyqPayeeWanted = { id: string; payeeName: string };

/**
 * What the budget already calls each counterparty.
 *
 * Actual titles the payee names it is given — "TESTFUEL 22" is stored as
 * "Testfuel" — so the name a counterparty goes by is the budget's business and
 * not AYQ's to impose. This reads it back, keyed by counterparty identity, so a
 * transaction being moved is given the spelling that is already on screen
 * rather than a shouting version of it.
 *
 * Sorted before the map is built, so a budget that somehow holds two payees of
 * one identity picks the same one on every run.
 */
async function payeeNames(): Promise<Map<string, string>> {
  const payees = [...(await api.getPayees())].sort((left, right) =>
    String(left.name).localeCompare(String(right.name)),
  );

  const byKey = new Map<string, string>();
  for (const payee of payees) {
    const key = ayqNormaliseKey(String(payee.name ?? ''));
    if (key !== null && !byKey.has(key)) byKey.set(key, String(payee.name));
  }
  return byKey;
}

/**
 * The payee every transaction AYQ imported ought to carry.
 *
 * The comparison is on identity, not on spelling: a transaction whose payee
 * already normalises to the counterparty it belongs to is right, whatever case
 * Actual chose to store it in, and is left alone. That is what keeps applying
 * an alias to one counterparty from rewriting the name of every other one.
 *
 * An aliased transaction wants the target's name; every other one wants the
 * name the resolver pronounced for it, canonicalised as the import did — which
 * is what makes removing an alias put things back rather than leave behind a
 * name nobody chose.
 *
 * Transactions AYQ has no provenance for are not in this list at all: AYQ did
 * not name them and will not rename them.
 */
async function wantedPayees(
  store: AyqStore,
  named: Map<string, string>,
): Promise<AyqPayeeWanted[]> {
  const answer = (await api.aqlQuery(
    api
      .q('transactions')
      .filter({ starting_balance_flag: false })
      .select(['id', 'imported_id', { payee: 'payee.name' }]),
  )) as {
    data?: Array<{
      id: string;
      imported_id: string | null;
      payee: string | null;
    }>;
  };

  const aliases = ayqAliasMap(store);
  const wanted: AyqPayeeWanted[] = [];

  for (const row of answer.data ?? []) {
    const provenance = store.provenance[ayqRowKey(row)];
    const resolvedKey = provenance?.counterpartyKey;
    if (!resolvedKey) continue;

    const alias = aliases.get(resolvedKey);
    const wantedKey = alias?.counterpartyKey ?? resolvedKey;
    if (ayqNormaliseKey(row.payee) === wantedKey) continue;

    const payeeName =
      named.get(wantedKey) ??
      (alias
        ? alias.counterpartyName
        : // Provenance written by store version 1 recorded the key and not the
          // name, and then there is nothing to restore to but the key itself.
          (ayqCanonicalName(provenance?.counterpartyName ?? null) ??
          wantedKey));

    wanted.push({ id: String(row.id), payeeName });
  }

  return wanted;
}

/** The payee by that name, created if the budget has not got one. */
async function payeeIdFor(name: string): Promise<string> {
  const existing = (await api.getPayees()).find(payee => payee.name === name);
  if (existing) return existing.id;
  return api.createPayee({ name });
}

/**
 * Makes every transaction carry the payee its counterparty identity implies.
 *
 * Only rows AYQ imported, and only rows that are not already right, so a second
 * call after the first changes nothing and reports zero. The writes go through
 * Actual's own batch handler: a merchant with six years of receipts is one
 * decision and should cost about what one decision costs.
 */
export async function ayqApplyAliases(
  dataDir: string,
): Promise<{ moved: number }> {
  const store = ayqReadStore(dataDir);
  const named = await payeeNames();
  const wanted = await wantedPayees(store, named);
  if (wanted.length === 0) return { moved: 0 };

  const ids = new Map<string, string>();
  for (const name of new Set(wanted.map(one => one.payeeName))) {
    ids.set(name, await payeeIdFor(name));
  }

  await ayqSetPayees(
    wanted.map(one => ({ id: one.id, payee: ids.get(one.payeeName)! })),
  );

  // The batch lands after the call that queued it returns, so the answer is not
  // believed until the budget shows it: nothing is left wanting a payee.
  await ayqSettle(
    () => wantedPayees(store, named),
    outstanding => outstanding.length === 0,
    'the counterparty names',
  );

  return { moved: wanted.length };
}

/**
 * Records one alias, and re-points anything that pointed at the variant.
 *
 * The table is kept flat: if somebody had already said that X is this variant,
 * and the variant is now that counterparty, then X is that counterparty too.
 * Resolving chains at write time rather than at read time means the answer to
 * "who is this?" is one lookup and cannot depend on the order the table is read
 * in.
 *
 * A rule that existed only for the variant moves with it. A rule the target
 * already has wins: it is the more recent statement of where that counterparty
 * belongs, and two rules for one counterparty is not a state AYQ keeps.
 */
export function ayqRememberAlias(
  dataDir: string,
  input: {
    variantKey: string;
    variant: string;
    counterpartyKey: string;
    counterpartyName: string;
  },
): AyqAliasRecord[] {
  if (input.variantKey === input.counterpartyKey) {
    throw new Error('a counterparty cannot be an alias of itself');
  }

  const store = ayqReadStore(dataDir);

  // The target may itself be aliased somewhere; the alias that is written is
  // to where it actually ends up.
  const settled = store.aliases.find(
    alias => alias.variantKey === input.counterpartyKey,
  );
  const counterpartyKey = settled?.counterpartyKey ?? input.counterpartyKey;
  const counterpartyName = settled?.counterpartyName ?? input.counterpartyName;

  if (input.variantKey === counterpartyKey) {
    throw new Error('a counterparty cannot be an alias of itself');
  }

  store.aliases = store.aliases.filter(
    alias => alias.variantKey !== input.variantKey,
  );
  for (const alias of store.aliases) {
    if (alias.counterpartyKey === input.variantKey) {
      alias.counterpartyKey = counterpartyKey;
      alias.counterpartyName = counterpartyName;
    }
  }

  store.aliases.push({
    id: ayqId('alias'),
    variant: input.variant,
    variantKey: input.variantKey,
    counterpartyKey,
    counterpartyName,
    createdAt: new Date().toISOString(),
  });
  store.aliases.sort((left, right) =>
    left.variantKey.localeCompare(right.variantKey),
  );

  const hasTargetRule = store.rules.some(
    rule => rule.counterpartyKey === counterpartyKey,
  );
  store.rules = store.rules
    .map(rule =>
      rule.counterpartyKey === input.variantKey && !hasTargetRule
        ? { ...rule, counterpartyKey }
        : rule,
    )
    .filter(
      rule => !(rule.counterpartyKey === input.variantKey && hasTargetRule),
    );

  ayqWriteStore(dataDir, store);
  return store.aliases;
}

export function ayqForgetAlias(
  dataDir: string,
  aliasId: string,
): { aliases: AyqAliasRecord[]; removed: AyqAliasRecord | null } {
  const store = ayqReadStore(dataDir);
  const removed = store.aliases.find(alias => alias.id === aliasId) ?? null;
  store.aliases = store.aliases.filter(alias => alias.id !== aliasId);
  ayqWriteStore(dataDir, store);
  return { aliases: store.aliases, removed };
}
