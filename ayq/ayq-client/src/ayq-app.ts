// The AYQ application shell.
//
// A summary, four views and one action. What a person came for is their own
// money — the ledger, what recurs, where it is filed and what has been imported
// — so that is the screen. Which process answered and which version of the
// engine it was are true, useful, and a footnote.
//
// Everything here is drawing and asking. The rows are the engine's, the
// counterparty on each row is the one the CAMT resolver decided at import time,
// and every total is counted by the engine's own query language. The renderer
// computes no money.

import { ayqAsk } from './ayq-bridge.ts';
import { ayqElement } from './ayq-dom.ts';
import { ayqEuro, ayqMoment, ayqMonth } from './ayq-format.ts';
import type {
  AyqCategoryRule,
  AyqEngineStatus,
  AyqImportRecord,
  AyqImportSummary,
  AyqRecurring,
  AyqSummary,
} from './ayq-ipc-contract.ts';
import {
  ayqRenderImports,
  ayqRenderRecurring,
  ayqRenderRules,
} from './ayq-other-views.ts';
import {
  ayqEmptyTransactionsState,
  ayqRenderTransactions,
  type AyqTransactionsState,
} from './ayq-transactions.ts';

type AyqView = 'transactions' | 'recurring' | 'rules' | 'imports';

const VIEWS: Array<{ id: AyqView; label: string }> = [
  { id: 'transactions', label: 'Transactions' },
  { id: 'recurring', label: 'Recurring' },
  { id: 'rules', label: 'Rules' },
  { id: 'imports', label: 'Imports' },
];

type AyqState = {
  view: AyqView;
  /** What stopped the last load, if anything did. */
  failure: string | null;
  status: AyqEngineStatus | null;
  summary: AyqSummary | null;
  transactions: AyqTransactionsState;
  recurring: AyqRecurring[];
  rules: AyqCategoryRule[];
  imports: AyqImportRecord[];
};

const state: AyqState = {
  view: 'transactions',
  failure: null,
  status: null,
  summary: null,
  transactions: ayqEmptyTransactionsState(),
  recurring: [],
  rules: [],
  imports: [],
};

function byId(id: string): HTMLElement | null {
  return document.getElementById(id);
}

/* ---------------------------------------------------------------- reporting */

/**
 * The outcome, published for the acceptance run.
 *
 * It has to be able to prove what happened from the result rather than from the
 * screen's optimism, so state and counts are set from the answers — never
 * before them.
 */
function markState(value: 'ready' | 'error'): void {
  document.body.dataset.ayqState = value;
  if (state.status)
    document.body.dataset.ayqEngineHost = state.status.engineHost;
}

function markLedger(): void {
  const ledger = state.transactions.ledger;
  document.body.dataset.ayqLedgerTotal = String(
    state.summary?.transactionCount ?? ledger?.total ?? 0,
  );
  document.body.dataset.ayqLedgerRows = String(ledger?.rows.length ?? 0);
}

function markImport(
  value: 'working' | 'done' | 'cancelled' | 'error',
  summary?: AyqImportSummary,
): void {
  document.body.dataset.ayqImportState = value;
  if (summary) document.body.dataset.ayqImportSummary = JSON.stringify(summary);
}

/**
 * Says what went wrong, above everything else, and stays until it is dismissed.
 *
 * An engine that cannot answer is not a blank screen: the message is the
 * engine's own, and the one thing that reliably helps — trying again — is right
 * there beside it.
 */
function showProblem(message: string): void {
  const bar = byId('ayq-problem');
  if (!bar) return;

  bar.replaceChildren(ayqElement('span', 'problem-text', message));

  const retry = document.createElement('button');
  retry.type = 'button';
  retry.className = 'quiet small';
  retry.textContent = 'Try again';
  retry.addEventListener('click', () => void refresh(true));
  bar.append(retry);

  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.className = 'quiet small';
  dismiss.textContent = 'Dismiss';
  dismiss.addEventListener('click', () => clearProblem());
  bar.append(dismiss);

  bar.hidden = false;
}

function clearProblem(): void {
  const bar = byId('ayq-problem');
  if (!bar) return;
  bar.replaceChildren();
  bar.hidden = true;
}

/* ------------------------------------------------------------------ loading */

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

/** Everything the shell shows, whichever view is open. */
/** The damaged store already reported, so it is said once and not every redraw. */
let damagedTold = '';

/** Held until the reload finishes, because a successful reload clears the bar. */
let damagedNotice: string | null = null;

async function loadShell(): Promise<void> {
  state.status = (await need({ kind: 'engine.status' })).result;
  state.summary = (await need({ kind: 'summary' })).result;
  state.transactions.accounts = state.summary.accounts;

  // Losing the rules is not a reason to refuse to open, but it is a reason to
  // say so: the transactions are Actual's and are all there, while everything
  // AYQ kept beside them is not. Said once per launch, and dismissible.
  const damaged = state.status?.storeDamaged ?? null;
  if (damaged !== null && damaged !== damagedTold) {
    damagedTold = damaged;
    damagedNotice =
      'AYQ could not read what it had kept beside this budget, so its rules ' +
      'and the record of where each name came from are gone. Your ' +
      `transactions are untouched. The unreadable file was kept as ${damaged}.`;
  }
}

async function loadView(): Promise<void> {
  switch (state.view) {
    case 'transactions': {
      if (state.transactions.categories.length === 0) {
        state.transactions.categories = (
          await need({ kind: 'categories.list' })
        ).result;
      }
      state.transactions.ledger = (
        await need({
          kind: 'transactions.list',
          filter: state.transactions.filter,
        })
      ).result;
      return;
    }
    case 'recurring':
      state.recurring = (await need({ kind: 'recurring.list' })).result;
      return;
    case 'rules':
      state.rules = (await need({ kind: 'rules.list' })).result;
      state.transactions.categories = (
        await need({ kind: 'categories.list' })
      ).result;
      return;
    case 'imports':
      state.imports = (await need({ kind: 'imports.list' })).result;
      return;
  }
}

let loading = false;
let queued = false;

/**
 * Reads what the open view needs, then draws.
 *
 * A reload asked for while one is already running is remembered rather than
 * dropped: the second one is usually the one that matters — a category just
 * assigned, a rule just applied — and losing it would leave the screen showing
 * the state before the change.
 */
async function refresh(reload: boolean): Promise<void> {
  if (reload) {
    if (loading) {
      queued = true;
      return;
    }
    loading = true;
    try {
      await loadShell();
      await loadView();
      state.failure = null;
      clearProblem();
      // After the bar is cleared, or clearing it would take the notice with it.
      if (damagedNotice !== null) {
        showProblem(damagedNotice);
        damagedNotice = null;
      }
    } catch (error) {
      state.failure = error instanceof Error ? error.message : String(error);
      showProblem(state.failure);
    } finally {
      loading = false;
    }

    if (queued) {
      queued = false;
      await refresh(true);
      return;
    }
  }
  draw();
}

/* ------------------------------------------------------------------ drawing */

function draw(): void {
  drawSummary();
  drawTabs();
  drawView();
  drawFooter();

  // Published last, once the screen actually says what the attributes claim.
  // Marking first meant the acceptance run could read "error" and then print a
  // body that had not been redrawn yet — the state of a screen that no longer
  // existed.
  markLedger();
  markState(state.failure === null ? 'ready' : 'error');
}

function drawSummary(): void {
  const target = byId('ayq-summary');
  if (!target) return;
  const summary = state.summary;
  if (summary === null) {
    target.replaceChildren();
    return;
  }

  const figures: Array<[string, string, string?]> = [
    ['Balance', ayqEuro(summary.totalBalanceCents)],
    ['Transactions', String(summary.transactionCount)],
    ['Counterparties', String(summary.counterpartyCount)],
    ['Uncategorised', String(summary.uncategorisedCount)],
  ];

  if (summary.month !== null) {
    figures.splice(
      1,
      0,
      [
        `In · ${ayqMonth(summary.month)}`,
        ayqEuro(summary.monthIncomeCents),
        'in',
      ],
      [
        `Out · ${ayqMonth(summary.month)}`,
        ayqEuro(summary.monthExpenseCents),
        'out',
      ],
    );
  }

  target.replaceChildren();
  for (const [label, value, tone] of figures) {
    const cell = ayqElement('div', 'figure');
    cell.append(
      ayqElement('span', 'figure-label', label),
      ayqElement('span', `figure-value ${tone ?? ''}`.trim(), value),
    );
    target.append(cell);
  }
}

function drawTabs(): void {
  const target = byId('ayq-tabs');
  if (!target) return;
  target.replaceChildren();

  for (const view of VIEWS) {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = view.id === state.view ? 'tab current' : 'tab';
    tab.textContent = view.label;
    tab.dataset.ayqTab = view.id;
    tab.addEventListener('click', () => {
      if (state.view === view.id) return;
      state.view = view.id;
      void refresh(true);
    });
    target.append(tab);
  }
}

function drawView(): void {
  const target = byId('ayq-body');
  if (!target) return;

  // A load that failed must not leave the view sitting on "reading…". The bar
  // above carries the engine's own words; this says which part of the screen
  // is missing, and why there is nothing under it.
  if (state.failure !== null) {
    target.replaceChildren(
      ayqElement('p', 'empty-title', 'The budget could not be read.'),
      ayqElement('pre', 'error', state.failure),
    );
    return;
  }

  switch (state.view) {
    case 'transactions':
      ayqRenderTransactions(
        state.transactions,
        target,
        reload => void refresh(reload),
      );
      return;
    case 'recurring':
      ayqRenderRecurring(state.recurring, target, counterpartyKey => {
        state.transactions.filter = { counterpartyKey };
        state.transactions.openId = null;
        state.view = 'transactions';
        void refresh(true);
      });
      return;
    case 'rules':
      ayqRenderRules(
        state.rules,
        state.transactions.categories,
        target,
        () => void refresh(true),
      );
      return;
    case 'imports':
      ayqRenderImports(state.imports, target);
      return;
  }
}

function drawFooter(): void {
  const note = byId('ayq-engine-note');
  if (!note) return;
  const status = state.status;
  if (status === null) {
    note.textContent = '';
    return;
  }

  const parts = [
    `${status.budgetName} · @actual-app/api ${status.apiVersion} · ${status.engineHost}`,
  ];
  if (state.summary?.lastImportAt) {
    parts.push(`last import ${ayqMoment(state.summary.lastImportAt)}`);
  }
  // Where the money actually lives, said out loud: this application keeps
  // everything on this machine, and a person is entitled to know where.
  parts.push(status.dataDir);
  note.textContent = parts.join(' · ');
}

/* ------------------------------------------------------------------- import */

function renderImportLine(node: HTMLElement | null): void {
  const target = byId('ayq-import-result');
  if (!target) return;
  if (node === null) target.replaceChildren();
  else target.replaceChildren(node);
}

/**
 * Imports a CAMT.053 file.
 *
 * Two calls, both across the same channel: the host opens the native picker and
 * answers with a path, then the engine reads that path. The renderer never
 * touches the filesystem — it has none — and never parses anything.
 */
async function importCamt(): Promise<void> {
  const button = byId('ayq-import');
  if (button instanceof HTMLButtonElement) button.disabled = true;
  markImport('working');
  renderImportLine(ayqElement('span', 'muted', 'Waiting for a file…'));

  try {
    const picked = await need({ kind: 'import.pick' });
    const paths = picked.result.paths;
    if (paths.length === 0) {
      renderImportLine(
        ayqElement('span', 'muted', 'No file chosen; nothing was imported.'),
      );
      markImport('cancelled');
      return;
    }

    renderImportLine(
      ayqElement(
        'span',
        'muted',
        paths.length === 1
          ? 'Reading and importing…'
          : `Reading and importing ${paths.length} files…`,
      ),
    );
    const done = await need({ kind: 'import.camt', paths });
    const summary = done.result;

    const outcome = ayqElement('div', 'import-outcome');
    outcome.append(
      ayqElement(
        'span',
        'import-done',
        `${summary.file}: ${summary.imported} imported, ` +
          `${summary.duplicates} already there` +
          (summary.categorised > 0
            ? `, ${summary.categorised} categorised by rules`
            : '') +
          (summary.skipped > 0 ? `, ${summary.skipped} skipped` : '') +
          (summary.failed > 0 ? `, ${summary.failed} failed` : '') +
          ` — ${summary.accountName}`,
      ),
    );

    // A count of failures tells a person that something went wrong and not
    // which thing. The files that could not be used are named, once each.
    for (const problem of summary.problems) {
      outcome.append(
        ayqElement(
          'span',
          'import-problem',
          `${problem.name} — ${problem.reason}`,
        ),
      );
    }
    renderImportLine(outcome);

    // The ledger is what just changed, so it is reloaded before the import is
    // called done: a person sees their transactions without asking twice, and
    // nothing starts a second import while this one still has a question out.
    state.view = 'transactions';
    await refresh(true);
    markImport('done', summary);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    renderImportLine(null);
    showProblem(`The import failed. ${message}`);
    markImport('error');
  } finally {
    if (button instanceof HTMLButtonElement) button.disabled = false;
  }
}

/* -------------------------------------------------------------------- start */

async function start(): Promise<void> {
  byId('ayq-import')?.addEventListener('click', () => void importCamt());
  clearProblem();
  await refresh(true);
}

void start();
