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
  ArrowImport20Regular,
  BuildingBank20Regular,
  CalendarClock20Regular,
  DataBarVertical20Regular,
  Home20Regular,
  Settings20Regular,
  TableSimple20Regular,
  TaskListLtr20Regular,
  ContactCard20Regular,
  TextBulletListSquare20Regular,
} from '@fluentui/react-icons';
import type { ReactNode } from 'react';

import {
  AYQ_DESTINATION_LABEL,
  AYQ_RAIL_FOOT,
  AYQ_RAIL_GROUPS,
  type AyqDestination,
} from '../ayq-destinations.ts';
import { ayqCount, ayqText } from '../ayq-strings.ts';
import { AYQ_METRIC, AYQ_TYPE } from '../ayq-tokens.ts';
import { AYQ_NO_BORDER, ayqBorderRight, ayqBorderTop } from './ayq-css.ts';

const ICON: Record<AyqDestination, ReactNode> = {
  today: <Home20Regular />,
  accounts: <BuildingBank20Regular />,
  counterparty: <ContactCard20Regular />,
  register: <TextBulletListSquare20Regular />,
  review: <TaskListLtr20Regular />,
  upcoming: <CalendarClock20Regular />,
  plan: <TableSimple20Regular />,
  reports: <DataBarVertical20Regular />,
  import: <ArrowImport20Regular />,
  settings: <Settings20Regular />,
};

const useStyles = makeStyles({
  // Template r003's rail, to A39's numbers: 64 wide, items 56×58, icons 20,
  // captions 11; the groups parted by a hairline across the rail.
  rail: {
    gridRow: '2 / span 2',
    width: `${AYQ_METRIC.railWidth}px`,
    backgroundColor: 'var(--ayq-rail)',
    color: 'var(--ayq-rail-ink)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    minHeight: '0',
    overflow: 'hidden',
    ...ayqBorderRight('var(--ayq-rail-line)'),
  },
  wordmark: {
    height: '52px',
    width: '100%',
    flex: 'none',
    display: 'grid',
    placeItems: 'center',
    fontSize: AYQ_TYPE.size.heading,
    fontWeight: AYQ_TYPE.weight.bold,
    letterSpacing: '0.7px',
    color: 'var(--ayq-rail-ink-on)',
    userSelect: 'none',
  },
  groups: {
    flex: '1',
    minHeight: '0',
    width: '100%',
    padding: `${AYQ_METRIC.space.hair}px ${AYQ_METRIC.space.tight}px`,
    overflowY: 'auto',
    overflowX: 'hidden',
    scrollbarWidth: 'thin',
  },
  group: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: `${AYQ_METRIC.space.hair}px`,
    padding: `${AYQ_METRIC.space.tight}px 0`,
  },
  groupAfter: {
    ...ayqBorderTop('var(--ayq-rail-line)'),
    marginTop: `${AYQ_METRIC.space.tight}px`,
    paddingTop: `${AYQ_METRIC.space.medium}px`,
  },
  foot: {
    flex: 'none',
    width: '100%',
    padding: `5px ${AYQ_METRIC.space.tight}px 7px`,
    display: 'grid',
    placeItems: 'center',
    ...ayqBorderTop('var(--ayq-rail-line)'),
  },
  item: {
    position: 'relative',
    width: `${AYQ_METRIC.railItemWidth}px`,
    height: `${AYQ_METRIC.railItemHeight}px`,
    flex: 'none',
    ...AYQ_NO_BORDER,
    backgroundColor: 'transparent',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: `${AYQ_METRIC.space.tight}px`,
    padding: '0',
    borderRadius: 'var(--ayq-radius-medium)',
    color: 'var(--ayq-rail-ink)',
    font: 'inherit',
    fontSize: `${AYQ_METRIC.railCaption}px`,
    lineHeight: '1',
    ':hover': { backgroundColor: 'var(--ayq-rail-hover)' },
    ':focus-visible': {
      outlineWidth: `${AYQ_METRIC.focusRing}px`,
      outlineStyle: 'solid',
      outlineColor: 'var(--ayq-accent)',
      outlineOffset: '-2px',
    },
    '& > svg': {
      width: `${AYQ_METRIC.railIcon}px`,
      height: `${AYQ_METRIC.railIcon}px`,
    },
  },
  current: {
    color: 'var(--ayq-rail-current-ink)',
    backgroundColor: 'var(--ayq-rail-current)',
    '::before': {
      content: '""',
      position: 'absolute',
      left: '0',
      top: '10px',
      bottom: '10px',
      width: '3px',
      borderRadius: '0 2px 2px 0',
      backgroundColor: 'var(--ayq-accent)',
    },
  },
  tally: {
    position: 'absolute',
    top: '3px',
    right: '4px',
    minWidth: '16px',
    height: '16px',
    padding: '0 4px',
    borderRadius: `${AYQ_METRIC.radiusPill}px`,
    backgroundColor: 'var(--ayq-rail-badge)',
    color: 'var(--ayq-rail-current-ink)',
    fontSize: AYQ_TYPE.size.caption,
    lineHeight: '16px',
    fontVariantNumeric: AYQ_TYPE.figures,
    fontWeight: AYQ_TYPE.weight.semibold,
    display: 'grid',
    placeItems: 'center',
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

      <div className={styles.groups}>
        {AYQ_RAIL_GROUPS.map((group, index) => (
          <div
            key={group.key}
            className={mergeClasses(
              styles.group,
              index === 0 ? undefined : styles.groupAfter,
            )}
            data-ayq-rail-separator={index === 0 ? undefined : ''}
          >
            {group.destinations.map(destination => (
              <AyqRailItem
                key={destination}
                destination={destination}
                current={destination === current}
                waiting={waiting?.[destination] ?? 0}
                open={open}
              />
            ))}
          </div>
        ))}
      </div>

      <div className={styles.foot}>
        <AyqRailItem
          destination={AYQ_RAIL_FOOT}
          current={AYQ_RAIL_FOOT === current}
          waiting={0}
          open={open}
        />
      </div>
    </nav>
  );
}
