// Upcoming: what is coming, and where it leaves the money.
//
// The first screen that answers a question about the future rather than about
// the past. Three things, in the order a person asks them: what is available
// today, what is due, and what the position does over the next twelve months.
//
// The table is the screen (04 A3) and the right-hand pane is where a record is
// read and changed (04 A4). Nothing here computes money: every figure is the
// engine's, including the running position on each row, and the renderer
// formats them and nothing more.

import { ayqAsk } from './ayq-bridge.ts';
import { ayqElement, ayqSelect, ayqTable } from './ayq-dom.ts';
import { ayqDay, ayqEuro } from './ayq-format.ts';
import type {
  AyqCategory,
  AyqForecast,
  AyqForecastEvent,
  AyqPlan,
  AyqPlanDraft,
  AyqPlanFrequency,
  AyqPlanKind,
  AyqPlanOccurrence,
  AyqPlannedRecord,
} from './ayq-ipc-contract.ts';

export type AyqUpcomingState = {
  forecast: AyqForecast | null;
  plan: AyqPlan | null;
  /** The record the pane is open on. */
  openRecordId: string | null;
  /** The occurrence selected with it, for the two decisions that are its own. */
  openDueDate: string | null;
  /** True while a new record is being written rather than an existing one read. */
  drafting: boolean;
  /** What the engine refused, if it refused something. */
  problem: string | null;
};

export function ayqEmptyUpcomingState(): AyqUpcomingState {
  return {
    forecast: null,
    plan: null,
    openRecordId: null,
    openDueDate: null,
    drafting: false,
    problem: null,
  };
}

const FREQUENCIES: Array<{ value: AyqPlanFrequency; label: string }> = [
  { value: 'once', label: 'Once' },
  { value: 'weekly', label: 'Every week' },
  { value: 'fortnightly', label: 'Every fortnight' },
  { value: 'monthly', label: 'Every month' },
  { value: 'quarterly', label: 'Every quarter' },
  { value: 'half-yearly', label: 'Every six months' },
  { value: 'yearly', label: 'Every year' },
];

function frequencyLabel(record: AyqPlannedRecord): string {
  const name =
    FREQUENCIES.find(one => one.value === record.recurrence.frequency)?.label ??
    record.recurrence.frequency;
  return record.recurrence.interval > 1
    ? `${name} × ${record.recurrence.interval}`
    : name;
}

/* --------------------------------------------------------------- the screen */

export function ayqRenderUpcoming(
  state: AyqUpcomingState,
  categories: AyqCategory[],
  target: HTMLElement,
  redraw: (reload: boolean) => void,
): void {
  target.replaceChildren();
  const forecast = state.forecast;

  if (forecast === null) {
    target.append(ayqElement('p', 'empty-title', 'Reading the budget…'));
    return;
  }

  target.append(actionBar(state, redraw));
  if (state.problem !== null) {
    target.append(ayqElement('p', 'error', state.problem));
  }

  const bench = ayqElement('div', 'workbench');
  const main = ayqElement('div', 'workbench-main');
  main.append(figures(forecast));

  if (forecast.events.length === 0) {
    main.append(
      ayqElement('p', 'empty-title', 'Nothing is expected yet.'),
      ayqElement(
        'p',
        'empty-body',
        'A planned payment says what is coming and when. AYQ can also look ' +
          'through what has already been imported and offer the ones that ' +
          'keep coming back.',
      ),
    );
  } else {
    main.append(eventsTable(state, forecast, redraw));
  }

  bench.append(main);
  bench.append(paneFor(state, categories, redraw));
  target.append(bench);
}

/**
 * The four figures worth stating above the list.
 *
 * The lowest point is the one a forecast is really for: not what is left at the
 * end, which nobody plans around, but the worst it gets on the way there.
 */
function figures(forecast: AyqForecast): HTMLElement {
  const box = ayqElement('div', 'figures');
  box.dataset.ayqForecast = 'ready';

  const figure = (
    label: string,
    value: string,
    tone?: string,
    hint?: string,
  ): void => {
    const one = ayqElement('div', 'figure');
    one.append(
      ayqElement('span', 'figure-label', label),
      ayqElement('span', `figure-value ${tone ?? ''}`.trim(), value),
    );
    if (hint) one.append(ayqElement('span', 'figure-hint', hint));
    box.append(one);
  };

  const income = forecast.months.reduce(
    (sum, month) => sum + month.expectedIncomeCents,
    0,
  );
  const expense = forecast.months.reduce(
    (sum, month) => sum + month.expectedExpenseCents,
    0,
  );

  figure(
    'Available today',
    ayqEuro(forecast.availableFundsCents),
    forecast.availableFundsCents < 0 ? 'out' : 'in',
    'The accounts that count toward it',
  );
  figure('Expected in', ayqEuro(income), 'in', 'Over twelve months');
  figure('Expected out', ayqEuro(expense), 'out', 'Over twelve months');
  figure(
    'Lowest it gets',
    ayqEuro(forecast.lowest.balanceCents),
    forecast.lowest.balanceCents < 0 ? 'out' : undefined,
    forecast.lowest.date === forecast.today
      ? 'today'
      : `on ${ayqDay(forecast.lowest.date)}`,
  );

  return box;
}

function eventsTable(
  state: AyqUpcomingState,
  forecast: AyqForecast,
  redraw: (reload: boolean) => void,
): HTMLElement {
  return ayqTable<AyqForecastEvent>(
    [
      { label: 'Date', className: 'col-date', cell: row => ayqDay(row.date) },
      {
        label: 'Expected',
        className: 'col-payee',
        cell: row => {
          const cell = ayqElement('span');
          cell.append(ayqElement('span', undefined, row.label));
          if (row.flagged) {
            cell.append(ayqElement('span', 'tag warn', 'overdue'));
          }
          if (row.suggested) {
            cell.append(ayqElement('span', 'tag', 'suggested'));
          }
          if (row.source === 'plan') {
            cell.append(ayqElement('span', 'tag', 'from the plan'));
          }
          return cell;
        },
      },
      {
        label: 'Category',
        className: 'col-category',
        cell: row => row.categoryName ?? '—',
      },
      {
        label: 'Amount',
        className: 'col-amount',
        cell: row =>
          ayqElement(
            'span',
            row.kind === 'income' ? 'in' : 'out',
            ayqEuro(row.amountCents),
          ),
      },
      {
        label: 'Position after',
        className: 'col-amount',
        cell: row =>
          ayqElement(
            'span',
            row.balanceCents < 0 ? 'out' : undefined,
            ayqEuro(row.balanceCents),
          ),
      },
    ],
    forecast.events,
    (row, line) => {
      if (row.recordId === null) {
        // A row that came from the plan rather than from a record has nothing
        // to open: the thing to change is the category's monthly plan, which is
        // the Plan screen's job.
        line.classList.add('muted-row');
        return;
      }
      line.dataset.ayqRecord = row.recordId;
      if (row.dueDate !== null) line.dataset.ayqDue = row.dueDate;
      line.classList.add('clickable');
      if (row.recordId === state.openRecordId && row.dueDate === state.openDueDate) {
        line.classList.add('current');
      }
      line.addEventListener('click', () => {
        state.openRecordId = row.recordId;
        state.openDueDate = row.dueDate;
        state.drafting = false;
        state.problem = null;
        redraw(false);
      });
    },
  );
}

function actionBar(
  state: AyqUpcomingState,
  redraw: (reload: boolean) => void,
): HTMLElement {
  const bar = ayqElement('div', 'filters');

  const add = document.createElement('button');
  add.type = 'button';
  add.id = 'ayq-plan-new';
  add.textContent = 'New planned payment';
  add.addEventListener('click', () => {
    state.drafting = true;
    state.openRecordId = null;
    state.openDueDate = null;
    state.problem = null;
    redraw(false);
  });
  bar.append(add);

  const suggest = document.createElement('button');
  suggest.type = 'button';
  suggest.id = 'ayq-plan-suggest';
  suggest.className = 'quiet';
  suggest.textContent = 'Find what keeps coming back';
  suggest.addEventListener('click', () => {
    void run(state, { kind: 'plan.suggest' }, redraw);
  });
  bar.append(suggest);

  return bar;
}

/* ----------------------------------------------------------------- the pane */

function paneFor(
  state: AyqUpcomingState,
  categories: AyqCategory[],
  redraw: (reload: boolean) => void,
): HTMLElement {
  const pane = ayqElement('aside', 'workbench-pane');
  pane.dataset.ayqPane = state.drafting
    ? 'new'
    : state.openRecordId === null
      ? 'empty'
      : 'record';

  if (state.drafting) {
    pane.append(
      ayqElement('h2', undefined, 'New planned payment'),
      recordForm(state, categories, null, redraw),
    );
    return pane;
  }

  const record =
    state.plan?.records.find(one => one.id === state.openRecordId) ?? null;
  if (record === null) {
    pane.append(
      ayqElement('h2', undefined, 'Nothing selected'),
      ayqElement(
        'p',
        'empty-body',
        'Choose a row to read what it is and change it, or add a payment that ' +
          'is not in the list yet.',
      ),
    );
    return pane;
  }

  pane.append(ayqElement('h2', undefined, record.name));

  const facts: Array<[string, string]> = [
    ['Kind', record.kind === 'income' ? 'Money in' : 'Money out'],
    ['Amount', ayqEuro(record.amountCents)],
    ['Category', record.categoryName ?? '—'],
    ['Rhythm', frequencyLabel(record)],
    ['Starting', ayqDay(record.startDate)],
  ];
  if (record.endDate !== null) facts.push(['Ending', ayqDay(record.endDate)]);
  facts.push([
    'State',
    record.state === 'suggested'
      ? 'Suggested by AYQ, not yet accepted'
      : record.state === 'dismissed'
        ? 'Put away'
        : 'Confirmed',
  ]);
  facts.push([
    'Decided by',
    record.provenance === 'detected' ? 'AYQ, from what recurs' : 'You',
  ]);
  if (record.mandateId !== null) facts.push(['SEPA mandate', record.mandateId]);

  const list = ayqElement('dl', 'facts');
  for (const [label, value] of facts) {
    list.append(
      ayqElement('dt', undefined, label),
      ayqElement('dd', undefined, value),
    );
  }
  pane.append(list);

  pane.append(recordActions(state, record, redraw));
  pane.append(occurrenceActions(state, record, redraw));
  pane.append(
    ayqElement('h3', 'pane-heading', 'Change it'),
    recordForm(state, categories, record, redraw),
  );
  return pane;
}

function recordActions(
  state: AyqUpcomingState,
  record: AyqPlannedRecord,
  redraw: (reload: boolean) => void,
): HTMLElement {
  const box = ayqElement('div', 'pane-actions');

  if (record.state !== 'confirmed') {
    const accept = document.createElement('button');
    accept.type = 'button';
    accept.id = 'ayq-plan-confirm';
    accept.textContent =
      record.state === 'suggested' ? 'Yes, this is real' : 'Bring it back';
    accept.addEventListener('click', () => {
      void run(
        state,
        { kind: 'plan.setState', recordId: record.id, state: 'confirmed' },
        redraw,
      );
    });
    box.append(accept);
  }

  if (record.state !== 'dismissed') {
    const away = document.createElement('button');
    away.type = 'button';
    away.className = 'quiet small';
    away.id = 'ayq-plan-dismiss';
    away.textContent = 'Put it away';
    away.addEventListener('click', () => {
      void run(
        state,
        { kind: 'plan.setState', recordId: record.id, state: 'dismissed' },
        redraw,
      );
    });
    box.append(away);
  }

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'quiet small';
  remove.id = 'ayq-plan-remove';
  remove.textContent = 'Delete it';
  remove.addEventListener('click', () => {
    state.openRecordId = null;
    state.openDueDate = null;
    void run(state, { kind: 'plan.remove', recordId: record.id }, redraw);
  });
  box.append(remove);

  return box;
}

/**
 * The two decisions that belong to one occurrence rather than to the record.
 *
 * A payment taken four days late this month has not moved for ever, and a month
 * somebody was not charged is not the end of the arrangement. Both are stored
 * against the one date and leave the rhythm alone.
 */
function occurrenceActions(
  state: AyqUpcomingState,
  record: AyqPlannedRecord,
  redraw: (reload: boolean) => void,
): HTMLElement {
  const box = ayqElement('div', 'pane-actions');
  const dueDate = state.openDueDate;
  if (dueDate === null) return box;

  const occurrence: AyqPlanOccurrence | undefined = state.plan?.occurrences.find(
    one => one.recordId === record.id && one.dueDate === dueDate,
  );

  box.append(
    ayqElement(
      'p',
      'pane-note',
      occurrence && occurrence.effectiveDate !== occurrence.dueDate
        ? `The one due ${ayqDay(dueDate)}, moved to ${ayqDay(occurrence.effectiveDate)}.`
        : `The one due ${ayqDay(dueDate)}.`,
    ),
  );

  const moveTo = document.createElement('input');
  moveTo.type = 'date';
  moveTo.id = 'ayq-plan-reschedule-date';
  moveTo.value = occurrence?.effectiveDate ?? dueDate;
  box.append(moveTo);

  const move = document.createElement('button');
  move.type = 'button';
  move.className = 'quiet small';
  move.id = 'ayq-plan-reschedule';
  move.textContent = 'Move just this one';
  move.addEventListener('click', () => {
    void run(
      state,
      {
        kind: 'plan.reschedule',
        recordId: record.id,
        dueDate,
        to: moveTo.value,
      },
      redraw,
    );
  });
  box.append(move);

  const skip = document.createElement('button');
  skip.type = 'button';
  skip.className = 'quiet small';
  skip.id = 'ayq-plan-skip';
  skip.textContent =
    occurrence?.state === 'dismissed' ? 'Put this one back' : 'Skip just this one';
  skip.addEventListener('click', () => {
    void run(
      state,
      {
        kind: 'plan.dismissOccurrence',
        recordId: record.id,
        dueDate,
        dismissed: occurrence?.state !== 'dismissed',
      },
      redraw,
    );
  });
  box.append(skip);

  return box;
}

/**
 * The form, for a new record or an existing one.
 *
 * Every field is on the screen at once rather than behind a wizard: this is six
 * facts about a payment, and a person who knows them can type them in one pass.
 */
function recordForm(
  state: AyqUpcomingState,
  categories: AyqCategory[],
  record: AyqPlannedRecord | null,
  redraw: (reload: boolean) => void,
): HTMLElement {
  const form = ayqElement('div', 'pane-form');

  const field = (
    label: string,
    control: HTMLElement,
    name: string,
  ): HTMLElement => {
    control.dataset.ayqPlanField = name;
    const row = ayqElement('label', 'pane-field');
    row.append(ayqElement('span', 'pane-field-label', label));
    row.append(control);
    return row;
  };

  const name = document.createElement('input');
  name.type = 'text';
  name.placeholder = 'Rent';
  name.value = record?.name ?? '';
  form.append(field('What it is', name, 'name'));

  let kind: AyqPlanKind = record?.kind ?? 'expense';
  form.append(
    field(
      'Direction',
      ayqSelect(
        [
          { value: 'expense', label: 'Money out' },
          { value: 'income', label: 'Money in' },
        ],
        kind,
        value => {
          kind = value as AyqPlanKind;
        },
      ),
      'kind',
    ),
  );

  const amount = document.createElement('input');
  amount.type = 'text';
  amount.inputMode = 'decimal';
  amount.placeholder = '1200.00';
  amount.value = record === null ? '' : (record.amountCents / 100).toFixed(2);
  form.append(field('Amount', amount, 'amount'));

  let categoryName = record?.categoryName ?? '';
  form.append(
    field(
      'Category',
      ayqSelect(
        [
          { value: '', label: '—' },
          ...categories.map(category => ({
            value: category.name,
            label: category.name,
          })),
        ],
        categoryName,
        value => {
          categoryName = value;
        },
      ),
      'category',
    ),
  );

  const start = document.createElement('input');
  start.type = 'date';
  start.value = record?.startDate ?? state.forecast?.today ?? '';
  form.append(field('First one on', start, 'startDate'));

  let frequency: AyqPlanFrequency = record?.recurrence.frequency ?? 'monthly';
  form.append(
    field(
      'How often',
      ayqSelect(FREQUENCIES, frequency, value => {
        frequency = value as AyqPlanFrequency;
      }),
      'frequency',
    ),
  );

  const end = document.createElement('input');
  end.type = 'date';
  end.value = record?.endDate ?? '';
  form.append(field('Last one by (optional)', end, 'endDate'));

  const save = document.createElement('button');
  save.type = 'button';
  save.id = 'ayq-plan-save';
  save.textContent = record === null ? 'Add it' : 'Save the change';
  save.addEventListener('click', () => {
    // Parsed here and nowhere else. The engine takes integer cents, so what a
    // person typed becomes cents once, at the edge, rather than being carried
    // around as a number that looks exact and is not.
    const cents = Math.round(Number(amount.value.replace(',', '.')) * 100);
    if (!Number.isFinite(cents)) {
      state.problem = 'That amount is not a number.';
      redraw(false);
      return;
    }
    const draft: AyqPlanDraft = {
      ...(record === null ? {} : { id: record.id }),
      name: name.value,
      kind,
      amountCents: cents,
      categoryName: categoryName === '' ? null : categoryName,
      startDate: start.value,
      recurrence: { frequency, interval: 1 },
      endDate: end.value === '' ? null : end.value,
    };
    state.drafting = false;
    void run(state, { kind: 'plan.save', record: draft }, redraw);
  });
  form.append(save);

  return form;
}

/* ------------------------------------------------------------------ talking */

/**
 * Sends one request and reloads.
 *
 * The engine answers every one of these with the whole plan rather than with
 * what it changed, and the screen throws its own copy away rather than patching
 * it: moving one occurrence can change what is overdue and what the position is
 * on every row after it.
 */
async function run(
  state: AyqUpcomingState,
  body: Parameters<typeof ayqAsk>[0],
  redraw: (reload: boolean) => void,
): Promise<void> {
  try {
    const answer = await ayqAsk(body);
    state.problem = answer.ok ? null : answer.message;
  } catch (error) {
    state.problem = error instanceof Error ? error.message : String(error);
  }
  redraw(true);
}
