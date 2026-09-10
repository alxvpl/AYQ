// The application shell: the left navigation and the workspace header.
//
// AYQ is a desktop application, not a page. What that means concretely is that
// where you are is always on screen — the sections down the left, the accounts
// under them with what each holds, and a header that says which workspace is
// open and what it is showing. Only the workspace under it is replaced when you
// move around.
//
// Nothing here computes money. The balances are the ones the engine returned in
// its summary; this file formats them and draws them.

import { ayqElement } from './ayq-dom.ts';
import { ayqEuro } from './ayq-format.ts';
import type { AyqAccountSummary } from './ayq-ipc-contract.ts';

export type AyqView =
  | 'transactions'
  | 'plan'
  | 'upcoming'
  | 'spending'
  | 'counterparties'
  | 'recurring'
  | 'rules'
  | 'imports';

/**
 * The primary sections, in the order they are offered.
 *
 * The blurb is the workspace's own second line — what this part of AYQ is for,
 * said once, where a person who has just arrived at it will read it.
 */
export const AYQ_VIEWS: ReadonlyArray<{
  id: AyqView;
  label: string;
  blurb: string;
}> = [
  {
    id: 'transactions',
    label: 'Transactions',
    blurb: 'Every booking, newest first.',
  },
  {
    id: 'plan',
    label: 'Plan',
    blurb: 'What each category is meant to take this month, and what it has.',
  },
  {
    id: 'upcoming',
    label: 'Upcoming',
    blurb: 'What is coming, and where it leaves the money.',
  },
  {
    id: 'spending',
    label: 'Spending',
    blurb: 'What the money went on, by category.',
  },
  {
    id: 'counterparties',
    label: 'Counterparties',
    blurb: 'Who the money went to, and what AYQ knows them by.',
  },
  {
    id: 'recurring',
    label: 'Recurring',
    blurb: 'What comes back, and when it is next due.',
  },
  {
    id: 'rules',
    label: 'Rules',
    blurb: 'Standing decisions about counterparties, and the categories.',
  },
  {
    id: 'imports',
    label: 'Imports',
    blurb: 'Every statement AYQ has read, and what it did with it.',
  },
];

/** What the navigation needs to know, all of it read from state it does not own. */
export type AyqNavigation = {
  view: AyqView;
  accounts: AyqAccountSummary[];
  /** The account the ledger is filtered to; null is all of them. */
  accountId: string | null;
};

export type AyqNavigationActions = {
  openView(view: AyqView): void;
  /** null means every account. */
  openAccount(accountId: string | null): void;
};

/**
 * Draws the left navigation.
 *
 * The account rows show a selection only while the ledger is what is open,
 * because the account is the ledger's filter and nothing else's. Choosing one
 * from any workspace opens the ledger — that is what the row is an offer of.
 */
export function ayqRenderNavigation(
  nav: AyqNavigation,
  sections: HTMLElement,
  accounts: HTMLElement,
  actions: AyqNavigationActions,
): void {
  sections.replaceChildren();
  for (const view of AYQ_VIEWS) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = view.id === nav.view ? 'nav-item current' : 'nav-item';
    item.textContent = view.label;
    item.dataset.ayqTab = view.id;
    if (view.id === nav.view) item.setAttribute('aria-current', 'page');
    item.addEventListener('click', () => actions.openView(view.id));
    sections.append(item);
  }

  accounts.replaceChildren(ayqElement('h3', 'nav-heading', 'Accounts'));

  const ledgerOpen = nav.view === 'transactions';

  const all = document.createElement('button');
  all.type = 'button';
  const allCurrent = ledgerOpen && nav.accountId === null;
  all.className = allCurrent ? 'nav-item current' : 'nav-item';
  all.dataset.ayqAccount = '';
  all.textContent = 'All accounts';
  if (allCurrent) all.setAttribute('aria-current', 'true');
  all.addEventListener('click', () => actions.openAccount(null));
  accounts.append(all);

  if (nav.accounts.length === 0) {
    accounts.append(
      ayqElement(
        'p',
        'nav-empty',
        'No account yet. Importing a statement makes one.',
      ),
    );
    return;
  }

  for (const account of nav.accounts) {
    const item = document.createElement('button');
    item.type = 'button';
    const current = ledgerOpen && account.id === nav.accountId;
    item.className = current ? 'nav-account current' : 'nav-account';
    item.dataset.ayqAccount = account.id;
    if (current) item.setAttribute('aria-current', 'true');
    item.append(
      ayqElement('span', 'nav-account-name', account.name),
      // The engine's own figure. The renderer knows how to print a number of
      // cents and nothing else about it.
      ayqElement(
        'span',
        `nav-account-balance ${account.balanceCents < 0 ? 'out' : 'in'}`,
        ayqEuro(account.balanceCents),
      ),
    );
    item.title = `${account.name} — ${account.transactionCount} transactions`;
    item.addEventListener('click', () => actions.openAccount(account.id));
    accounts.append(item);
  }
}

/** What the header says it is showing. */
export type AyqWorkspace = {
  view: AyqView;
  /** The account the ledger is filtered to, already looked up. */
  account: AyqAccountSummary | null;
  /** Transactions the open ledger matched, when it has answered. */
  matched: number | null;
};

/**
 * Draws the workspace header: what is open, and what it is showing.
 *
 * With an account chosen the ledger's title is that account, because that is
 * what the workspace now is; the line under it says so is the ledger and offers
 * the way back to all of them.
 */
export function ayqRenderWorkspaceHeader(
  workspace: AyqWorkspace,
  title: HTMLElement,
  context: HTMLElement,
  allAccounts: () => void,
): void {
  const section =
    AYQ_VIEWS.find(view => view.id === workspace.view) ?? AYQ_VIEWS[0];
  const account = workspace.view === 'transactions' ? workspace.account : null;

  title.textContent = account === null ? section.label : account.name;

  context.replaceChildren();
  if (account === null) {
    context.append(ayqElement('span', 'context-note', section.blurb));
    if (workspace.view === 'transactions' && workspace.matched !== null) {
      context.append(
        ayqElement(
          'span',
          'context-note',
          `${workspace.matched} matching this view`,
        ),
      );
    }
    return;
  }

  context.append(
    ayqElement('span', 'context-note', 'Transactions'),
    ayqElement('span', 'context-note', ayqEuro(account.balanceCents)),
    ayqElement(
      'span',
      'context-note',
      workspace.matched === null
        ? `${account.transactionCount} in this account`
        : `${workspace.matched} of ${account.transactionCount} in this account`,
    ),
  );

  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'quiet small';
  back.textContent = 'All accounts';
  back.addEventListener('click', () => allAccounts());
  context.append(back);
}
