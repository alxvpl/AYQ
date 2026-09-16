// The Plan worksheet (03 §7.8, §7.10; 04 A8).
//
// What is checked is the part a worksheet can get wrong: that every column is
// the engine's own figure and none is recomputed here; that "still expected" is
// the larger of what is left of the plan and the records expected in the
// category and never their sum, with the rule stated on the screen; that a month
// the budget cannot be planned in is readable and not editable, and says so; and
// that setting a plan sends the month, the category and the amount in cents, and
// nothing else.
//
// Every category and amount below is invented.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { AyqPlanSheet } from '../src/ayq-ipc-contract.ts';
import { AyqPlanScreen } from '../src/ayq-screens/ayq-plan.tsx';
import { ayqMonthName, ayqText } from '../src/ayq-strings.ts';
import { AyqGroundProvider } from '../src/ayq-ui/ayq-ground-provider.tsx';
import { ayqBlur, ayqOpenWindow, ayqPress, ayqType } from './ayq-react.ts';

const SHEET: AyqPlanSheet = {
  month: '2026-09',
  editable: true,
  today: '2026-09-12',
  months: ['2026-08', '2026-09', '2026-10'],
  rows: [
    {
      categoryId: 'cat-housing',
      categoryName: 'Housing',
      groupName: 'Home',
      isIncome: false,
      planCents: 150_000,
      actualCents: 120_000,
      remainingCents: 30_000,
      overspentCents: 0,
      // 03 §7.10: the larger of the 30_000 left of the plan and the 42_500 of
      // records expected in the category. Never 72_500.
      expectedCents: 42_500,
    },
    {
      categoryId: 'cat-groceries',
      categoryName: 'Groceries',
      groupName: 'Home',
      isIncome: false,
      planCents: 40_000,
      actualCents: 51_240,
      remainingCents: 0,
      overspentCents: 11_240,
      expectedCents: 0,
    },
    {
      categoryId: 'cat-transport',
      categoryName: 'Transport',
      groupName: 'Getting about',
      isIncome: false,
      planCents: 0,
      actualCents: 8_100,
      remainingCents: 0,
      overspentCents: 8_100,
      expectedCents: 0,
    },
  ],
  totalPlanCents: 190_000,
  totalActualCents: 179_340,
  totalRemainingCents: 30_000,
  totalExpectedCents: 42_500,
  // 10 §10.2: a figure, the basis it rests on, and a category with no basis at
  // all — which is a different thing from a category suggested nothing for.
  suggestions: [
    {
      categoryId: 'cat-housing',
      categoryName: 'Housing',
      suggestedCents: 148_000,
      monthsUsed: 7,
      fromMonth: '2026-02',
      toMonth: '2026-08',
      totalCents: 1_036_000,
    },
    {
      categoryId: 'cat-groceries',
      categoryName: 'Groceries',
      suggestedCents: 40_873,
      monthsUsed: 7,
      fromMonth: '2026-02',
      toMonth: '2026-08',
      totalCents: 286_111,
    },
    {
      categoryId: 'cat-transport',
      categoryName: 'Transport',
      suggestedCents: null,
      monthsUsed: 0,
      fromMonth: null,
      toMonth: null,
      totalCents: 0,
    },
  ],
};

function engine(sheet: AyqPlanSheet = SHEET) {
  return (request: Record<string, unknown>): unknown => {
    if (request.kind === 'plan.month') {
      return request.month === undefined || request.month === sheet.month
        ? sheet
        : { ...sheet, month: String(request.month) };
    }
    if (request.kind === 'budget.setPlan') return { month: sheet.month };
    // Both acceptances answer with the sheet as it stands afterwards, which is
    // what the screen redraws from.
    if (
      request.kind === 'plan.useSuggestion' ||
      request.kind === 'plan.useAllSuggestions'
    ) {
      return sheet;
    }
    return undefined;
  };
}

function screen(onFailure: (message: string) => void = message => {
  throw new Error(message);
}) {
  return (
    <AyqGroundProvider>
      <AyqPlanScreen onFailure={onFailure} />
    </AyqGroundProvider>
  );
}

function row(window: { container: HTMLElement }, categoryId: string): HTMLElement {
  const found = [
    ...window.container.querySelectorAll('[data-ayq-table="plan"] tbody tr'),
  ].find(one => one.querySelector(`[data-ayq-category="${categoryId}"]`));
  assert.ok(found, `there is no row for ${categoryId}`);
  return found as HTMLElement;
}

function figure(where: Element, column: string): string | null {
  return (
    where
      .querySelector(`[data-ayq-cell="${column}"] [data-ayq-figure]`)
      ?.getAttribute('data-ayq-figure') ?? null
  );
}

test('every column is the engine’s own figure', async () => {
  const window = await ayqOpenWindow(engine());
  await window.render(screen());

  const housing = row(window, 'cat-housing');
  assert.equal(figure(housing, 'actual'), '120000');
  assert.equal(figure(housing, 'remaining'), '30000');
  assert.equal(figure(housing, 'expected'), '42500');

  // 03 §7.10, said out loud: the larger, not the sum. Nothing here adds the
  // two together, and the screen states the rule so the column can be trusted.
  assert.notEqual(figure(housing, 'expected'), '72500');
  assert.match(
    window.container.querySelector('[data-ayq-plan-rule]')?.textContent ?? '',
    /larger of what is left of the plan and the records expected/,
  );

  // A category spent past its plan has nothing left, and the overspend is not
  // turned into a negative remainder (§7.8).
  assert.equal(figure(row(window, 'cat-groceries'), 'remaining'), '0');
  assert.equal(figure(row(window, 'cat-groceries'), 'actual'), '51240');

  await window.close();
});

test('the totals are the engine’s too, and say which column each describes', async () => {
  const window = await ayqOpenWindow(engine());
  await window.render(screen());

  const totals = window.container.querySelector('[data-ayq-plan-totals]');
  assert.ok(totals, 'the sheet states no totals');
  const of = (which: string): string | null =>
    totals
      .querySelector(`[data-ayq-total="${which}"] [data-ayq-figure]`)
      ?.getAttribute('data-ayq-figure') ?? null;

  assert.equal(of('plan'), '190000');
  assert.equal(of('actual'), '179340');
  assert.equal(of('remaining'), '30000');
  assert.equal(of('expected'), '42500');
  // Each is named, because four bare figures in a row are four figures nobody
  // can tell apart.
  assert.match(totals.textContent ?? '', new RegExp(ayqText('plan.column.plan')));
  assert.match(totals.textContent ?? '', new RegExp(ayqText('plan.column.expected')));

  await window.close();
});

test('setting a plan sends the month, the category and the cents', async () => {
  const window = await ayqOpenWindow(engine());
  await window.render(screen());

  const cell = row(window, 'cat-transport').querySelector('[data-ayq-plan-cell]');
  await ayqType(cell, '87.50');
  await ayqBlur(cell);

  const sent = window.asked.find(one => one.kind === 'budget.setPlan');
  assert.ok(sent, 'nothing was sent');
  assert.equal(sent.month, '2026-09');
  assert.equal(sent.categoryId, 'cat-transport');
  assert.equal(sent.cents, 8_750);
  assert.deepEqual(Object.keys(sent).sort(), [
    'categoryId',
    'cents',
    'id',
    'kind',
    'month',
  ]);

  await window.close();
});

test('a cell shows the engine’s figure until the edit is committed', async () => {
  const window = await ayqOpenWindow(engine());
  await window.render(screen());

  const cell = row(window, 'cat-housing').querySelector(
    '[data-ayq-plan-cell]',
  ) as HTMLInputElement;
  assert.equal(cell.value, '1500.00', 'the cell does not show what the engine holds');

  // Typing is not yet a decision, and nothing crosses the boundary for it.
  await ayqType(cell, '16');
  assert.equal(
    window.asked.filter(one => one.kind === 'budget.setPlan').length,
    0,
    'a keystroke was sent to the engine',
  );

  await window.close();
});

test('a plan that has not changed is not sent again', async () => {
  const window = await ayqOpenWindow(engine());
  await window.render(screen());

  const cell = row(window, 'cat-housing').querySelector('[data-ayq-plan-cell]');
  await ayqType(cell, '1500.00');
  await ayqBlur(cell);

  assert.equal(
    window.asked.filter(one => one.kind === 'budget.setPlan').length,
    0,
    'the same plan was written over itself',
  );

  await window.close();
});

test('a month that cannot be planned in is read, and says so', async () => {
  const window = await ayqOpenWindow(
    engine({ ...SHEET, editable: false, month: '2099-01' }),
  );
  await window.render(screen());

  assert.equal(
    window.container
      .querySelector('[data-ayq-plan-editable]')
      ?.getAttribute('data-ayq-plan-editable'),
    'false',
  );
  assert.match(
    window.container.querySelector('[data-ayq-plan-editable]')?.textContent ?? '',
    /can be read and not changed/,
  );

  // No cell to type into, rather than a cell that refuses when it is used.
  assert.equal(window.container.querySelector('[data-ayq-plan-cell]'), null);
  // And the figures are still there to read.
  assert.equal(figure(row(window, 'cat-housing'), 'plan'), '150000');

  await window.close();
});

test('choosing another month asks the engine for that month', async () => {
  const window = await ayqOpenWindow(engine());
  await window.render(screen());

  await ayqType(window.container.querySelector('[data-ayq-plan-month]'), '2026-10');

  const asked = window.asked.filter(one => one.kind === 'plan.month');
  assert.equal(asked.at(-1)?.month, '2026-10');
  // Every month the budget can be asked about is offered, and named.
  const offered = [
    ...(window.container.querySelectorAll('[data-ayq-plan-month] option') ?? []),
  ].map(one => (one as HTMLOptionElement).value);
  assert.deepEqual(offered, SHEET.months);
  assert.match(
    window.container.querySelector('[data-ayq-plan-month]')?.textContent ?? '',
    new RegExp(ayqMonthName('2026-09')),
  );

  await window.close();
});

test('a budget with no categories says so where the rows would be', async () => {
  const window = await ayqOpenWindow(
    engine({
      ...SHEET,
      rows: [],
      totalPlanCents: 0,
      totalActualCents: 0,
      totalRemainingCents: 0,
      totalExpectedCents: 0,
      suggestions: [],
    }),
  );
  await window.render(screen());

  assert.match(
    window.container.querySelector('[data-ayq-table="plan"][data-ayq-empty]')
      ?.textContent ?? '',
    new RegExp(ayqText('plan.empty')),
  );

  await window.close();
});

/* ------------------------------------------------- what history suggests (10)

   Beside the plan, never in it. A suggestion is an offer with its basis stated;
   what makes it a plan is a person deciding, and the two acts that do that are
   deliberately not the same act.                                            */

test('a suggestion is shown with the basis it rests on, and is not the plan', async () => {
  const window = await ayqOpenWindow(engine());
  await window.render(screen());

  const rows = window.container.querySelectorAll(
    '[data-ayq-table="plan"] tbody tr',
  );
  const housing = rows[0];

  const suggestion = housing.querySelector('[data-ayq-suggestion]');
  assert.ok(suggestion, 'the sheet does not show a suggestion at all');
  assert.equal(suggestion.getAttribute('data-ayq-suggestion'), '148000');
  assert.equal(suggestion.getAttribute('data-ayq-suggestion-months'), '7');

  // It says what it is based on, so the figure can be checked rather than
  // believed. Seven, not twelve.
  assert.match(suggestion.textContent ?? '', /7 months/);

  // And Planned is still the owner's own figure, untouched.
  assert.equal(
    (housing.querySelector('[data-ayq-plan-cell="cat-housing"]') as HTMLInputElement)
      ?.value,
    '1500.00',
    'a suggestion became the plan on its own',
  );

  await window.close();
});

test('a category with no basis says so, rather than being suggested nought', async () => {
  const window = await ayqOpenWindow(engine());
  await window.render(screen());

  const rows = window.container.querySelectorAll(
    '[data-ayq-table="plan"] tbody tr',
  );
  const transport = rows[2];
  const none = transport.querySelector('[data-ayq-suggestion="none"]');
  assert.ok(none, 'a category with no basis was given a figure');
  assert.equal(none.textContent, ayqText('plan.suggestion.none'));
  // Nought is a plan. No basis is not.
  assert.ok(!/0[.,]00/.test(none.textContent ?? ''));

  await window.close();
});

test('the whole sheet says how many months the suggestions rest on', async () => {
  const window = await ayqOpenWindow(engine());
  await window.render(screen());

  const basis = window.container.querySelector('[data-ayq-plan-basis]');
  assert.ok(basis);
  assert.match(basis.textContent ?? '', /7 complete/);
  assert.match(basis.textContent ?? '', /fills only rows with no plan/);

  await window.close();
});

test('Use suggestion sends that row, and only that row (10 §10.3)', async () => {
  const window = await ayqOpenWindow(engine());
  await window.render(screen());

  await ayqPress(
    window.container.querySelector('[data-ayq-action="plan-use-cat-groceries"]'),
  );

  const sent = window.asked.filter(one => one.kind === 'plan.useSuggestion');
  assert.equal(sent.length, 1);
  // The correlation id is the bridge's; what the screen decided is the rest.
  const { id: _id, ...asked } = sent[0];
  assert.deepEqual(asked, {
    kind: 'plan.useSuggestion',
    month: '2026-09',
    categoryId: 'cat-groceries',
  });
  // Not the bulk action, which is a different decision.
  assert.equal(
    window.asked.filter(one => one.kind === 'plan.useAllSuggestions').length,
    0,
  );

  await window.close();
});

test('Use all suggestions is offered only when it would fill something', async () => {
  // Transport is the one row with no plan, and it has no suggestion — so a
  // bulk action would do nothing, and is not offered.
  const nothingToFill = await ayqOpenWindow(engine());
  await nothingToFill.render(screen());
  assert.equal(
    nothingToFill.container.querySelector('[data-ayq-action="plan-use-all"]'),
    null,
    'a bulk action was offered that would have done nothing',
  );
  await nothingToFill.close();

  // Give Transport a suggestion and it becomes worth offering.
  const fillable: AyqPlanSheet = {
    ...SHEET,
    suggestions: SHEET.suggestions.map(one =>
      one.categoryId === 'cat-transport'
        ? { ...one, suggestedCents: 9_000, monthsUsed: 7, fromMonth: '2026-02', toMonth: '2026-08' }
        : one,
    ),
  };
  const window = await ayqOpenWindow(engine(fillable));
  await window.render(screen());
  await ayqPress(window.container.querySelector('[data-ayq-action="plan-use-all"]'));

  const bulk = window.asked.filter(
    one => one.kind === 'plan.useAllSuggestions',
  );
  assert.equal(bulk.length, 1);
  const { id: _bulkId, ...sentBulk } = bulk[0];
  assert.deepEqual(sentBulk, {
    kind: 'plan.useAllSuggestions',
    month: '2026-09',
  });

  await window.close();
});

test('a month that cannot be planned in offers no acceptance at all', async () => {
  const window = await ayqOpenWindow(
    engine({ ...SHEET, editable: false }),
  );
  await window.render(screen());

  assert.equal(
    window.container.querySelector('[data-ayq-action="plan-use-all"]'),
    null,
  );
  assert.equal(
    window.container.querySelector('[data-ayq-action="plan-use-cat-housing"]'),
    null,
  );

  await window.close();
});
