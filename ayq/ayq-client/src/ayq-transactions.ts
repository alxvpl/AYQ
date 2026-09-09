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
  AyqCategorised,
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
  /** What went wrong in the panel, if anything did. */
  problem: string | null;
  /** The counterparty a manual choice just made offerable, if any. */
  offer: AyqCategorised | null;
};

export function ayqEmptyTransactionsState(): AyqTransactionsState {
  return {
    filter: {},
    accounts: [],
    categories: [],
    ledger: null,
    openId: null,
    detail: null,
    problem: null,
    offer: null,
  };
}

/**
 * Draws the ledger.
 *
 * `redraw` is handed in rather than imported: this view changes the filter and
 * the open row, and the shell owns both the state and when it is drawn again.
 */
/**
 * Changes what is being looked at, and starts the list again from the top.
 *
 * "Show more" raises the row limit, and the limit belongs to the list a person
 * was reading — not to the next one. Without this, searching after paging down
 * five times asks the engine for three thousand rows of something else.
 */
function narrow(
  state: AyqTransactionsState,
  change: () => void,
  redraw: (reload: boolean) => void,
): void {
  change();
  state.filter.limit = undefined;
  redraw(true);
}

/**
 * Points the ledger at one account, or at all of them.
 *
 * The left navigation and the filter bar's own control are two ways to the same
 * decision, so they are one function: whichever is used, the other reads back
 * what was chosen. Everything else being looked at — a search, a period, a
 * category — is kept, because narrowing to an account is a narrowing and not a
 * fresh start; the page limit is not, for the same reason any other change to
 * the filter drops it, and an open row belongs to the ledger being left behind.
 */
export function ayqSelectAccount(
  state: AyqTransactionsState,
  accountId: string | null,
): void {
  state.filter = {
    ...state.filter,
    accountId: accountId ?? undefined,
    limit: undefined,
  };
  state.openId = null;
  state.detail = null;
  state.offer = null;
}

/** How many more rows one "Show more" adds. The engine's own default page. */
const AYQ_LEDGER_PAGE = 500;

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
        cell: row => categoryCell(state, row, redraw),
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
        state.problem = null;
        state.offer = null;
        redraw(false);
        if (state.openId !== null) void loadDetail(state, redraw);
      });
    },
  );
  target.append(table);

  const counted = ayqElement(
    'p',
    'count',
    ledger.shown === ledger.total
      ? `${ledger.total} transactions`
      : `${ledger.shown} of ${ledger.total} transactions`,
  );

  // Six years of statements is twelve thousand rows, and the ledger draws the
  // newest few hundred of them. Saying "500 of 12,178" and offering no way
  // further leaves a person with only the filters to reach their own past,
  // which is a fine way to answer a question and no way to look around.
  if (ledger.shown < ledger.total) {
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'quiet small';
    more.textContent = 'Show more';
    more.addEventListener('click', () => {
      state.filter = {
        ...state.filter,
        limit: ledger.shown + AYQ_LEDGER_PAGE,
      };
      redraw(true);
    });
    counted.append(' ', more);
  }

  target.append(counted);

  if (state.offer !== null) target.append(offerLine(state, redraw));
  if (state.openId !== null) target.append(detailPanel(state, redraw));
}

/**
 * The category control, in the row.
 *
 * Filing a transaction should not require opening anything: the column that
 * shows the category is the column that sets it. Choosing here is a person's
 * own decision and is recorded as one, so no rule will later overwrite it.
 */
function categoryCell(
  state: AyqTransactionsState,
  row: AyqLedgerRow,
  redraw: (reload: boolean) => void,
): HTMLElement {
  const select = ayqSelect(
    [
      { value: '', label: '—' },
      ...state.categories.map(category => ({
        value: category.id,
        label: category.name,
      })),
    ],
    row.categoryId ?? '',
    value => {
      void assign(state, row.id, value === '' ? null : value, false, redraw);
    },
    row.categoryId === null ? 'category-unset' : undefined,
  );

  select.title =
    row.categorySource === 'rule'
      ? `${row.category} — from the rule for this counterparty`
      : row.categorySource === 'manual'
        ? `${row.category} — filed by hand`
        : 'Not categorised';

  // The row opens its detail panel on click; the control must not.
  select.addEventListener('click', event => event.stopPropagation());
  return select;
}

/**
 * The offer after a manual choice: the same shop, the rest of the ledger.
 *
 * It appears only when there is something to offer, says exactly how many, and
 * does nothing until it is accepted. Declining it leaves the one transaction
 * filed and the rest alone.
 */
function offerLine(
  state: AyqTransactionsState,
  redraw: (reload: boolean) => void,
): HTMLElement {
  const offer = state.offer;
  const line = ayqElement('div', 'offer');
  if (offer === null) return line;

  const name = offer.counterpartyName ?? 'this counterparty';
  line.append(
    ayqElement(
      'span',
      undefined,
      `${offer.pendingForCounterparty} more from ${name} ${
        offer.pendingForCounterparty === 1 ? 'is' : 'are'
      } uncategorised.`,
    ),
  );

  const accept = document.createElement('button');
  accept.type = 'button';
  accept.className = 'quiet small';
  accept.textContent = `File them as ${offer.row.category} too`;
  accept.addEventListener('click', () => {
    void (async () => {
      accept.disabled = true;
      const key = offer.counterpartyKey;
      const categoryId = offer.row.categoryId;
      state.offer = null;
      if (key !== null && categoryId !== null) {
        const answer = await ayqAsk({
          kind: 'transaction.categoriseCounterparty',
          counterpartyKey: key,
          categoryId,
        });
        if (!answer.ok) state.problem = answer.message;
      }
      redraw(true);
    })();
  });
  line.append(accept);

  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.className = 'quiet small';
  dismiss.textContent = 'No';
  dismiss.addEventListener('click', () => {
    state.offer = null;
    redraw(false);
  });
  line.append(dismiss);

  return line;
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
    narrow(
      state,
      () => {
        state.filter.search =
          search.value.trim() === '' ? undefined : search.value;
      },
      redraw,
    );
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
        // The same decision the left navigation makes, made the same way.
        ayqSelectAccount(state, value === '' ? null : value);
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
      narrow(
        state,
        () => {
          state.filter[key] = field.value === '' ? undefined : field.value;
        },
        redraw,
      );
    });
    bar.append(field);
  }

  // One control rather than a checkbox and a list: "everything", "the ones
  // nobody has filed", or one category.
  bar.append(
    ayqSelect(
      [
        { value: '', label: 'Any category' },
        { value: 'none', label: 'Uncategorised' },
        ...state.categories.map(category => ({
          value: category.id,
          label: category.name,
        })),
      ],
      state.filter.uncategorised === true
        ? 'none'
        : (state.filter.categoryId ?? ''),
      value =>
        narrow(
          state,
          () => {
            state.filter.uncategorised = value === 'none' ? true : undefined;
            state.filter.categoryId =
              value === '' || value === 'none' ? undefined : value;
          },
          redraw,
        ),
    ),
  );

  if (state.filter.counterpartyKey) {
    const chip = ayqElement('span', 'chip');
    chip.append(ayqElement('span', undefined, state.filter.counterpartyKey));
    const drop = document.createElement('button');
    drop.type = 'button';
    drop.className = 'quiet small';
    drop.textContent = 'Show all';
    drop.addEventListener('click', () => {
      narrow(
        state,
        () => {
          state.filter.counterpartyKey = undefined;
        },
        redraw,
      );
    });
    chip.append(drop);
    bar.append(chip);
  }

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

  if (state.problem !== null) {
    panel.append(ayqElement('p', 'error', state.problem));
  }

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
    if (provenance.mandateId)
      facts.push(['SEPA mandate', provenance.mandateId]);
    if (provenance.endToEndId)
      facts.push(['End-to-end id', provenance.endToEndId]);
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

  const key = provenance?.counterpartyKey;
  if (key) {
    const all = document.createElement('button');
    all.type = 'button';
    all.className = 'quiet small';
    all.textContent = 'Show every transaction from this counterparty';
    all.addEventListener('click', () => {
      state.filter = { counterpartyKey: key };
      state.openId = null;
      state.detail = null;
      state.offer = null;
      redraw(true);
    });
    panel.append(all);
  }

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
      void assign(
        state,
        detail.row.id,
        value === '' ? null : value,
        remember.checked,
        redraw,
      );
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
  try {
    const answer = await ayqAsk({
      kind: 'transaction.categorise',
      transactionId,
      categoryId,
      createRule: createRule && categoryId !== null,
    });

    // Said where it happened, in the panel that asked. A rejected change that
    // vanishes silently is worse than one that never happened.
    state.problem = answer.ok ? null : answer.message;

    if (answer.ok && answer.kind === 'transaction.categorise') {
      // Offered, never assumed: the rest of the shop is only filed if the
      // person says so, and there is nothing to say when nothing is pending.
      state.offer =
        !createRule && answer.result.pendingForCounterparty > 0
          ? answer.result
          : null;
    }
  } catch (error) {
    state.problem = error instanceof Error ? error.message : String(error);
  }

  // The rule may have categorised other rows too, so the whole list is read
  // again rather than the one row patched in place.
  redraw(true);
}
