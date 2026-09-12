// Review (04 A6, A7; 03 §3.6, §4.1).
//
// The one thing this screen must never do is make one decision look like
// another. Filing a counterparty is a statement about the transactions in front
// of a person; learning a rule is a statement about every one that arrives from
// now on. So the two are separate controls, both are labelled, and what crosses
// the boundary says which it was — that last part is checked by the keys and the
// values of the request, not by the button that was pressed.
//
// The rest: the backlog is the engine's, largest first, and it is what shrinks
// (A6); the names the bank printed are shown as the evidence they are and can be
// corrected (§3.6); and nothing here files without a category.
//
// Every counterparty, name, amount and date below is invented.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type {
  AyqCounterpartyDetail,
  AyqUnfiled,
} from '../src/ayq-ipc-contract.ts';
import { AyqReviewScreen } from '../src/ayq-screens/ayq-review.tsx';
import { ayqText } from '../src/ayq-strings.ts';
import { AyqGroundProvider } from '../src/ayq-ui/ayq-ground-provider.tsx';
import { ayqOpenWindow, ayqPress, ayqType } from './ayq-react.ts';

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
];

const DETAIL: AyqCounterpartyDetail = {
  counterparty: {
    key: 'TESTMARKT',
    name: 'TESTMARKT',
    transactions: 9,
    outgoingCents: 41_250,
    firstDate: '2026-01-08',
    lastDate: '2026-09-09',
    categoryName: null,
    recurring: false,
    aliases: 1,
  },
  variants: [
    {
      key: 'TESTMARKT',
      names: ['TESTMARKT 118 AMSTERDAM', 'TESTMARKT 22 UTRECHT'],
      transactions: 7,
      firstDate: '2026-01-08',
      lastDate: '2026-09-09',
      aliased: false,
    },
    {
      key: 'TESTMKT EXPRESS',
      names: ['TESTMKT EXPRESS 4'],
      transactions: 2,
      firstDate: '2026-05-02',
      lastDate: '2026-07-02',
      aliased: true,
    },
  ],
  recurring: null,
  recent: [
    {
      id: 't-1',
      date: '2026-09-09',
      payee: 'TESTMARKT',
      amountCents: -4_920,
      account: 'AYQ NL…3579',
      accountId: 'acc-1',
      category: null,
      categoryId: null,
      categorySource: null,
      cleared: true,
    },
  ],
};

const CATEGORIES = [
  { id: 'cat-1', name: 'Groceries', groupId: 'g', groupName: 'Home', isIncome: false },
  { id: 'cat-2', name: 'Transport', groupId: 'g', groupName: 'Home', isIncome: false },
  { id: 'cat-3', name: 'Salary', groupId: 'i', groupName: 'Income', isIncome: true },
];

function engine(over: Record<string, unknown> = {}) {
  return (request: Record<string, unknown>): unknown => {
    if (request.kind === 'counterparties.unfiled') return over.backlog ?? BACKLOG;
    if (request.kind === 'categories.list') return CATEGORIES;
    if (request.kind === 'counterparty.detail') return over.detail ?? DETAIL;
    if (request.kind === 'transaction.categoriseCounterparty') {
      return (
        over.filed ?? {
          categorised: 9,
          keptByHand: 0,
          ruleWritten: request.createRule === true,
        }
      );
    }
    if (request.kind === 'alias.create') {
      return {
        aliases: [],
        moved: 2,
        counterpartyKey: 'TESTMARKT',
        counterpartyName: 'TESTMARKT',
      };
    }
    return undefined;
  };
}

function screen(
  opened: string[] = [],
  onFailure: (message: string) => void = message => {
    throw new Error(message);
  },
) {
  return (
    <AyqGroundProvider>
      <AyqReviewScreen
        onFailure={onFailure}
        onOpenRegister={key => opened.push(key)}
        onChanged={() => {}}
      />
    </AyqGroundProvider>
  );
}

function rows(window: { container: HTMLElement }): HTMLElement[] {
  return [
    ...window.container.querySelectorAll('[data-ayq-table="review"] tbody tr'),
  ] as HTMLElement[];
}

test('the backlog is the engine’s, and it is what shrinks (04 A6)', async () => {
  const window = await ayqOpenWindow(engine());
  await window.render(screen());

  assert.deepEqual(
    rows(window).map(one => one.getAttribute('data-ayq-row')),
    ['TESTMARKT', 'TESTFUEL'],
    'the order the engine answered in was not kept',
  );
  // Largest first is the engine's ordering, and the screen says how many are
  // waiting rather than leaving it to be counted off the table.
  assert.equal(
    window.container
      .querySelector('[data-ayq-backlog]')
      ?.getAttribute('data-ayq-backlog'),
    '2',
  );
  // And it says out loud that this queue is meant to shrink.
  assert.match(
    window.container.querySelector('[data-ayq-screen], [data-ayq-pane]')?.textContent ??
      '',
    /Counterparties AYQ has resolved and nobody has filed/,
  );

  const first = rows(window)[0];
  assert.match(first.textContent ?? '', /TESTMARKT/);
  assert.equal(
    first
      .querySelector('[data-ayq-cell="spent"] [data-ayq-figure]')
      ?.getAttribute('data-ayq-figure'),
    '41250',
  );

  await window.close();
});

test('filing and learning are two controls, and the request says which', async () => {
  const window = await ayqOpenWindow(engine());
  await window.render(screen());
  await ayqPress(rows(window)[0]);

  // Both are offered, and the difference is stated in words rather than left to
  // the labels alone.
  const said = window.container.querySelector('[data-ayq-file]')?.textContent ?? '';
  assert.match(said, /statement about the transactions below/);
  assert.match(said, /every one that arrives from now on/);

  await ayqType(window.container.querySelector('[data-ayq-review-category]'), 'cat-1');
  await ayqPress(window.container.querySelector('[data-ayq-action="review-file"]'));

  const filed = window.asked.find(
    one => one.kind === 'transaction.categoriseCounterparty',
  );
  assert.ok(filed, 'nothing was sent');
  assert.equal(filed.createRule, false, 'filing these learned a rule as well');
  assert.equal(filed.counterpartyKey, 'TESTMARKT');
  assert.equal(filed.categoryId, 'cat-1');
  assert.deepEqual(Object.keys(filed).sort(), [
    'categoryId',
    'counterpartyKey',
    'createRule',
    'id',
    'kind',
  ]);

  await window.close();
});

test('learning a rule is the other control, and says so afterwards', async () => {
  const window = await ayqOpenWindow(engine());
  await window.render(screen());
  await ayqPress(rows(window)[0]);

  await ayqType(window.container.querySelector('[data-ayq-review-category]'), 'cat-2');
  await ayqPress(window.container.querySelector('[data-ayq-action="review-learn"]'));

  const sent = window.asked.find(
    one => one.kind === 'transaction.categoriseCounterparty',
  );
  assert.ok(sent);
  assert.equal(sent.createRule, true);
  assert.equal(sent.categoryId, 'cat-2');

  // What it came to, in the engine's own numbers, and it says that the rule is
  // the part that reaches forward.
  assert.match(
    window.container.querySelector('[data-ayq-outcome]')?.textContent ?? '',
    /will file this counterparty from now on/,
  );

  await window.close();
});

test('what was left as it was is said, not swallowed', async () => {
  const window = await ayqOpenWindow(
    engine({ filed: { categorised: 7, keptByHand: 2, ruleWritten: false } }),
  );
  await window.render(screen());
  await ayqPress(rows(window)[0]);
  await ayqType(window.container.querySelector('[data-ayq-review-category]'), 'cat-1');
  await ayqPress(window.container.querySelector('[data-ayq-action="review-file"]'));

  const said = window.container.querySelector('[data-ayq-outcome]')?.textContent ?? '';
  assert.match(said, /7 filed/);
  assert.match(said, /2 left as they were/);
  assert.match(said, /you had filed them yourself/);

  await window.close();
});

test('nothing is filed without a category, and the engine is not asked', async () => {
  const refusals: string[] = [];
  const window = await ayqOpenWindow(engine());
  await window.render(screen([], message => refusals.push(message)));
  await ayqPress(rows(window)[0]);

  await ayqPress(window.container.querySelector('[data-ayq-action="review-file"]'));
  await ayqPress(window.container.querySelector('[data-ayq-action="review-learn"]'));

  assert.deepEqual(refusals, [
    ayqText('review.needsCategory'),
    ayqText('review.needsCategory'),
  ]);
  assert.equal(
    window.asked.filter(one => one.kind === 'transaction.categoriseCounterparty')
      .length,
    0,
  );

  await window.close();
});

test('only categories money can go out of are offered', async () => {
  const window = await ayqOpenWindow(engine());
  await window.render(screen());
  await ayqPress(rows(window)[0]);

  const offered = [
    ...window.container.querySelectorAll('[data-ayq-review-category] option'),
  ].map(one => (one as HTMLOptionElement).value);
  assert.deepEqual(offered, ['', 'cat-1', 'cat-2'], 'an income category was offered');

  await window.close();
});

test('the names the bank printed are the evidence, and say who decided', async () => {
  const window = await ayqOpenWindow(engine());
  await window.render(screen());
  await ayqPress(rows(window)[0]);

  // 03 §3.5: the evidence that decided is recorded, and §3.6: one merchant under
  // many strings is one counterparty. Both are shown rather than asserted.
  const names = [
    ...window.container.querySelectorAll('[data-ayq-variant-names]'),
  ].map(one => one.textContent ?? '');
  assert.ok(
    names.some(one => one.includes('TESTMARKT 118 AMSTERDAM')),
    'the raw names the bank printed are not shown',
  );

  // One variant is here because a person said so and one because the statement
  // did, and the screen says which is which rather than presenting them alike.
  const pane = window.container.querySelector('[data-ayq-counterparty]');
  assert.match(pane?.textContent ?? '', new RegExp(ayqText('review.pane.byHand')));
  assert.match(
    pane?.textContent ?? '',
    new RegExp(ayqText('review.pane.byStatement')),
  );

  await window.close();
});

test('saying a variant is somebody else sends that decision, and only that', async () => {
  const window = await ayqOpenWindow(engine());
  await window.render(screen());
  await ayqPress(rows(window)[0]);

  await ayqType(
    window.container.querySelector('[data-ayq-variant-move="TESTMKT EXPRESS"]'),
    'TESTMARKT',
  );

  const sent = window.asked.find(one => one.kind === 'alias.create');
  assert.ok(sent, 'nothing was sent');
  assert.equal(sent.variantKey, 'TESTMKT EXPRESS');
  assert.equal(sent.counterpartyKey, 'TESTMARKT');
  // A decision about identity, not an instruction about transactions.
  assert.deepEqual(Object.keys(sent).sort(), [
    'counterpartyKey',
    'id',
    'kind',
    'variant',
    'variantKey',
  ]);
  assert.match(
    window.container.querySelector('[data-ayq-outcome]')?.textContent ?? '',
    /2 transactions now belong to TESTMARKT/,
  );

  await window.close();
});

test('a counterparty with one variant is offered nothing to move it to', async () => {
  const window = await ayqOpenWindow(
    engine({
      detail: { ...DETAIL, variants: [DETAIL.variants[0]] },
    }),
  );
  await window.render(screen());
  await ayqPress(rows(window)[0]);

  assert.equal(
    window.container.querySelector('[data-ayq-variant-move]'),
    null,
    'a variant was offered itself as somewhere to go',
  );

  await window.close();
});

test('Review asks the shell for the Register rather than navigating', async () => {
  const opened: string[] = [];
  const window = await ayqOpenWindow(engine());
  await window.render(screen(opened));
  await ayqPress(rows(window)[0]);
  await ayqPress(window.container.querySelector('[data-ayq-action="review-register"]'));

  assert.deepEqual(opened, ['TESTMARKT']);

  await window.close();
});

test('an empty backlog says so, which is the point of the screen', async () => {
  const window = await ayqOpenWindow(engine({ backlog: [] }));
  await window.render(screen());

  assert.match(
    window.container.querySelector('[data-ayq-table="review"][data-ayq-empty]')
      ?.textContent ?? '',
    new RegExp(ayqText('review.backlog.none')),
  );
  assert.equal(
    window.container
      .querySelector('[data-ayq-backlog]')
      ?.getAttribute('data-ayq-backlog'),
    '0',
  );

  await window.close();
});
