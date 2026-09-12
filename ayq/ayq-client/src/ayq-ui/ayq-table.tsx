// The table (04 A3): a first-class element, not cards pretending to be one.
//
// Every screen's table is this one. What that buys is that the things A22 and
// A20 ask for are decided once: the header stays while the rows move, a row is
// selectable by keyboard as well as by mouse, focus is visible, and a column of
// figures is right-aligned with tabular numerals (A19).

import { makeStyles, mergeClasses } from '@fluentui/react-components';
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
  head: {
    position: 'sticky',
    top: '0',
    zIndex: 1,
    backgroundColor: 'var(--ayq-pane)',
    textAlign: 'left',
    fontWeight: AYQ_TYPE.weight.semibold,
    color: 'var(--ayq-ink-quiet)',
    padding: `${AYQ_METRIC.header.paddingY}px ${AYQ_METRIC.header.paddingX}px`,
    ...ayqBorderBottom('var(--ayq-line-strong)'),
    whiteSpace: 'nowrap',
  },
  cell: {
    padding: `${AYQ_METRIC.row.paddingY}px ${AYQ_METRIC.row.paddingX}px`,
    ...ayqBorderBottom('var(--ayq-line)'),
    verticalAlign: 'top',
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
    boxShadow: 'inset 3px 0 0 var(--ayq-accent)',
  },
  foot: {
    padding: `9px ${AYQ_METRIC.row.paddingX}px`,
    ...ayqBorderTop('var(--ayq-line-strong)'),
    fontWeight: AYQ_TYPE.weight.semibold,
  },
  empty: {
    padding: `26px ${AYQ_METRIC.row.paddingX}px`,
    color: 'var(--ayq-ink-faint)',
  },
});

export type AyqColumn<T> = {
  id: string;
  header: string;
  /** Right-aligned, tabular numerals (04 A19). */
  figures?: boolean;
  cell(row: T): ReactNode;
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
}: {
  columns: readonly AyqColumn<T>[];
  rows: readonly T[];
  keyOf(row: T): string;
  selected?: string | null;
  onSelect?(row: T): void;
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

  return (
    <table className={styles.table} data-ayq-table={mark}>
      <thead>
        <tr>
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
            <td className={styles.foot} colSpan={columns.length}>
              {footer}
            </td>
          </tr>
        </tfoot>
      )}
    </table>
  );
}
