// The table (04 A3): a first-class element, not cards pretending to be one.
//
// Every screen's table is this one. What that buys is that the things A22 and
// A20 ask for are decided once: the header stays while the rows move, a row is
// selectable by keyboard as well as by mouse, focus is visible, and a column of
// figures is right-aligned with tabular numerals (A19).
//
// Two kinds of choosing, kept apart (04 A36). Opening a row — click, Enter,
// Space — is "what am I looking at", and there is one of those. Ticking a row
// is "this one is part of what I am about to change", and there may be many.
// The tick lives in its own column, is a real checkbox, and does not open the
// row it is on, so a person can gather a set without the pane chasing them.

import { Checkbox, makeStyles, mergeClasses } from '@fluentui/react-components';
import type { ReactNode } from 'react';

import { AYQ_METRIC, AYQ_TYPE } from '../ayq-tokens.ts';
import { ayqBorderBottom, ayqBorderTop } from './ayq-css.ts';

const useStyles = makeStyles({
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 'var(--ayq-size-body)',
    color: 'var(--ayq-ink)',
  },
  // A39: header and body cells on 6×10; the header on the quiet surface in
  // the small size, the rows parted by the section line.
  head: {
    position: 'sticky',
    top: '0',
    zIndex: 1,
    backgroundColor: 'var(--ayq-quiet)',
    textAlign: 'left',
    fontSize: AYQ_TYPE.size.small,
    fontWeight: AYQ_TYPE.weight.semibold,
    color: 'var(--ayq-label)',
    padding: `${AYQ_METRIC.header.paddingY}px ${AYQ_METRIC.header.paddingX}px`,
    ...ayqBorderBottom('var(--ayq-line-strong)'),
    whiteSpace: 'nowrap',
  },
  cell: {
    padding: `${AYQ_METRIC.row.paddingY}px ${AYQ_METRIC.row.paddingX}px`,
    ...ayqBorderBottom('var(--ayq-section)'),
    verticalAlign: 'middle',
  },
  figures: {
    textAlign: 'right',
    whiteSpace: 'nowrap',
    fontVariantNumeric: AYQ_TYPE.figures,
  },
  row: {
    cursor: 'pointer',
    ':hover': { backgroundColor: 'var(--ayq-row-hover)' },
    ':focus-visible': {
      outlineWidth: `${AYQ_METRIC.focusRing}px`,
      outlineStyle: 'solid',
      outlineColor: 'var(--ayq-accent-focus)',
      outlineOffset: '-2px',
    },
  },
  selected: {
    backgroundColor: 'var(--ayq-row-selected)',
    boxShadow: 'inset 3px 0 0 var(--ayq-accent-line-on)',
  },
  // The template's pane foot: 12×18, on the line.
  foot: {
    padding: `${AYQ_METRIC.space.wide}px ${AYQ_METRIC.panePadding}px`,
    ...ayqBorderTop('var(--ayq-line)'),
    fontSize: 'var(--ayq-size-small)',
    color: 'var(--ayq-ink-quiet)',
  },
  empty: {
    padding: `26px ${AYQ_METRIC.row.paddingX}px`,
    color: 'var(--ayq-ink-faint)',
  },
  tick: {
    width: '32px',
    paddingTop: '2px',
    paddingBottom: '2px',
    paddingRight: '0',
  },
});

export type AyqColumn<T> = {
  id: string;
  header: string;
  /** Right-aligned, tabular numerals (04 A19). */
  figures?: boolean;
  cell(row: T): ReactNode;
};

/** The rows a person has ticked, and the words the checkboxes say. */
export type AyqSelection = {
  selected: ReadonlySet<string>;
  onToggle(id: string, checked: boolean): void;
  /** Tick, or untick, every row on the screen. */
  onToggleShown(checked: boolean): void;
  rowLabel: string;
  shownLabel: string;
};

export function AyqTable<T>({
  columns,
  rows,
  keyOf,
  selected,
  onSelect,
  footer,
  empty,
  mark,
  selection,
}: {
  columns: readonly AyqColumn<T>[];
  rows: readonly T[];
  keyOf(row: T): string;
  selected?: string | null;
  onSelect?(row: T): void;
  /** Present when rows can be gathered for a bulk decision (04 A36). */
  selection?: AyqSelection;
  /** One cell per column, or fewer — the last is stretched by the caller. */
  footer?: ReactNode;
  /** What to say when there is nothing, which is not the same as nothing. */
  empty?: ReactNode;
  mark?: string;
}): ReactNode {
  const styles = useStyles();

  if (rows.length === 0 && empty !== undefined) {
    return (
      <div className={styles.empty} data-ayq-table={mark} data-ayq-empty="">
        {empty}
      </div>
    );
  }

  const ticked = selection === undefined
    ? 0
    : rows.filter(row => selection.selected.has(keyOf(row))).length;
  const span = columns.length + (selection === undefined ? 0 : 1);

  return (
    <table className={styles.table} data-ayq-table={mark}>
      <thead>
        <tr>
          {selection === undefined ? null : (
            <th scope="col" className={mergeClasses(styles.head, styles.tick)}>
              <Checkbox
                data-ayq-select-shown=""
                aria-label={selection.shownLabel}
                checked={
                  ticked === 0 ? false : ticked === rows.length ? true : 'mixed'
                }
                onChange={(_event, data) =>
                  selection.onToggleShown(data.checked === true)
                }
              />
            </th>
          )}
          {columns.map(column => (
            <th
              key={column.id}
              scope="col"
              className={mergeClasses(
                styles.head,
                column.figures === true ? styles.figures : undefined,
              )}
            >
              {column.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map(row => {
          const id = keyOf(row);
          const chosen = selected !== undefined && selected === id;
          return (
            <tr
              key={id}
              data-ayq-row={id}
              aria-selected={onSelect === undefined ? undefined : chosen}
              tabIndex={onSelect === undefined ? undefined : 0}
              className={mergeClasses(
                onSelect === undefined ? undefined : styles.row,
                chosen ? styles.selected : undefined,
              )}
              onClick={() => onSelect?.(row)}
              onKeyDown={event => {
                // A row a mouse can choose is a row a keyboard can choose.
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                onSelect?.(row);
              }}
            >
              {selection === undefined ? null : (
                <td
                  className={mergeClasses(styles.cell, styles.tick)}
                  data-ayq-cell="select"
                  // A tick is not an opening: the click stops here.
                  onClick={event => event.stopPropagation()}
                  onKeyDown={event => event.stopPropagation()}
                >
                  <Checkbox
                    data-ayq-select-row={id}
                    aria-label={selection.rowLabel}
                    checked={selection.selected.has(id)}
                    onChange={(_event, data) =>
                      selection.onToggle(id, data.checked === true)
                    }
                  />
                </td>
              )}
              {columns.map(column => (
                <td
                  key={column.id}
                  className={mergeClasses(
                    styles.cell,
                    column.figures === true ? styles.figures : undefined,
                  )}
                  data-ayq-cell={column.id}
                >
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
      {footer === undefined ? null : (
        <tfoot>
          <tr>
            <td className={styles.foot} colSpan={span}>
              {footer}
            </td>
          </tr>
        </tfoot>
      )}
    </table>
  );
}
