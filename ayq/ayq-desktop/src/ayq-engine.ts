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
  AyqAbout,
  AyqBackupCreated,
  AyqEngineRequest,
  AyqResponse,
  AyqRestored,
} from '../../ayq-client/src/ayq-ipc-contract.ts';

import {
  ayqAliases,
  ayqApplyAliases,
  ayqForgetAlias,
  ayqRememberAlias,
} from './ayq-aliases.ts';
import { ayqUseSend } from './ayq-batch.ts';
import {
  ayqBulkScope,
  ayqCategoriseScope,
  ayqCorrectScopeCounterparty,
} from './ayq-bulk.ts';
import {
  ayqBudgetMonth,
  ayqBudgetType,
  ayqEnsureTrackingBudget,
  ayqSetPlan,
} from './ayq-budget.ts';
import { ayqImportCamt, ayqImports } from './ayq-camt-import.ts';
import { ayqAccountsView } from './ayq-coverage.ts';
import { ayqTodayView } from './ayq-today.ts';
import {
  ayqCategories,
  ayqCategoryImpact,
  ayqCreateCategory,
  ayqMoveCategory,
  ayqRemoveCategory,
  ayqRenameCategory,
} from './ayq-categories.ts';
import { ayqRecoverCounterpartyNames } from './ayq-recover-names.ts';
import { ayqProvisionTaxonomy } from './ayq-taxonomy.ts';
import {
  ayqAbout,
  ayqCompiledIdentity,
  ayqRepositoryUrl,
} from './ayq-about.ts';
import {
  ayqAutomaticBackupDue,
  ayqBackupOverview,
  ayqCheckBackup,
  ayqClearPartialBackups,
  ayqCreateBackup,
  ayqFinishRestore,
  ayqRecoverInterruptedRestore,
  ayqReplaceWithBackup,
  AyqRestoreRefused,
} from './ayq-backup.ts';
import { ayqGate } from './ayq-gate.ts';
import { ayqAttention, ayqMarkImportProblemHandled } from './ayq-attention.ts';
import { ayqApplyAnchor, ayqRecordAnchor } from './ayq-anchors.ts';
import { ayqSetDisplayName } from './ayq-names.ts';
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
  ayqRetireInvalidSuggestions,
  ayqUsePlanSuggestions,
  ayqRunMatching,
  ayqSavePlan,
  ayqSetPlanState,
  ayqSuggest,
  ayqUnmatch,
} from './ayq-plan.ts';
import { ayqToday } from './ayq-plan-series.ts';
import { ayqSaveSettings, ayqSettings } from './ayq-preferences.ts';
import { ayqRecurring } from './ayq-recurring.ts';
import {
  ayqApplyFiling,
  ayqApplyRules,
  ayqCorrectRule,
  ayqFileCounterparty,
  ayqForgetRule,
  ayqKeyOfTransaction,
  ayqPendingForCounterparty,
  ayqRecordDecision,
  ayqRememberRule,
  ayqRuleImpact,
  ayqRules,
} from './ayq-rules.ts';
import { ayqMergeCounterparty } from './ayq-merge.ts';
import { ayqSettle } from './ayq-settle.ts';
import {
  AYQ_COUNTERPARTY_FOLD,
  ayqDamagedStore,
  ayqReadStore,
  ayqWriteStore,
} from './ayq-store.ts';
import { AyqEngineError, ayqErrorCodeOf } from './ayq-error.ts';
import { ayqExportAnalyticalSnapshot } from './ayq-snapshot.ts';

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

/**
 * The open that is already in flight, if one is.
 *
 * `opened` is only set once a budget is loaded, so two requests arriving
 * together both found it null, both ran `api.init`, and both created a budget.
 * On a first launch that produced two budget ids, a SQLite "table payees
 * already exists", and a window that said it had an unknown problem opening a
 * budget it had just made.
 *
 * It only became reachable when the renderer became a React shell that asks
 * several questions at once — which is the right thing for a renderer to do.
 * The engine is what has to be able to answer them: the first request opens the
 * budget and the rest wait on that same open.
 */
let opening: Promise<AyqOpenBudget> | null = null;

async function openBudget(dataDir: string): Promise<AyqOpenBudget> {
  if (opened) return opened;
  if (opening === null) {
    opening = openBudgetOnce(dataDir);
    // Cleared either way. Resolved, `opened` answers from then on; rejected,
    // the next request must be able to try again rather than be handed the same
    // failure for the life of the process.
    opening.then(
      () => {
        opening = null;
      },
      () => {
        opening = null;
      },
    );
  }
  return opening;
}

async function openBudgetOnce(dataDir: string): Promise<AyqOpenBudget> {
  // On a first launch the directory does not exist yet, and the API expects to
  // be handed one that does.
  mkdirSync(dataDir, { recursive: true });
  // Once per process. A backup or a restore closes the budget and opens it
  // again, and the library that did the opening is the one to do it again.
  lib ??= await api.init({ dataDir });
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
    // 11 §11.3: one-time and strictly additive on a budget that already exists.
    // It runs on every launch and does nothing at all from the second one
    // onward, because the marker in the store says it has been done.
    await ayqProvisionTaxonomy(dataDir, { fresh: false });
    // 9 §9.2: offers a previous AYQ made under the looser rule are reconsidered
    // against the strict one, once, on the way in. It costs a query only when
    // there are outstanding offers to reconsider, and it touches nothing the
    // owner decided — a confirmed record, a manual record, a match and a
    // rejection all come through untouched.
    await ayqRetireInvalidSuggestions(dataDir);
    // 3 §3.9 was widened in build 006, so a counterparty the bank prints with a
    // reference folds to one key where it used to fold to several. The payees
    // already in the budget were written under the older rule, and §3.13 wants
    // one name per counterparty on every screen — so they are brought up to
    // date once, here, and the marker says it has been done. A store that is
    // already current never pays for the pass.
    await foldCounterparties(dataDir);
    // 11 §11.12: a store filed before automatic categorisation existed catches
    // up here, without the owner refiling anything by hand. It is idempotent —
    // a second launch finds nothing left to file — and it cannot reach a
    // decision a person or a rule made, so running it on every launch costs one
    // query on a store that is already up to date.
    await ayqApplyFiling(dataDir);
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
  // placeholders it replaces (11 §11.2).
  await ayqProvisionTaxonomy(dataDir, { fresh: true });
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
/**
 * This build, as the About tab shows it.
 *
 * The engine answers it because it is the side that knows which
 * `@actual-app/api` actually loaded, and because the copy text's privacy
 * contract (12 §12.4) is the engine's to keep.
 */
function aboutThisBuild(): AyqAbout {
  return ayqAbout({
    engineVersion: apiVersion(),
    electronVersion: process.versions.electron ?? null,
    nodeVersion: process.versions.node,
    repositoryUrl: manifestRepository(),
  });
}

/** The repository the manifest declares, wherever the manifest ended up. */
function manifestRepository(): string | null {
  for (const candidate of ['../package.json', '../../package.json']) {
    try {
      const found = ayqRepositoryUrl(
        fileURLToPath(new URL(candidate, import.meta.url)),
      );
      if (found !== null) return found;
    } catch {
      // Try the next location.
    }
  }
  return null;
}

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

/** Backup and restore take the budget alone; see `ayq-gate.ts`. */
const { shared, exclusive } = ayqGate();

/**
 * Closes the budget, so that nothing writes it while its files are copied or
 * replaced. Only ever called from inside `exclusive`.
 */
async function closeBudget(): Promise<void> {
  if (opened === null || lib === null) return;
  await lib.send('close-budget' as never, undefined as never);
  opened = null;
}

function identity(): { productVersion: string; buildNumber: string } {
  return ayqCompiledIdentity();
}

/**
 * **Create backup now** (04 A38): the budget is paused, captured with the store,
 * and opened again.
 */
async function createBackup(): Promise<AyqBackupCreated> {
  return exclusive(async () => {
    await openBudget(dataDir);
    await closeBudget();
    try {
      const made = ayqCreateBackup(dataDir, {
        trigger: 'manual',
        identity: identity(),
      });
      return made.outcome === 'created'
        ? {
            outcome: 'created',
            backupId: made.backupId,
            overview: ayqBackupOverview(dataDir),
          }
        : {
            outcome: 'failed',
            failure: made.failure,
            overview: ayqBackupOverview(dataDir),
          };
    } finally {
      await openBudget(dataDir);
    }
  });
}

/**
 * **Restore backup** (03 §12.4): all of it, or none of it.
 *
 * The set is checked completely before the budget is even closed. Then what is
 * there now is backed up, the set replaces it, and the restored budget is
 * opened. If any step after the check fails — the copy, a rename, or Actual
 * refusing to open what was restored — the previous state is put back and
 * opened instead, and the answer says which step it was.
 */
async function restoreBackup(backupId: string): Promise<AyqRestored> {
  return exclusive(async () => {
    const checked = ayqCheckBackup(dataDir, backupId);
    if (!checked.ok) {
      return {
        outcome: 'refused',
        refusal: checked.refusal,
        overview: ayqBackupOverview(dataDir),
      };
    }

    await openBudget(dataDir);
    await closeBudget();
    const failed = (
      failure: 'safety-backup-failed' | 'replace-failed' | 'open-failed',
    ) =>
      ({
        outcome: 'failed',
        failure,
        overview: ayqBackupOverview(dataDir),
      }) as const;

    try {
      const kept = ayqCreateBackup(dataDir, {
        trigger: 'before-restore',
        identity: identity(),
      });
      if (kept.outcome === 'failed') return failed('safety-backup-failed');

      try {
        ayqReplaceWithBackup(dataDir, checked.manifest);
      } catch (error) {
        ayqRecoverInterruptedRestore(dataDir);
        if (error instanceof AyqRestoreRefused) {
          return {
            outcome: 'refused',
            refusal: error.refusal,
            overview: ayqBackupOverview(dataDir),
          } as const;
        }
        return failed('replace-failed');
      }

      try {
        await openBudget(dataDir);
      } catch {
        // Actual would not open what was restored. It is closed again, whatever
        // it managed to load, and the previous state goes back.
        try {
          await lib?.send('close-budget' as never, undefined as never);
        } catch {
          // Nothing was loaded, which is fine.
        }
        opened = null;
        ayqRecoverInterruptedRestore(dataDir);
        return failed('open-failed');
      }
      ayqFinishRestore(dataDir);
      return {
        outcome: 'restored',
        backupId,
        keptBackupId: kept.backupId,
        overview: ayqBackupOverview(dataDir),
      } as const;
    } finally {
      if (opened === null) await openBudget(dataDir);
    }
  });
}

/**
 * What happens once, when the engine starts and before it answers anything.
 *
 * First, a restore a previous process did not finish is put back (03 §12.4).
 * Then a backup that never finished is cleared away. Then, if one is due, the
 * automatic backup is made — now, because nothing has opened the budget yet,
 * so the files on disk are exactly the state the last session left.
 *
 * None of it may stop AYQ from opening. A failed automatic backup is recorded
 * as the last automatic attempt (030 §2), where Settings shows it.
 */
const started = exclusive(async () => {
  if (dataDir === '') return;
  try {
    ayqRecoverInterruptedRestore(dataDir);
  } catch (error) {
    process.stderr.write(`[ayq-backup] could not put back an unfinished restore: ${said(error)}\n`);
  }
  try {
    ayqClearPartialBackups(dataDir);
  } catch {
    // A leftover folder is untidy, not harmful: it is never listed.
  }
  try {
    if (ayqAutomaticBackupDue(dataDir, new Date())) {
      ayqCreateBackup(dataDir, { trigger: 'automatic', identity: identity() });
    }
  } catch (error) {
    process.stderr.write(`[ayq-backup] automatic backup: ${said(error)}\n`);
  }
});
void started;

/**
 * Answers one request.
 *
 * Every kind opens the budget first, because every kind reads or writes it.
 * The one exception would be a request about the host, and the host answers
 * those itself rather than sending them here.
 */
async function answer(request: AyqEngineRequest): Promise<AyqResponse> {
  const id = request.id;

  if (request.kind === 'engine.status') {
    return {
      id,
      ok: true,
      kind: 'engine.status',
      result: await status(dataDir),
    };
  }

  // The interface settings are answered before the budget is opened, and on
  // purpose: the window asks which ground to draw in as the first thing it
  // does, and waiting for a budget to open to find out would mean drawing the
  // wrong one first and correcting it in front of the person.
  if (request.kind === 'settings.get') {
    return { id, ok: true, kind: 'settings.get', result: ayqSettings(dataDir) };
  }
  if (request.kind === 'settings.set') {
    return {
      id,
      ok: true,
      kind: 'settings.set',
      result: ayqSaveSettings(dataDir, request.settings),
    };
  }

  // What this build is, answered without opening a budget: it is a fact about
  // the application and not about anybody's money, which is also why nothing in
  // it can carry any (12 §12.4).
  if (request.kind === 'about') {
    return { id, ok: true, kind: 'about', result: aboutThisBuild() };
  }

  if (request.kind === 'backup.overview') {
    return {
      id,
      ok: true,
      kind: 'backup.overview',
      result: ayqBackupOverview(dataDir),
    };
  }
  if (request.kind === 'backup.create') {
    return { id, ok: true, kind: 'backup.create', result: await createBackup() };
  }
  if (request.kind === 'backup.restore') {
    return {
      id,
      ok: true,
      kind: 'backup.restore',
      result: await restoreBackup(request.backupId),
    };
  }

  // The analytical snapshot (02 §7.8–§7.16, 03 §13) is read alone, like a
  // backup: no filing may land between reading the ledger and reading the
  // store, or the file would describe two moments at once.
  if (request.kind === 'snapshot.write') {
    const { path } = request;
    const today = ayqToday(request.today);
    return exclusive(async () => {
      const opened = await openBudget(dataDir);
      return {
        id,
        ok: true,
        kind: 'snapshot.write',
        result: await ayqExportAnalyticalSnapshot(
          dataDir,
          opened.budgetId,
          today,
          aboutThisBuild(),
          path,
        ),
      };
    });
  }
  if (request.kind === 'snapshot.export') {
    // Only the host may turn this into a write, once the owner has chosen
    // where; the engine is never asked to choose a place itself.
    throw new AyqEngineError(
      'snapshot-not-from-window',
      'snapshot.export is answered by the host, which asks the owner where',
    );
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

    case 'today':
      return {
        id,
        ok: true,
        kind: 'today',
        result: await ayqTodayView(
          dataDir,
          ayqToday(request.today),
          new Date().toISOString(),
        ),
      };

    case 'accounts.view':
      return {
        id,
        ok: true,
        kind: 'accounts.view',
        result: await ayqAccountsView(dataDir),
      };

    case 'accounts.setFlag':
      ayqSetAccountFlag(dataDir, request.accountId, request.countsTowardFunds);
      return {
        id,
        ok: true,
        kind: 'accounts.setFlag',
        result: await ayqAccounts(dataDir),
      };

    case 'accounts.setBalance':
    case 'accounts.reanchor': {
      // One implementation, because they are one act: the owner stating what an
      // account holds on a named day. They are two request kinds because they
      // are reached from two places and mean two different things to the person
      // — the first is answering a question the import asked, the second is
      // correcting an answer already given — and an import record that could
      // not tell them apart would lose that.
      const anchor = ayqRecordAnchor(dataDir, {
        accountId: request.accountId,
        amountCents: request.amountCents,
        coverageDate: request.coverageDate,
        importId:
          request.kind === 'accounts.setBalance'
            ? (request.importId ?? null)
            : null,
        source: 'manual',
      });
      await ayqApplyAnchor(anchor);
      return {
        id,
        ok: true,
        kind: request.kind,
        result: await ayqAccountsView(dataDir),
      };
    }

    case 'counterparty.setName':
      ayqSetDisplayName(dataDir, request.counterpartyKey, request.displayName);
      return {
        id,
        ok: true,
        kind: 'counterparty.setName',
        result: await ayqCounterpartyDetail(dataDir, request.counterpartyKey),
      };

    case 'plan.useSuggestion':
      return {
        id,
        ok: true,
        kind: 'plan.useSuggestion',
        result: await ayqUsePlanSuggestions(dataDir, request.month, {
          categoryId: request.categoryId,
        }),
      };

    case 'plan.useAllSuggestions':
      return {
        id,
        ok: true,
        kind: 'plan.useAllSuggestions',
        result: await ayqUsePlanSuggestions(dataDir, request.month, {
          all: true,
        }),
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
      if (!chosen) throw new AyqEngineError('category-not-found', 'no such category');

      // 03 §4.1's two decisions, and the caller had to say which. Learning a
      // rule files what is there as a consequence of the rule; filing by hand
      // files what is there and leaves the next import alone.
      if (request.createRule) {
        ayqRememberRule(dataDir, request.counterpartyKey, chosen.name);
        const applied = await ayqApplyRules(dataDir);
        return {
          id,
          ok: true,
          kind: 'transaction.categoriseCounterparty',
          result: { ...applied, keptByHand: 0, ruleWritten: true },
        };
      }

      const filed = await ayqFileCounterparty(dataDir, request.counterpartyKey, {
        id: chosen.id,
        name: chosen.name,
      });
      return {
        id,
        ok: true,
        kind: 'transaction.categoriseCounterparty',
        result: { ...filed, ruleWritten: false },
      };
    }

    case 'transactions.scope':
      return {
        id,
        ok: true,
        kind: 'transactions.scope',
        result: await ayqBulkScope(dataDir, request.scope),
      };

    case 'transactions.categoriseMany':
      return {
        id,
        ok: true,
        kind: 'transactions.categoriseMany',
        result: await ayqCategoriseScope(
          dataDir,
          request.scope,
          request.categoryId,
          request.includeByHand === true,
        ),
      };

    case 'transactions.correctCounterparty':
      return {
        id,
        ok: true,
        kind: 'transactions.correctCounterparty',
        result: await ayqCorrectScopeCounterparty(
          dataDir,
          request.scope,
          request.counterpartyKey,
        ),
      };

    case 'categories.create':
      return {
        id,
        ok: true,
        kind: 'categories.create',
        result: await ayqCreateCategory(request.name, request.groupId),
      };

    case 'categories.move':
      return {
        id,
        ok: true,
        kind: 'categories.move',
        result: await ayqMoveCategory(request.categoryId, request.groupId),
      };

    case 'categories.impact':
      return {
        id,
        ok: true,
        kind: 'categories.impact',
        result: await ayqCategoryImpact(dataDir, request.categoryId),
      };

    case 'categories.remove':
      return {
        id,
        ok: true,
        kind: 'categories.remove',
        result: await ayqRemoveCategory(
          dataDir,
          request.categoryId,
          request.destination,
        ),
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

    case 'rules.impact':
      return {
        id,
        ok: true,
        kind: 'rules.impact',
        result: await ayqRuleImpact(dataDir, request.ruleId),
      };

    case 'rules.correct':
      return {
        id,
        ok: true,
        kind: 'rules.correct',
        result: await ayqCorrectRule(dataDir, request.ruleId, request.categoryId),
      };

    case 'rules.remove':
      return {
        id,
        ok: true,
        kind: 'rules.remove',
        result: ayqForgetRule(dataDir, request.ruleId),
      };

    case 'rules.apply': {
      // Both passes, in the order 03 §11.11 fixes: the owner's own rules first,
      // then AYQ's reading of whatever they left. The count reported is the
      // rules' own, so the button goes on meaning what it meant.
      const applied = await ayqApplyRules(dataDir);
      await ayqApplyFiling(dataDir);
      return { id, ok: true, kind: 'rules.apply', result: applied };
    }

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

    case 'counterparty.merge':
      return {
        id,
        ok: true,
        kind: 'counterparty.merge',
        result: await ayqMergeCounterparty(
          dataDir,
          request.counterpartyKey,
          request.intoKey,
        ),
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
        throw new AyqEngineError(
          'counterparty-not-found',
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

    case 'attention':
      return {
        id,
        ok: true,
        kind: 'attention',
        result: await ayqAttention(dataDir, ayqToday(request.today)),
      };

    case 'imports.markHandled':
      return {
        id,
        ok: true,
        kind: 'imports.markHandled',
        result: ayqMarkImportProblemHandled(
          dataDir,
          request.importId,
          request.name,
          new Date().toISOString(),
        ),
      };

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
      // Two clocks, on purpose. `createdAt` is the instant, for the audit
      // trail; the date 03 §7.14 dates expectations from is the day the engine
      // was asked about, so a stated `today` states both and the rule holds
      // wherever it is exercised.
      const today = ayqToday(request.today);
      ayqSavePlan(dataDir, request.record, new Date().toISOString(), today);
      return { id, ok: true, kind: 'plan.save', result: ayqPlan(dataDir, today) };
    }

    case 'plan.setState': {
      const today = ayqToday(request.today);
      ayqSetPlanState(
        dataDir,
        request.recordId,
        request.state,
        new Date().toISOString(),
        today,
      );
      return {
        id,
        ok: true,
        kind: 'plan.setState',
        result: ayqPlan(dataDir, today),
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
        result: await ayqBudgetMonth(dataDir, request.month),
      };

    case 'budget.setPlan':
      return {
        id,
        ok: true,
        kind: 'budget.setPlan',
        result: await ayqSetPlan(
          dataDir,
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
    const request = message as AyqEngineRequest;
    let response: AyqResponse;
    try {
      if (dataDir === '') {
        throw new Error('AYQ_DATA_DIR was not set by the host');
      }
      // Backup and restore take the gate alone inside their own handlers;
      // everything else shares it.
      const takesItAlone =
        request?.kind === 'backup.create' ||
        request?.kind === 'backup.restore' ||
        request?.kind === 'snapshot.write';
      response = takesItAlone
        ? await answer(request)
        : await shared(() => answer(request));
    } catch (error) {
      const detail = explain(said(error));
      // The native-binding failure has a cure a person can be told about, so
      // it has a code of its own; everything else keeps the one it was thrown
      // with, or is `unexpected`.
      const coded = ayqErrorCodeOf(error);
      response = {
        id: request?.id ?? 'unknown',
        ok: false,
        kind: 'error',
        ...(coded.code === 'unexpected' && detail !== said(error)
          ? { code: 'engine-native-binding' as const }
          : coded),
        detail,
      };
    }
    channel.send(response);
  })();
});

/**
 * Brings the budget's payees up to date with the current folding rule, once.
 *
 * `ayqApplyAliases` is the existing machinery for "every transaction AYQ
 * imported carries the payee its counterparty ought to have", and it is exactly
 * what is wanted: it reads provenance, which an alias and a fold both leave
 * untouched, and writes only the rows whose payee disagrees. It is used rather
 * than a second implementation so that there is one answer to what a
 * transaction should be called and not two that can drift apart.
 *
 * Marked rather than scanned. A pass over every transaction on every launch is
 * how build 003's status bar cost seventeen seconds on fifty thousand rows, and
 * this has no more right to that than the status bar did.
 *
 * The marker is written only after the pass returns, so an interrupted run is
 * finished by the next launch (03 §5.5, and the same discipline the taxonomy
 * marker keeps).
 *
 * ## It may not stop the application from opening
 *
 * Build 006 shipped it able to. The pass reads its own writes back through
 * `ayqSettle`, that read could not converge on the owner's own budget, and the
 * exception came out of `openBudget` — so a cosmetic tidying of names left him
 * with a red banner and a screen that said `Reading…` and never stopped.
 *
 * The defect that caused it is fixed, and this is the second half of the
 * answer: a pass whose whole job is to make names agree does not get to decide
 * whether AYQ opens. If it cannot finish, the names stay exactly as they were —
 * which is the state the owner already had, so nothing is lost and nothing is
 * claimed — the marker stays unset, and the next launch tries again.
 */
async function foldCounterparties(dataDir: string): Promise<void> {
  const store = ayqReadStore(dataDir);
  if (store.counterpartyFoldVersion >= AYQ_COUNTERPARTY_FOLD) return;

  // Before anything is folded, the name a store written before build 006 never
  // recorded is recovered from the description the bank wrote. Without it there
  // is nothing to fold and nothing to file: the fold reads a stored key again
  // through the name it came from, and the filing reads the counterparty the
  // resolver pronounced. The owner's budget carried 567 records and not one of
  // them had a name, so build 007 folded nothing and filed nothing on the only
  // budget that mattered while every test passed.
  if (ayqRecoverCounterpartyNames(store) > 0) ayqWriteStore(dataDir, store);

  try {
    await ayqApplyAliases(dataDir);
  } catch {
    // Left unmarked on purpose: not finished is not the same as done, and the
    // next launch is the retry.
    return;
  }

  const after = ayqReadStore(dataDir);
  after.counterpartyFoldVersion = AYQ_COUNTERPARTY_FOLD;
  ayqWriteStore(dataDir, after);
}
