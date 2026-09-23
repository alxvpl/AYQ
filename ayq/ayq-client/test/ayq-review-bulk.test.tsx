// Gathering counterparties in Review, and what the bar over them says
// (04 A36, A29; 03 §4.1).
//
// What is being checked: the bar states the gathered counterparties, their
// transactions and their money from the backlog rows; `File these` sends one
// filing per gathered counterparty with `createRule: false`, and `File these
// and remember` the same with `createRule: true` — the two decisions of A29
// kept apart in what crosses the boundary; nothing files without a category;
// and once filed, the gathering is gone and the outcome is said.
//
// Every counterparty, amount and date below is invented.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { AyqUnfiled } from '../src/ayq-ipc-contract.ts';
import { AyqReviewScreen } from '../src/ayq-screens/ayq-review.tsx';
import { AyqGroundProvider } from '../src/ayq-ui/ayq-ground-provider.tsx';

import { ayqOpenWindow, ayqPress, ayqType } from './ayq-react.ts';
import type { AyqWindow } from './ayq-react.ts';

const BACKLOG: AyqUnfiled[] = [
  {
    key: 'TESTMARKT',
    name: 'TESTMARKT',
    cents: 41_250,
    transactions: 9,
    firstDate: '2026-01-08',
    lastDate: '2026-09-09',
  },
  {
    key: 'TESTFUEL',
    name: 'TESTFUEL',
    cents: 8_100,
    transactions: 2,
    firstDate: '2026-03-05',
    lastDate: '2026-08-05',
  },
  {
    key: 'TESTKOFFIE',
    name: 'TESTKOFFIE',
    cents: 600,
    transactions: 1,
    firstDate: '2026-06-01',
    lastDate: '2026-06-01',
  },
];

const CATEGORIES = [
  {
    id: 'cat-1',
    name: 'Groceries',
    groupId: 'g',
    groupName: 'Home',
    isIncome: false,
  },
  {
    id: 'cat-3',
    name: 'Salary',
    groupId: 'i',
    groupName: 'Income',
    isIncome: true,
  },
];

function engine(
  filed: (key: string) => { categorised: number; keptByHand: number },
) {
  return (request: Record<string, unknown>): unknown => {
    if (request.kind === 'counterparties.unfiled') return BACKLOG;
    if (request.kind === 'categories.list') return CATEGORIES;
    if (request.kind === 'transaction.categoriseCounterparty') {
      return {
        ...filed(request.counterpartyKey as string),
        ruleWritten: request.createRule === true,
      };
    }
    return undefined;
  };
}

function screen(
  onFailure: (message: string) => void = message => {
    throw new Error(message);
  },
) {
  return (
    <AyqGroundProvider>
      <AyqReviewScreen
        onFailure={onFailure}
        onOpenRegister={() => {}}
        onChanged={() => {}}
      />
    </AyqGroundProvider>
  );
}

const tick = (window: AyqWindow, key: string): Promise<void> =>
  ayqPress(window.container.querySelector(`[data-ayq-select-row="${key}"]`));

const find = (window: AyqWindow, selector: string): Element | null =>
  window.container.querySelector(selector);

test('gathering counterparties states what they come to, before anything is filed', async () => {
  const window = await ayqOpenWindow(
    engine(() => ({ categorised: 1, keptByHand: 0 })),
  );
  await window.render(screen());
  assert.equal(find(window, '[data-ayq-bulk]'), null);

  await tick(window, 'TESTMARKT');
  await tick(window, 'TESTFUEL');
  const bar = find(window, '[data-ayq-bulk]');
  assert.ok(bar, 'two are ticked and there is no bar');
  assert.equal(
    bar.querySelector('[data-ayq-bulk-count]')?.textContent,
    '2 selected',
  );
  assert.match(
    bar.querySelector('[data-ayq-bulk-basis]')?.textContent ?? '',
    /11 transactions · €493\.50 out/,
    "the engine's counts, added up, and nothing invented",
  );
  assert.ok(
    !window.asked.some(one => one.kind === 'counterparty.detail'),
    'ticking a row opened it',
  );
  await window.close();
});

test('File these files each gathered counterparty by hand, and learns nothing', async () => {
  const window = await ayqOpenWindow(
    engine(key => ({
      categorised: key === 'TESTMARKT' ? 9 : 2,
      keptByHand: 0,
    })),
  );
  await window.render(screen());
  await tick(window, 'TESTMARKT');
  await tick(window, 'TESTFUEL');
  await ayqType(find(window, '[data-ayq-bulk-category-choice]'), 'cat-1');
  await ayqPress(find(window, '[data-ayq-action="bulk-file"]'));

  const sent = window.asked.filter(
    one => one.kind === 'transaction.categoriseCounterparty',
  );
  assert.deepEqual(
    sent.map(one => [one.counterpartyKey, one.categoryId, one.createRule]),
    [
      ['TESTMARKT', 'cat-1', false],
      ['TESTFUEL', 'cat-1', false],
    ],
    'one filing per counterparty, each saying it is not a rule (03 §4.1)',
  );
  assert.equal(
    find(window, '[data-ayq-bulk]'),
    null,
    'filed, and the gathering is gone',
  );
  assert.match(
    find(window, '[data-ayq-bulk-outcome]')?.textContent ?? '',
    /11 filed across 2 counterparties/,
  );
  assert.ok(
    window.asked.filter(one => one.kind === 'counterparties.unfiled').length >=
      2,
    'the backlog was read again',
  );
  await window.close();
});

test('File these and remember writes one rule per counterparty, and says so', async () => {
  const window = await ayqOpenWindow(
    engine(key => ({
      categorised: key === 'TESTMARKT' ? 9 : 1,
      keptByHand: 0,
    })),
  );
  await window.render(screen());
  await tick(window, 'TESTMARKT');
  await tick(window, 'TESTKOFFIE');
  assert.match(
    find(window, '[data-ayq-bulk]')?.textContent ?? '',
    /writes one rule per counterparty/,
    'the bar says what the second button does, before it is pressed',
  );
  await ayqType(find(window, '[data-ayq-bulk-category-choice]'), 'cat-1');
  await ayqPress(find(window, '[data-ayq-action="bulk-learn"]'));

  const sent = window.asked.filter(
    one => one.kind === 'transaction.categoriseCounterparty',
  );
  assert.deepEqual(
    sent.map(one => [one.counterpartyKey, one.createRule]),
    [
      ['TESTMARKT', true],
      ['TESTKOFFIE', true],
    ],
  );
  assert.match(
    find(window, '[data-ayq-bulk-outcome]')?.textContent ?? '',
    /10 filed, and AYQ will file these 2 counterparties from now on/,
  );
  await window.close();
});

test('nothing is filed in bulk without a category, and kept rows are counted', async () => {
  const said: string[] = [];
  const window = await ayqOpenWindow(
    engine(() => ({ categorised: 4, keptByHand: 1 })),
  );
  await window.render(screen(message => said.push(message)));
  await tick(window, 'TESTMARKT');
  await ayqPress(find(window, '[data-ayq-action="bulk-file"]'));
  assert.deepEqual(said, ['Choose a category first.']);
  assert.equal(
    window.asked.filter(
      one => one.kind === 'transaction.categoriseCounterparty',
    ).length,
    0,
  );

  await ayqType(find(window, '[data-ayq-bulk-category-choice]'), 'cat-1');
  await ayqPress(find(window, '[data-ayq-action="bulk-file"]'));
  assert.match(
    find(window, '[data-ayq-bulk-outcome]')?.textContent ?? '',
    /4 filed across 1 counterparties\. 1 kept as you had filed them by hand/,
  );
  await window.close();
});

test('the header tick gathers the whole backlog, and clearing lets it go', async () => {
  const window = await ayqOpenWindow(
    engine(() => ({ categorised: 1, keptByHand: 0 })),
  );
  await window.render(screen());
  await ayqPress(find(window, '[data-ayq-select-shown]'));
  assert.equal(
    find(window, '[data-ayq-bulk-count]')?.textContent,
    '3 selected',
  );
  await ayqPress(find(window, '[data-ayq-action="bulk-clear"]'));
  assert.equal(find(window, '[data-ayq-bulk]'), null);
  await window.close();
});
