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
      },
      {
        id: 'acc-2',
        name: 'AYQ NL…9052',
        balanceCents: 41200,
        transactionCount: 40,
        countsTowardFunds: true,
      },
      {
        id: 'acc-3',
        name: 'AYQ NL…3310',
        balanceCents: 900000,
        transactionCount: 4,
        countsTowardFunds: false,
      },
    ],
    coverage: [],
    availableFundsCents: 169650,
    totalBalanceCents: 1069650,
    reliableTo: '2026-08-31',
    countedWithoutCoverage: 0,
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

function screen(open: (destination: string) => void = () => {}) {
  return (
    <AyqGroundProvider>
      <AyqTodayScreen
        onFailure={message => {
          throw new Error(message);
        }}
        onOpen={destination => open(destination)}
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
