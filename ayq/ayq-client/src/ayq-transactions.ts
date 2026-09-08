// The ledger: what a person came to see.
//
// A filter bar, a table, and a detail panel that opens on the row you click.
// The counterparty shown is the canonical one the CAMT resolver decided at
// import time; the string the bank printed lives in the detail panel, where it
// belongs — visible when asked for, never the name.

import { ayqAsk } from './ayq-bridge.ts';
import { ayqElement, ayqSelect, ayqTable } from './ayq-dom.ts';
import { ayqDay, ayqEuro } from './ayq-format.ts';
import type {
  AyqAccountSummary,
  AyqCategory,
  AyqLedger,
  AyqLedgerFilter,
  AyqLedgerRow,
  AyqTransactionDetail,
} from './ayq-ipc-contract.ts';

export type AyqTransactionsState = {
  filter: AyqLedgerFilter;
  accounts: AyqAccountSummary[];
  categories: AyqCategory[];
  ledger: AyqLedger | null;
  /** The row whose detail panel is open. */
  openId: string | null;
  detail: AyqTransactionDetail | null;
};

export function ayqEmptyTransactionsState(): AyqTransactionsState {
  return {
    filter: {},
    accounts: [],
    categories: [],
    ledger: null,
    openId: null,
    detail: null,
  };
}

/**
 * Draws the ledger.
 *
 * `redraw` is handed in rather than imported: this view changes the filter and
 * the open row, and the shell owns both the state and when it is drawn again.
 */
export function ayqRenderTransactions(
  state: AyqTransactionsState,
  target: HTMLElement,
  redraw: (reload: boolean) => void,
): void {
  target.replaceChildren(filterBar(state, redraw));

  const ledger = state.ledger;
  if (ledger === null) {
    target.append(ayqElement('p', 'muted', 'Reading the budget…'));
    return;
  }

  if (ledger.total === 0) {
    target.append(emptyState(state));
    return;
  }

  const table = ayqTable<AyqLedgerRow>(
    [
      { label: 'Date', className: 'col-date', cell: row => ayqDay(row.date) },
      {
        label: 'Counterparty',
        className: 'col-payee',
        cell: row => row.payee ?? 'Unknown',
      },
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
        cell: row => {
          const cell = ayqElement(
            'span',
            row.amountCents < 0 ? 'out' : 'in',
            ayqEuro(row.amountCents),
          );
          return cell;
        },
      },
    ],
    ledger.rows,
    (row, line) => {
      line.classList.add('clickable');
      if (row.id === state.openId) line.classList.add('open');
      line.addEventListener('click', () => {
        state.openId = state.openId === row.id ? null : row.id;
        state.detail = null;
        redraw(false);
        if (state.openId !== null) void loadDetail(state, redraw);
      });
    },
  );
  target.append(table);

  target.append(
    ayqElement(
      'p',
      'count',
      ledger.shown === ledger.total
        ? `${ledger.total} transactions`
        : `${ledger.shown} of ${ledger.total} transactions`,
    ),
  );

  if (state.openId !== null) target.append(detailPanel(state, redraw));
}

async function loadDetail(
  state: AyqTransactionsState,
  redraw: (reload: boolean) => void,
): Promise<void> {
  const transactionId = state.openId;
  if (transactionId === null) return;

  const answer = await ayqAsk({ kind: 'transaction.detail', transactionId });
  if (answer.ok && answer.kind === 'transaction.detail') {
    // The row may have been closed again while the engine was answering.
    if (state.openId === transactionId) {
      state.detail = answer.result;
      redraw(false);
    }
  }
}

function emptyState(state: AyqTransactionsState): HTMLElement {
  const box = ayqElement('div', 'empty');
  const filtered = Object.keys(state.filter).some(
    key => key !== 'limit' && state.filter[key as keyof AyqLedgerFilter],
  );

  if (filtered) {
    box.append(
      ayqElement('p', 'empty-title', 'Nothing matches.'),
      ayqElement(
        'p',
        'empty-body',
        'No transaction in this budget answers that filter. Clear it to see ' +
          'everything again.',
      ),
    );
    return box;
  }

  box.append(
    ayqElement('p', 'empty-title', 'No transactions yet.'),
    ayqElement(
      'p',
      'empty-body',
      'Import a CAMT.053 statement from your bank — an .xml file or a .zip ' +
        'of them — and it will appear here. Nothing leaves this machine.',
    ),
  );
  return box;
}

function filterBar(
  state: AyqTransactionsState,
  redraw: (reload: boolean) => void,
): HTMLElement {
  const bar = ayqElement('div', 'filters');

  const search = document.createElement('input');
  search.type = 'search';
  search.placeholder = 'Search counterparty or description';
  search.className = 'search';
  search.value = state.filter.search ?? '';
  search.addEventListener('input', () => {
    state.filter.search = search.value.trim() === '' ? undefined : search.value;
    redraw(true);
  });
  bar.append(search);

  bar.append(
    ayqSelect(
      [
        { value: '', label: 'All accounts' },
        ...state.accounts.map(account => ({
          value: account.id,
          label: account.name,
        })),
      ],
      state.filter.accountId ?? '',
      value => {
        state.filter.accountId = value === '' ? undefined : value;
        redraw(true);
      },
    ),
  );

  for (const [label, key] of [
    ['From', 'from'],
    ['To', 'to'],
  ] as Array<[string, 'from' | 'to']>) {
    const field = document.createElement('input');
    field.type = 'date';
    field.title = label;
    field.value = state.filter[key] ?? '';
    field.addEventListener('change', () => {
      state.filter[key] = field.value === '' ? undefined : field.value;
      redraw(true);
    });
    bar.append(field);
  }

  const uncategorised = ayqElement('label', 'check');
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = state.filter.uncategorised === true;
  box.addEventListener('change', () => {
    state.filter.uncategorised = box.checked ? true : undefined;
    redraw(true);
  });
  uncategorised.append(box, ayqElement('span', undefined, 'Uncategorised'));
  bar.append(uncategorised);

  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'quiet';
  clear.textContent = 'Clear';
  clear.addEventListener('click', () => {
    state.filter = {};
    redraw(true);
  });
  bar.append(clear);

  return bar;
}

/**
 * What the bank said, what AYQ made of it, and where it belongs.
 *
 * The provenance is the answer to "why is it called that?" — the layer that
 * decided, the code the bank sent, the mandate behind a direct debit. Actual
 * has no field for any of it, so AYQ keeps it beside the budget.
 */
function detailPanel(
  state: AyqTransactionsState,
  redraw: (reload: boolean) => void,
): HTMLElement {
  const panel = ayqElement('div', 'detail');
  const detail = state.detail;

  if (detail === null) {
    panel.append(ayqElement('p', 'muted', 'Reading the transaction…'));
    return panel;
  }

  panel.append(ayqElement('h2', undefined, detail.row.payee ?? 'Unknown'));

  const facts: Array<[string, string]> = [
    ['Date', ayqDay(detail.row.date)],
    ['Amount', ayqEuro(detail.row.amountCents)],
    ['Account', detail.row.account],
    ['Status', detail.row.cleared ? 'Booked' : 'Pending'],
  ];

  if (detail.importedPayee) facts.push(['The bank said', detail.importedPayee]);
  if (detail.notes && detail.notes !== detail.importedPayee) {
    facts.push(['Description', detail.notes]);
  }

  const provenance = detail.provenance;
  if (provenance) {
    facts.push(['Payment kind', provenance.kind]);
    facts.push(['Name decided by', provenance.resolvedBy]);
    if (provenance.counterpartyKey) {
      facts.push(['Counterparty key', provenance.counterpartyKey]);
    }
    if (provenance.bankTransactionCode) {
      facts.push(['Bank transaction code', provenance.bankTransactionCode]);
    }
    if (provenance.counterpartyIban) {
      facts.push(['Counterparty IBAN', provenance.counterpartyIban]);
    }
    if (provenance.intermediary) {
      facts.push(['Paid through', provenance.intermediary]);
    }
    if (provenance.mandateId) facts.push(['SEPA mandate', provenance.mandateId]);
    if (provenance.endToEndId) facts.push(['End-to-end id', provenance.endToEndId]);
    if (provenance.valueDate && provenance.valueDate !== detail.row.date) {
      facts.push(['Value date', ayqDay(provenance.valueDate)]);
    }
    if (provenance.file) facts.push(['Imported from', provenance.file]);
  }

  const list = ayqElement('dl', 'facts');
  for (const [label, value] of facts) {
    list.append(
      ayqElement('dt', undefined, label),
      ayqElement('dd', undefined, value),
    );
  }
  panel.append(list);

  panel.append(categoryPicker(state, detail, redraw));
  return panel;
}

function categoryPicker(
  state: AyqTransactionsState,
  detail: AyqTransactionDetail,
  redraw: (reload: boolean) => void,
): HTMLElement {
  const box = ayqElement('div', 'categorise');
  box.append(ayqElement('h3', undefined, 'Category'));

  const remember = document.createElement('input');
  remember.type = 'checkbox';
  remember.checked = true;

  const select = ayqSelect(
    [
      { value: '', label: 'No category' },
      ...state.categories.map(category => ({
        value: category.id,
        label: category.groupName
          ? `${category.groupName} · ${category.name}`
          : category.name,
      })),
    ],
    detail.row.categoryId ?? '',
    value => {
      void assign(state, detail.row.id, value === '' ? null : value, remember.checked, redraw);
    },
  );
  box.append(select);

  const label = ayqElement('label', 'check');
  label.append(
    remember,
    ayqElement(
      'span',
      undefined,
      'Remember this for every transaction from this counterparty',
    ),
  );
  box.append(label);

  return box;
}

async function assign(
  state: AyqTransactionsState,
  transactionId: string,
  categoryId: string | null,
  createRule: boolean,
  redraw: (reload: boolean) => void,
): Promise<void> {
  const answer = await ayqAsk({
    kind: 'transaction.categorise',
    transactionId,
    categoryId,
    createRule: createRule && categoryId !== null,
  });

  if (!answer.ok) {
    state.detail = null;
    redraw(true);
    throw new Error(answer.message);
  }

  // The rule may have categorised other rows too, so the whole list is read
  // again rather than the one row patched in place.
  redraw(true);
}
