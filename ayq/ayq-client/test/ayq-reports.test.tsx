// Reports (04 A2, A20, A32; 03 §7.26): spending by category, and the route
// from a category into the Register.
//
// What is being checked: every figure is the engine's answer to `spending`
// for the period and account asked; Uncategorised is a row like any other; and
// choosing a category hands the shell the same period, account and category
// as a filter — the real filter, not a claim that one was applied.
//
// Every category and amount below is invented.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type {
  AyqAccountSummary,
  AyqSpending,
} from '../src/ayq-ipc-contract.ts';
import { ayqPeriodBounds } from '../src/ayq-screens/ayq-register.tsx';
import { AyqReportsScreen } from '../src/ayq-screens/ayq-reports.tsx';
import { ayqText } from '../src/ayq-strings.ts';
import { AyqGroundProvider } from '../src/ayq-ui/ayq-ground-provider.tsx';

import { ayqOpenWindow, ayqPress, ayqType } from './ayq-react.ts';

const SPENDING: AyqSpending = {
  from: '2026-07-01',
  to: null,
  rows: [
    {
      categoryId: 'cat-1',
      categoryName: 'Housing',
      cents: 354_000,
      transactions: 3,
      share: 0.594,
    },
    {
      categoryId: 'cat-2',
      categoryName: 'Groceries',
      cents: 87_432,
      transactions: 21,
      share: 0.147,
    },
    {
      categoryId: null,
      categoryName: 'Uncategorised',
      cents: 45_481,
      transactions: 7,
      share: 0.076,
    },
  ],
  totalCents: 596_284,
  uncategorisedCents: 45_481,
  incomeCents: 852_000,
  transferCount: 2,
  months: ['2026-09', '2026-08', '2026-07'],
  years: ['2026'],
};

const ACCOUNTS = [
  { id: 'acc-1', name: 'Daily' },
  { id: 'acc-2', name: 'Reserve' },
] as unknown as AyqAccountSummary[];

function engine() {
  return (request: Record<string, unknown>): unknown => {
    if (request.kind === 'spending') return SPENDING;
    if (request.kind === 'settings.get') return { ground: 'light' };
    return undefined;
  };
}

function screen(opened: Record<string, unknown>[] = []) {
  return (
    <AyqGroundProvider>
      <AyqReportsScreen
        accounts={ACCOUNTS}
        onOpenRegister={filter =>
          opened.push(filter as Record<string, unknown>)
        }
        onFailure={message => {
          throw new Error(message);
        }}
      />
    </AyqGroundProvider>
  );
}

test('every figure is the engine\'s answer for the period asked, Uncategorised among them', async () => {
  const window = await ayqOpenWindow(engine());
  await window.render(screen());

  const asked = window.asked.filter(one => one.kind === 'spending');
  assert.equal(asked.length, 1);
  const today = new Date().toISOString().slice(0, 10);
  assert.deepEqual(
    asked[0].filter,
    { ...ayqPeriodBounds('threeMonths', today), accountId: undefined },
    'the period opens on the last three months, and the engine is asked for it',
  );

  const rows = [
    ...window.container.querySelectorAll('[data-ayq-table="reports"] tbody tr'),
  ];
  assert.equal(rows.length, 3);
  assert.match(rows[0].textContent ?? '', /Housing/);
  assert.match(rows[0].textContent ?? '', /59\.4%/);
  assert.ok(
    rows[2].querySelector('[data-ayq-state="uncategorised"]'),
    'the unfiled part is not a row',
  );
  assert.equal(
    rows[1]
      .querySelector('[data-ayq-report-transactions]')
      ?.getAttribute('data-ayq-report-transactions'),
    '21',
  );
  // Income, expenses and net, as the engine gave them.
  const totals = window.container.querySelector('[data-ayq-reports-totals]');
  const figures = [
    ...(totals?.querySelectorAll('[data-ayq-figure]') ?? []),
  ].map(one => one.getAttribute('data-ayq-figure'));
  assert.deepEqual(figures, ['852000', '596284', '255716']);
  assert.match(
    window.container.querySelector('[data-ayq-reports-transfers]')
      ?.textContent ?? '',
    /2 transfers/,
  );
  await window.close();
});

test('choosing a category hands the shell the same period, account and category as a filter', async () => {
  const opened: Record<string, unknown>[] = [];
  const window = await ayqOpenWindow(engine());
  await window.render(screen(opened));
  await ayqType(
    window.container.querySelector('[data-ayq-reports-account]'),
    'acc-2',
  );
  await ayqType(
    window.container.querySelector('[data-ayq-reports-period]'),
    'thisYear',
  );
  const asked = window.asked.filter(one => one.kind === 'spending');
  assert.deepEqual(
    asked.at(-1)?.filter,
    { from: `${new Date().getFullYear()}-01-01`, accountId: 'acc-2' },
    'the engine is asked again for what is now chosen',
  );

  const rows = [
    ...window.container.querySelectorAll('[data-ayq-table="reports"] tbody tr'),
  ];
  await ayqPress(rows[1]);
  assert.deepEqual(opened, [
    {
      from: `${new Date().getFullYear()}-01-01`,
      accountId: 'acc-2',
      categoryId: 'cat-2',
    },
  ]);

  await ayqPress(rows[2]);
  assert.deepEqual(opened[1], {
    from: `${new Date().getFullYear()}-01-01`,
    accountId: 'acc-2',
    uncategorised: true,
  });
  await window.close();
});

test('the screen says how to reach the Register, and nothing about being unbuilt', async () => {
  const window = await ayqOpenWindow(engine());
  await window.render(screen());
  const said = window.container.textContent ?? '';
  assert.ok(said.includes(ayqText('reports.select')));
  assert.ok(!/not built/i.test(said));
  await window.close();
});
