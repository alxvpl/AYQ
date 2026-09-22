// The counterparty page (04 A37, A29; 03 §3).
//
// What is being checked: the evidence the bank printed is shown as it was
// and stays when the owner names the counterparty; the rules that mention it
// are inspectable where they are seen; a merge states before the button that
// every record is kept and that it is undone only by a further identity
// decision, and then sends that merge and nothing else; undoing one identity
// decision is explicit and per variant; and the page asks the engine no
// analytical question.
//
// Every name and count below is invented.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { AyqCounterpartyDetail } from '../src/ayq-ipc-contract.ts';
import { AyqCounterpartyScreen } from '../src/ayq-screens/ayq-counterparty.tsx';
import { ayqText } from '../src/ayq-strings.ts';
import { AyqGroundProvider } from '../src/ayq-ui/ayq-ground-provider.tsx';

import { ayqOpenWindow, ayqPress, ayqType } from './ayq-react.ts';
import type { AyqWindow } from './ayq-react.ts';

const DETAIL: AyqCounterpartyDetail = {
  counterparty: {
    key: 'TESTMARKT',
    name: 'Testmarkt',
    transactions: 9,
    outgoingCents: 41_230,
    firstDate: '2026-01-08',
    lastDate: '2026-09-09',
    categoryName: 'Groceries',
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
      aliasId: null,
    },
    {
      key: 'TESTMKT EXPRESS',
      names: ['TESTMKT EXPRESS 4'],
      transactions: 2,
      firstDate: '2026-05-02',
      lastDate: '2026-07-02',
      aliased: true,
      aliasId: 'alias-1',
    },
  ],
  recurring: null,
  recent: [],
  rules: [
    {
      id: 'rule-1',
      counterpartyKey: 'TESTMARKT',
      categoryName: 'Groceries',
      createdAt: '2026-02-01T09:00:00.000Z',
    },
  ],
  ownerNamed: true,
};

const CATEGORIES = [
  {
    id: 'cat-1',
    name: 'Groceries',
    groupId: 'g',
    groupName: 'Home',
    isIncome: false,
  },
  {
    id: 'cat-2',
    name: 'Transport',
    groupId: 'g',
    groupName: 'Home',
    isIncome: false,
  },
];

function engine(over: Record<string, unknown> = {}) {
  return (request: Record<string, unknown>): unknown => {
    switch (request.kind) {
      case 'counterparty.detail':
        return over.detail ?? DETAIL;
      case 'categories.list':
        return CATEGORIES;
      case 'rules.impact':
        return {
          rule: DETAIL.rules[0],
          filed: 7,
          byHand: 0,
          categoryExists: true,
        };
      case 'counterparties.list':
        return {
          rows: [
            { ...DETAIL.counterparty },
            {
              key: 'TESTMARKET',
              name: 'Testmarket',
              transactions: 3,
              outgoingCents: 9_000,
              firstDate: '2026-03-01',
              lastDate: '2026-08-01',
              categoryName: null,
              recurring: false,
              aliases: 0,
            },
          ],
          total: 2,
          shown: 2,
        };
      case 'counterparty.merge':
        return {
          counterpartyKey: 'TESTMARKET',
          counterpartyName: 'Testmarket',
          variants: 2,
          moved: 9,
          rulesMoved: 1,
          rulesRemoved: 0,
        };
      case 'counterparty.setName':
        return {
          ...DETAIL,
          counterparty: { ...DETAIL.counterparty, name: 'The corner shop' },
        };
      case 'alias.remove':
        return {
          aliases: [],
          moved: 2,
          counterpartyKey: 'TESTMKT EXPRESS',
          counterpartyName: 'TESTMKT EXPRESS 4',
        };
      default:
        return undefined;
    }
  };
}

function screen(opened: string[] = [], backs: number[] = []) {
  return (
    <AyqGroundProvider>
      <AyqCounterpartyScreen
        counterpartyKey="TESTMARKT"
        onFailure={message => {
          throw new Error(message);
        }}
        onChanged={() => {}}
        onOpenRegister={() => {}}
        onOpenKey={key => opened.push(key)}
        onBack={() => backs.push(1)}
      />
    </AyqGroundProvider>
  );
}

const find = (window: AyqWindow, selector: string): Element | null =>
  window.container.querySelector(selector);

test('the evidence is what the bank printed, and the owner\'s name does not replace it', async () => {
  const window = await ayqOpenWindow(engine());
  await window.render(screen());
  assert.equal(find(window, '[data-ayq-cp-name]')?.textContent, 'Testmarkt');
  const names = [
    ...window.container.querySelectorAll('[data-ayq-cp-variant-names]'),
  ].map(one => one.textContent);
  assert.match(names[0] ?? '', /TESTMARKT 118 AMSTERDAM/);
  assert.match(names[0] ?? '', /TESTMARKT 22 UTRECHT/);
  assert.match(names[1] ?? '', /TESTMKT EXPRESS 4/);
  assert.match(
    find(window, '[data-ayq-cp-evidence]')?.textContent ?? '',
    /never replaces it/,
  );

  await ayqPress(find(window, '[data-ayq-action="cp-rename"]'));
  await ayqType(find(window, '[data-ayq-cp-rename-input]'), 'The corner shop');
  await ayqPress(find(window, '[data-ayq-action="cp-rename-save"]'));
  const sent = window.asked.filter(one => one.kind === 'counterparty.setName');
  assert.deepEqual(
    sent.map(one => [one.counterpartyKey, one.displayName]),
    [['TESTMARKT', 'The corner shop']],
  );
  assert.match(
    find(window, '[data-ayq-cp-said]')?.textContent ?? '',
    /What the bank printed is kept as it was/,
  );
  await window.close();
});

test('the rules that mention it are inspectable here, through the same card', async () => {
  const window = await ayqOpenWindow(engine());
  await window.render(screen());
  assert.equal(
    find(window, '[data-ayq-cp-rules]')?.getAttribute('data-ayq-cp-rules'),
    '1',
  );
  const card = find(window, '[data-ayq-rule-card="rule-1"]');
  assert.ok(card, 'the rule is not shown where the counterparty is');
  assert.match(
    card.querySelector('[data-ayq-rule-impact]')?.textContent ?? '',
    /filed 7 transactions/,
  );
  assert.ok(card.querySelector('[data-ayq-action="rule-correct"]'));
  assert.ok(card.querySelector('[data-ayq-action="rule-remove"]'));
  await window.close();
});

test('a merge states that every record is kept and how it is undone, before it is sent', async () => {
  const opened: string[] = [];
  const window = await ayqOpenWindow(engine());
  await window.render(screen(opened));
  await ayqPress(find(window, '[data-ayq-action="cp-merge"]'));
  const picker = find(
    window,
    '[data-ayq-cp-merge-target]',
  ) as HTMLSelectElement;
  assert.ok(picker, 'nothing to merge into');
  assert.ok(
    ![...picker.options].some(one => one.value === 'TESTMARKT'),
    'itself is offered',
  );
  await ayqType(picker, 'TESTMARKET');

  const consequence =
    find(window, '[data-ayq-cp-merge-consequence]')?.textContent ?? '';
  assert.match(
    consequence,
    /2 statement variants of Testmarkt becomes Testmarket/,
  );
  assert.match(consequence, /9 transactions move, and every record is kept/);
  assert.match(consequence, /undone only by a further identity decision/);
  assert.equal(
    window.asked.filter(one => one.kind === 'counterparty.merge').length,
    0,
  );

  await ayqPress(find(window, '[data-ayq-action="cp-merge-confirm"]'));
  const sent = window.asked.filter(one => one.kind === 'counterparty.merge');
  assert.deepEqual(
    sent.map(one => [one.counterpartyKey, one.intoKey]),
    [['TESTMARKT', 'TESTMARKET']],
  );
  assert.ok(
    !window.asked.some(
      one =>
        one.kind === 'alias.create' ||
        one.kind === 'rules.correct' ||
        one.kind === 'transaction.categoriseCounterparty',
    ),
    'a merge decided about identity and nothing else',
  );
  assert.deepEqual(opened, ['TESTMARKET'], 'the page follows the transactions');
  await window.close();
});

test('undoing one identity decision is explicit, per variant, and says what goes back', async () => {
  const window = await ayqOpenWindow(engine());
  await window.render(screen());
  assert.equal(
    find(window, '[data-ayq-action="cp-alias-undo-TESTMARKT"]'),
    null,
    'the counterparty\'s own key is not an identity decision to undo',
  );
  await ayqPress(
    find(window, '[data-ayq-action="cp-alias-undo-TESTMKT EXPRESS"]'),
  );
  assert.match(
    find(window, '[data-ayq-cp-undo-consequence]')?.textContent ?? '',
    /2 transactions printed as TESTMKT EXPRESS 4 go back to being their own counterparty, TESTMKT EXPRESS/,
  );
  assert.equal(
    window.asked.filter(one => one.kind === 'alias.remove').length,
    0,
  );
  await ayqPress(find(window, '[data-ayq-action="cp-alias-undo-confirm"]'));
  assert.deepEqual(
    window.asked
      .filter(one => one.kind === 'alias.remove')
      .map(one => one.aliasId),
    ['alias-1'],
  );
  assert.match(
    find(window, '[data-ayq-cp-said]')?.textContent ?? '',
    /TESTMKT EXPRESS is its own counterparty again; 2 transactions moved/,
  );
  await window.close();
});

test('the page asks no analytical question, and offers the way back', async () => {
  const backs: number[] = [];
  const window = await ayqOpenWindow(engine());
  await window.render(screen([], backs));
  const kinds = new Set(window.asked.map(one => one.kind));
  for (const analytical of [
    'spending',
    'recurring.list',
    'counterparties.unfiled',
    'reports',
  ]) {
    assert.ok(!kinds.has(analytical), `${analytical} was asked`);
  }
  assert.ok(
    !(find(window, '[data-ayq-counterparty-page]')?.textContent ?? '').includes(
      ayqText('review.pane.file'),
    ),
    'filing belongs to Review, not here',
  );
  await ayqPress(find(window, '[data-ayq-action="cp-back"]'));
  assert.equal(backs.length, 1);
  await window.close();
});
