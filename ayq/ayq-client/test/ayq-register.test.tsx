// The Register, exercised in a real window.
//
// What is being checked is 04 A3, A4 and review D2.1 as behaviour: that the
// table shows what the engine answered, that uncategorised is a state rather
// than a blank (03 §4.5), that what is being filtered is visible and can be
// taken off, that the totals say which set they describe, and that the pane
// beside the table carries the evidence and sends exactly the decision a
// person made and nothing else.
//
// Every counterparty, amount and date below is invented.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type {
  AyqAccountSummary,
  AyqCategory,
  AyqLedgerRow,
  AyqTransactionDetail,
} from '../src/ayq-ipc-contract.ts';
import { AyqRegisterScreen } from '../src/ayq-screens/ayq-register.tsx';
import { ayqAmount, ayqText } from '../src/ayq-strings.ts';
import { AyqGroundProvider } from '../src/ayq-ui/ayq-ground-provider.tsx';
import { ayqOpenWindow, ayqPress } from './ayq-react.ts';

const ACCOUNTS: AyqAccountSummary[] = [
  {
    id: 'acc-1',
    name: 'AYQ NL…3579',
    balanceCents: 128450,
    transactionCount: 3,
    countsTowardFunds: true,
  },
];

const CATEGORIES: AyqCategory[] = [
  {
    id: 'cat-groceries',
    name: 'Groceries',
    groupId: 'grp-1',
    groupName: 'Everyday',
    isIncome: false,
  },
  {
    id: 'cat-utilities',
    name: 'Utilities',
    groupId: 'grp-1',
    groupName: 'Everyday',
    isIncome: false,
  },
];

const ROWS: AyqLedgerRow[] = [
  {
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
  },
  {
    id: 't-2',
    date: '2026-09-10',
    payee: 'TESTFUEL',
    amountCents: -6100,
    account: 'AYQ NL…3579',
    accountId: 'acc-1',
    category: 'Groceries',
    categoryId: 'cat-groceries',
    categorySource: 'rule',
    cleared: true,
  },
  {
    id: 't-3',
    date: '2026-09-01',
    payee: 'TEST EMPLOYER',
    amountCents: 240000,
    account: 'AYQ NL…3579',
    accountId: 'acc-1',
    category: 'Salary',
    categoryId: 'cat-salary',
    categorySource: 'manual',
    cleared: true,
  },
];

const DETAIL: AyqTransactionDetail = {
  row: ROWS[1],
  importedPayee: 'TESTFUEL 22',
  notes: null,
  importedId: 'SCALE0000000001',
  provenance: {
    importId: 'imp-1',
    counterpartyKey: 'TESTFUEL',
    counterpartyName: 'TESTFUEL 22',
    resolvedBy: 'card descriptor',
    kind: 'card payment',
    counterpartyIban: null,
    intermediary: null,
    mandateId: null,
    endToEndId: null,
    bankTransactionCode: 'PMNT/CCRD/POSD',
    valueDate: '2026-09-10',
    description: 'BEA, Betaalpas TESTFUEL 22,PAS421',
    file: 'ayq-invented.xml',
  },
  counterpartyKey: 'TESTFUEL',
  decisions: [
    { source: 'manual', categoryName: 'Utilities', at: '2026-09-10T09:00:00.000Z' },
    { source: 'rule', categoryName: 'Groceries', at: '2026-09-11T09:00:00.000Z' },
  ],
  rule: {
    id: 'rule-1',
    counterpartyKey: 'TESTFUEL',
    categoryName: 'Groceries',
    createdAt: '2026-09-10T09:00:00.000Z',
  },
  match: null,
};

type Asked = Record<string, unknown>;

function engineOver(rows: AyqLedgerRow[], total = rows.length) {
  return (request: Asked): unknown => {
    switch (request.kind) {
      case 'transactions.list': {
        const filter = (request.filter ?? {}) as {
          uncategorised?: boolean;
          limit?: number;
        };
        const matching =
          filter.uncategorised === true
            ? rows.filter(row => row.categoryId === null)
            : rows;
        const income = matching
          .filter(row => row.amountCents > 0)
          .reduce((sum, row) => sum + row.amountCents, 0);
        const expense = matching
          .filter(row => row.amountCents < 0)
          .reduce((sum, row) => sum - row.amountCents, 0);
        const shown = filter.limit ?? Math.min(matching.length, total);
        return {
          rows: matching.slice(0, shown),
          total: filter.uncategorised === true ? matching.length : total,
          shown: Math.min(matching.length, shown),
          incomeCents: income,
          expenseCents: expense,
          netCents: income - expense,
          uncategorised: matching.filter(row => row.categoryId === null).length,
        };
      }
      case 'categories.list':
        return CATEGORIES;
      case 'transaction.detail':
        return DETAIL;
      case 'counterparties.list':
        return {
          rows: [
            {
              key: 'TESTFUEL STATION',
              name: 'TESTFUEL STATION',
              transactions: 4,
              outgoingCents: 12000,
              firstDate: '2026-01-01',
              lastDate: '2026-09-01',
              categoryName: null,
              recurring: false,
              aliases: 0,
            },
          ],
          total: 1,
          shown: 1,
        };
      case 'transaction.categorise':
        return { row: ROWS[1], counterpartyKey: 'TESTFUEL', counterpartyName: 'TESTFUEL', pendingForCounterparty: 0 };
      case 'alias.create':
        return { aliases: [], recategorised: 0 };
      case 'settings.get':
      case 'settings.set':
        return { ground: 'light' };
      default:
        return undefined;
    }
  };
}

/** The screen, with the shell's half of it stood in for. */
function screen(
  onFilter: (filter: Record<string, unknown>) => void = () => {},
  filter: Record<string, unknown> = {},
) {
  return (
    <AyqGroundProvider>
      <AyqRegisterScreen
        accounts={ACCOUNTS}
        filter={filter}
        onFilter={onFilter}
        onShowTheRule={() => {}}
        onFailure={message => {
          throw new Error(message);
        }}
        onLoaded={() => {}}
      />
    </AyqGroundProvider>
  );
}

test('the Register does not say the budget is empty before it has looked', async () => {
  // Found by an acceptance run on Windows, and it is the kind of untruth that
  // is easy to write and hard to see: the table drew its empty state — "Nothing
  // has been imported yet" — while the engine was still answering, so a person
  // opening AYQ on a large budget was told for a moment that they had nothing.
  // The run read the screen in that moment and reported a lost budget.
  //
  // Nothing is drawn as a table until there is an answer behind it, and the
  // table's own marker appears with it.
  let answer: ((rows: unknown) => void) | null = null;
  const held = new Promise<unknown>(resolve => {
    answer = resolve;
  });

  const window = await ayqOpenWindow(request => {
    if (request.kind === 'transactions.list') return held;
    return engineOver(ROWS)(request);
  });
  await window.render(screen());

  assert.equal(
    window.container.querySelector('[data-ayq-table="register"]'),
    null,
    'the Register drew a table before the engine had answered',
  );
  assert.ok(
    window.container.querySelector('[data-ayq-reading="register"]'),
    'the Register says nothing at all while it reads',
  );
  assert.ok(
    !(window.container.textContent ?? '').includes(
      ayqText('register.empty'),
    ),
    'the Register said the budget was empty before it had looked',
  );

  await window.close();
});

test('the table shows the rows the engine answered, in the accepted columns', async () => {
  const window = await ayqOpenWindow(engineOver(ROWS));
  await window.render(screen());

  const rows = window.container.querySelectorAll(
    '[data-ayq-table="register"] tbody tr',
  );
  assert.equal(rows.length, ROWS.length);

  const first = rows[0];
  for (const column of ['date', 'payee', 'category', 'account', 'amount']) {
    assert.ok(
      first.querySelector(`[data-ayq-cell="${column}"]`),
      `the table has no ${column} column`,
    );
  }
  assert.match(
    first.querySelector('[data-ayq-cell="payee"]')?.textContent ?? '',
    /TESTMARKT/,
  );
  // 04 A19: the amount is the engine's cents, formatted, and carries no colour.
  assert.equal(
    first.querySelector('[data-ayq-cell="amount"]')?.textContent,
    ayqAmount(ROWS[0].amountCents),
  );

  await window.close();
});

test('uncategorised is a state, not a blank', async () => {
  const window = await ayqOpenWindow(engineOver(ROWS));
  await window.render(screen());

  const chip = window.container.querySelector(
    '[data-ayq-table="register"] tbody tr [data-ayq-state="uncategorised"]',
  );
  assert.ok(chip, 'a transaction nobody has filed shows nothing at all');
  assert.equal(chip.textContent, ayqText('register.category.none'));

  await window.close();
});

test('the totals say which set they describe, and keep the unfiled in them', async () => {
  const window = await ayqOpenWindow(engineOver(ROWS));
  await window.render(screen());

  const totals = window.container.querySelector('[data-ayq-totals]');
  assert.ok(totals);
  const said = totals.textContent ?? '';
  assert.match(said, /totals describe all 3 transactions/);
  // 03 §4.5: a total that drops the unfiled is a total that is wrong, so the
  // screen says how many of them are in it.
  assert.match(said, /1 of them are uncategorised, and are counted here/);

  await window.close();
});

test('a filter that is on is shown, and can be taken off', async () => {
  let filter: Record<string, unknown> = {};
  const window = await ayqOpenWindow(engineOver(ROWS));
  const draw = async (): Promise<void> => {
    await window.render(
      screen(next => {
        filter = next;
      }, filter),
    );
  };
  await draw();

  await ayqPress(
    // Fluent puts a component's native props on its primary slot, which for a
    // checkbox is the input itself.
    window.container.querySelector('[data-ayq-filter-uncategorised]'),
  );
  assert.equal(filter.uncategorised, true, 'the filter never reached the shell');
  await draw();

  const chip = window.container.querySelector('[data-ayq-filter="uncategorised"]');
  assert.ok(chip, 'the filter is on and the screen does not say so');
  assert.ok(
    window.container.querySelector('[data-ayq-action="clear-filters"]'),
    'there is no way to clear the filters at once',
  );

  const totals = window.container.querySelector('[data-ayq-totals]')?.textContent ?? '';
  assert.match(totals, /this filter matched/, 'the filtered totals do not say so');

  // Off again, on its own.
  await ayqPress(
    window.container.querySelector('[data-ayq-filter-remove="uncategorised"]'),
  );
  assert.equal(filter.uncategorised, undefined);
  await draw();
  assert.equal(
    window.container.querySelector('[data-ayq-filter="uncategorised"]'),
    null,
  );

  await window.close();
});

test('clearing takes every filter off at once', async () => {
  let filter: Record<string, unknown> = { uncategorised: true, search: 'fuel' };
  const window = await ayqOpenWindow(engineOver(ROWS));
  const draw = async (): Promise<void> => {
    await window.render(
      screen(next => {
        filter = next;
      }, filter),
    );
  };
  await draw();

  assert.equal(
    window.container.querySelectorAll('[data-ayq-filter]').length,
    2,
    'both filters should be shown',
  );
  await ayqPress(window.container.querySelector('[data-ayq-action="clear-filters"]'));
  assert.deepEqual(filter, {});

  await window.close();
});

test('choosing a row opens the evidence, the provenance and the decisions', async () => {
  const window = await ayqOpenWindow(engineOver(ROWS));
  await window.render(screen());

  await ayqPress(
    window.container.querySelector('[data-ayq-table="register"] tbody tr[data-ayq-row="t-2"]'),
  );

  const pane = window.container.querySelector('[data-ayq-detail="t-2"]');
  assert.ok(pane, 'no detail pane opened');
  const said = pane.textContent ?? '';

  assert.match(said, /TESTFUEL/);
  // The evidence behind the counterparty (03 §3.5), not a name and a shrug.
  assert.match(said, /card descriptor/);
  assert.match(said, /PMNT\/CCRD\/POSD/);
  assert.match(said, /TESTFUEL 22/);
  // Who decided the category, and every decision before it.
  assert.match(said, new RegExp(ayqText('detail.by.rule')));
  assert.equal(
    pane.querySelector('[data-ayq-history]')?.getAttribute('data-ayq-history'),
    '2',
  );
  assert.match(said, /Utilities/, 'the decision that was overruled is not shown');

  await window.close();
});

test('changing the category sends that decision, and only that', async () => {
  const window = await ayqOpenWindow(engineOver(ROWS));
  await window.render(screen());
  await ayqPress(
    window.container.querySelector('[data-ayq-table="register"] tbody tr[data-ayq-row="t-2"]'),
  );

  const before = window.asked.length;
  const select = window.container.querySelector(
    'select[data-ayq-category-choice]',
  ) as HTMLSelectElement | null;
  assert.ok(select, 'the pane offers no way to change the category');
  select.value = 'cat-utilities';
  await ayqPress(select);
  select.dispatchEvent(
    new window.dom.window.Event('change', { bubbles: true }),
  );

  const sent = window.asked
    .slice(before)
    .filter(one => one.kind === 'transaction.categorise');
  assert.equal(sent.length, 1, 'exactly one decision crossed the boundary');
  assert.equal(sent[0].transactionId, 't-2');
  assert.equal(sent[0].categoryId, 'cat-utilities');
  // Not a rule: categorising one transaction and learning a rule are two
  // different actions (03 §4.1), and this is the first of them.
  assert.equal(sent[0].createRule, undefined);

  await window.close();
});

test('a row can be chosen from the keyboard', async () => {
  const window = await ayqOpenWindow(engineOver(ROWS));
  await window.render(screen());

  const row = window.container.querySelector(
    '[data-ayq-table="register"] tbody tr[data-ayq-row="t-2"]',
  ) as HTMLElement | null;
  assert.ok(row);
  assert.equal(row.tabIndex, 0, 'the row is not in the tab order');

  await window.render(screen());
  row.dispatchEvent(
    new window.dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
  );
  await window.render(screen());

  assert.ok(
    window.asked.some(one => one.kind === 'transaction.detail' && one.transactionId === 't-2'),
    'Enter did not do what the click does',
  );

  await window.close();
});

test('a page is not the whole ledger, and says so', async () => {
  const many = Array.from({ length: 500 }, (_, index) => ({
    ...ROWS[0],
    id: `t-${index}`,
  }));
  const window = await ayqOpenWindow(engineOver(many, 900));
  await window.render(screen());

  const totals = window.container.querySelector('[data-ayq-totals]')?.textContent ?? '';
  assert.match(totals, /Showing the newest 500 of 900/);

  const before = window.asked.filter(one => one.kind === 'transactions.list').length;
  await ayqPress(window.container.querySelector('[data-ayq-action="show-more"]'));
  const asked = window.asked
    .filter(one => one.kind === 'transactions.list')
    .slice(before);
  assert.equal(asked.length, 1, 'showing more asked the engine once');
  assert.equal(
    (asked[0].filter as { limit?: number }).limit,
    1000,
    'showing more asked for a bigger page rather than a second one',
  );

  await window.close();
});
