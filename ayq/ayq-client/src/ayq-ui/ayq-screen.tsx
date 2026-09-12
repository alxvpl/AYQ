// The frame every screen is drawn in (04 A20, A22).
//
// A head that does not scroll — the screen's name, what it is for, and the tab
// strip when a screen holds more views than the rail can carry — and under it
// one scroller. One, and its scrollbar is at the window's right edge: no pane
// inside a screen carries a scrollbar of its own, because two scrollbars mean
// a person has to work out which one moves the thing they are looking at.

import { makeStyles, mergeClasses } from '@fluentui/react-components';
import type { ReactNode } from 'react';

import { AYQ_METRIC, AYQ_TYPE } from '../ayq-tokens.ts';
import { AYQ_NO_BORDER, ayqBorderBottom } from './ayq-css.ts';

const useStyles = makeStyles({
  screen: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '0',
    minWidth: '0',
    overflow: 'hidden',
  },
  head: { padding: `18px ${AYQ_METRIC.space.edge}px 0` },
  title: {
    fontFamily: 'var(--ayq-font-display)',
    fontSize: 'var(--ayq-size-screen)',
    fontWeight: AYQ_TYPE.weight.semibold,
    margin: '0',
    color: 'var(--ayq-ink)',
  },
  blurb: {
    margin: `5px 0 0`,
    color: 'var(--ayq-ink-quiet)',
    maxWidth: '74ch',
  },
  tabs: {
    display: 'flex',
    gap: `${AYQ_METRIC.space.hair}px`,
    margin: `${AYQ_METRIC.space.screen}px 0 0`,
    ...ayqBorderBottom('var(--ayq-line)'),
  },
  tab: {
    ...AYQ_NO_BORDER,
    backgroundColor: 'transparent',
    font: 'inherit',
    color: 'var(--ayq-ink-quiet)',
    padding: '7px 12px 8px',
    cursor: 'pointer',
    ...ayqBorderBottom('transparent', '2px'),
    marginBottom: '-1px',
    ':focus-visible': {
      outlineWidth: `${AYQ_METRIC.focusRing}px`,
      outlineStyle: 'solid',
      outlineColor: 'var(--ayq-accent-focus)',
      outlineOffset: '-3px',
    },
  },
  tabCurrent: {
    color: 'var(--ayq-ink)',
    borderBottomColor: 'var(--ayq-accent-pressed)',
    fontWeight: AYQ_TYPE.weight.semibold,
  },
  // The one scroller. `scrollbar-gutter: stable` keeps the rows from shifting
  // sideways when a screen grows past the window.
  body: {
    flexGrow: 1,
    minHeight: '0',
    padding: `0 ${AYQ_METRIC.space.edge}px 20px`,
    overflowY: 'scroll',
    overflowX: 'hidden',
    scrollbarGutter: 'stable',
    display: 'flex',
    flexDirection: 'column',
    gap: `${AYQ_METRIC.space.wide}px`,
    '> *:first-child': { marginTop: `${AYQ_METRIC.space.screen}px` },
  },
});

export type AyqTab<T extends string> = { id: T; label: string; tally?: number };

export function AyqScreen<T extends string>({
  name,
  title,
  blurb,
  tabs,
  tab,
  onTab,
  children,
}: {
  /** Which destination this is, for the acceptance runs. */
  name: string;
  title: string;
  blurb?: string;
  tabs?: readonly AyqTab<T>[];
  tab?: T;
  onTab?: (tab: T) => void;
  children: ReactNode;
}): ReactNode {
  const styles = useStyles();
  return (
    <section className={styles.screen} data-ayq-screen={name}>
      <div className={styles.head}>
        <h1 className={styles.title}>{title}</h1>
        {blurb === undefined || blurb === '' ? null : (
          <p className={styles.blurb}>{blurb}</p>
        )}
        {tabs === undefined || tabs.length === 0 ? null : (
          <div className={styles.tabs} role="tablist">
            {tabs.map(one => (
              <button
                key={one.id}
                type="button"
                role="tab"
                aria-selected={one.id === tab}
                className={mergeClasses(
                  styles.tab,
                  one.id === tab ? styles.tabCurrent : undefined,
                )}
                data-ayq-screen-tab={one.id}
                onClick={() => onTab?.(one.id)}
              >
                {one.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className={styles.body} data-ayq-scroller="">
        {children}
      </div>
    </section>
  );
}
