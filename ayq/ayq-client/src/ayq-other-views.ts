// The three views beside the ledger: what recurs, what the rules say, and what
// has been imported.
//
// Each is a table over one engine answer. None of them computes anything: the
// rhythms are detected by the engine, the rules are the engine's store, and the
// import history is what actually happened.

import { ayqAsk } from './ayq-bridge.ts';
import { ayqElement, ayqTable } from './ayq-dom.ts';
import { ayqDay, ayqEuro, ayqMoment } from './ayq-format.ts';
import type {
  AyqCategoryRule,
  AyqImportRecord,
  AyqRecurring,
} from './ayq-ipc-contract.ts';

export function ayqRenderRecurring(
  entries: AyqRecurring[],
  target: HTMLElement,
): void {
  target.replaceChildren();

  if (entries.length === 0) {
    target.append(
      ayqElement('p', 'empty-title', 'Nothing recurs yet.'),
      ayqElement(
        'p',
        'empty-body',
        'A counterparty needs three payments before a rhythm is more than a ' +
          'coincidence. Import a few more months and they will show up here.',
      ),
    );
    return;
  }

  target.append(
    ayqTable<AyqRecurring>(
      [
        { label: 'Counterparty', className: 'col-payee', cell: entry => entry.name },
        { label: 'Rhythm', className: 'col-account', cell: entry => entry.cadence },
        {
          label: 'Seen',
          className: 'col-account',
          cell: entry => `${entry.occurrences}×`,
        },
        {
          label: 'Typical',
          className: 'col-amount',
          cell: entry =>
            ayqElement(
              'span',
              'out',
              entry.amountVaries
                ? `~ ${ayqEuro(entry.averageAmountCents)}`
                : ayqEuro(entry.averageAmountCents),
            ),
        },
        { label: 'Last', className: 'col-date', cell: entry => ayqDay(entry.lastDate) },
        {
          label: 'Next',
          className: 'col-date',
          cell: entry =>
            entry.nextExpectedDate === null
              ? '—'
              : ayqDay(entry.nextExpectedDate),
        },
        {
          label: 'Mandate',
          className: 'col-account',
          cell: entry => (entry.mandateId === null ? '—' : 'SEPA'),
        },
      ],
      entries,
    ),
  );

  target.append(
    ayqElement(
      'p',
      'count',
      `${entries.length} recurring ${
        entries.length === 1 ? 'counterparty' : 'counterparties'
      }`,
    ),
  );
}

export function ayqRenderRules(
  rules: AyqCategoryRule[],
  target: HTMLElement,
  redraw: () => void,
): void {
  target.replaceChildren();

  const apply = document.createElement('button');
  apply.type = 'button';
  apply.className = 'quiet';
  apply.textContent = 'Apply rules to uncategorised transactions';
  apply.addEventListener('click', () => {
    void (async () => {
      apply.disabled = true;
      await ayqAsk({ kind: 'rules.apply' });
      apply.disabled = false;
      redraw();
    })();
  });

  if (rules.length === 0) {
    target.append(
      ayqElement('p', 'empty-title', 'No rules yet.'),
      ayqElement(
        'p',
        'empty-body',
        'Give a transaction a category and tick "remember this" — every ' +
          'transaction from that counterparty, past and future, follows.',
      ),
      apply,
    );
    return;
  }

  target.append(
    ayqTable<AyqCategoryRule>(
      [
        {
          label: 'Counterparty',
          className: 'col-payee',
          cell: rule => rule.counterpartyKey,
        },
        {
          label: 'Category',
          className: 'col-account',
          cell: rule => rule.categoryName,
        },
        {
          label: 'Since',
          className: 'col-date',
          cell: rule => ayqDay(rule.createdAt.slice(0, 10)),
        },
        {
          label: '',
          className: 'col-amount',
          cell: rule => {
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'quiet small';
            remove.textContent = 'Forget';
            remove.addEventListener('click', () => {
              void (async () => {
                await ayqAsk({ kind: 'rules.remove', ruleId: rule.id });
                redraw();
              })();
            });
            return remove;
          },
        },
      ],
      rules,
    ),
  );

  target.append(apply);
}

export function ayqRenderImports(
  history: AyqImportRecord[],
  target: HTMLElement,
): void {
  target.replaceChildren();

  if (history.length === 0) {
    target.append(
      ayqElement('p', 'empty-title', 'Nothing imported yet.'),
      ayqElement(
        'p',
        'empty-body',
        'Every import is recorded here: what the file held, what went in, and ' +
          'what was already there.',
      ),
    );
    return;
  }

  target.append(
    ayqTable<AyqImportRecord>(
      [
        { label: 'When', className: 'col-date', cell: record => ayqMoment(record.at) },
        { label: 'File', className: 'col-payee', cell: record => record.file },
        {
          label: 'Account',
          className: 'col-account',
          cell: record => record.accountName,
        },
        {
          label: 'Read',
          className: 'col-amount',
          cell: record => String(record.records),
        },
        {
          label: 'Imported',
          className: 'col-amount',
          cell: record => String(record.imported),
        },
        {
          label: 'Already there',
          className: 'col-amount',
          cell: record => String(record.duplicates),
        },
        {
          label: 'Categorised',
          className: 'col-amount',
          cell: record => String(record.categorised),
        },
        {
          label: 'Failed',
          className: 'col-amount',
          cell: record => String(record.failed),
        },
      ],
      history,
    ),
  );
}
