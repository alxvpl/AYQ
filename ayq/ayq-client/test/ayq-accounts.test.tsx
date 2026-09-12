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

import type { AyqAccountsView } from '../src/ayq-ipc-contract.ts';
import { AyqAccountsScreen } from '../src/ayq-screens/ayq-accounts.tsx';
import { AyqSettingsAccounts } from '../src/ayq-screens/ayq-settings-accounts.tsx';
import { ayqDate, ayqMoney, ayqText } from '../src/ayq-strings.ts';
import { AyqGroundProvider } from '../src/ayq-ui/ayq-ground-provider.tsx';
import { ayqOpenWindow, ayqPress } from './ayq-react.ts';

const EVERYDAY = {
  id: 'acc-1',
  name: 'AYQ NL…3579',
  balanceCents: 128450,
  transactionCount: 212,
  countsTowardFunds: true,
};

const JOINT = {
  id: 'acc-2',
  name: 'AYQ NL…9052',
  balanceCents: 41200,
  transactionCount: 40,
  countsTowardFunds: true,
};

const SAVINGS = {
  id: 'acc-3',
  name: 'AYQ NL…3310',
  balanceCents: 900000,
  transactionCount: 4,
  countsTowardFunds: false,
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

test('Settings keeps only the switch, and it reaches the engine', async () => {
  const window = await ayqOpenWindow(engine(VIEW));
  let changed = 0;
  let opened = 0;
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
      ayqText('accounts.column.balance'),
    ],
    'Settings shows more than the switch it is supposed to keep',
  );

  await ayqPress(window.container.querySelector('[data-ayq-funds-switch="acc-3"]'));
  const sent = window.asked.filter(one => one.kind === 'accounts.setFlag');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].accountId, 'acc-3');
  assert.equal(sent[0].countsTowardFunds, true);
  assert.equal(changed, 1, 'available funds changed and the shell was told');

  // And it points at the screen that holds the rest (03 §8).
  await ayqPress(window.container.querySelector('[data-ayq-action="open-accounts"]'));
  assert.equal(opened, 1);

  await window.close();
});
