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
import { ayqBlur, ayqOpenWindow, ayqType } from './ayq-react.ts';

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
};

function engine(sheet: AyqPlanSheet = SHEET) {
  return (request: Record<string, unknown>): unknown => {
    if (request.kind === 'plan.month') {
      return request.month === undefined || request.month === sheet.month
        ? sheet
        : { ...sheet, month: String(request.month) };
    }
    if (request.kind === 'budget.setPlan') return { month: sheet.month };
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
