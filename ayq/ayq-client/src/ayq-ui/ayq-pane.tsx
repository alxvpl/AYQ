// A pane, and the table-plus-detail-pane composition every screen reuses
// (04 A3, A4, A22).
//
// The table is the screen and the pane beside it is where the selected record
// is read and changed — not a modal, because a modal hides the list a person is
// working through. The detail pane sticks to the top of the scroller rather
// than scrolling away from the row it describes.
//
// Neither pane scrolls on its own: A22 allows one scroller per screen, and it
// belongs to the screen.

import { makeStyles } from '@fluentui/react-components';
import type { ReactNode } from 'react';

import { AYQ_METRIC, AYQ_TYPE } from '../ayq-tokens.ts';
import { ayqBorder, ayqBorderBottom } from './ayq-css.ts';

const useStyles = makeStyles({
  pane: {
    backgroundColor: 'var(--ayq-pane)',
    ...ayqBorder('var(--ayq-line)'),
    borderRadius: 'var(--ayq-radius-medium)',
    minWidth: '0',
  },
  head: {
    padding: `11px ${AYQ_METRIC.space.screen}px`,
    ...ayqBorderBottom('var(--ayq-line)'),
    display: 'flex',
    alignItems: 'center',
    gap: `${AYQ_METRIC.space.wide}px`,
  },
  title: {
    margin: '0',
    fontSize: 'var(--ayq-size-body)',
    fontWeight: AYQ_TYPE.weight.semibold,
    color: 'var(--ayq-ink)',
  },
  note: { color: 'var(--ayq-ink-faint)', fontSize: 'var(--ayq-size-small)' },
  actions: { marginLeft: 'auto', display: 'flex', gap: `${AYQ_METRIC.space.small}px` },
  split: {
    display: 'grid',
    gridTemplateColumns: `minmax(0, 1fr) var(--ayq-pane-width)`,
    gap: `${AYQ_METRIC.space.screen}px`,
    alignItems: 'start',
  },
  sticky: { position: 'sticky', top: '0' },
});

export function AyqPane({
  title,
  note,
  actions,
  children,
  mark,
}: {
  title?: string;
  note?: string;
  actions?: ReactNode;
  children?: ReactNode;
  mark?: string;
}): ReactNode {
  const styles = useStyles();
  return (
    <div className={styles.pane} data-ayq-pane={mark}>
      {title === undefined ? null : (
        <div className={styles.head}>
          <h2 className={styles.title}>{title}</h2>
          {note === undefined ? null : <span className={styles.note}>{note}</span>}
          {actions === undefined ? null : (
            <div className={styles.actions}>{actions}</div>
          )}
        </div>
      )}
      {children}
    </div>
  );
}

/** The table on the left, the detail pane on the right, and it stays put. */
export function AyqSplit({
  table,
  detail,
}: {
  table: ReactNode;
  detail: ReactNode;
}): ReactNode {
  const styles = useStyles();
  return (
    <div className={styles.split} data-ayq-split="">
      <div>{table}</div>
      <div className={styles.sticky}>{detail}</div>
    </div>
  );
}
