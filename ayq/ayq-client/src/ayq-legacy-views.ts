// The screens that have not been brought over to Fluent yet.
//
// They are the imperative renderers the application has always used, with what
// they need to be loaded and drawn. Nothing here is new work: it is the old
// shell's loading and drawing, lifted out of the shell so that the new one
// (04 A20) can host them while each is replaced in its own stage.
//
// Every one of them goes, and this file with them.

import { ayqAsk } from './ayq-bridge.ts';
import type {
  AyqCategoryRule,
  AyqImportRecord,
  AyqLedgerFilter,
} from './ayq-ipc-contract.ts';
import {
  ayqEmptyCounterpartiesState,
  ayqRenderCounterparties,
  type AyqCounterpartiesState,
} from './ayq-counterparties.ts';
import { ayqRenderImports, ayqRenderRules } from './ayq-other-views.ts';
import {
  ayqEmptyPlanViewState,
  ayqRenderPlan,
  type AyqPlanViewState,
} from './ayq-plan-view.ts';
import {
  ayqEmptyTransactionsState,
  ayqRenderTransactions,
  type AyqTransactionsState,
} from './ayq-transactions.ts';
import {
  ayqEmptyUpcomingState,
  ayqRenderUpcoming,
  type AyqUpcomingState,
} from './ayq-upcoming.ts';

export type AyqLegacyView =
  | 'register'
  | 'upcoming'
  | 'plan'
  | 'imports'
  | 'counterparties'
  | 'rules';

type AyqLegacyState = {
  transactions: AyqTransactionsState;
  plan: AyqPlanViewState;
  upcoming: AyqUpcomingState;
  counterparties: AyqCounterpartiesState;
  rules: AyqCategoryRule[];
  imports: AyqImportRecord[];
};

export const ayqLegacyState: AyqLegacyState = {
  transactions: ayqEmptyTransactionsState(),
  plan: ayqEmptyPlanViewState(),
  upcoming: ayqEmptyUpcomingState(),
  counterparties: ayqEmptyCounterpartiesState(),
  rules: [],
  imports: [],
};

/** Asks the engine, and turns a refusal into an exception with its words. */
async function need<K extends Parameters<typeof ayqAsk>[0]['kind']>(
  body: Parameters<typeof ayqAsk>[0] & { kind: K },
): Promise<Extract<Awaited<ReturnType<typeof ayqAsk>>, { ok: true; kind: K }>> {
  const answer = await ayqAsk(body);
  if (!answer.ok) throw new Error(answer.message);
  if (answer.kind !== body.kind) {
    throw new Error('the engine answered a different request');
  }
  return answer as Extract<
    Awaited<ReturnType<typeof ayqAsk>>,
    { ok: true; kind: K }
  >;
}

/**
 * How a screen asks the shell to open the Register on something.
 *
 * The shell owns which destination is open; a screen that wants another one is
 * making a request, not navigating.
 */
let openRegister: (filter: AyqLedgerFilter) => void = () => {};

export function ayqOnOpenRegister(open: (filter: AyqLedgerFilter) => void): void {
  openRegister = open;
}

/** Opens the Register on one counterparty. */
export function ayqLegacyOpenCounterparty(counterpartyKey: string): void {
  ayqLegacyState.transactions.filter = { counterpartyKey };
  ayqLegacyState.transactions.openId = null;
  openRegister(ayqLegacyState.transactions.filter);
}

async function categories(): Promise<void> {
  if (ayqLegacyState.transactions.categories.length > 0) return;
  ayqLegacyState.transactions.categories = (
    await need({ kind: 'categories.list' })
  ).result;
}

export async function ayqLoadLegacy(view: AyqLegacyView): Promise<void> {
  switch (view) {
    case 'register':
      await categories();
      ayqLegacyState.transactions.ledger = (
        await need({
          kind: 'transactions.list',
          filter: ayqLegacyState.transactions.filter,
        })
      ).result;
      return;

    case 'plan':
      ayqLegacyState.plan.sheet = (
        await need({
          kind: 'plan.month',
          ...(ayqLegacyState.plan.month === null
            ? {}
            : { month: ayqLegacyState.plan.month }),
        })
      ).result;
      return;

    case 'upcoming':
      await categories();
      // Two questions, because they answer different halves of the screen: the
      // forecast is what the position does, and the plan is what the records
      // are. The pane reads a record; the table reads the projection.
      ayqLegacyState.upcoming.forecast = (await need({ kind: 'forecast' })).result;
      ayqLegacyState.upcoming.plan = (await need({ kind: 'plan.list' })).result;
      ayqLegacyState.upcoming.proposals = (
        await need({ kind: 'match.propose' })
      ).result.proposals;
      return;

    case 'counterparties':
      ayqLegacyState.counterparties.list = (
        await need({
          kind: 'counterparties.list',
          filter: ayqLegacyState.counterparties.filter,
        })
      ).result;
      return;

    case 'rules':
      ayqLegacyState.rules = (await need({ kind: 'rules.list' })).result;
      await categories();
      return;

    case 'imports':
      ayqLegacyState.imports = (await need({ kind: 'imports.list' })).result;
      return;
  }
}

export function ayqDrawLegacy(
  view: AyqLegacyView,
  target: HTMLElement,
  reload: () => void,
): void {
  switch (view) {
    case 'register':
      ayqRenderTransactions(ayqLegacyState.transactions, target, () => reload());
      return;
    case 'plan':
      ayqRenderPlan(ayqLegacyState.plan, target, () => reload());
      return;
    case 'upcoming':
      ayqRenderUpcoming(
        ayqLegacyState.upcoming,
        ayqLegacyState.transactions.categories,
        target,
        () => reload(),
      );
      return;
    case 'counterparties':
      ayqRenderCounterparties(
        ayqLegacyState.counterparties,
        target,
        () => reload(),
        key => ayqLegacyOpenCounterparty(key),
      );
      return;
    case 'rules':
      ayqRenderRules(
        ayqLegacyState.rules,
        ayqLegacyState.transactions.categories,
        target,
        () => reload(),
      );
      return;
    case 'imports':
      ayqRenderImports(ayqLegacyState.imports, target);
      return;
  }
}
