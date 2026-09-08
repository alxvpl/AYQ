// The first AYQ screen.
//
// Deliberately almost nothing: it asks the engine one question and shows the
// answer. What it proves is the architecture — a renderer of our own, no Actual
// UI, no Actual import, one typed call across the boundary — not a design.

import { ayqAsk } from './ayq-bridge.ts';
import type {
  AyqEngineStatus,
  AyqImportSummary,
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

function renderStatus(status: AyqEngineStatus): void {
  const target = document.getElementById('ayq-body');
  if (!target) return;
  target.replaceChildren();

  const facts: Array<[string, string]> = [
    ['Engine', `@actual-app/api ${status.apiVersion}`],
    ['Host', status.engineHost],
    ['Budget', `${status.budgetName} (${status.budgetId})`],
    ['Transactions', String(status.transactionCount)],
    ['Answered', status.answeredAt],
  ];

  const table = element('dl', 'facts');
  for (const [label, value] of facts) {
    table.append(element('dt', undefined, label), element('dd', undefined, value));
  }
  target.append(table);

  target.append(element('h2', undefined, 'Accounts'));
  const list = element('ul', 'accounts');
  for (const account of status.accounts) {
    const row = element('li');
    row.append(element('span', 'name', account.name));
    row.append(element('span', 'amount', euro(account.balanceCents)));
    list.append(row);
  }
  target.append(list);

  if (status.budgetCreated) {
    target.append(
      element(
        'p',
        'note',
        'This budget did not exist before this launch; the engine created it.',
      ),
    );
  }
}

function renderError(message: string): void {
  const target = document.getElementById('ayq-body');
  if (!target) return;
  target.replaceChildren(element('pre', 'error', message));
}

/**
 * The smoke run reads these attributes to decide whether the slice worked, so
 * they are set from the outcome and never optimistically. The engine host is
 * published too: the production acceptance test has to be able to prove which
 * process answered, not take the screen's word for it.
 */
function markState(state: 'ready' | 'error', engineHost?: string): void {
  document.body.dataset.ayqState = state;
  if (engineHost !== undefined) document.body.dataset.ayqEngineHost = engineHost;
}

/**
 * Imports a CAMT.053 file.
 *
 * Two calls, both across the same channel: the host opens the native picker
 * and answers with a path, then the engine reads that path. The renderer never
 * touches the filesystem — it has none — and never parses anything. It asks,
 * and it shows what came back.
 */
async function importCamt(): Promise<void> {
  const button = document.getElementById('ayq-import');
  if (button instanceof HTMLButtonElement) button.disabled = true;
  markImport('working');
  renderImport(element('p', 'waiting', 'Waiting for a file…'));

  try {
    const picked = await ayqAsk({ kind: 'import.pick' });
    if (!picked.ok) throw new Error(picked.message);
    if (picked.kind !== 'import.pick') throw new Error('the host answered the wrong request');

    const path = picked.result.path;
    if (path === null) {
      renderImport(element('p', 'note', 'No file chosen; nothing was imported.'));
      markImport('cancelled');
      return;
    }

    renderImport(element('p', 'waiting', 'Reading and importing…'));
    const done = await ayqAsk({ kind: 'import.camt', path });
    if (!done.ok) throw new Error(done.message);
    if (done.kind !== 'import.camt') throw new Error('the engine answered the wrong request');

    renderSummary(done.result);

    // The counts came from the engine; the screen above them is now stale.
    // Refreshed before the import is called done, so that nothing — a person
    // clicking twice, or the acceptance run doing the same — starts a second
    // import while this one still has a question outstanding.
    await refreshStatus();
    markImport('done', done.result);
  } catch (error) {
    renderImport(element('pre', 'error', String(error)));
    markImport('error');
  } finally {
    if (button instanceof HTMLButtonElement) button.disabled = false;
  }
}

function renderImport(node: HTMLElement): void {
  document.getElementById('ayq-import-result')?.replaceChildren(node);
}

/** The result, as counts. Nothing from the statement itself is shown. */
function renderSummary(summary: AyqImportSummary): void {
  const facts: Array<[string, string]> = [
    ['File', summary.file],
    ['Documents', String(summary.files)],
    ['Imported', String(summary.imported)],
    ['Duplicates', String(summary.duplicates)],
    ['Skipped', String(summary.skipped)],
    ['Failed', String(summary.failed)],
    ['Account', summary.accountName],
    ['Budget', summary.budgetName],
    ['Transactions now', String(summary.transactionCountAfter)],
  ];

  const table = element('dl', 'facts');
  for (const [label, value] of facts) {
    table.append(element('dt', undefined, label), element('dd', undefined, value));
  }
  renderImport(table);
}

/**
 * Published for the same reason the engine host is: the acceptance run has to
 * be able to prove what the import did, from the outcome rather than from the
 * screen's optimism. Counts only, which is all the summary carries.
 */
function markImport(
  state: 'working' | 'done' | 'cancelled' | 'error',
  summary?: AyqImportSummary,
): void {
  document.body.dataset.ayqImportState = state;
  if (summary) document.body.dataset.ayqImportSummary = JSON.stringify(summary);
}

async function refreshStatus(): Promise<void> {
  const answer = await ayqAsk({ kind: 'engine.status' });
  if (answer.ok && answer.kind === 'engine.status') {
    renderStatus(answer.result);
    markState('ready', answer.result.engineHost);
  }
}

async function start(): Promise<void> {
  document.getElementById('ayq-import')?.addEventListener('click', () => {
    void importCamt();
  });

  try {
    const answer = await ayqAsk({ kind: 'engine.status' });
    if (answer.ok && answer.kind === 'engine.status') {
      renderStatus(answer.result);
      markState('ready', answer.result.engineHost);
    } else {
      renderError(
        answer.ok ? 'the engine answered the wrong request' : answer.message,
      );
      markState('error');
    }
  } catch (error) {
    renderError(String(error));
    markState('error');
  }
}

void start();
