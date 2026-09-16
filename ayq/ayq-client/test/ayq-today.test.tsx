// Today, in the order 04 A21 fixes.
//
// What you have, how long it lasts, what is waiting on you — and the first
// figure on the screen is available funds, with the accounts beside it and the
// reliability boundary under it. Every count in the waiting list is the
// engine's, drawn as it came.
//
// Every account, amount and date below is invented.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { AyqToday } from '../src/ayq-ipc-contract.ts';
import { AyqTodayScreen } from '../src/ayq-screens/ayq-today.tsx';
import { ayqDate, ayqMoney, ayqText } from '../src/ayq-strings.ts';
import { AyqGroundProvider } from '../src/ayq-ui/ayq-ground-provider.tsx';
import { ayqOpenWindow, ayqPress } from './ayq-react.ts';

const ROW = {
  id: 't-1',
  date: '2026-09-11',
  payee: 'TESTMARKT',
  amountCents: -2450,
  account: 'AYQ NL…3579',
  accountId: 'acc-1',
  category: null,
  categoryId: null,
  categorySource: null,
  cleared: true,
};

const TODAY: AyqToday = {
  today: '2026-09-12',
  accounts: {
    accounts: [
      {
        id: 'acc-1',
        name: 'AYQ NL…3579',
        balanceCents: 128450,
        transactionCount: 212,
        countsTowardFunds: true,
        anchor: {
          amountCents: 128450,
          coverageDate: '2026-08-31',
          source: 'bank',
          createdAt: '2026-09-01T08:00:00.000Z',
        },
        anchorHistory: [
          {
            amountCents: 128450,
            coverageDate: '2026-08-31',
            source: 'bank',
            createdAt: '2026-09-01T08:00:00.000Z',
          },
        ],
        lastImportAt: '2026-09-01T08:00:00.000Z',
        bankDataThrough: '2026-08-31',
        reconciliation: {
          asOf: '2026-08-31',
          statementBalanceCents: 128450,
          ledgerBalanceCents: 128450,
          differenceCents: 0,
          agrees: true,
          file: 'august.xml',
          readAt: '2026-09-01T08:00:00.000Z',
        },
      },
      {
        id: 'acc-2',
        name: 'AYQ NL…9052',
        balanceCents: 41200,
        transactionCount: 40,
        countsTowardFunds: true,
        anchor: {
          amountCents: 41200,
          coverageDate: '2026-08-31',
          source: 'manual',
          createdAt: '2026-09-01T08:05:00.000Z',
        },
        anchorHistory: [
          {
            amountCents: 41200,
            coverageDate: '2026-08-31',
            source: 'manual',
            createdAt: '2026-09-01T08:05:00.000Z',
          },
        ],
        lastImportAt: '2026-09-01T08:05:00.000Z',
        bankDataThrough: '2026-08-31',
        reconciliation: null,
      },
      {
        id: 'acc-3',
        name: 'AYQ NL…3310',
        balanceCents: 900000,
        transactionCount: 4,
        countsTowardFunds: false,
        anchor: {
          amountCents: 900000,
          coverageDate: '2026-08-31',
          source: 'bank',
          createdAt: '2026-09-01T08:10:00.000Z',
        },
        anchorHistory: [
          {
            amountCents: 900000,
            coverageDate: '2026-08-31',
            source: 'bank',
            createdAt: '2026-09-01T08:10:00.000Z',
          },
        ],
        lastImportAt: '2026-09-01T08:10:00.000Z',
        bankDataThrough: '2026-08-31',
        reconciliation: null,
      },
    ],
    coverage: [],
    availableFundsCents: 169650,
    totalBalanceCents: 1069650,
    reliableTo: '2026-08-31',
    countedWithoutCoverage: 0,
    countedWithoutAnchor: 0,
  },
  lowest: { date: '2026-09-28', balanceCents: -17974 },
  monthEnd: { month: '2026-09', closingCents: 306026 },
  waiting: {
    overdue: 2,
    overdueCents: 12390,
    matches: 3,
    uncategorised: 12,
    suggestions: 1,
    counterparties: 0,
    total: 18,
  },
};

function engine(today: AyqToday) {
  return (request: Record<string, unknown>): unknown => {
    if (request.kind === 'today') return today;
    if (request.kind === 'transactions.list') {
      return {
        rows: [ROW],
        total: 1,
        shown: 1,
        incomeCents: 0,
        expenseCents: 2450,
        netCents: -2450,
        uncategorised: 1,
      };
    }
    if (request.kind === 'categories.list') return [];
    if (request.kind === 'settings.get' || request.kind === 'settings.set') {
      return { ground: 'light' };
    }
    return undefined;
  };
}

function screen(
  open: (destination: string) => void = () => {},
  openAccount: (accountId: string) => void = () => {},
) {
  return (
    <AyqGroundProvider>
      <AyqTodayScreen
        onFailure={message => {
          throw new Error(message);
        }}
        onOpen={destination => open(destination)}
        onOpenAccount={accountId => openAccount(accountId)}
        round={0}
      />
    </AyqGroundProvider>
  );
}

test('available funds is the first figure, with the accounts beside it', async () => {
  const window = await ayqOpenWindow(engine(TODAY));
  await window.render(screen());

  const funds = window.container.querySelector('[data-ayq-available-funds]');
  assert.ok(funds, 'available funds is not on the screen');
  assert.equal(
    funds.getAttribute('data-ayq-available-funds'),
    String(TODAY.accounts.availableFundsCents),
  );

  // The largest figure on the screen, which is what A21 means by first.
  const headline = funds.querySelector('[data-ayq-figure]');
  assert.ok(headline);
  const sizes = [...window.container.querySelectorAll('[data-ayq-figure]')];
  assert.equal(sizes[0], headline, 'something is drawn before available funds');

  // The accounts are beside it, counted and uncounted alike.
  for (const account of TODAY.accounts.accounts) {
    assert.ok(
      window.container.querySelector(`[data-ayq-today-account="${account.id}"]`),
      `${account.name} is not beside the figure`,
    );
  }

  await window.close();
});

test('A21\u2019s order, in A21\u2019s own words', async () => {
  const window = await ayqOpenWindow(engine(TODAY));
  await window.render(screen());

  // "Available funds is the first figure on the screen... The transaction list
  // follows. Queues come last." Prototype r009 put the queues above the list;
  // this is the order Canon fixes, and it is pinned here so it cannot drift
  // back on a later change to the layout.
  const order = [...window.container.querySelectorAll('[data-ayq-pane]')]
    .map(one => one.getAttribute('data-ayq-pane'))
    .filter(one => one !== null && one.startsWith('today-'));

  assert.deepEqual(order, [
    'today-funds',
    'today-lasts',
    // The table and, beside it, the pane that holds the chosen row (A4).
    'today-movements',
    'today-movements-detail',
    'today-waiting',
  ]);

  await window.close();
});

test('the reliability boundary is stated, and it is the earliest', async () => {
  const window = await ayqOpenWindow(engine(TODAY));
  await window.render(screen());

  const line = window.container.querySelector('[data-ayq-today-coverage]');
  assert.ok(line);
  assert.match(line.textContent ?? '', new RegExp(ayqDate('2026-08-31')));

  await window.close();
});

test('a counted account with no statement leaves no date to rely on', async () => {
  const window = await ayqOpenWindow(
    engine({
      ...TODAY,
      accounts: { ...TODAY.accounts, reliableTo: null, countedWithoutCoverage: 1 },
    }),
  );
  await window.render(screen());

  const line = window.container.querySelector('[data-ayq-today-coverage]');
  assert.match(line?.textContent ?? '', /no statement/);

  await window.close();
});

test('how long it lasts: the lowest point and the end of the month', async () => {
  const window = await ayqOpenWindow(engine(TODAY));
  await window.render(screen());

  const lowest = window.container.querySelector('[data-ayq-lowest]');
  assert.ok(lowest, 'the lowest point is not shown');
  assert.equal(lowest.getAttribute('data-ayq-lowest'), '2026-09-28');
  assert.match(lowest.textContent ?? '', new RegExp(ayqDate('2026-09-28')));

  const monthEnd = window.container.querySelector('[data-ayq-month-end]');
  assert.ok(monthEnd, 'the position at month end is not shown');
  assert.equal(monthEnd.getAttribute('data-ayq-month-end'), '2026-09');

  await window.close();
});

test('what is waiting is the engine’s counts, every kind of them', async () => {
  const window = await ayqOpenWindow(engine(TODAY));
  await window.render(screen());

  const list = window.container.querySelector('[data-ayq-waiting]');
  assert.ok(list);
  assert.equal(list.getAttribute('data-ayq-waiting'), '18');
  const said = list.textContent ?? '';

  const overdue = ayqText('today.waiting.overdue', { amount: ayqMoney(12390) });
  assert.ok(said.includes(overdue), `the overdue line does not read "${overdue}"`);
  assert.match(said, /2\s*overdue/);
  assert.match(said, /3\s*matches to confirm/);
  assert.match(said, /12\s*transactions with no category/);
  assert.match(said, /1\s*suggested records to confirm/);
  // Nothing is waiting under that heading, so it is not a line saying zero.
  assert.ok(
    !said.includes(ayqText('today.waiting.counterparties')),
    'a queue with nothing in it was drawn anyway',
  );

  await window.close();
});

test('nothing waiting says so, rather than showing an empty list', async () => {
  const window = await ayqOpenWindow(
    engine({
      ...TODAY,
      waiting: {
        overdue: 0,
        overdueCents: 0,
        matches: 0,
        uncategorised: 0,
        suggestions: 0,
        counterparties: 0,
        total: 0,
      },
    }),
  );
  await window.render(screen());

  assert.ok(
    (window.container.querySelector('[data-ayq-waiting]')?.textContent ?? '')
      .includes(ayqText('today.waiting.none')),
    'an empty queue did not say that nothing is waiting',
  );

  await window.close();
});

test('Import is reachable from here, beside the coverage line', async () => {
  const opened: string[] = [];
  const window = await ayqOpenWindow(engine(TODAY));
  await window.render(screen(destination => opened.push(destination)));

  const line = window.container.querySelector('[data-ayq-today-coverage]');
  assert.ok(
    line?.querySelector('[data-ayq-action="today-import"]'),
    'Import is not beside the coverage line, which is where it is looked for',
  );

  await ayqPress(window.container.querySelector('[data-ayq-action="today-import"]'));
  assert.deepEqual(opened, ['import']);

  await window.close();
});

test('the latest movements are a table with the same detail pane', async () => {
  const window = await ayqOpenWindow(engine(TODAY));
  await window.render(screen());

  const rows = window.container.querySelectorAll(
    '[data-ayq-table="today-movements"] tbody tr',
  );
  assert.equal(rows.length, 1);
  assert.match(rows[0].textContent ?? '', /TESTMARKT/);

  // The same pane the Register uses: it says so by saying nothing is chosen
  // in the same words.
  assert.match(
    window.container.querySelector('[data-ayq-pane="today-movements-detail"]')
      ?.textContent ?? '',
    new RegExp(ayqText('detail.none')),
  );

  // And it asked for the newest few rather than for everything.
  const asked = window.asked.find(one => one.kind === 'transactions.list');
  assert.equal((asked?.filter as { limit?: number }).limit, 8);

  await window.close();
});


/* ------------------------------------------------- 5 and 7 §7.2 on the screen

   An unknown balance is a state, not a nought, and the two freshness facts are
   two facts. Both are properties of what a person sees, so both are read off
   the drawn window rather than off the object that was handed to it.        */

/** The view, with one counted account that AYQ has no balance for. */
function withUnknown(): AyqToday {
  const accounts = TODAY.accounts.accounts.map(account =>
    account.id === 'acc-2'
      ? {
          ...account,
          balanceCents: null,
          anchor: null,
          anchorHistory: [],
          reconciliation: null,
        }
      : account,
  );
  return {
    ...TODAY,
    accounts: {
      ...TODAY.accounts,
      accounts,
      // What the engine answers when a counted account has no anchor: no
      // available funds, no total held, and a count of how many are missing.
      availableFundsCents: null,
      totalBalanceCents: null,
      countedWithoutAnchor: 1,
    },
    // And with no position to start from, there is no position to project.
    lowest: null,
    monthEnd: null,
  };
}

test('an account with no balance says Unknown, and is not drawn as nought', async () => {
  const window = await ayqOpenWindow(engine(withUnknown()));
  await window.render(screen());

  const account = window.container.querySelector(
    '[data-ayq-today-account="acc-2"]',
  );
  assert.ok(account);
  assert.equal(account.getAttribute('data-ayq-account-balance'), 'unknown');

  const figure = account.querySelector('[data-ayq-figure]');
  assert.equal(figure?.getAttribute('data-ayq-figure'), 'unknown');
  assert.equal(figure?.textContent, ayqText('figure.unknown'));
  // The one thing it must never say.
  assert.ok(!/0[.,]00/.test(account.textContent ?? ''));

  // And the way out of it is offered where the figure is.
  assert.ok(
    (account.textContent ?? '').includes(ayqText('today.account.setBalance')),
    'no way to set the balance is offered',
  );

  await window.close();
});

test('available funds is Unknown when any counted account is (§5)', async () => {
  const window = await ayqOpenWindow(engine(withUnknown()));
  await window.render(screen());

  const funds = window.container.querySelector('[data-ayq-available-funds]');
  assert.ok(funds);
  assert.equal(funds.getAttribute('data-ayq-available-funds'), 'unknown');
  assert.equal(
    funds.querySelector('[data-ayq-figure]')?.textContent,
    ayqText('figure.unknown'),
  );

  // The known subset is not summed and labelled: 128450 + 900000 is a figure
  // that would be drawn here if anybody had been tempted.
  const said = funds.textContent ?? '';
  assert.ok(!said.includes('1284'), 'the known accounts were summed anyway');
  assert.ok(!said.includes('9000'), 'the known accounts were summed anyway');

  await window.close();
});

test('an unknown position shows no lowest point and no month end (§5)', async () => {
  const window = await ayqOpenWindow(engine(withUnknown()));
  await window.render(screen());

  assert.ok(
    window.container.querySelector('[data-ayq-no-position]'),
    'the screen did not say why there is no projection',
  );
  assert.equal(window.container.querySelector('[data-ayq-lowest]'), null);
  assert.equal(window.container.querySelector('[data-ayq-month-end]'), null);

  await window.close();
});

test('Today says when an import last succeeded and how far the bank reaches', async () => {
  const window = await ayqOpenWindow(engine(TODAY));
  await window.render(screen());

  const account = window.container.querySelector(
    '[data-ayq-today-account="acc-1"]',
  );
  assert.ok(account);

  // Two facts, two elements, two dates. They are not the same timestamp and
  // the screen must not present them as one.
  const lastImport = account.querySelector('[data-ayq-last-import]');
  const through = account.querySelector('[data-ayq-bank-through]');
  assert.equal(lastImport?.getAttribute('data-ayq-last-import'), '2026-09-01T08:00:00.000Z');
  assert.equal(through?.getAttribute('data-ayq-bank-through'), '2026-08-31');
  assert.ok(lastImport !== through);

  assert.match(lastImport?.textContent ?? '', /Last import/);
  assert.match(through?.textContent ?? '', /Bank data through/);

  await window.close();
});

test('an account that has never been imported says so, rather than showing a date', async () => {
  const bare: AyqToday = {
    ...TODAY,
    accounts: {
      ...TODAY.accounts,
      accounts: TODAY.accounts.accounts.map(account =>
        account.id === 'acc-3'
          ? { ...account, lastImportAt: null, bankDataThrough: null }
          : account,
      ),
    },
  };
  const window = await ayqOpenWindow(engine(bare));
  await window.render(screen());

  const account = window.container.querySelector(
    '[data-ayq-today-account="acc-3"]',
  );
  assert.ok(account);
  assert.equal(
    account.querySelector('[data-ayq-last-import]')?.textContent,
    ayqText('today.account.lastImport.never'),
  );
  assert.equal(
    account.querySelector('[data-ayq-bank-through]')?.textContent,
    ayqText('today.account.bankThrough.none'),
  );

  await window.close();
});

test('clicking an account opens its own detail, not a workspace', async () => {
  let opened: string | null = null;
  const window = await ayqOpenWindow(engine(TODAY));
  await window.render(
    screen(
      () => {},
      accountId => {
        opened = accountId;
      },
    ),
  );

  const account = window.container.querySelector(
    '[data-ayq-today-account="acc-1"]',
  );
  assert.ok(account);
  await ayqPress(account as HTMLElement);

  assert.equal(opened, 'acc-1', 'the account did not open its detail');

  await window.close();
});

test('reconciliation is shown only where the bank stated a balance', async () => {
  const window = await ayqOpenWindow(engine(TODAY));
  await window.render(screen());

  // acc-1 has a closing balance from the bank and agrees with it.
  const agreeing = window.container.querySelector(
    '[data-ayq-today-account="acc-1"] [data-ayq-agrees]',
  );
  assert.equal(agreeing?.getAttribute('data-ayq-agrees'), 'true');

  // acc-2 has an anchor the owner set and no bank figure, so there is nothing
  // to reconcile and nothing is claimed.
  assert.equal(
    window.container.querySelector(
      '[data-ayq-today-account="acc-2"] [data-ayq-agrees]',
    ),
    null,
  );

  await window.close();
});
