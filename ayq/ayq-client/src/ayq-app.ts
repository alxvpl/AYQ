// The AYQ screen.
//
// A ledger and one action. What the person came for is the list of their own
// transactions, so that is the page; which process answered and which version
// of the engine it was are true, useful, and a footnote.
//
// Everything here is drawing. The rows are the engine's, the counterparty on
// each row is the one the CAMT resolver decided at import time, and the totals
// are counted by the engine's own query language. The renderer computes no
// money.

import { ayqAsk } from './ayq-bridge.ts';
import type {
  AyqEngineStatus,
  AyqImportSummary,
  AyqLedger,
  AyqLedgerRow,
} from './ayq-ipc-contract.ts';

const euro = (cents: number): string =>
  (cents / 100).toLocaleString('nl-NL', {
    style: 'currency',
    currency: 'EUR',
  });

function element(tag: string, className?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function body(): HTMLElement | null {
  return document.getElementById('ayq-body');
}

/**
 * What an empty AYQ says.
 *
 * A new budget is genuinely empty — no invented account, no invented entries —
 * so the screen has to say what is true and what to do about it, and the button
 * that does it is already in the bar above.
 */
function renderEmpty(): void {
  const target = body();
  if (!target) return;

  target.replaceChildren(
    element('p', 'empty-title', 'No transactions yet.'),
    element(
      'p',
      'empty-body',
      'Import a CAMT.053 statement from your bank — an .xml file or a .zip of ' +
        'them — and it will appear here. Nothing leaves this machine.',
    ),
  );
}

function renderLedger(ledger: AyqLedger): void {
  const target = body();
  if (!target) return;

  if (ledger.rows.length === 0) {
    renderEmpty();
    return;
  }

  const table = element('table', 'ledger');

  const headRow = element('tr');
  const columns: Array<[string, string]> = [
    ['Date', 'col-date'],
    ['Counterparty', 'col-payee'],
    ['Account', 'col-account'],
    ['Amount', 'col-amount'],
  ];
  for (const [label, className] of columns) {
    headRow.append(element('th', className, label));
  }
  const head = element('thead');
  head.append(headRow);
  table.append(head);

  const rows = element('tbody');
  for (const row of ledger.rows) rows.append(renderRow(row));
  table.append(rows);

  target.replaceChildren(table);
  target.append(
    element(
      'p',
      'ledger-count',
      ledger.shown === ledger.total
        ? `${ledger.total} transactions`
        : `${ledger.shown} of ${ledger.total} transactions`,
    ),
  );
}

function renderRow(row: AyqLedgerRow): HTMLElement {
  const line = element('tr', row.amountCents < 0 ? 'out' : 'in');
  line.append(element('td', 'col-date', row.date));
  // The resolved counterparty, never the bank's raw string: that is the whole
  // point of the resolver, and the raw string stays in the record.
  line.append(element('td', 'col-payee', row.payee ?? 'Unknown'));
  line.append(element('td', 'col-account', row.account));
  line.append(element('td', 'col-amount', euro(row.amountCents)));
  return line;
}

/** The engine's own particulars, kept to a footnote rather than a screen. */
function renderEngineNote(status: AyqEngineStatus): void {
  const note = document.getElementById('ayq-engine-note');
  if (!note) return;
  note.textContent =
    `${status.budgetName} · @actual-app/api ${status.apiVersion} · ` +
    `${status.engineHost}`;
}

function renderError(message: string): void {
  body()?.replaceChildren(element('pre', 'error', message));
}

function renderImport(node: HTMLElement | null): void {
  const target = document.getElementById('ayq-import-result');
  if (!target) return;
  if (node === null) target.replaceChildren();
  else target.replaceChildren(node);
}

/** The result of an import, as counts. Nothing from the statement itself. */
function renderSummary(summary: AyqImportSummary): void {
  const line =
    `${summary.file}: ${summary.imported} imported, ` +
    `${summary.duplicates} already there` +
    (summary.skipped > 0 ? `, ${summary.skipped} skipped` : '') +
    (summary.failed > 0 ? `, ${summary.failed} failed` : '') +
    ` — ${summary.accountName}`;
  renderImport(element('p', 'import-done', line));
}

/**
 * The outcome, published for the acceptance run.
 *
 * It has to be able to prove what happened from the result rather than from the
 * screen's optimism, so state and counts are set from the answers — never
 * before them.
 */
function markState(state: 'ready' | 'error', engineHost?: string): void {
  document.body.dataset.ayqState = state;
  if (engineHost !== undefined) document.body.dataset.ayqEngineHost = engineHost;
}

function markLedger(ledger: AyqLedger): void {
  document.body.dataset.ayqLedgerTotal = String(ledger.total);
  document.body.dataset.ayqLedgerRows = String(ledger.rows.length);
}

function markImport(
  state: 'working' | 'done' | 'cancelled' | 'error',
  summary?: AyqImportSummary,
): void {
  document.body.dataset.ayqImportState = state;
  if (summary) document.body.dataset.ayqImportSummary = JSON.stringify(summary);
}

async function loadLedger(): Promise<void> {
  const answer = await ayqAsk({ kind: 'transactions.list' });
  if (!answer.ok) throw new Error(answer.message);
  if (answer.kind !== 'transactions.list') {
    throw new Error('the engine answered the wrong request');
  }
  renderLedger(answer.result);
  markLedger(answer.result);
}

async function loadStatus(): Promise<void> {
  const answer = await ayqAsk({ kind: 'engine.status' });
  if (!answer.ok) throw new Error(answer.message);
  if (answer.kind !== 'engine.status') {
    throw new Error('the engine answered the wrong request');
  }
  renderEngineNote(answer.result);
  markState('ready', answer.result.engineHost);
}

/**
 * Imports a CAMT.053 file.
 *
 * Two calls, both across the same channel: the host opens the native picker and
 * answers with a path, then the engine reads that path. The renderer never
 * touches the filesystem — it has none — and never parses anything. It asks,
 * shows what came back, and reloads the ledger it just changed.
 */
async function importCamt(): Promise<void> {
  const button = document.getElementById('ayq-import');
  if (button instanceof HTMLButtonElement) button.disabled = true;
  markImport('working');
  renderImport(element('p', 'waiting', 'Waiting for a file…'));

  try {
    const picked = await ayqAsk({ kind: 'import.pick' });
    if (!picked.ok) throw new Error(picked.message);
    if (picked.kind !== 'import.pick') {
      throw new Error('the host answered the wrong request');
    }

    const path = picked.result.path;
    if (path === null) {
      renderImport(element('p', 'muted', 'No file chosen; nothing was imported.'));
      markImport('cancelled');
      return;
    }

    renderImport(element('p', 'waiting', 'Reading and importing…'));
    const done = await ayqAsk({ kind: 'import.camt', path });
    if (!done.ok) throw new Error(done.message);
    if (done.kind !== 'import.camt') {
      throw new Error('the engine answered the wrong request');
    }

    renderSummary(done.result);

    // The ledger is what just changed, so it is reloaded before the import is
    // called done — a person sees their transactions without asking twice, and
    // nothing starts a second import while this one still has a question out.
    await loadLedger();
    markImport('done', done.result);
  } catch (error) {
    renderImport(element('pre', 'error', String(error)));
    markImport('error');
  } finally {
    if (button instanceof HTMLButtonElement) button.disabled = false;
  }
}

async function start(): Promise<void> {
  document.getElementById('ayq-import')?.addEventListener('click', () => {
    void importCamt();
  });

  try {
    await loadStatus();
    await loadLedger();
  } catch (error) {
    renderError(String(error));
    markState('error');
  }
}

void start();
