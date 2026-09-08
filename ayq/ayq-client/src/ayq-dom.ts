// The three DOM helpers the whole interface is built from.
//
// No framework: this renderer draws four tables and a filter bar, and a
// framework would be more code than the screens. What matters is that
// everything is built from text nodes rather than from strings of HTML, so
// nothing a bank ever wrote can become markup.

export function ayqElement(
  tag: string,
  className?: string,
  text?: string,
): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export type AyqColumn<T> = {
  label: string;
  className?: string;
  cell(row: T): HTMLElement | string;
};

/** A table, header and all, from a list and a column description. */
export function ayqTable<T>(
  columns: AyqColumn<T>[],
  rows: T[],
  onRow?: (row: T, element: HTMLElement) => void,
): HTMLElement {
  const table = ayqElement('table', 'grid');

  const headRow = ayqElement('tr');
  for (const column of columns) {
    headRow.append(ayqElement('th', column.className, column.label));
  }
  const head = ayqElement('thead');
  head.append(headRow);
  table.append(head);

  const body = ayqElement('tbody');
  for (const row of rows) {
    const line = ayqElement('tr');
    for (const column of columns) {
      const content = column.cell(row);
      if (typeof content === 'string') {
        line.append(ayqElement('td', column.className, content));
      } else {
        const cell = ayqElement('td', column.className);
        cell.append(content);
        line.append(cell);
      }
    }
    if (onRow) onRow(row, line);
    body.append(line);
  }
  table.append(body);

  return table;
}

/** A <select>, built from options and a current value. */
export function ayqSelect(
  options: Array<{ value: string; label: string }>,
  selected: string,
  onChange: (value: string) => void,
  className?: string,
): HTMLSelectElement {
  const select = document.createElement('select');
  if (className) select.className = className;
  for (const option of options) {
    const node = document.createElement('option');
    node.value = option.value;
    node.textContent = option.label;
    select.append(node);
  }
  select.value = selected;
  select.addEventListener('change', () => onChange(select.value));
  return select;
}
