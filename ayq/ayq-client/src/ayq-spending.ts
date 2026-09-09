// What the money went on, over a period a person chooses.
//
// This is the view categories exist for. Everything else AYQ does with them —
// filing one transaction, standing rules, keeping a manual choice safe from
// automation — is in service of being able to answer one question: what did
// this year cost, and on what.
//
// Two rules shape it. Spending is stated positive, because a person asking what
// a month cost does not want to read a negative number; and what nobody has
// filed yet is shown as a row of its own rather than dropped, because a total
// that omits it is a total that understates the year and says nothing about why.

import { ayqElement, ayqSelect, ayqTable } from './ayq-dom.ts';
import { ayqEuro, ayqMonth } from './ayq-format.ts';
import type { AyqSpending, AyqSpendingFilter } from './ayq-ipc-contract.ts';

export type AyqSpendingState = {
  filter: AyqSpendingFilter;
  spending: AyqSpending | null;
  /** 'all' | 'year' | 'month', remembered so the control reads back. */
  period: 'all' | 'year' | 'month';
  /** The year or month chosen, when the period is one of those. */
  chosen: string;
};

export function ayqEmptySpendingState(): AyqSpendingState {
  return { filter: {}, spending: null, period: 'all', chosen: '' };
}

/** The bounds a period choice means, which is all the engine is told. */
export function ayqSpendingBounds(
  period: AyqSpendingState['period'],
  chosen: string,
): AyqSpendingFilter {
  if (period === 'year' && chosen !== '') {
    return { from: `${chosen}-01-01`, to: `${chosen}-12-31` };
  }
  if (period === 'month' && chosen !== '') {
    // The last day is not computed: a bound of the next month's first day
    // would include it, and every month ends on or before the 31st.
    return { from: `${chosen}-01`, to: `${chosen}-31` };
  }
  return {};
}

export function ayqRenderSpending(
  state: AyqSpendingState,
  target: HTMLElement,
  redraw: (reload: boolean) => void,
  openCategory: (categoryId: string | null) => void,
): void {
  target.replaceChildren();
  const spending = state.spending;

  if (!spending) {
    target.append(ayqElement('p', 'empty-title', 'Reading the budget…'));
    return;
  }

  target.append(periodBar(state, spending, redraw));

  if (spending.rows.length === 0) {
    target.append(
      ayqElement('p', 'empty-title', 'Nothing was spent in this period.'),
      ayqElement(
        'p',
        'empty-body',
        'Import a statement, or choose a period the budget has transactions in.',
      ),
    );
    return;
  }

  target.append(figures(spending));

  const table = ayqTable(
    [
      {
        label: 'Category',
        className: 'col-payee',
        cell: row => row.categoryName,
      },
      {
        label: 'Share',
        className: 'col-share',
        cell: row => {
          const bar = ayqElement('div', 'bar');
          const fill = ayqElement('div', 'bar-fill');
          // Rounded to a whole percent for the label, but drawn from the exact
          // share: two categories a hair apart should not draw identically.
          fill.style.width = `${(row.share * 100).toFixed(2)}%`;
          bar.append(fill);
          bar.title = `${(row.share * 100).toFixed(1)}%`;
          return bar;
        },
      },
      {
        label: 'Transactions',
        className: 'col-count',
        cell: row => String(row.transactions),
      },
      {
        label: 'Spent',
        className: 'col-amount',
        // Positive, because the column is already called Spent: a minus sign
        // in front of a number under that heading says the same thing twice.
        cell: row => ayqElement('span', 'out', ayqEuro(row.cents)),
      },
    ],
    spending.rows,
    (row, line) => {
      line.classList.add('clickable');
      // The obvious next question about any row here is "on what?", and the
      // ledger already answers it: the same category, the same period.
      line.addEventListener('click', () => openCategory(row.categoryId));
    },
  );
  target.append(table);
}

/** The period control: everything, a year, or a month the budget has. */
function periodBar(
  state: AyqSpendingState,
  spending: AyqSpending,
  redraw: (reload: boolean) => void,
): HTMLElement {
  const bar = ayqElement('div', 'filters');

  const choose = (period: AyqSpendingState['period'], chosen: string): void => {
    state.period = period;
    state.chosen = chosen;
    state.filter = ayqSpendingBounds(period, chosen);
    redraw(true);
  };

  bar.append(
    ayqSelect(
      [
        { value: 'all', label: 'All time' },
        { value: 'year', label: 'One year' },
        { value: 'month', label: 'One month' },
      ],
      state.period,
      value => {
        const period = value as AyqSpendingState['period'];
        const first =
          period === 'year'
            ? (spending.years[0] ?? '')
            : period === 'month'
              ? (spending.months[0] ?? '')
              : '';
        choose(period, first);
      },
    ),
  );

  if (state.period === 'year') {
    bar.append(
      ayqSelect(
        spending.years.map(year => ({ value: year, label: year })),
        state.chosen,
        value => choose('year', value),
      ),
    );
  }

  if (state.period === 'month') {
    bar.append(
      ayqSelect(
        spending.months.map(month => ({
          value: month,
          label: ayqMonth(month),
        })),
        state.chosen,
        value => choose('month', value),
      ),
    );
  }

  return bar;
}

/** The three numbers worth stating before the breakdown. */
function figures(spending: AyqSpending): HTMLElement {
  const box = ayqElement('div', 'figures');

  const figure = (label: string, value: string, hint?: string): HTMLElement => {
    const one = ayqElement('div', 'figure');
    one.append(
      ayqElement('span', 'figure-label', label),
      ayqElement('span', 'figure-value', value),
    );
    if (hint) one.append(ayqElement('span', 'figure-hint', hint));
    return one;
  };

  box.append(figure('Spent', ayqEuro(spending.totalCents)));
  box.append(figure('Received', ayqEuro(spending.incomeCents)));

  // Stated as a share, because the number that matters about what is unfiled
  // is how much of the answer it makes unreliable.
  const unfiled =
    spending.totalCents === 0
      ? 0
      : (spending.uncategorisedCents / spending.totalCents) * 100;
  box.append(
    figure(
      'Not yet filed',
      ayqEuro(spending.uncategorisedCents),
      unfiled > 0 ? `${unfiled.toFixed(0)}% of the period` : undefined,
    ),
  );

  return box;
}
