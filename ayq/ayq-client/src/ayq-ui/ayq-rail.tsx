// The navigation rail (04 A20).
//
// 64 px on the left, the wordmark AYQ at the top as text rather than as a
// coloured tile, three groups separated by hairlines, and Settings at the foot.
// No top panel: the system title bar is the system's.
//
// Every destination is a real button, so the rail is reachable and operable
// from the keyboard with nothing added, and focus is visible on each.

import { makeStyles, mergeClasses } from '@fluentui/react-components';
import {
  ArrowImport24Regular,
  BuildingBank24Regular,
  CalendarClock24Regular,
  DataBarVertical24Regular,
  Home24Regular,
  Settings24Regular,
  TableSimple24Regular,
  TaskListLtr24Regular,
  TextBulletListSquare24Regular,
} from '@fluentui/react-icons';
import { Fragment, type ReactNode } from 'react';

import {
  AYQ_DESTINATION_LABEL,
  AYQ_RAIL_FOOT,
  AYQ_RAIL_GROUPS,
  type AyqDestination,
} from '../ayq-destinations.ts';
import { ayqCount, ayqText } from '../ayq-strings.ts';
import { AYQ_METRIC, AYQ_TYPE } from '../ayq-tokens.ts';
import { AYQ_NO_BORDER } from './ayq-css.ts';

const ICON: Record<AyqDestination, ReactNode> = {
  today: <Home24Regular />,
  accounts: <BuildingBank24Regular />,
  register: <TextBulletListSquare24Regular />,
  review: <TaskListLtr24Regular />,
  upcoming: <CalendarClock24Regular />,
  plan: <TableSimple24Regular />,
  reports: <DataBarVertical24Regular />,
  import: <ArrowImport24Regular />,
  settings: <Settings24Regular />,
};

const useStyles = makeStyles({
  rail: {
    gridRow: '1 / span 2',
    width: `${AYQ_METRIC.railWidth}px`,
    backgroundColor: 'var(--ayq-rail)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: `${AYQ_METRIC.space.wide}px 0`,
    gap: `${AYQ_METRIC.space.hair}px`,
    overflow: 'hidden',
  },
  wordmark: {
    fontFamily: 'var(--ayq-font-display)',
    fontSize: '13px',
    fontWeight: AYQ_TYPE.weight.bold,
    letterSpacing: '1.4px',
    color: 'var(--ayq-rail-ink-on)',
    padding: `${AYQ_METRIC.space.tight}px 0 ${AYQ_METRIC.space.wide}px`,
    userSelect: 'none',
  },
  item: {
    position: 'relative',
    width: '52px',
    height: '46px',
    ...AYQ_NO_BORDER,
    backgroundColor: 'transparent',
    cursor: 'pointer',
    display: 'grid',
    placeItems: 'center',
    rowGap: '3px',
    borderRadius: 'var(--ayq-radius-medium)',
    color: 'var(--ayq-rail-ink)',
    font: 'inherit',
    fontSize: '10.5px',
    ':hover': { color: 'var(--ayq-rail-ink-on)', backgroundColor: '#ffffff14' },
    ':focus-visible': {
      outlineWidth: `${AYQ_METRIC.focusRing}px`,
      outlineStyle: 'solid',
      outlineColor: 'var(--ayq-accent)',
      outlineOffset: '-2px',
    },
  },
  current: {
    color: 'var(--ayq-rail-ink-on)',
    backgroundColor: '#ffffff1a',
    '::before': {
      content: '""',
      position: 'absolute',
      left: '-6px',
      top: '11px',
      bottom: '11px',
      width: '3px',
      borderRadius: '2px',
      backgroundColor: 'var(--ayq-accent)',
    },
  },
  separator: {
    width: '34px',
    height: 'var(--ayq-hairline)',
    backgroundColor: 'var(--ayq-rail-line)',
    margin: `${AYQ_METRIC.space.small}px 0`,
  },
  spacer: { flexGrow: 1 },
  tally: {
    position: 'absolute',
    top: '5px',
    right: '7px',
    minWidth: '15px',
    height: '15px',
    padding: '0 3px',
    borderRadius: '8px',
    backgroundColor: 'var(--ayq-state-overdue-bg)',
    color: 'var(--ayq-state-overdue-fg)',
    fontSize: '9.5px',
    lineHeight: '15px',
    fontVariantNumeric: AYQ_TYPE.figures,
    fontWeight: AYQ_TYPE.weight.semibold,
  },
});

export type AyqRailProps = {
  current: AyqDestination;
  /** How many things are waiting, per destination. Nothing is drawn for zero. */
  waiting?: Partial<Record<AyqDestination, number>>;
  open(destination: AyqDestination): void;
};

function AyqRailItem({
  destination,
  current,
  waiting,
  open,
}: {
  destination: AyqDestination;
  current: boolean;
  waiting: number;
  open(destination: AyqDestination): void;
}): ReactNode {
  const styles = useStyles();
  // The name is under the icon rather than in a tooltip: a rail that has to be
  // hovered to be read is a rail nobody reads.
  const label = ayqText(AYQ_DESTINATION_LABEL[destination]);
  return (
    <button
      type="button"
      className={mergeClasses(styles.item, current ? styles.current : undefined)}
      aria-current={current ? 'page' : undefined}
      data-ayq-tab={destination}
      onClick={() => open(destination)}
    >
      {ICON[destination]}
      {label}
      {waiting > 0 ? (
        <span className={styles.tally} data-ayq-waiting={String(waiting)}>
          {ayqCount(waiting)}
        </span>
      ) : null}
    </button>
  );
}

export function AyqRail({ current, waiting, open }: AyqRailProps): ReactNode {
  const styles = useStyles();
  return (
    <nav className={styles.rail} aria-label={ayqText('app.name')} data-ayq-rail="">
      <div className={styles.wordmark}>{ayqText('app.name')}</div>

      {AYQ_RAIL_GROUPS.map((group, index) => (
        <Fragment key={group.key}>
          {index === 0 ? null : (
            <div className={styles.separator} data-ayq-rail-separator="" />
          )}
          {group.destinations.map(destination => (
            <AyqRailItem
              key={destination}
              destination={destination}
              current={destination === current}
              waiting={waiting?.[destination] ?? 0}
              open={open}
            />
          ))}
        </Fragment>
      ))}

      <div className={styles.spacer} />
      <AyqRailItem
        destination={AYQ_RAIL_FOOT}
        current={AYQ_RAIL_FOOT === current}
        waiting={0}
        open={open}
      />
    </nav>
  );
}
