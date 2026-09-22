// Accounts, coverage and reconciliation on the screen (03 §8).
//
// What is being checked is that the screen states the comparison and never
// more than it: a difference is said in figures, nothing is offered that would
// close it by writing into the ledger, and the reliability boundary is the
// earliest date among the counted accounts rather than the latest.
//
// Every account, amount and date below is invented.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type {
  AyqAccountSummary,
  AyqAccountsView,
  AyqBalanceAnchorView,
} from '../src/ayq-ipc-contract.ts';
import { AyqAccountsScreen } from '../src/ayq-screens/ayq-accounts.tsx';
import { AyqSettingsAccounts } from '../src/ayq-screens/ayq-settings-accounts.tsx';
import { ayqDate, ayqMoney, ayqText } from '../src/ayq-strings.ts';
import { AyqGroundProvider } from '../src/ayq-ui/ayq-ground-provider.tsx';
import { ayqOpenWindow, ayqPress } from './ayq-react.ts';

/** A bank-stated anchor, which is what a statement with a closing balance makes. */
function anchor(
  amountCents: number,
  coverageDate: string,
  source: 'bank' | 'manual' = 'bank',
): AyqBalanceAnchorView {
  return { amountCents, coverageDate, source, createdAt: `${coverageDate}T09:00:00.000Z` };
}

const EVERYDAY: AyqAccountSummary = {
  id: 'acc-1',
  name: 'AYQ NL…3579',
  balanceCents: 128450,
  transactionCount: 212,
  countsTowardFunds: true,
  anchor: anchor(128450, '2026-09-11'),
  anchorHistory: [anchor(128450, '2026-09-11')],
  lastImportAt: '2026-09-11T09:14:00.000Z',
  bankDataThrough: '2026-09-11',
  reconciliation: {
    asOf: '2026-09-11',
    statementBalanceCents: 128450,
    ledgerBalanceCents: 128450,
    differenceCents: 0,
    agrees: true,
    file: 'ayq-invented-2026-09-11.xml',
    readAt: '2026-09-11T09:14:00.000Z',
  },
};

const JOINT: AyqAccountSummary = {
  id: 'acc-2',
  name: 'AYQ NL…9052',
  balanceCents: 41200,
  transactionCount: 40,
  countsTowardFunds: true,
  anchor: anchor(41200, '2026-08-31', 'manual'),
  anchorHistory: [anchor(41200, '2026-08-31', 'manual')],
  lastImportAt: '2026-09-01T09:14:00.000Z',
  bankDataThrough: '2026-08-31',
  reconciliation: {
    asOf: '2026-08-31',
    statementBalanceCents: 60000,
    ledgerBalanceCents: 41200,
    differenceCents: 18800,
    agrees: false,
    file: 'ayq-invented-2026-08-31.xml',
    readAt: '2026-09-01T09:14:00.000Z',
  },
};

const SAVINGS: AyqAccountSummary = {
  id: 'acc-3',
  name: 'AYQ NL…3310',
  balanceCents: 900000,
  transactionCount: 4,
  countsTowardFunds: false,
  anchor: anchor(900000, '2026-06-30'),
  anchorHistory: [anchor(900000, '2026-06-30')],
  lastImportAt: null,
  bankDataThrough: null,
  reconciliation: null,
};

const VIEW: AyqAccountsView = {
  accounts: [EVERYDAY, JOINT, SAVINGS],
  coverage: [
    {
      accountId: 'acc-1',
      toDate: '2026-09-11',
      statementBalanceCents: 128450,
      ledgerBalanceCents: 128450,
      differenceCents: 0,
      agrees: true,
      file: 'ayq-invented-2026-09-11.xml',
      readAt: '2026-09-11T09:14:00.000Z',
    },
    {
      accountId: 'acc-2',
      toDate: '2026-08-31',
      statementBalanceCents: 60000,
      ledgerBalanceCents: 41200,
      differenceCents: 18800,
      agrees: false,
      file: 'ayq-invented-2026-08-31.xml',
      readAt: '2026-09-01T09:14:00.000Z',
    },
    {
      accountId: 'acc-3',
      toDate: null,
      statementBalanceCents: null,
      ledgerBalanceCents: 900000,
      differenceCents: null,
      agrees: null,
      file: null,
      readAt: null,
    },
  ],
  availableFundsCents: 169650,
  totalBalanceCents: 1069650,
  // The earliest of the two counted accounts, not the latest.
  reliableTo: '2026-08-31',
  countedWithoutCoverage: 0,
  countedWithoutAnchor: 0,
};

const screen = (
  <AyqGroundProvider>
    <AyqAccountsScreen onFailure={message => {
      throw new Error(message);
    }} round={0} />
  </AyqGroundProvider>
);

function engine(view: AyqAccountsView) {
  return (request: Record<string, unknown>): unknown => {
    if (request.kind === 'accounts.view') return view;
    if (request.kind === 'settings.get' || request.kind === 'settings.set') {
      return { ground: 'light' };
    }
    if (request.kind === 'accounts.list') return view.accounts;
    if (request.kind === 'accounts.setFlag') {
      return view.accounts.map(account =>
        account.id === request.accountId
          ? { ...account, countsTowardFunds: request.countsTowardFunds }
          : account,
      );
    }
    return undefined;
  };
}

test('each account says how far its statements reach and whether AYQ agrees', async () => {
  const window = await ayqOpenWindow(engine(VIEW));
  await window.render(screen);

  const rows = window.container.querySelectorAll(
    '[data-ayq-table="accounts"] tbody tr',
  );
  assert.equal(rows.length, 3);

  const said = (index: number, cell: string): string =>
    rows[index].querySelector(`[data-ayq-cell="${cell}"]`)?.textContent ?? '';

  assert.equal(said(0, 'statements'), ayqDate('2026-09-11'));
  assert.equal(said(0, 'agrees'), ayqText('accounts.agrees.yes'));

  // A difference is stated as an amount, not as a warning with no figure in it.
  assert.equal(
    said(1, 'agrees'),
    ayqText('accounts.agrees.no', { amount: ayqMoney(18800) }),
  );

  // An account with nothing imported has nothing to compare, which is not the
  // same as disagreeing.
  assert.equal(said(2, 'statements'), ayqText('accounts.statements.none'));
  assert.equal(said(2, 'agrees'), ayqText('accounts.agrees.unknown'));

  // Whether it counts toward available funds is shown here and changed in
  // Settings (03 §7.6).
  assert.equal(said(0, 'counts'), ayqText('accounts.counts.yes'));
  assert.equal(said(2, 'counts'), ayqText('accounts.counts.no'));

  await window.close();
});

test('the reliability boundary is the earliest counted account, not the latest', async () => {
  const window = await ayqOpenWindow(engine(VIEW));
  await window.render(screen);

  const line = window.container.querySelector('[data-ayq-reliable-to]');
  assert.ok(line);
  assert.equal(line.getAttribute('data-ayq-reliable-to'), '2026-08-31');
  assert.match(line.textContent ?? '', new RegExp(ayqDate('2026-08-31')));
  // The later of the two counted dates must not be what a person is told to
  // rely on (03 §8.4).
  assert.ok(
    !(line.textContent ?? '').includes(ayqDate('2026-09-11')),
    'the screen offered the latest date as the boundary',
  );

  await window.close();
});

test('a counted account with no statement leaves no date to rely on', async () => {
  const window = await ayqOpenWindow(
    engine({
      ...VIEW,
      accounts: [EVERYDAY, { ...SAVINGS, countsTowardFunds: true }],
      coverage: [VIEW.coverage[0], VIEW.coverage[2]],
      reliableTo: null,
      countedWithoutCoverage: 1,
    }),
  );
  await window.render(screen);

  const line = window.container.querySelector('[data-ayq-reliable-to]');
  assert.equal(line?.getAttribute('data-ayq-reliable-to'), '');
  assert.match(line?.textContent ?? '', /no statement at all/);

  await window.close();
});

test('the difference is stated, and nothing is offered that would close it', async () => {
  const window = await ayqOpenWindow(engine(VIEW));
  await window.render(screen);

  await ayqPress(
    window.container.querySelector('[data-ayq-table="accounts"] tbody tr[data-ayq-row="acc-2"]'),
  );

  const pane = window.container.querySelector('[data-ayq-account-detail="acc-2"]');
  assert.ok(pane, 'no detail pane opened');
  const said = pane.textContent ?? '';

  assert.ok(
    pane.querySelector('[data-ayq-difference="18800"]'),
    'the exact difference is not on the screen',
  );
  assert.match(said, /does not say which statement is missing/);
  assert.match(said, /no adjustment, no balancing entry/);
  // 03 §8.6: it informs and gates nothing.
  assert.match(said, /gates nothing/);

  // 03 §8.3 and §8.5: there is nothing here to accept, dismiss, adjust or mark
  // as reconciled, because reconciliation is not a decision.
  const actions = [...pane.querySelectorAll('button')].map(
    one => one.textContent?.toLowerCase() ?? '',
  );
  for (const forbidden of ['adjust', 'reconcile', 'accept', 'dismiss', 'fix']) {
    assert.ok(
      !actions.some(label => label.includes(forbidden)),
      `the pane offers to ${forbidden} a difference`,
    );
  }

  await window.close();
});

test('the totals are available funds and what is held in total', async () => {
  const window = await ayqOpenWindow(engine(VIEW));
  await window.render(screen);

  const totals = window.container.querySelector('[data-ayq-account-totals]');
  assert.ok(totals);
  const said = totals.textContent ?? '';
  assert.match(said, /2 of 3 accounts/);
  assert.ok(said.includes(ayqMoney(VIEW.availableFundsCents)));
  assert.ok(said.includes(ayqMoney(VIEW.totalBalanceCents)));

  await window.close();
});

test('the detail states each fact under its own label, and the two dates apart', async () => {
  const window = await ayqOpenWindow(engine(VIEW));
  await window.render(screen);
  const rows = window.container.querySelectorAll(
    '[data-ayq-table="accounts"] tbody tr',
  );
  await ayqPress(rows[1]);
  const detail = window.container.querySelector('[data-ayq-account-detail="acc-2"]');
  assert.ok(detail, 'the account did not open');

  const fact = (mark: string): Element | null =>
    detail.querySelector(`[data-ayq-detail-${mark}]`);
  assert.equal(fact('counts')?.textContent, ayqText('accounts.counts.yes'));
  assert.equal(fact('statements')?.textContent, ayqDate('2026-08-31'));

  // Last successful import and bank data through are two facts, and stay two
  // elements even here, where they fall one day apart.
  const lastImport = fact('last-import');
  const bankThrough = fact('bank-through');
  assert.ok(lastImport && bankThrough);
  assert.notEqual(lastImport, bankThrough);
  assert.equal(lastImport.getAttribute('data-ayq-detail-last-import'), '2026-09-01T09:14:00.000Z');
  assert.equal(bankThrough.getAttribute('data-ayq-detail-bank-through'), '2026-08-31');
  assert.equal(bankThrough.textContent, ayqDate('2026-08-31'));

  // The balance rests on its anchor, and the anchor says whose it is.
  assert.equal(fact('balance')?.getAttribute('data-ayq-detail-balance'), '41200');
  assert.equal(
    detail.querySelector('[data-ayq-anchor-source]')?.getAttribute('data-ayq-anchor-source'),
    'manual',
  );

  // Nothing here configures the account: the switch is Settings' alone.
  assert.equal(detail.querySelector('[data-ayq-funds-switch]'), null);
  await window.close();
});

test('with no anchor the balance is Unknown and setting one is offered', async () => {
  const bare: AyqAccountSummary = {
    ...SAVINGS,
    balanceCents: null,
    anchor: null,
    anchorHistory: [],
  };
  const window = await ayqOpenWindow(
    engine({ ...VIEW, accounts: [EVERYDAY, JOINT, bare] }),
  );
  await window.render(screen);
  const rows = window.container.querySelectorAll(
    '[data-ayq-table="accounts"] tbody tr',
  );
  await ayqPress(rows[2]);
  const detail = window.container.querySelector('[data-ayq-account-detail="acc-3"]');
  assert.ok(detail);
  assert.equal(
    detail.querySelector('[data-ayq-detail-balance]')?.getAttribute('data-ayq-detail-balance'),
    'unknown',
    'four imported movements are not a balance',
  );
  assert.ok(detail.querySelector('[data-ayq-no-anchor]'));
  assert.equal(
    detail.querySelector('[data-ayq-action="account-anchor"]')?.textContent,
    ayqText('balance.set.title'),
  );
  assert.equal(
    detail.querySelector('[data-ayq-detail-statements]')?.textContent,
    ayqText('accounts.statements.none'),
  );
  await window.close();
});

test('Settings keeps only the switch, and it reaches the engine', async () => {
  const window = await ayqOpenWindow(engine(VIEW));
  let changed = 0;
  let opened = 0;
  const openedOne: string[] = [];
  await window.render(
    <AyqGroundProvider>
      <AyqSettingsAccounts
        onFailure={message => {
          throw new Error(message);
        }}
        onChanged={() => {
          changed += 1;
        }}
        onOpenAccounts={() => {
          opened += 1;
        }}
        onOpenAccount={accountId => {
          openedOne.push(accountId);
        }}
      />
    </AyqGroundProvider>,
  );

  const columns = [
    ...window.container.querySelectorAll('[data-ayq-table="settings-accounts"] thead th'),
  ].map(one => one.textContent);
  assert.deepEqual(
    columns,
    [
      ayqText('accounts.column.name'),
      ayqText('accounts.column.counts'),
      ayqText('accounts.column.details'),
    ],
    'Settings shows more than the switch it is supposed to keep',
  );
  // No operational evidence here: not a balance, not a date, not a verdict.
  assert.equal(
    window.container.querySelector('[data-ayq-table="settings-accounts"] [data-ayq-figure]'),
    null,
    'a balance is operational evidence and belongs on the Accounts screen (A34)',
  );
  assert.ok(
    !(window.container.querySelector('[data-ayq-table="settings-accounts"]')?.textContent ?? '')
      .includes(ayqMoney(EVERYDAY.balanceCents ?? 0)),
  );

  await ayqPress(window.container.querySelector('[data-ayq-funds-switch="acc-3"]'));
  const sent = window.asked.filter(one => one.kind === 'accounts.setFlag');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].accountId, 'acc-3');
  assert.equal(sent[0].countsTowardFunds, true);
  assert.equal(changed, 1, 'available funds changed and the shell was told');

  // And it points at the screen that holds the rest (03 §8) — for one
  // account, and for all of them.
  await ayqPress(window.container.querySelector('[data-ayq-action="open-account-acc-2"]'));
  assert.deepEqual(openedOne, ['acc-2']);
  await ayqPress(window.container.querySelector('[data-ayq-action="open-accounts"]'));
  assert.equal(opened, 1);

  await window.close();
});
