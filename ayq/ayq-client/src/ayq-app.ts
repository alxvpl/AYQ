// The first AYQ screen.
//
// Deliberately almost nothing: it asks the engine one question and shows the
// answer. What it proves is the architecture — a renderer of our own, no Actual
// UI, no Actual import, one typed call across the boundary — not a design.

import { ayqAsk } from './ayq-bridge.ts';
import type { AyqEngineStatus } from './ayq-ipc-contract.ts';

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

async function start(): Promise<void> {
  try {
    const answer = await ayqAsk('engine.status');
    if (answer.ok) {
      renderStatus(answer.result);
      markState('ready', answer.result.engineHost);
    } else {
      renderError(answer.message);
      markState('error');
    }
  } catch (error) {
    renderError(String(error));
    markState('error');
  }
}

void start();
