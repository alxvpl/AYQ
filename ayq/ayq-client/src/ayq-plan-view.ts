// Plan: categories down, one month across.
//
// A worksheet, and deliberately not the other two things it could have been.
// Not envelope budgeting (04 A8): no money is assigned in advance and nothing
// carries into next month — the plan is a frame to measure against, and a month
// that ends with the frame unfilled has simply ended. And not a dashboard of
// cards (04 A3): four numbers about eleven categories is a table, and a table is
// what lets a person read down a column and see where the month went.
//
// The four numbers are the plan, what actually happened, what is left of the
// plan, and what AYQ still expects before the month is out. The last is the
// forecast's own figure rather than one computed here, so this screen and
// Upcoming cannot come to disagree about the same month (04 A9).

import { ayqAsk } from './ayq-bridge.ts';
import { ayqElement, ayqSelect, ayqTable } from './ayq-dom.ts';
import { ayqEuro, ayqMonth } from './ayq-format.ts';
import type { AyqPlanSheet, AyqPlanSheetRow } from './ayq-ipc-contract.ts';

export type AyqPlanViewState = {
  sheet: AyqPlanSheet | null;
  /** The month being looked at; null means the one today is in. */
  month: string | null;
  problem: string | null;
};

export function ayqEmptyPlanViewState(): AyqPlanViewState {
  return { sheet: null, month: null, problem: null };
}

export function ayqRenderPlan(
  state: AyqPlanViewState,
  target: HTMLElement,
  redraw: (reload: boolean) => void,
): void {
  target.replaceChildren();
  const sheet = state.sheet;

  if (sheet === null) {
    target.append(ayqElement('p', 'empty-title', 'Reading the budget…'));
    return;
  }

  target.append(monthBar(state, sheet, redraw));
  if (state.problem !== null) {
    target.append(ayqElement('p', 'error', state.problem));
  }
  if (!sheet.editable) {
    target.append(
      ayqElement(
        'p',
        'empty-body',
        'This month is outside the range the budget keeps, so it can be read ' +
          'and not planned in.',
      ),
    );
  }

  target.append(figures(sheet));

  const expenses = sheet.rows.filter(row => !row.isIncome);
  if (expenses.length === 0) {
    target.append(
      ayqElement('p', 'empty-title', 'This budget has no categories yet.'),
    );
    return;
  }

  target.append(sheetTable(state, sheet, expenses, redraw));
}

/** The month being looked at, and every month the budget can be asked about. */
function monthBar(
  state: AyqPlanViewState,
  sheet: AyqPlanSheet,
  redraw: (reload: boolean) => void,
): HTMLElement {
  const bar = ayqElement('div', 'filters');
  bar.dataset.ayqPlanMonth = sheet.month;

  // Newest first: a person opening this is far more often looking at the month
  // they are in than at one four years ago.
  const months = [...sheet.months].reverse();
  bar.append(
    ayqSelect(
      months.map(month => ({ value: month, label: ayqMonth(month) })),
      sheet.month,
      value => {
        state.month = value;
        state.problem = null;
        redraw(true);
      },
    ),
  );

  if (sheet.month !== sheet.today.slice(0, 7)) {
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'quiet small';
    back.textContent = 'This month';
    back.addEventListener('click', () => {
      state.month = sheet.today.slice(0, 7);
      redraw(true);
    });
    bar.append(back);
  }

  return bar;
}

function figures(sheet: AyqPlanSheet): HTMLElement {
  const box = ayqElement('div', 'figures');
  box.dataset.ayqPlanSheet = 'ready';

  const figure = (label: string, value: string, tone?: string): void => {
    const one = ayqElement('div', 'figure');
    one.append(
      ayqElement('span', 'figure-label', label),
      ayqElement('span', `figure-value ${tone ?? ''}`.trim(), value),
    );
    box.append(one);
  };

  figure('Planned', ayqEuro(sheet.totalPlanCents));
  figure('Spent', ayqEuro(sheet.totalActualCents), 'out');
  figure('Left of the plan', ayqEuro(sheet.totalRemainingCents));
  figure('Still expected', ayqEuro(sheet.totalExpectedCents), 'out');

  return box;
}

function sheetTable(
  state: AyqPlanViewState,
  sheet: AyqPlanSheet,
  rows: AyqPlanSheetRow[],
  redraw: (reload: boolean) => void,
): HTMLElement {
  return ayqTable<AyqPlanSheetRow>(
    [
      {
        label: 'Category',
        className: 'col-payee',
        cell: row => row.categoryName,
      },
      {
        label: 'Plan',
        className: 'col-amount',
        cell: row => planInput(state, sheet, row, redraw),
      },
      {
        label: 'Spent',
        className: 'col-amount',
        cell: row =>
          ayqElement(
            'span',
            row.actualCents > 0 ? 'out' : undefined,
            ayqEuro(row.actualCents),
          ),
      },
      {
        label: 'Left',
        className: 'col-amount',
        cell: row => {
          // The overspend rather than a negative remainder, because 03 §7.8
          // says the remainder never goes below zero — and because "−40,00
          // left" is a sentence nobody should have to parse.
          if (row.overspentCents > 0) {
            return ayqElement(
              'span',
              'out',
              `${ayqEuro(row.overspentCents)} over`,
            );
          }
          return ayqEuro(row.remainingCents);
        },
      },
      {
        label: 'Still expected',
        className: 'col-amount',
        cell: row =>
          row.expectedCents === 0 ? '—' : ayqEuro(row.expectedCents),
      },
    ],
    rows,
    (row, line) => {
      line.dataset.ayqCategory = row.categoryId;
    },
  );
}

/**
 * The one editable cell on the sheet.
 *
 * Written on blur and on Enter rather than on every keystroke: a person typing
 * "1200" would otherwise have set a plan of 1, then 12, then 120 on the way.
 */
function planInput(
  state: AyqPlanViewState,
  sheet: AyqPlanSheet,
  row: AyqPlanSheetRow,
  redraw: (reload: boolean) => void,
): HTMLElement {
  const field = document.createElement('input');
  field.type = 'text';
  field.inputMode = 'decimal';
  field.className = 'plan-input';
  field.dataset.ayqPlanFor = row.categoryId;
  field.value = row.planCents === 0 ? '' : (row.planCents / 100).toFixed(2);
  field.disabled = !sheet.editable;

  const commit = (): void => {
    const typed = field.value.trim();
    const cents =
      typed === '' ? 0 : Math.round(Number(typed.replace(',', '.')) * 100);
    if (!Number.isFinite(cents) || cents < 0) {
      state.problem = `"${typed}" is not an amount.`;
      redraw(false);
      return;
    }
    if (cents === row.planCents) return;
    // Marked, so nothing reads this control back as if it were an answer: what
    // the engine stored comes back in the row the renderer draws next.
    field.dataset.ayqTyped = '1';
    void save(state, sheet.month, row.categoryId, cents, redraw);
  };

  field.addEventListener('blur', commit);
  field.addEventListener('keydown', event => {
    if (event.key === 'Enter') field.blur();
  });
  return field;
}

async function save(
  state: AyqPlanViewState,
  month: string,
  categoryId: string,
  cents: number,
  redraw: (reload: boolean) => void,
): Promise<void> {
  try {
    const answer = await ayqAsk({
      kind: 'budget.setPlan',
      month,
      categoryId,
      cents,
    });
    state.problem = answer.ok ? null : answer.message;
  } catch (error) {
    state.problem = error instanceof Error ? error.message : String(error);
  }
  redraw(true);
}
