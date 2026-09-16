// What a category has actually cost, offered as a plan.
//
// The Plan worksheet has always been able to say what was planned and what
// happened. What it could not say is the one thing a person planning a month
// actually wants: *what does this normally come to?* 10 answers it with an
// arithmetic mean of the category's real spending over the months AYQ can
// vouch for.
//
// ## Only months AYQ can vouch for
//
// The divisor is the number of months actually included and never twelve. A
// month AYQ holds half a statement for is not a cheap month, it is an unknown
// month, and averaging it in as though the missing fortnight cost nothing would
// understate every suggestion — silently, and in the direction that makes a
// person plan too little. So the complete-month helper (§6.3) decides which
// months count, incomplete months are excluded rather than treated as nought,
// and the answer carries `monthsUsed` so the screen can say what it is based on
// rather than presenting a figure with no provenance.
//
// Zero complete months is a real answer: no usable suggestion, said plainly.
//
// ## The same arithmetic as everywhere else
//
// Spending comes from `ayqCategorySpending`, which is what Reports and the
// Plan's own Actual column read (03 §9.3). So confirmed reversals reduce their
// category, transfers between the owner's own accounts are not spending, and a
// credit AYQ holds no reversal evidence for is income however neatly it matches
// an expense. Nothing about the suggestion re-derives any of that.
//
// Income categories, what nobody has filed yet, and Actual's `Starting
// Balances` are not suggestion targets: the first is not a plan to spend, the
// second is not a category, and the third is the technical row §4.2 writes.
//
// Nothing here is persisted. A suggestion is derived on every read, so it can
// never be stale while still looking authoritative, and accepting one is a
// separate and explicit act that writes a plan through Actual.

import api from '@actual-app/api';

import type { AyqPlanSuggestion } from '../../ayq-client/src/ayq-ipc-contract.ts';

import {
  ayqAddMonthsToMonth,
  ayqMonthEnd,
  ayqMonthStart,
} from './ayq-dates.ts';
import { ayqCompleteMonths, type AyqAccountLifetime } from './ayq-evidence.ts';
import { ayqCategorySpending } from './ayq-ledger.ts';
import { ayqReadStore } from './ayq-store.ts';

/** How far back a suggestion may look (10 §10.1). */
export const AYQ_SUGGESTION_MONTHS = 12;

/** Actual's technical income category. Never a plan target. */
const STARTING_BALANCES = 'starting balances';

/**
 * When AYQ first has any evidence of each account.
 *
 * Both sources count: a transaction AYQ imported, and a statement interval it
 * read. An account with neither is an account AYQ knows nothing about, and
 * §6.3 is explicit that it then fails every month rather than being waved past.
 */
async function lifetimes(dataDir: string): Promise<AyqAccountLifetime[]> {
  const store = ayqReadStore(dataDir);

  // One row per account, earliest first, and the first one wins. Actual's AQL
  // has no `$min`, so the aggregate this obviously wants does not exist; an
  // ordered read of the dates is what the engine actually supports.
  const answer = (await api.aqlQuery(
    (
      api
        .q('transactions')
        .filter({ starting_balance_flag: false })
        .select(['date', { accountId: 'account.id' }]) as unknown as {
        orderBy(exprs: unknown): unknown;
      }
    ).orderBy([{ date: 'asc' }]) as Parameters<typeof api.aqlQuery>[0],
  )) as { data?: Array<{ accountId: string; date: unknown }> };

  const earliest = new Map<string, string>();
  for (const row of answer.data ?? []) {
    const accountId = String(row.accountId);
    if (earliest.has(accountId)) continue;
    const day = asDay(row.date);
    if (day !== null) earliest.set(accountId, day);
  }

  const found: AyqAccountLifetime[] = [];
  for (const account of await api.getAccounts()) {
    let firstSeen = earliest.get(account.id) ?? null;
    for (const one of store.evidence) {
      if (one.accountId !== account.id) continue;
      const day = one.fromDate ?? one.toDate;
      if (day !== null && (firstSeen === null || day < firstSeen)) {
        firstSeen = day;
      }
    }
    found.push({ accountId: account.id, firstSeen });
  }
  return found;
}

/** Actual hands dates back as strings, and as YYYYMMDD numbers internally. */
function asDay(value: unknown): string | null {
  if (typeof value === 'string' && value.length >= 10) return value.slice(0, 10);
  if (typeof value === 'number' && value > 10_000_000) {
    const text = String(value);
    return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
  }
  return null;
}

/**
 * The historical suggestion for every plannable expense category.
 *
 * `month` is the Plan month being looked at; the window is the twelve months
 * *before* it. The month being planned is never part of its own basis — half of
 * it has usually not happened.
 */
export async function ayqPlanSuggestions(
  dataDir: string,
  month: string,
): Promise<AyqPlanSuggestion[]> {
  const store = ayqReadStore(dataDir);

  // The twelve candidate months, oldest first.
  const candidates: string[] = [];
  for (let back = AYQ_SUGGESTION_MONTHS; back >= 1; back -= 1) {
    candidates.push(ayqAddMonthsToMonth(month, -back));
  }

  const complete = ayqCompleteMonths(
    store,
    await lifetimes(dataDir),
    candidates,
  );
  const months = candidates.filter(one => complete.has(one));

  const categories = await api.getCategories();
  const plannable = categories.filter(
    category =>
      category.is_income !== true &&
      category.name.trim().toLowerCase() !== STARTING_BALANCES,
  );

  // No usable basis at all. Every category still gets a row, because the screen
  // has to be able to say *why* there is no suggestion — a row that is simply
  // absent looks like a category the arithmetic forgot.
  if (months.length === 0) {
    return plannable.map(category => ({
      categoryId: category.id,
      categoryName: category.name,
      suggestedCents: null,
      monthsUsed: 0,
      fromMonth: null,
      toMonth: null,
      totalCents: 0,
    }));
  }

  const totals = new Map<string, number>();
  for (const one of months) {
    const spending = await ayqCategorySpending(dataDir, {
      from: ayqMonthStart(one),
      to: ayqMonthEnd(one),
    });
    for (const [categoryId, cents] of spending) {
      if (categoryId === '') continue;
      totals.set(categoryId, (totals.get(categoryId) ?? 0) + cents);
    }
  }

  return plannable.map(category => {
    const total = totals.get(category.id) ?? 0;
    return {
      categoryId: category.id,
      categoryName: category.name,
      // The divisor is the months actually included. A category that took
      // nothing in four of the seven covered months averages over seven, not
      // over three: those months are evidence that it cost nothing, which is
      // exactly what an incomplete month is not.
      //
      // Negative is possible and is kept: a category whose reversals outweighed
      // its spending really did give money back, and rounding that up to nought
      // would be AYQ deciding the arithmetic was embarrassing.
      suggestedCents: Math.round(total / months.length),
      monthsUsed: months.length,
      fromMonth: months[0],
      toMonth: months[months.length - 1],
      totalCents: total,
    };
  });
}
