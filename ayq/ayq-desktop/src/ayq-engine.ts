// The AYQ engine process.
//
// The only file in the whole product that loads `@actual-app/api`. It runs in
// its own process, forked by the host, exactly as Actual's shipped desktop app
// forks its core into a `utilityProcess` and talks to it over one channel.
//
// It owns the budget's lifecycle and dispatches the contract; the work itself
// lives in the modules beside it. Nothing here is fabricated for the benefit of
// the interface: every number is the engine's own.

import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import api from '@actual-app/api';

import type {
  AyqEngineStatus,
  AyqRequest,
  AyqResponse,
} from '../../ayq-client/src/ayq-ipc-contract.ts';

import {
  ayqAliases,
  ayqApplyAliases,
  ayqForgetAlias,
  ayqRememberAlias,
} from './ayq-aliases.ts';
import { ayqUseSend } from './ayq-batch.ts';
import {
  ayqBudgetMonth,
  ayqBudgetType,
  ayqEnsureTrackingBudget,
  ayqSetPlan,
} from './ayq-budget.ts';
import { ayqImportCamt, ayqImports } from './ayq-camt-import.ts';
import {
  ayqCategories,
  ayqCreateCategory,
  ayqRenameCategory,
  ayqSeedCategories,
} from './ayq-categories.ts';
import {
  ayqCounterparties,
  ayqCounterpartyDetail,
} from './ayq-counterparties.ts';
import { ayqSetAccountFlag } from './ayq-funds.ts';
import {
  ayqAccounts,
  ayqDetail,
  ayqLedger,
  ayqSpending,
  ayqSummary,
  ayqUnfiled,
} from './ayq-ledger.ts';
import {
  ayqApplyMatch,
  ayqDismissOccurrence,
  ayqForecast,
  ayqPlan,
  ayqRejectMatch,
  ayqRemovePlan,
  ayqReschedule,
  ayqPlanSheet,
  ayqRunMatching,
  ayqSavePlan,
  ayqSetPlanState,
  ayqSuggest,
  ayqUnmatch,
} from './ayq-plan.ts';
import { ayqToday } from './ayq-plan-series.ts';
import { ayqRecurring } from './ayq-recurring.ts';
import {
  ayqApplyRules,
  ayqForgetRule,
  ayqKeyOfTransaction,
  ayqPendingForCounterparty,
  ayqRecordDecision,
  ayqRememberRule,
  ayqRules,
} from './ayq-rules.ts';
import { ayqSettle } from './ayq-settle.ts';
import { ayqDamagedStore, ayqReadStore, ayqWriteStore } from './ayq-store.ts';

const BUDGET_NAME = 'AYQ';

/**
 * The transport, chosen by what the parent gave us.
 *
 * Electron's `utilityProcess` hands the child a `parentPort`; `child_process`
 * hands it `process.send`. The engine works under either, so the host can pick
 * without the engine caring — which is what makes it testable outside Electron.
 */
type Transport = {
  name: string;
  send(message: unknown): void;
  onMessage(handler: (message: unknown) => void): void;
};

function transport(): Transport {
  const parentPort = (
    process as unknown as {
      parentPort?: {
        postMessage(message: unknown): void;
        on(event: 'message', handler: (event: { data: unknown }) => void): void;
      };
    }
  ).parentPort;

  if (parentPort) {
    return {
      name: 'electron utilityProcess',
      send: message => parentPort.postMessage(message),
      onMessage: handler =>
        parentPort.on('message', event => handler(event.data)),
    };
  }

  if (typeof process.send === 'function') {
    const send = process.send.bind(process);
    return {
      name: 'node child_process fork',
      send: message => send(message),
      onMessage: handler => process.on('message', handler),
    };
  }

  throw new Error('the AYQ engine was started without a parent to answer');
}

const channel = transport();

type AyqOpenBudget = { budgetId: string; created: boolean };

/** Set once the budget is open, so a second request does not reopen it. */
let opened: AyqOpenBudget | null = null;

/** What `api.init` hands back: the same engine, one level lower. */
let lib: Awaited<ReturnType<typeof api.init>> | null = null;

/**
 * The engine's own handlers, for the few things the public API does not carry.
 *
 * Two so far: creating a budget without reaching for a sync server AYQ does not
 * have, and setting the budget's type. Both are settings Actual's own client
 * sends through exactly this path; nothing in `packages/` is touched to reach
 * them.
 */
const sendToEngine = (name: string, args?: unknown): Promise<unknown> =>
  lib!.send(name as never, args as never) as Promise<unknown>;

/** The budget's id, or null when it does not exist yet. */
async function findBudgetId(): Promise<string | null> {
  const match = (await api.getBudgets()).find(
    budget => budget.name === BUDGET_NAME,
  );
  return match?.id ?? null;
}

async function openBudget(dataDir: string): Promise<AyqOpenBudget> {
  if (opened) return opened;

  // On a first launch the directory does not exist yet, and the API expects to
  // be handed one that does.
  mkdirSync(dataDir, { recursive: true });
  lib = await api.init({ dataDir });
  // Lent to the batch helper, so a rule can file a decade of one shop's
  // receipts in a handful of calls rather than one call per receipt.
  ayqUseSend((name, args) => lib!.send(name as never, args as never));

  const existing = await findBudgetId();
  if (existing !== null) {
    await api.loadBudget(existing);
    // Including a budget an earlier AYQ created as an envelope one. There is
    // nothing to lose by moving it: AYQ has never set a budgeted amount, and
    // envelope arithmetic is what 01 §4 and 04 A8 say AYQ does not do.
    await ayqEnsureTrackingBudget(sendToEngine);
    opened = { budgetId: existing, created: false };
    return opened;
  }

  // A new budget, and nothing in it. No demo account, no invented entries: an
  // empty AYQ is empty, and the screen says so rather than showing figures
  // nobody recognises.
  //
  // `runImport` is the public way to make a budget from nothing, and it ends by
  // uploading the result to a sync server — which AYQ does not have, so every
  // first launch logged a failed cloud attempt. The handler underneath it takes
  // `avoidUpload`, so the budget is created without ever reaching for a network
  // AYQ is not on. Nothing in Actual's own packages is touched to get this.
  await lib.send('create-budget', {
    budgetName: BUDGET_NAME,
    avoidUpload: true,
  });

  const created = await findBudgetId();
  if (created === null) throw new Error('the engine created no budget');

  await api.loadBudget(created);
  await ayqEnsureTrackingBudget(sendToEngine);
  // Only ever on a budget just created, so nothing can be referencing the
  // placeholders it replaces.
  await ayqSeedCategories();
  opened = { budgetId: created, created: true };
  return opened;
}

async function status(dataDir: string): Promise<AyqEngineStatus> {
  const budget = await openBudget(dataDir);
  return {
    apiVersion: apiVersion(),
    engineHost: channel.name,
    budgetCreated: budget.created,
    budgetId: budget.budgetId,
    budgetName: BUDGET_NAME,
    dataDir,
    storeVersion: ayqReadStore(dataDir).version,
    budgetType: await ayqBudgetType(sendToEngine),
    storeDamaged: ayqDamagedStore(dataDir),
    answeredAt: new Date().toISOString(),
  };
}

/** Read from the installed package rather than hard-coded, so it cannot drift. */
function apiVersion(): string {
  for (const candidate of [
    '../node_modules/@actual-app/api/package.json',
    '../../node_modules/@actual-app/api/package.json',
  ]) {
    try {
      const path = fileURLToPath(new URL(candidate, import.meta.url));
      const manifest = JSON.parse(readFileSync(path, 'utf8')) as {
        version?: string;
      };
      if (manifest.version) return manifest.version;
    } catch {
      // Try the next location.
    }
  }
  return 'unknown';
}

/**
 * Turns the one failure this engine has a specific cure for into a sentence
 * that names the cure.
 *
 * `@actual-app/api` carries a native SQLite binding built for the Node ABI it
 * was installed against. Loaded inside Electron's `utilityProcess` it meets a
 * different ABI, and the symptom that surfaces is an unrelated-looking null
 * dereference several layers up.
 */
function explain(message: string): string {
  const abi =
    /NODE_MODULE_VERSION|ERR_DLOPEN_FAILED|reading 'prepare'|better_sqlite3\.node/;
  if (!abi.test(message)) return message;
  return (
    `${message}\n\n` +
    'The engine could not load its native SQLite binding. It was built for ' +
    "Node's ABI, and this process is running on Electron's. Run `npm run " +
    'setup` once: it rebuilds the binding for this exact Electron and refuses ' +
    'to finish unless the result loads. `npm run start:debug-node-engine` ' +
    'sidesteps it by forking the engine on the system Node, but that is a ' +
    'development shortcut, not the shipped path.'
  );
}

/**
 * Whatever was thrown, as words.
 *
 * Not everything that reaches here is an `Error`. Actual's own handlers reject
 * with plain objects — `{ type: 'APIError', message: … }` among them — and
 * `String(value)` renders one of those as `[object Object]`, which names
 * nothing and cost a debugging session to work out. So an object is asked for
 * its message and, failing that, printed.
 */
function said(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message !== '') return message;
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error);
}

const dataDir = process.env.AYQ_DATA_DIR ?? '';

/**
 * Answers one request.
 *
 * Every kind opens the budget first, because every kind reads or writes it.
 * The one exception would be a request about the host, and the host answers
 * those itself rather than sending them here.
 */
async function answer(request: AyqRequest): Promise<AyqResponse> {
  const id = request.id;

  if (request.kind === 'engine.status') {
    return {
      id,
      ok: true,
      kind: 'engine.status',
      result: await status(dataDir),
    };
  }

  const budget = await openBudget(dataDir);

  switch (request.kind) {
    case 'accounts.list':
      return {
        id,
        ok: true,
        kind: 'accounts.list',
        result: await ayqAccounts(dataDir),
      };

    case 'accounts.setFlag':
      ayqSetAccountFlag(dataDir, request.accountId, request.countsTowardFunds);
      return {
        id,
        ok: true,
        kind: 'accounts.setFlag',
        result: await ayqAccounts(dataDir),
      };

    case 'transactions.list':
      return {
        id,
        ok: true,
        kind: 'transactions.list',
        result: await ayqLedger(dataDir, request.filter ?? {}),
      };

    case 'transaction.detail':
      return {
        id,
        ok: true,
        kind: 'transaction.detail',
        result: await ayqDetail(dataDir, request.transactionId),
      };

    case 'transaction.categorise': {
      const before = await ayqDetail(dataDir, request.transactionId);
      const chosen = (await ayqCategories()).find(
        candidate => candidate.id === request.categoryId,
      );

      // Actual clears a category by writing null — that is what its own
      // interface does — but the published type admits only a string. The
      // mismatch is stated here rather than worked around by leaving a
      // category no one can remove.
      await api.updateTransaction(request.transactionId, {
        category: request.categoryId,
      } as unknown as Parameters<typeof api.updateTransaction>[1]);

      // A person chose this, so it is recorded as theirs: no rule may
      // overwrite it afterwards, including the rule this may be about to
      // create. An empty name is a deliberate "no category", and outranks a
      // rule just as firmly.
      ayqRecordDecision(
        dataDir,
        before.importedId ?? request.transactionId,
        'manual',
        chosen?.name ?? '',
      );

      if (request.createRule === true && chosen) {
        const key = ayqKeyOfTransaction(dataDir, before.importedId);
        if (key !== null) {
          ayqRememberRule(dataDir, key, chosen.name);
          await ayqApplyRules(dataDir);
        }
      }

      // Read back only once the budget agrees: the write lands after the call
      // that queued it returns, so the first read can still hold the old value.
      const updated = await ayqSettle(
        () => ayqDetail(dataDir, request.transactionId),
        detail => detail.row.categoryId === request.categoryId,
        'the category',
      );

      const counterpartyKey = ayqKeyOfTransaction(dataDir, before.importedId);
      return {
        id,
        ok: true,
        kind: 'transaction.categorise',
        result: {
          row: updated.row,
          counterpartyKey,
          counterpartyName: updated.row.payee,
          pendingForCounterparty:
            counterpartyKey === null || request.categoryId === null
              ? 0
              : await ayqPendingForCounterparty(dataDir, counterpartyKey),
        },
      };
    }

    case 'transaction.categoriseCounterparty': {
      const chosen = (await ayqCategories()).find(
        candidate => candidate.id === request.categoryId,
      );
      if (!chosen) throw new Error('no such category');

      ayqRememberRule(dataDir, request.counterpartyKey, chosen.name);
      return {
        id,
        ok: true,
        kind: 'transaction.categoriseCounterparty',
        result: await ayqApplyRules(dataDir),
      };
    }

    case 'categories.create':
      return {
        id,
        ok: true,
        kind: 'categories.create',
        result: await ayqCreateCategory(request.name, request.groupId),
      };

    case 'categories.rename': {
      const { categories, was } = await ayqRenameCategory(
        request.categoryId,
        request.name,
      );

      // The rules keep a category by name, so they move with it. Without this,
      // renaming a category would quietly orphan every rule that used it.
      const store = ayqReadStore(dataDir);
      let moved = false;
      for (const rule of store.rules) {
        if (rule.categoryName === was) {
          rule.categoryName = request.name.trim();
          moved = true;
        }
      }
      if (moved) ayqWriteStore(dataDir, store);

      return { id, ok: true, kind: 'categories.rename', result: categories };
    }

    case 'categories.list':
      return {
        id,
        ok: true,
        kind: 'categories.list',
        result: await ayqCategories(),
      };

    case 'rules.list':
      return { id, ok: true, kind: 'rules.list', result: ayqRules(dataDir) };

    case 'rules.remove':
      return {
        id,
        ok: true,
        kind: 'rules.remove',
        result: ayqForgetRule(dataDir, request.ruleId),
      };

    case 'rules.apply':
      return {
        id,
        ok: true,
        kind: 'rules.apply',
        result: await ayqApplyRules(dataDir),
      };

    case 'recurring.list':
      return {
        id,
        ok: true,
        kind: 'recurring.list',
        result: await ayqRecurring(dataDir),
      };

    case 'counterparties.list':
      return {
        id,
        ok: true,
        kind: 'counterparties.list',
        result: await ayqCounterparties(dataDir, request.filter ?? {}),
      };

    case 'counterparty.detail':
      return {
        id,
        ok: true,
        kind: 'counterparty.detail',
        result: await ayqCounterpartyDetail(dataDir, request.key),
      };

    case 'aliases.list':
      return { id, ok: true, kind: 'aliases.list', result: ayqAliases(dataDir) };

    case 'alias.create': {
      // The target is named by the budget rather than by the renderer: the
      // screen sends a key, and what that counterparty is called is the
      // engine's answer to it, not a string that crossed the boundary and may
      // already be stale.
      const target = await ayqCounterpartyDetail(
        dataDir,
        request.counterpartyKey,
      );
      if (target.counterparty.transactions === 0) {
        throw new Error(
          'no counterparty in this budget has that key; an alias points at one ' +
            'that exists',
        );
      }

      const aliases = ayqRememberAlias(dataDir, {
        variantKey: request.variantKey,
        variant: request.variant,
        counterpartyKey: request.counterpartyKey,
        counterpartyName: target.counterparty.name,
      });
      const { moved } = await ayqApplyAliases(dataDir);
      // The counterparty may already have a rule, and the transactions that
      // have just joined it were never filed under it. Applying the rules is
      // the existing mechanism and keeps the existing limit: a category a
      // person chose themselves is never overwritten, by a rule or by this.
      await ayqApplyRules(dataDir);

      return {
        id,
        ok: true,
        kind: 'alias.create',
        result: {
          aliases,
          moved,
          counterpartyKey: request.counterpartyKey,
          counterpartyName: target.counterparty.name,
        },
      };
    }

    case 'alias.remove': {
      const { aliases, removed } = ayqForgetAlias(dataDir, request.aliasId);
      // The names go back to what the automatic resolver pronounced, which is
      // still in provenance because an alias never rewrote it.
      const { moved } = await ayqApplyAliases(dataDir);
      await ayqApplyRules(dataDir);

      return {
        id,
        ok: true,
        kind: 'alias.remove',
        result: {
          aliases,
          moved,
          counterpartyKey: removed?.variantKey ?? '',
          counterpartyName: removed?.variant ?? '',
        },
      };
    }

    case 'imports.list':
      return {
        id,
        ok: true,
        kind: 'imports.list',
        result: ayqImports(dataDir),
      };

    case 'summary':
      return {
        id,
        ok: true,
        kind: 'summary',
        result: await ayqSummary(dataDir),
      };

    case 'spending':
      return {
        id,
        ok: true,
        kind: 'spending',
        result: await ayqSpending(dataDir, request.filter ?? {}),
      };

    case 'counterparties.unfiled':
      return {
        id,
        ok: true,
        kind: 'counterparties.unfiled',
        result: await ayqUnfiled(dataDir, request.filter ?? {}),
      };

    /* ------------------------------------------------------------ the plan

       Every one of these answers with the whole plan rather than with what it
       changed. Rescheduling one occurrence can move it past another and change
       what is overdue, so a screen that patched its own copy would be drawing a
       plan the engine does not have.                                        */

    case 'plan.list':
      return {
        id,
        ok: true,
        kind: 'plan.list',
        result: ayqPlan(dataDir, ayqToday(request.today)),
      };

    case 'plan.month':
      return {
        id,
        ok: true,
        kind: 'plan.month',
        result: await ayqPlanSheet(
          dataDir,
          ayqToday(request.today),
          request.month,
        ),
      };

    case 'plan.save': {
      const now = new Date().toISOString();
      ayqSavePlan(dataDir, request.record, now);
      return {
        id,
        ok: true,
        kind: 'plan.save',
        result: ayqPlan(dataDir, ayqToday(request.today)),
      };
    }

    case 'plan.setState': {
      ayqSetPlanState(
        dataDir,
        request.recordId,
        request.state,
        new Date().toISOString(),
      );
      return {
        id,
        ok: true,
        kind: 'plan.setState',
        result: ayqPlan(dataDir, ayqToday(request.today)),
      };
    }

    case 'plan.remove':
      ayqRemovePlan(dataDir, request.recordId);
      return {
        id,
        ok: true,
        kind: 'plan.remove',
        result: ayqPlan(dataDir, ayqToday(request.today)),
      };

    case 'plan.reschedule':
      ayqReschedule(dataDir, request.recordId, request.dueDate, request.to);
      return {
        id,
        ok: true,
        kind: 'plan.reschedule',
        result: ayqPlan(dataDir, ayqToday(request.today)),
      };

    case 'plan.dismissOccurrence':
      ayqDismissOccurrence(
        dataDir,
        request.recordId,
        request.dueDate,
        request.dismissed,
      );
      return {
        id,
        ok: true,
        kind: 'plan.dismissOccurrence',
        result: ayqPlan(dataDir, ayqToday(request.today)),
      };

    /* ---------------------------------------------------------- matching

       Every one of these answers with the whole plan too, for the same reason
       the plan requests do: a match changes what is expected on every later
       row, not only on the one it touched.                                 */

    case 'match.propose':
      return {
        id,
        ok: true,
        kind: 'match.propose',
        result: await ayqRunMatching(
          dataDir,
          ayqToday(request.today),
          new Date().toISOString(),
        ),
      };

    case 'match.apply':
      return {
        id,
        ok: true,
        kind: 'match.apply',
        result: await ayqApplyMatch(
          dataDir,
          request.recordId,
          request.dueDate,
          request.transactionId,
          ayqToday(request.today),
          new Date().toISOString(),
        ),
      };

    case 'match.reject':
      return {
        id,
        ok: true,
        kind: 'match.reject',
        result: ayqRejectMatch(
          dataDir,
          request.recordId,
          request.dueDate,
          request.transactionId,
          ayqToday(request.today),
        ),
      };

    case 'match.unmatch':
      return {
        id,
        ok: true,
        kind: 'match.unmatch',
        result: ayqUnmatch(
          dataDir,
          request.recordId,
          request.dueDate,
          ayqToday(request.today),
        ),
      };

    case 'forecast':
      return {
        id,
        ok: true,
        kind: 'forecast',
        result: await ayqForecast(dataDir, ayqToday(request.today)),
      };

    case 'budget.month':
      return {
        id,
        ok: true,
        kind: 'budget.month',
        result: await ayqBudgetMonth(request.month),
      };

    case 'budget.setPlan':
      return {
        id,
        ok: true,
        kind: 'budget.setPlan',
        result: await ayqSetPlan(
          request.month,
          request.categoryId,
          request.cents,
        ),
      };

    case 'plan.suggest':
      return {
        id,
        ok: true,
        kind: 'plan.suggest',
        result: await ayqSuggest(
          dataDir,
          ayqToday(request.today),
          new Date().toISOString(),
        ),
      };

    case 'import.camt':
      return {
        id,
        ok: true,
        kind: 'import.camt',
        result: await ayqImportCamt(dataDir, request.paths, {
          budgetId: budget.budgetId,
          budgetName: BUDGET_NAME,
        }),
      };

    default:
      throw new Error(
        `unknown request kind: ${String((request as { kind?: unknown }).kind)}`,
      );
  }
}

channel.onMessage(message => {
  void (async () => {
    const request = message as AyqRequest;
    let response: AyqResponse;
    try {
      if (dataDir === '') {
        throw new Error('AYQ_DATA_DIR was not set by the host');
      }
      response = await answer(request);
    } catch (error) {
      response = {
        id: request?.id ?? 'unknown',
        ok: false,
        kind: 'error',
        message: explain(said(error)),
      };
    }
    channel.send(response);
  })();
});
