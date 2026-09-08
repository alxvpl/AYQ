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
  AyqCategory,
  AyqCategoryRule,
  AyqImportRecord,
  AyqRecurring,
} from './ayq-ipc-contract.ts';

export function ayqRenderRecurring(
  entries: AyqRecurring[],
  target: HTMLElement,
  open: (counterpartyKey: string) => void,
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
      (entry, line) => {
        // A rhythm is only useful if you can see what it is made of.
        line.classList.add('clickable');
        line.title = `Show every transaction from ${entry.name}`;
        line.addEventListener('click', () => open(entry.key));
      },
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
  categories: AyqCategory[],
  target: HTMLElement,
  redraw: () => void,
): void {
  target.replaceChildren();
  target.append(ayqElement('h3', undefined, 'Categories'));
  target.append(categoryList(categories, redraw));
  target.append(ayqElement('h3', undefined, 'Counterparty rules'));

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

/**
 * The categories, renameable in place, with one field for adding another.
 *
 * Deliberately plain: a category is a name in a group, and the interface for it
 * should be no more than that. Renaming moves the rules that use it, which the
 * engine does — the list here only asks.
 */
function categoryList(
  categories: AyqCategory[],
  redraw: () => void,
): HTMLElement {
  const box = ayqElement('div', 'categories');

  for (const category of categories) {
    const row = ayqElement('div', 'category-row');
    row.append(ayqElement('span', 'category-group', category.groupName));

    const name = document.createElement('input');
    name.type = 'text';
    name.value = category.name;
    name.className = 'category-name';
    const rename = () => {
      const wanted = name.value.trim();
      if (wanted === '' || wanted === category.name) {
        name.value = category.name;
        return;
      }
      void (async () => {
        const answer = await ayqAsk({
          kind: 'categories.rename',
          categoryId: category.id,
          name: wanted,
        });
        if (!answer.ok) name.value = category.name;
        redraw();
      })();
    };
    name.addEventListener('blur', rename);
    name.addEventListener('keydown', event => {
      if (event.key === 'Enter') name.blur();
      if (event.key === 'Escape') {
        name.value = category.name;
        name.blur();
      }
    });
    row.append(name);
    box.append(row);
  }

  const adding = ayqElement('div', 'category-row');
  const field = document.createElement('input');
  field.type = 'text';
  field.className = 'category-name';
  field.placeholder = 'Add a category…';

  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'quiet small';
  add.textContent = 'Add';
  const submit = () => {
    const wanted = field.value.trim();
    if (wanted === '') return;
    // Into the group the spending categories already live in: a new category
    // with nowhere to belong is a category nobody finds.
    const group =
      categories.find(category => !category.isIncome)?.groupId ??
      categories[0]?.groupId;
    if (!group) return;

    void (async () => {
      add.disabled = true;
      await ayqAsk({ kind: 'categories.create', name: wanted, groupId: group });
      add.disabled = false;
      field.value = '';
      redraw();
    })();
  };
  add.addEventListener('click', submit);
  field.addEventListener('keydown', event => {
    if (event.key === 'Enter') submit();
  });

  adding.append(ayqElement('span', 'category-group', ''), field, add);
  box.append(adding);

  return box;
}
