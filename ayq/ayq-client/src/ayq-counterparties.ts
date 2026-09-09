// The counterparties workspace: who the money went to.
//
// A list of shops rather than a list of rows, which is how a person thinks
// about their own spending — and, since the whole CAMT exercise exists to make
// one merchant one counterparty however the terminal printed it, the place
// where that work becomes visible and correctable.
//
// The detail panel shows the evidence: the imported name variants AYQ actually
// saw, and what it decided about each. That is where a person can say "this one
// is that shop" and have every transaction, past and future, follow.
//
// Nothing here computes money. Every count, every total and every date is the
// engine's; this file formats them and asks.

import { ayqAsk } from './ayq-bridge.ts';
import { ayqElement, ayqSelect, ayqTable } from './ayq-dom.ts';
import { ayqDay, ayqEuro } from './ayq-format.ts';
import type {
  AyqCounterparty,
  AyqCounterpartyDetail,
  AyqCounterpartyFilter,
  AyqCounterpartyList,
  AyqCounterpartyVariant,
  AyqLedgerRow,
} from './ayq-ipc-contract.ts';

export type AyqCounterpartiesState = {
  filter: AyqCounterpartyFilter;
  list: AyqCounterpartyList | null;
  /** The counterparty whose detail is open. */
  openKey: string | null;
  detail: AyqCounterpartyDetail | null;
  /** What went wrong in the panel, if anything did. */
  problem: string | null;
  /** What the last alias decision did, in the words the engine used. */
  outcome: string | null;
};

export function ayqEmptyCounterpartiesState(): AyqCounterpartiesState {
  return {
    filter: {},
    list: null,
    openKey: null,
    detail: null,
    problem: null,
    outcome: null,
  };
}

/** How many more counterparties one "Show more" adds. */
const AYQ_COUNTERPARTY_PAGE = 200;

export function ayqRenderCounterparties(
  state: AyqCounterpartiesState,
  target: HTMLElement,
  redraw: (reload: boolean) => void,
  openLedger: (counterpartyKey: string) => void,
): void {
  target.replaceChildren(filterBar(state, redraw));

  const list = state.list;
  if (list === null) {
    target.append(ayqElement('p', 'muted', 'Reading the budget…'));
    return;
  }

  if (list.total === 0) {
    target.append(emptyState(state));
    return;
  }

  target.append(
    ayqTable<AyqCounterparty>(
      [
        {
          label: 'Counterparty',
          className: 'col-payee',
          cell: row => row.name,
        },
        {
          label: 'Transactions',
          className: 'col-count',
          cell: row => String(row.transactions),
        },
        {
          label: 'First seen',
          className: 'col-date',
          cell: row => ayqDay(row.firstDate),
        },
        {
          label: 'Last seen',
          className: 'col-date',
          cell: row => ayqDay(row.lastDate),
        },
        {
          label: 'Rule',
          className: 'col-category',
          cell: row => row.categoryName ?? '—',
        },
        {
          label: 'Recurs',
          className: 'col-account',
          cell: row => (row.recurring ? 'Yes' : '—'),
        },
        {
          label: 'Spent',
          className: 'col-amount',
          cell: row => ayqElement('span', 'out', ayqEuro(row.outgoingCents)),
        },
      ],
      list.rows,
      (row, line) => {
        line.classList.add('clickable');
        line.dataset.ayqCounterparty = row.key;
        if (row.key === state.openKey) line.classList.add('open');
        line.addEventListener('click', () => {
          open(state, state.openKey === row.key ? null : row.key, redraw);
        });
      },
    ),
  );

  const counted = ayqElement(
    'p',
    'count',
    list.shown === list.total
      ? `${list.total} counterparties`
      : `${list.shown} of ${list.total} counterparties`,
  );
  if (list.shown < list.total) {
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'quiet small';
    more.textContent = 'Show more';
    more.addEventListener('click', () => {
      state.filter = {
        ...state.filter,
        limit: list.shown + AYQ_COUNTERPARTY_PAGE,
      };
      redraw(true);
    });
    counted.append(' ', more);
  }
  target.append(counted);

  if (state.outcome !== null) {
    target.append(ayqElement('p', 'offer', state.outcome));
  }
  if (state.openKey !== null) {
    target.append(detailPanel(state, redraw, openLedger));
  }
}

/**
 * Opens or closes a counterparty, and asks the engine for its detail.
 *
 * The panel draws at once with what is already known and fills in when the
 * answer arrives, so clicking a row never leaves the screen doing nothing.
 */
function open(
  state: AyqCounterpartiesState,
  key: string | null,
  redraw: (reload: boolean) => void,
): void {
  state.openKey = key;
  state.detail = null;
  state.problem = null;
  state.outcome = null;
  redraw(false);
  if (key !== null) void loadDetail(state, key, redraw);
}

async function loadDetail(
  state: AyqCounterpartiesState,
  key: string,
  redraw: (reload: boolean) => void,
): Promise<void> {
  const answer = await ayqAsk({ kind: 'counterparty.detail', key });
  // The panel may have been closed, or another one opened, while the engine
  // was answering.
  if (state.openKey !== key) return;
  if (answer.ok && answer.kind === 'counterparty.detail') {
    state.detail = answer.result;
  } else if (!answer.ok) {
    state.problem = answer.message;
  }
  redraw(false);
}

function emptyState(state: AyqCounterpartiesState): HTMLElement {
  const box = ayqElement('div', 'empty');
  if ((state.filter.search ?? '') !== '') {
    box.append(
      ayqElement('p', 'empty-title', 'No counterparty matches.'),
      ayqElement(
        'p',
        'empty-body',
        'Nothing in this budget is called that. Clear the search to see them ' +
          'all again.',
      ),
    );
    return box;
  }

  box.append(
    ayqElement('p', 'empty-title', 'No counterparties yet.'),
    ayqElement(
      'p',
      'empty-body',
      'Import a statement and every shop, subscription and employer in it ' +
        'appears here, one line each however many times the bank printed them.',
    ),
  );
  return box;
}

function filterBar(
  state: AyqCounterpartiesState,
  redraw: (reload: boolean) => void,
): HTMLElement {
  const bar = ayqElement('div', 'filters');

  const search = document.createElement('input');
  search.type = 'search';
  search.placeholder = 'Search counterparties';
  search.className = 'search';
  search.value = state.filter.search ?? '';
  search.addEventListener('input', () => {
    const wanted = search.value.trim();
    // A narrower list is a different list, so the page a person had read to
    // does not carry over — the same rule the ledger's filters follow.
    state.filter = { search: wanted === '' ? undefined : search.value };
    state.openKey = null;
    state.detail = null;
    redraw(true);
  });
  bar.append(search);

  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'quiet';
  clear.textContent = 'Clear';
  clear.addEventListener('click', () => {
    state.filter = {};
    state.openKey = null;
    state.detail = null;
    redraw(true);
  });
  bar.append(clear);

  return bar;
}

/**
 * One counterparty: what it comes to, what AYQ has seen it called, and what it
 * has bought lately.
 *
 * The banking provenance a transaction carries — the counterparty IBAN, the
 * bank transaction code, the mandate — is deliberately not here. It belongs to
 * one payment and is answered in the ledger's own detail panel; a list of shops
 * is not the place to spread account numbers across the screen.
 */
function detailPanel(
  state: AyqCounterpartiesState,
  redraw: (reload: boolean) => void,
  openLedger: (counterpartyKey: string) => void,
): HTMLElement {
  const panel = ayqElement('div', 'detail');
  panel.dataset.ayqCounterpartyDetail = state.openKey ?? '';

  if (state.problem !== null) {
    panel.append(ayqElement('p', 'error', state.problem));
  }

  const detail = state.detail;
  if (detail === null) {
    panel.append(ayqElement('p', 'muted', 'Reading the counterparty…'));
    return panel;
  }

  const one = detail.counterparty;
  panel.append(ayqElement('h2', undefined, one.name));

  const facts: Array<[string, string]> = [
    ['Transactions', String(one.transactions)],
    ['Spent', ayqEuro(one.outgoingCents)],
    ['First seen', one.firstDate === '' ? '—' : ayqDay(one.firstDate)],
    ['Last seen', one.lastDate === '' ? '—' : ayqDay(one.lastDate)],
    ['Category rule', one.categoryName ?? 'None'],
  ];

  const rhythm = detail.recurring;
  if (rhythm !== null) {
    facts.push(['Recurs', `${rhythm.cadence}, ${rhythm.occurrences} times`]);
    // The engine's own average, signed as it stores it. A fact on its own line
    // rather than inside a sentence, where a minus sign reads as a typo.
    facts.push(['Typical amount', ayqEuro(rhythm.averageAmountCents)]);
    if (rhythm.nextExpectedDate !== null) {
      facts.push(['Next expected', ayqDay(rhythm.nextExpectedDate)]);
    }
    if (rhythm.mandateId !== null) {
      facts.push(['Standing authorisation', 'SEPA mandate']);
    }
  }

  const list = ayqElement('dl', 'facts');
  for (const [label, value] of facts) {
    list.append(
      ayqElement('dt', undefined, label),
      ayqElement('dd', undefined, value),
    );
  }
  panel.append(list);

  const all = document.createElement('button');
  all.type = 'button';
  all.className = 'quiet small';
  all.textContent = 'Show every transaction from this counterparty';
  all.addEventListener('click', () => openLedger(one.key));
  panel.append(all);

  panel.append(ayqElement('h3', undefined, 'Imported name variants'));
  panel.append(
    ayqElement(
      'p',
      'empty-body',
      'What the bank printed, and what AYQ read out of it. Assigning a variant ' +
        'to another counterparty moves every transaction it matches, past and ' +
        'future. Nothing the bank sent is changed.',
    ),
  );
  panel.append(variantTable(state, detail, redraw));

  if (detail.recent.length > 0) {
    panel.append(ayqElement('h3', undefined, 'Recent transactions'));
    panel.append(
      ayqTable<AyqLedgerRow>(
        [
          { label: 'Date', className: 'col-date', cell: row => ayqDay(row.date) },
          {
            label: 'Category',
            className: 'col-category',
            cell: row => row.category ?? '—',
          },
          {
            label: 'Account',
            className: 'col-account',
            cell: row => row.account,
          },
          {
            label: 'Amount',
            className: 'col-amount',
            cell: row =>
              ayqElement(
                'span',
                row.amountCents < 0 ? 'out' : 'in',
                ayqEuro(row.amountCents),
              ),
          },
        ],
        detail.recent,
      ),
    );
  }

  return panel;
}

function variantTable(
  state: AyqCounterpartiesState,
  detail: AyqCounterpartyDetail,
  redraw: (reload: boolean) => void,
): HTMLElement {
  // Everything else on the page, which is what a variant can be moved to. The
  // list on screen is the list of choices: narrowing the search narrows both.
  const targets = (state.list?.rows ?? []).filter(
    row => row.key !== detail.counterparty.key,
  );

  return ayqTable<AyqCounterpartyVariant>(
    [
      {
        label: 'Matches as',
        className: 'col-payee',
        cell: variant => {
          const cell = ayqElement('div', 'variant');
          cell.append(ayqElement('span', 'variant-key', variant.key));
          if (variant.names.length > 0) {
            cell.append(
              ayqElement('span', 'variant-names', variant.names.join(' · ')),
            );
          }
          return cell;
        },
      },
      {
        label: 'Transactions',
        className: 'col-count',
        cell: variant => String(variant.transactions),
      },
      {
        label: 'Since',
        className: 'col-date',
        cell: variant => ayqDay(variant.firstDate),
      },
      {
        label: 'Assigned',
        className: 'col-account',
        cell: variant => (variant.aliased ? 'By hand' : 'By the statement'),
      },
      {
        label: 'Move to',
        className: 'col-category',
        cell: variant => {
          const select = ayqSelect(
            [
              { value: '', label: '—' },
              ...targets.map(row => ({ value: row.key, label: row.name })),
            ],
            '',
            value => {
              if (value === '') return;
              void assign(state, variant, value, redraw);
            },
            'category-unset',
          );
          select.dataset.ayqVariant = variant.key;
          if (targets.length === 0) select.disabled = true;
          return select;
        },
      },
    ],
    detail.variants,
  );
}

/**
 * Says that one imported variant is one counterparty.
 *
 * The renderer sends the decision and nothing else: which variant, and which
 * counterparty. Finding the transactions it is true of, moving them, and
 * leaving every other one alone is the engine's work, and so is refusing the
 * request if the counterparty is not there.
 */
async function assign(
  state: AyqCounterpartiesState,
  variant: AyqCounterpartyVariant,
  counterpartyKey: string,
  redraw: (reload: boolean) => void,
): Promise<void> {
  try {
    const answer = await ayqAsk({
      kind: 'alias.create',
      variantKey: variant.key,
      variant: variant.names[0] ?? variant.key,
      counterpartyKey,
    });

    if (!answer.ok) {
      state.problem = answer.message;
    } else if (answer.kind === 'alias.create') {
      state.problem = null;
      state.outcome =
        `${answer.result.moved} ${
          answer.result.moved === 1 ? 'transaction' : 'transactions'
        } now belong to ${answer.result.counterpartyName}.`;
      // The counterparty that was emptied may no longer exist as a row, so the
      // panel follows the transactions rather than staying open on nothing.
      state.openKey = answer.result.counterpartyKey;
      state.detail = null;
    }
  } catch (error) {
    state.problem = error instanceof Error ? error.message : String(error);
  }

  // The list is read again because the counterparty that was emptied may be
  // gone from it, and the panel is asked for again because it is now showing a
  // different counterparty — the one the transactions went to.
  const opened = state.openKey;
  redraw(true);
  if (opened !== null) void loadDetail(state, opened, redraw);
}
