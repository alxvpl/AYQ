// The application shell, exercised against a real document.
//
// What is being checked here is information architecture rather than looks:
// that the accounts a person sees are the ones the engine reported, that
// choosing one narrows the ledger to it and says so, that there is a way back
// to all of them, and that the five workspaces are still reachable.
//
// Every account, balance and name in this file is invented. Nothing about
// anybody's bank belongs in a test.

import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import { ayqEuro } from '../src/ayq-format.ts';
import type { AyqAccountSummary } from '../src/ayq-ipc-contract.ts';
import {
  AYQ_VIEWS,
  type AyqView,
  ayqRenderNavigation,
  ayqRenderWorkspaceHeader,
} from '../src/ayq-shell.ts';
import {
  ayqEmptyTransactionsState,
  ayqRenderTransactions,
  ayqSelectAccount,
  type AyqTransactionsState,
} from '../src/ayq-transactions.ts';
import { ayqClick, ayqOpenShell, type AyqShellElements } from './ayq-jsdom.ts';

/** Two invented accounts, one of them overdrawn so the sign is exercised. */
const ACCOUNTS: AyqAccountSummary[] = [
  {
    id: 'acc-everyday',
    name: 'Everyday current',
    balanceCents: 128450,
    transactionCount: 212,
  },
  {
    id: 'acc-rainy',
    name: 'Rainy day savings',
    balanceCents: -4200,
    transactionCount: 8,
  },
];

let shell: AyqShellElements;
let state: AyqTransactionsState;

beforeEach(async () => {
  shell = await ayqOpenShell();
  state = ayqEmptyTransactionsState();
  state.accounts = ACCOUNTS;
});

/**
 * Draws the navigation the way the shell does, wired to the real decisions.
 *
 * The account handler is the application's own — `ayqSelectAccount` — rather
 * than a stand-in, so what these tests observe is what a click does in the
 * product and not what a test author thought it did.
 */
function drawNavigation(view: AyqView): { opened: AyqView[] } {
  const opened: AyqView[] = [];
  ayqRenderNavigation(
    {
      view,
      accounts: ACCOUNTS,
      accountId: state.filter.accountId ?? null,
    },
    shell.sections,
    shell.accounts,
    {
      openView: next => opened.push(next),
      openAccount: accountId => ayqSelectAccount(state, accountId),
    },
  );
  return { opened };
}

function accountButton(id: string): Element | null {
  return shell.accounts.querySelector(`[data-ayq-account="${id}"]`);
}

test('the accounts section is drawn from the engine account summaries', () => {
  drawNavigation('transactions');

  const rows = [...shell.accounts.querySelectorAll('.nav-account')];
  assert.equal(rows.length, ACCOUNTS.length, 'one row per account, no more');

  for (const account of ACCOUNTS) {
    const row = accountButton(account.id);
    assert.ok(row, `${account.name} is missing from the navigation`);
    assert.equal(
      row.querySelector('.nav-account-name')?.textContent,
      account.name,
    );
    // The engine's figure, formatted. Nothing here adds anything up.
    assert.equal(
      row.querySelector('.nav-account-balance')?.textContent,
      ayqEuro(account.balanceCents),
    );
  }

  assert.equal(
    shell.accounts
      .querySelector('[data-ayq-account="acc-rainy"] .nav-account-balance')
      ?.className.includes('out'),
    true,
    'an overdrawn account is not drawn as money coming in',
  );
});

test('an empty budget says so where the accounts would be', () => {
  ayqRenderNavigation(
    { view: 'transactions', accounts: [], accountId: null },
    shell.sections,
    shell.accounts,
    { openView: () => {}, openAccount: () => {} },
  );

  assert.equal(shell.accounts.querySelectorAll('.nav-account').length, 0);
  assert.match(
    shell.accounts.querySelector('.nav-empty')?.textContent ?? '',
    /No account yet/,
  );
});

test('choosing an account filters the ledger to it', () => {
  state.filter = { search: 'bakery', limit: 1500 };
  drawNavigation('transactions');

  ayqClick(accountButton('acc-rainy'), 'the Rainy day savings account');

  assert.equal(state.filter.accountId, 'acc-rainy');
  // Narrowing to an account is a narrowing, not a fresh start.
  assert.equal(state.filter.search, 'bakery');
  // But the page a person had read to belongs to the list they were reading.
  assert.equal(state.filter.limit, undefined);
});

test('the chosen account is the one the shell says is chosen', () => {
  ayqSelectAccount(state, 'acc-rainy');
  drawNavigation('transactions');

  assert.equal(
    accountButton('acc-rainy')?.className.includes('current'),
    true,
    'the chosen account is not marked',
  );
  assert.equal(
    accountButton('acc-everyday')?.className.includes('current'),
    false,
    'an account that was not chosen is marked',
  );
  assert.equal(
    accountButton('')?.className.includes('current'),
    false,
    'all accounts is still marked while one account is chosen',
  );

  ayqRenderWorkspaceHeader(
    {
      view: 'transactions',
      account: ACCOUNTS[1],
      matched: 8,
    },
    shell.title,
    shell.context,
    () => {},
  );

  assert.equal(shell.title.textContent, 'Rainy day savings');
  assert.match(shell.context.textContent ?? '', /8 of 8 in this account/);
  assert.match(shell.context.textContent ?? '', /All accounts/);
});

test('All accounts clears the account filter', () => {
  ayqSelectAccount(state, 'acc-everyday');
  drawNavigation('transactions');
  assert.equal(state.filter.accountId, 'acc-everyday');

  ayqClick(accountButton(''), 'All accounts');

  assert.equal(state.filter.accountId, undefined);

  drawNavigation('transactions');
  assert.equal(accountButton('')?.className.includes('current'), true);
  assert.equal(shell.accounts.querySelectorAll('.current').length, 1);
});

test('the header offers the way back to all accounts', () => {
  ayqSelectAccount(state, 'acc-everyday');
  let asked = 0;
  ayqRenderWorkspaceHeader(
    { view: 'transactions', account: ACCOUNTS[0], matched: 212 },
    shell.title,
    shell.context,
    () => {
      asked += 1;
      ayqSelectAccount(state, null);
    },
  );

  ayqClick(
    shell.context.querySelector('button'),
    'the header All accounts button',
  );

  assert.equal(asked, 1);
  assert.equal(state.filter.accountId, undefined);
});

test('every workspace is reachable from the navigation', () => {
  for (const view of AYQ_VIEWS) {
    const { opened } = drawNavigation('transactions');
    ayqClick(
      shell.sections.querySelector(`[data-ayq-tab="${view.id}"]`),
      view.label,
    );
    assert.deepEqual(opened, [view.id], `${view.label} does not open`);
  }
});

test('the navigation marks the workspace that is open, and only that one', () => {
  for (const view of AYQ_VIEWS) {
    drawNavigation(view.id);
    const current = [...shell.sections.querySelectorAll('.nav-item.current')];
    assert.equal(current.length, 1, `${view.label} did not mark exactly one`);
    assert.equal((current[0] as HTMLElement).dataset.ayqTab, view.id);

    ayqRenderWorkspaceHeader(
      { view: view.id, account: null, matched: null },
      shell.title,
      shell.context,
      () => {},
    );
    assert.equal(shell.title.textContent, view.label);
  }
});

test('the ledger account control and the navigation make the same change', () => {
  ayqRenderTransactions(state, shell.body, () => {});

  const select = shell.body.querySelector('.filters select');
  assert.ok(select, 'the ledger has no account control');
  const control = select as HTMLSelectElement;
  const option = [...control.options].find(
    one => one.textContent === 'Rainy day savings',
  );
  assert.ok(option, 'the ledger does not offer the accounts the engine gave it');

  control.value = option.value;
  control.dispatchEvent(new Event('change', { bubbles: true }));
  assert.equal(state.filter.accountId, 'acc-rainy');

  // And what the navigation chose reads back in the ledger's own control.
  ayqSelectAccount(state, 'acc-everyday');
  ayqRenderTransactions(state, shell.body, () => {});
  const redrawn = shell.body.querySelector('.filters select') as
    | HTMLSelectElement
    | null;
  assert.equal(redrawn?.value, 'acc-everyday');
});
