// Gathering rows in the Register, and what the bar over them says (04 A36).
//
// What is being checked is that the scope a person is shown is the scope that
// crosses the boundary: the ticked rows, exactly; or the whole filter, exactly
// as the Register is holding it; that the whole filter is offered only where
// 03 §4.8 admits it; that a change of filter drops the selection rather than
// leaving a stale claim; that rows filed by hand are named before the decision;
// and that a counterparty correction states its reach, from the engine's own
// count, before the button is pressed. And that none of it writes a rule.
//
// Every counterparty, amount and date below is invented.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type {
  AyqAccountSummary,
  AyqCategory,
  AyqLedgerRow,
} from '../src/ayq-ipc-contract.ts';
import { AyqRegisterScreen } from '../src/ayq-screens/ayq-register.tsx';
import { AyqGroundProvider } from '../src/ayq-ui/ayq-ground-provider.tsx';

import {
  ayqOpenWindow,
  ayqPress,
  ayqType,
  type AyqWindow,
} from './ayq-react.ts';

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

const row = (id: string, over: Partial<AyqLedgerRow> = {}): AyqLedgerRow => ({
  id,
  date: '2026-09-11',
  payee: 'TESTMARKT',
  amountCents: -2450,
  account: 'AYQ NL…3579',
  accountId: 'acc-1',
  category: null,
  categoryId: null,
  categorySource: null,
  cleared: true,
  ...over,
});

const ROWS: AyqLedgerRow[] = [
  row('t-1'),
  row('t-2', {
    date: '2026-09-10',
    payee: 'TESTFUEL',
    amountCents: -6100,
    category: 'Groceries',
    categoryId: 'cat-groceries',
    categorySource: 'rule',
  }),
  row('t-3', {
    date: '2026-09-01',
    payee: 'TEST EMPLOYER',
    amountCents: 240000,
    category: 'Salary',
    categoryId: 'cat-salary',
    categorySource: 'manual',
  }),
];

type Asked = Record<string, unknown>;

/**
 * A stand-in engine: a ledger of `total` rows of which `rows` are the page,
 * `byHand` of any scope already decided by hand, and one bank name behind
 * everything with nine transactions on it.
 */
function engine(rows: AyqLedgerRow[], total = rows.length, byHand = 0) {
  return (request: Asked): unknown => {
    switch (request.kind) {
      case 'transactions.list': {
        const filter = (request.filter ?? {}) as { limit?: number };
        const shown = Math.min(rows.length, filter.limit ?? total);
        return {
          rows: rows.slice(0, shown),
          total,
          shown,
          incomeCents: 0,
          expenseCents: 0,
          netCents: 0,
          uncategorised: rows.filter(one => one.categoryId === null).length,
        };
      }
      case 'categories.list':
        return CATEGORIES;
      case 'transactions.scope': {
        const scope = request.scope as
          | { kind: 'selected'; transactionIds: string[] }
          | { kind: 'filter' };
        return {
          transactions:
            scope.kind === 'selected' ? scope.transactionIds.length : total,
          byHand,
          variants: [
            { variantKey: 'TESTFUEL', variant: 'TESTFUEL 22', transactions: 9 },
          ],
          variantTransactions: 9,
        };
      }
      case 'transactions.categoriseMany':
        return { scoped: 2, categorised: 2, keptByHand: 0 };
      case 'transactions.correctCounterparty':
        return {
          variants: 1,
          moved: 9,
          counterpartyKey: 'TESTFUEL STATION',
          counterpartyName: 'TESTFUEL STATION',
        };
      case 'counterparties.list':
        return {
          rows: [
            {
              key: 'TESTFUEL STATION',
              name: 'TESTFUEL STATION',
              transactions: 9,
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
      case 'settings.get':
      case 'settings.set':
        return { ground: 'light' };
      default:
        return undefined;
    }
  };
}

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

const tick = (window: AyqWindow, id: string): Promise<void> =>
  ayqPress(window.container.querySelector(`[data-ayq-select-row="${id}"]`));

const find = (window: AyqWindow, selector: string): Element | null =>
  window.container.querySelector(selector);

test('ticking rows states the count, and the count is the set that is sent', async () => {
  const window = await ayqOpenWindow(engine(ROWS));
  await window.render(screen());

  assert.equal(
    find(window, '[data-ayq-bulk]'),
    null,
    'nothing gathered, nothing to say',
  );

  await tick(window, 't-1');
  await tick(window, 't-3');
  const bar = find(window, '[data-ayq-bulk]');
  assert.ok(bar, 'two rows are ticked and there is no bar');
  assert.equal(
    bar.querySelector('[data-ayq-bulk-count]')?.textContent,
    '2 selected',
  );
  assert.equal(
    bar
      .querySelector('[data-ayq-bulk-basis]')
      ?.getAttribute('data-ayq-bulk-basis'),
    'shown',
  );
  assert.equal(
    find(window, '[data-ayq-action="bulk-scope"]'),
    null,
    'with no filter on, the whole filter is not a scope and is not offered (03 §4.8)',
  );
  assert.ok(
    !window.asked.some(one => one.kind === 'transaction.detail'),
    'ticking a row opened it',
  );

  await ayqPress(find(window, '[data-ayq-action="bulk-category"]'));
  const stated = window.asked.filter(one => one.kind === 'transactions.scope');
  assert.equal(stated.length, 1, 'the scope was stated from the engine, once');
  assert.deepEqual(stated[0].scope, {
    kind: 'selected',
    transactionIds: ['t-1', 't-3'],
  });

  await ayqType(
    find(window, '[data-ayq-bulk-category-choice]'),
    'cat-utilities',
  );
  await ayqPress(find(window, '[data-ayq-action="bulk-category-apply"]'));

  const sent = window.asked.filter(
    one => one.kind === 'transactions.categoriseMany',
  );
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].scope, {
    kind: 'selected',
    transactionIds: ['t-1', 't-3'],
  });
  assert.equal(sent[0].categoryId, 'cat-utilities');
  assert.equal(sent[0].includeByHand, false);
  assert.ok(
    !window.asked.some(
      one =>
        one.kind === 'transaction.categoriseCounterparty' ||
        one.kind === 'rules.apply' ||
        one.kind === 'transaction.categorise',
    ),
    'a bulk filing did something other than file the rows',
  );

  // Afterwards: the selection is gone, the outcome is said, the table re-read.
  assert.equal(find(window, '[data-ayq-bulk]'), null);
  assert.match(
    find(window, '[data-ayq-bulk-outcome]')?.textContent ?? '',
    /2 filed/,
  );
  assert.equal(
    window.asked.filter(one => one.kind === 'transactions.list').length,
    2,
    'the table was read again after the decision',
  );

  await window.close();
});

test('the whole filter is offered where 03 §4.8 admits it, and is sent as the filter', async () => {
  const many = Array.from({ length: 500 }, (_, index) => row(`t-${index}`));
  let filter: Record<string, unknown> = { search: 'test' };
  const window = await ayqOpenWindow(engine(many, 900));
  const draw = async (): Promise<void> => {
    await window.render(
      screen(next => {
        filter = next;
      }, filter),
    );
  };
  await draw();

  await tick(window, 't-0');
  const offer = find(window, '[data-ayq-action="bulk-scope"]');
  assert.ok(
    offer,
    'a word is a scope, and the filter holds more than the page',
  );
  assert.match(offer.textContent ?? '', /Select all 900 in this filter/);
  await ayqPress(offer);

  const bar = find(window, '[data-ayq-bulk]');
  assert.match(
    bar?.querySelector('[data-ayq-bulk-count]')?.textContent ?? '',
    /All 900 in this filter selected/,
  );
  assert.equal(
    bar
      ?.querySelector('[data-ayq-bulk-basis]')
      ?.getAttribute('data-ayq-bulk-basis'),
    'filter',
  );
  assert.equal(
    (find(window, '[data-ayq-select-row="t-7"]') as HTMLInputElement).checked,
    true,
    'the whole filter includes every row on the screen, and the ticks say so',
  );

  await ayqPress(find(window, '[data-ayq-action="bulk-category"]'));
  await ayqType(
    find(window, '[data-ayq-bulk-category-choice]'),
    'cat-groceries',
  );
  await ayqPress(find(window, '[data-ayq-action="bulk-category-apply"]'));
  const sent = window.asked.filter(
    one => one.kind === 'transactions.categoriseMany',
  );
  assert.equal(sent.length, 1);
  assert.deepEqual(
    sent[0].scope,
    { kind: 'filter', filter: { search: 'test' } },
    'the scope is the filter the Register is holding, without its page depth',
  );

  await window.close();
});

test('unticking one row after choosing the whole filter is a selection again', async () => {
  const many = Array.from({ length: 500 }, (_, index) => row(`t-${index}`));
  const window = await ayqOpenWindow(engine(many, 900));
  await window.render(screen(() => {}, { search: 'test' }));
  await tick(window, 't-0');
  await ayqPress(find(window, '[data-ayq-action="bulk-scope"]'));
  await tick(window, 't-3');
  assert.equal(
    find(window, '[data-ayq-bulk-basis]')?.getAttribute('data-ayq-bulk-basis'),
    'shown',
    'a claim over the whole filter cannot stand once a row has been taken out',
  );
  assert.equal(
    find(window, '[data-ayq-bulk-count]')?.textContent,
    '499 selected',
  );
  await window.close();
});

test('an amount-only filter does not offer the whole filter as a scope', async () => {
  const many = Array.from({ length: 500 }, (_, index) => row(`t-${index}`));
  const window = await ayqOpenWindow(engine(many, 900));
  await window.render(screen(() => {}, { minCents: 1000 }));
  await tick(window, 't-0');
  assert.ok(find(window, '[data-ayq-bulk]'));
  assert.equal(
    find(window, '[data-ayq-action="bulk-scope"]'),
    null,
    'the amount alone is never a scope (03 §4.8)',
  );
  await window.close();
});

test('a change of filter drops the selection, so no stale scope is claimed', async () => {
  let filter: Record<string, unknown> = {};
  const window = await ayqOpenWindow(engine(ROWS));
  const draw = async (): Promise<void> => {
    await window.render(
      screen(next => {
        filter = next;
      }, filter),
    );
  };
  await draw();
  await tick(window, 't-1');
  assert.ok(find(window, '[data-ayq-bulk]'));

  await ayqPress(find(window, '[data-ayq-filter-uncategorised]'));
  await draw();
  assert.equal(
    find(window, '[data-ayq-bulk]'),
    null,
    'the filter changed and the old selection was still claimed',
  );
  assert.equal(
    (find(window, '[data-ayq-select-row="t-1"]') as HTMLInputElement).checked,
    false,
  );
  await window.close();
});

test('the header tick gathers every row shown, and clears them again', async () => {
  const window = await ayqOpenWindow(engine(ROWS));
  await window.render(screen());
  await ayqPress(find(window, '[data-ayq-select-shown]'));
  assert.equal(
    find(window, '[data-ayq-bulk-count]')?.textContent,
    '3 selected',
  );
  await ayqPress(find(window, '[data-ayq-action="bulk-clear"]'));
  assert.equal(find(window, '[data-ayq-bulk]'), null);
  assert.equal(
    (find(window, '[data-ayq-select-row="t-2"]') as HTMLInputElement).checked,
    false,
  );
  await window.close();
});

test('rows already filed by hand are named before the decision, and kept unless said otherwise', async () => {
  const window = await ayqOpenWindow(engine(ROWS, ROWS.length, 1));
  await window.render(screen());
  await tick(window, 't-1');
  await tick(window, 't-3');
  await ayqPress(find(window, '[data-ayq-action="bulk-category"]'));

  const note = find(window, '[data-ayq-bulk-by-hand]');
  assert.ok(note, 'one of these was filed by hand and the bar did not say so');
  assert.match(note.textContent ?? '', /1 of these were filed by hand/);

  await ayqPress(find(window, '[data-ayq-bulk-include-by-hand]'));
  await ayqType(
    find(window, '[data-ayq-bulk-category-choice]'),
    'cat-utilities',
  );
  await ayqPress(find(window, '[data-ayq-action="bulk-category-apply"]'));
  const sent = window.asked.filter(
    one => one.kind === 'transactions.categoriseMany',
  );
  assert.equal(
    sent[0].includeByHand,
    true,
    'the person said so, and the engine was told',
  );
  await window.close();
});

test('a counterparty correction states how far it reaches before it is made', async () => {
  const window = await ayqOpenWindow(engine(ROWS));
  await window.render(screen());
  await tick(window, 't-2');
  await ayqPress(find(window, '[data-ayq-action="bulk-counterparty"]'));

  const reach = find(window, '[data-ayq-bulk-reach]');
  assert.ok(reach, 'the reach of the decision was not stated');
  assert.equal(reach.getAttribute('data-ayq-bulk-reach'), '9');
  assert.match(
    reach.textContent ?? '',
    /records the 1 bank names behind your selection/,
  );
  assert.match(
    reach.textContent ?? '',
    /9 in all, 8 of them not in your selection/,
  );

  const apply = find(
    window,
    '[data-ayq-action="bulk-counterparty-apply"]',
  ) as HTMLButtonElement;
  assert.equal(apply.disabled, true, 'nothing chosen, nothing to record');
  await ayqType(
    find(window, '[data-ayq-bulk-counterparty-choice]'),
    'TESTFUEL STATION',
  );
  await ayqPress(find(window, '[data-ayq-action="bulk-counterparty-apply"]'));

  const sent = window.asked.filter(
    one => one.kind === 'transactions.correctCounterparty',
  );
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].scope, {
    kind: 'selected',
    transactionIds: ['t-2'],
  });
  assert.equal(sent[0].counterpartyKey, 'TESTFUEL STATION');
  assert.match(
    find(window, '[data-ayq-bulk-outcome]')?.textContent ?? '',
    /9 transactions now belong to it/,
  );
  await window.close();
});
