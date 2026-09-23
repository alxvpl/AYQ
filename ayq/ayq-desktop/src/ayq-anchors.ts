// What an account actually holds, and how AYQ comes to know it.
//
// A statement is a list of movements. It says what changed; it does not say
// what there was. Build 004 added the movements to a starting point of nought
// and presented the total as the account's balance, which is the one arithmetic
// in a personal finance application that must never be guessed: it is not a
// balance, it is the net of whatever period happened to be imported, and a
// person reading it as money in the bank is being misled by the product.
//
// So an absolute balance is *evidence*. Either the bank stated a closing
// balance, or the owner typed one in. Both are anchors: a figure, an account,
// and the day it is true on. Without one the balance is Unknown, and Unknown is
// a state AYQ says out loud rather than a nought it quietly draws.
//
// ## Actual stays the owner of the balance (02, 03 §7.6)
//
// AYQ does not keep a balance of its own to disagree with Actual's. It writes
// the anchor into Actual's own technical starting-balance transaction — the row
// Actual creates with `starting_balance_flag = true` when an account is opened
// with an opening figure — through `@actual-app/api`. Never SQL, and never an
// ordinary balancing transaction: a made-up payment of €412.66 to nobody would
// show up in the Register, in the category totals and in the year's spending,
// and would be indistinguishable from a real one.
//
// The arithmetic, for an active anchor of `A` on day `D`:
//
//     M = the signed sum of every non-starting transaction dated on or before D
//     technical starting balance = A - M
//
// and then `balance at D == A` is read back from Actual rather than assumed.
//
// The row is dated at the earliest movement the account holds, or at `D` when
// it holds none — never after `D`, because a starting balance outside the
// cutoff is a starting balance that is not in the figure it is supposed to fix.
//
// Measured against `@actual-app/api` 26.9.0 before any of it was written:
// `createAccount` with a non-zero opening creates that row and with nought
// creates none; `addTransactions` will create one carrying the flag;
// `updateTransaction` will change its amount and its date; and a read issued
// immediately after either comes back stale, which is what `ayqSettle` is for.

import api from '@actual-app/api';

import { ayqSettle } from './ayq-settle.ts';
import {
  ayqId,
  ayqReadStore,
  ayqWriteStore,
  type AyqBalanceAnchor,
  type AyqStore,
} from './ayq-store.ts';
import { AyqEngineError } from './ayq-error.ts';

/** The payee Actual itself gives the row; used only when creating one. */
const STARTING_BALANCE = 'Starting Balance';

/**
 * The anchor that stands for one account.
 *
 * Folded in decision order rather than picked by a sort, because the three
 * rules in the specification are rules about *sequence*:
 *
 *   - a newer reliable bank-stated balance may become the active anchor;
 *   - an explicit later manual re-anchor becomes active;
 *   - an older statement imported later does not displace a newer anchor.
 *
 * The middle one is why a manual anchor always wins when it is the most recent
 * decision: an owner correcting a balance is correcting it, and a correction
 * that lost to a statement imported last week would be a correction the product
 * quietly ignored. The third is why a bank anchor has to reach further than
 * what already stands before it counts — importing 2021 after 2026 adds
 * evidence about 2021 and says nothing new about today.
 */
export function ayqActiveAnchor(
  store: AyqStore,
  accountId: string,
): AyqBalanceAnchor | null {
  const mine = store.anchors
    .filter(anchor => anchor.accountId === accountId)
    .sort((left, right) => (left.createdAt < right.createdAt ? -1 : left.createdAt > right.createdAt ? 1 : 0));

  let active: AyqBalanceAnchor | null = null;
  for (const anchor of mine) {
    if (anchor.source === 'manual') {
      active = anchor;
    } else if (active === null || anchor.coverageDate > active.coverageDate) {
      active = anchor;
    }
  }
  return active;
}

/** Every anchor an account has ever had, newest decision first. */
export function ayqAnchorHistory(
  store: AyqStore,
  accountId: string,
): AyqBalanceAnchor[] {
  return store.anchors
    .filter(anchor => anchor.accountId === accountId)
    .sort((left, right) => (left.createdAt < right.createdAt ? 1 : -1));
}

/**
 * Adds an anchor to the history and leaves every earlier one where it is.
 *
 * Appending rather than replacing is the whole of §4.5's "never silently
 * rewrites prior provenance": the reason a balance was one figure in March and
 * another in May is a question with an answer only while both are still there.
 */
export function ayqRecordAnchor(
  dataDir: string,
  input: {
    accountId: string;
    amountCents: number;
    coverageDate: string;
    importId: string | null;
    source: 'bank' | 'manual';
  },
): AyqBalanceAnchor {
  const store = ayqReadStore(dataDir);
  const anchor: AyqBalanceAnchor = {
    id: ayqId('anchor'),
    accountId: input.accountId,
    amountCents: Math.round(input.amountCents),
    coverageDate: input.coverageDate,
    importId: input.importId,
    source: input.source,
    createdAt: new Date().toISOString(),
  };
  store.anchors.push(anchor);
  ayqWriteStore(dataDir, store);
  return anchor;
}

type AyqStartingRow = { id: string; date: string; amount: number };

/** Actual's own technical starting-balance row for an account, if it has one. */
async function startingRow(accountId: string): Promise<AyqStartingRow | null> {
  const answer = (await api.aqlQuery(
    api
      .q('transactions')
      .filter({ account: accountId, starting_balance_flag: true })
      .select(['id', 'date', 'amount'])
      .options({ splits: 'none' }),
  )) as { data?: Array<{ id: string; date: string; amount: number }> };

  const rows = answer.data ?? [];
  if (rows.length === 0) return null;
  // One is what Actual creates. If a budget somehow holds two, the earliest is
  // the one the balance is built on and the one that gets corrected.
  const [first] = [...rows].sort((left, right) =>
    String(left.date) < String(right.date) ? -1 : 1,
  );
  return { id: String(first.id), date: String(first.date), amount: Number(first.amount ?? 0) };
}

/**
 * The signed sum of the account's real movements between two days.
 *
 * `after` is exclusive and `to` is inclusive, which is what makes this the
 * arithmetic between two balance readings: the balance on the 31st already has
 * the 31st's movements in it, and the balance on the 1st does not have the
 * 1st's twice.
 */
export async function ayqMovementsBetween(
  accountId: string,
  after: string,
  to: string,
): Promise<number> {
  const answer = (await api.aqlQuery(
    api
      .q('transactions')
      .filter({
        account: accountId,
        starting_balance_flag: false,
        date: { $gt: after, $lte: to },
      })
      .calculate({ $sum: '$amount' })
      .options({ splits: 'none' }),
  )) as { data?: number };
  return Number(answer.data ?? 0);
}

/** The signed sum of the account's real movements up to and including a day. */
async function movementsTo(accountId: string, date: string): Promise<number> {
  const answer = (await api.aqlQuery(
    api
      .q('transactions')
      .filter({
        account: accountId,
        starting_balance_flag: false,
        date: { $lte: date },
      })
      .calculate({ $sum: '$amount' })
      .options({ splits: 'none' }),
  )) as { data?: number };
  return Number(answer.data ?? 0);
}

/**
 * The first day the account holds a real movement on, if it holds any.
 *
 * Asked for as one row in date order rather than as an aggregate: Actual's AQL
 * has `$count` and `$sum` and no `$min`, which is a fact about the engine and
 * not a preference. `limit(1)` over an ordered query costs the same and works.
 */
async function earliestMovement(accountId: string): Promise<string | null> {
  const answer = (await api.aqlQuery(
    (
      api
        .q('transactions')
        .filter({ account: accountId, starting_balance_flag: false })
        .select(['date']) as unknown as {
        orderBy(exprs: unknown): { limit(count: number): unknown };
      }
    )
      .orderBy([{ date: 'asc' }])
      .limit(1) as Parameters<typeof api.aqlQuery>[0],
  )) as { data?: Array<{ date: string }> };

  const found = answer.data?.[0]?.date;
  return typeof found === 'string' && found.length >= 10 ? found.slice(0, 10) : null;
}

/**
 * Makes Actual's balance at the anchor's day equal the anchor, exactly.
 *
 * Idempotent by construction: it computes the figure the technical row must
 * carry from the movements that are in the budget right now, so running it
 * again after nothing has changed writes the same number, and running it after
 * an import of older history writes the corrected one (§4.3).
 *
 * The verification at the end is not ceremony. Everything above is arithmetic
 * over a query, and the one thing that would make it wrong — a movement the
 * query did not see, a write that did not land — is invisible to arithmetic
 * and visible to Actual. So Actual is asked.
 */
export async function ayqApplyAnchor(anchor: AyqBalanceAnchor): Promise<void> {
  const { accountId, coverageDate, amountCents } = anchor;

  const movements = await movementsTo(accountId, coverageDate);
  const technical = amountCents - movements;

  const earliest = await earliestMovement(accountId);
  // On or before the cutoff, always: a starting balance dated after `D` is not
  // inside the balance at `D`, and the anchor it is supposed to establish would
  // be off by its own amount.
  const date =
    earliest !== null && earliest < coverageDate ? earliest : coverageDate;

  const existing = await startingRow(accountId);
  if (existing === null) {
    await api.addTransactions(accountId, [
      {
        date,
        amount: technical,
        payee_name: STARTING_BALANCE,
        starting_balance_flag: true,
        cleared: true,
      } as Parameters<typeof api.addTransactions>[1][number],
    ]);
  } else if (existing.amount !== technical || existing.date !== date) {
    await api.updateTransaction(existing.id, { amount: technical, date });
  }

  // 03 §8: read it back rather than declaring it. A write through this API
  // lands after the call that queued it returns, so the first read can still be
  // the old figure.
  // The day as a string, which is what AYQ handles everywhere and what this
  // was measured against. The published type says `Date`, and a `Date` would
  // reintroduce the one bug every date in this product is written to avoid: a
  // calendar day the bank stated is not an instant, and midnight UTC formatted
  // in a machine's own timezone is the day before in half the world. The API
  // takes the string and filters on it; the cast says so out loud.
  const asCutoff = coverageDate as unknown as Date;
  const reached = await ayqSettle(
    async () => (await api.getAccountBalance(accountId, asCutoff)) ?? 0,
    balance => balance === amountCents,
    'the balance anchor',
  );

  if (reached !== amountCents) {
    throw new AyqEngineError(
      'anchor-disagrees',
      `the anchor for this account is ${amountCents} cents on ${coverageDate}, ` +
        `and Actual makes the balance ${reached} cents on that day`,
    );
  }
}

/**
 * Re-states the active anchor for one account, if it has one.
 *
 * Called after every import that added anything (§4.3). When all the new
 * movements fall after the anchor's day the arithmetic above lands on the same
 * technical figure and nothing is written; when any of them falls on or before
 * it, the figure changes and the anchor stays true at its own date. Both cases
 * are the same code, which is why neither can be forgotten.
 */
export async function ayqReapplyAnchor(
  dataDir: string,
  accountId: string,
): Promise<AyqBalanceAnchor | null> {
  const anchor = ayqActiveAnchor(ayqReadStore(dataDir), accountId);
  if (anchor === null) return null;
  await ayqApplyAnchor(anchor);
  return anchor;
}

/**
 * Whether the movements AYQ holds account for what the bank says it holds.
 *
 * This is the question 03 §8 asks, and after build 005 it is no longer the
 * question "does the balance on the screen equal the bank's figure" — because
 * §4.2 makes that true by construction. Anchoring writes Actual's technical
 * starting balance so the balance at the anchor's day *is* the anchor; asking
 * afterwards whether they agree is asking a number whether it equals itself.
 *
 * So reconciliation is asked of the movements instead, between two things the
 * bank itself said:
 *
 *     the balance the bank stated at an earlier point
 *   + every movement AYQ holds between that point and this one
 *   = what AYQ can account for here
 *
 * and the difference from the bank's own closing figure is what is stated. A
 * difference means statements are missing over that interval — which is a fact
 * about AYQ's evidence and not about the account, and it is exactly the fact
 * §8.3 says to state and leave standing. Nothing is written to close it (§8.2):
 * the way to close one is to import what is missing.
 *
 * Null when there is no earlier bank reading to measure from, because then
 * there is no interval and nothing to check.
 */
export async function ayqAccountedFor(
  store: AyqStore,
  accountId: string,
  closingDate: string,
): Promise<{ accountedCents: number; fromDate: string } | null> {
  const earlier = store.anchors
    .filter(
      anchor =>
        anchor.accountId === accountId && anchor.coverageDate < closingDate,
    )
    .sort((left, right) => (left.coverageDate < right.coverageDate ? -1 : 1))
    .at(-1);
  if (earlier === undefined) return null;

  const moved = await ayqMovementsBetween(
    accountId,
    earlier.coverageDate,
    closingDate,
  );
  return {
    accountedCents: earlier.amountCents + moved,
    fromDate: earlier.coverageDate,
  };
}

/** Every account the store holds an anchor for. */
export function ayqAnchoredAccounts(store: AyqStore): Set<string> {
  return new Set(store.anchors.map(anchor => anchor.accountId));
}
