// The frame every screen is drawn in (04 A20, A22; template r003).
//
// When a screen holds more views than the rail can carry, a strip of tabs
// stands at its top, 38 high with a 36 hit target (A39), and does not scroll.
// Under it — or, on every other screen, at the top — one scroller: the
// screen's name and what it is for, then its panes, on 18 of padding with 8
// between them. One scroller, and its scrollbar is at the window's right edge:
// no pane inside a screen carries a scrollbar of its own, because two
// scrollbars mean a person has to work out which one moves the thing they are
// looking at.

import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { makeStyles, mergeClasses } from '@fluentui/react-components';

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
  strip: {
    flex: 'none',
    height: `${AYQ_METRIC.stripHeight}px`,
    display: 'flex',
    alignItems: 'stretch',
    gap: `${AYQ_METRIC.space.tight}px`,
    padding: '0 14px',
    backgroundColor: 'var(--ayq-pane)',
    ...ayqBorderBottom('var(--ayq-line)'),
  },
  tab: {
    position: 'relative',
    height: `${AYQ_METRIC.stripHit}px`,
    minWidth: '74px',
    padding: `0 ${AYQ_METRIC.space.wide}px`,
    ...AYQ_NO_BORDER,
    backgroundColor: 'transparent',
    font: 'inherit',
    fontSize: AYQ_TYPE.size.body,
    color: 'var(--ayq-ink-quiet)',
    cursor: 'pointer',
    ':hover': { backgroundColor: 'var(--ayq-row-hover)' },
    ':focus-visible': {
      outlineWidth: `${AYQ_METRIC.focusRing}px`,
      outlineStyle: 'solid',
      outlineColor: 'var(--ayq-accent-focus)',
      outlineOffset: '-3px',
    },
  },
  tabCurrent: {
    color: 'var(--ayq-ink)',
    fontWeight: AYQ_TYPE.weight.semibold,
    '::after': {
      content: '""',
      position: 'absolute',
      left: '10px',
      right: '10px',
      bottom: '0',
      height: '2px',
      backgroundColor: 'var(--ayq-accent-line-on)',
    },
  },
  // The one scroller. `scrollbar-gutter: stable` keeps the rows from shifting
  // sideways when a screen grows past the window.
  body: {
    flexGrow: 1,
    minHeight: '0',
    padding: `${AYQ_METRIC.panePadding}px`,
    overflowY: 'auto',
    overflowX: 'hidden',
    scrollbarColor: 'var(--ayq-line-strong) transparent',
    display: 'flex',
    flexDirection: 'column',
    gap: `${AYQ_METRIC.splitGap}px`,
    // The panes keep their height: the scroller scrolls, it does not squeeze.
    '& > *': { flexShrink: 0 },
  },
  head: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: `${AYQ_METRIC.space.screen}px`,
    marginBottom: '6px',
  },
  toolbar: {
    display: 'flex',
    gap: `${AYQ_METRIC.space.medium}px`,
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  title: {
    fontFamily: 'var(--ayq-font-display)',
    fontSize: 'var(--ayq-size-screen)',
    fontWeight: AYQ_TYPE.weight.semibold,
    margin: '0 0 3px',
    color: 'var(--ayq-ink)',
  },
  blurb: {
    margin: '0',
    fontSize: 'var(--ayq-size-small)',
    color: 'var(--ayq-ink-faint)',
    maxWidth: '74ch',
  },
});

export type AyqTab<T extends string> = { id: T; label: string; tally?: number };

/**
 * Where a screen's own actions go: the right of its name (template r003's
 * toolbar). The screen renders them through `AyqScreenActions`; the frame
 * holds the place.
 */
export const AyqScreenActionsContext = createContext<HTMLElement | null>(null);
const ActionsContext = AyqScreenActionsContext;

export function AyqScreenActions({ children }: { children: ReactNode }): ReactNode {
  const host = useContext(ActionsContext);
  // Outside a frame — a test, or a screen drawn on its own — the actions
  // stand where they are written.
  if (host === null) return children;
  return createPortal(children, host);
}

export function AyqScreen<T extends string>({
  name,
  title,
  blurb,
  tabs,
  tab,
  onTab,
  actions,
  children,
}: {
  /** Which destination this is, for the acceptance runs. */
  name: string;
  title: string;
  blurb?: string;
  tabs?: readonly AyqTab<T>[];
  tab?: T;
  onTab?: (tab: T) => void;
  /** The screen's own actions, at the right of its name. */
  actions?: ReactNode;
  children: ReactNode;
}): ReactNode {
  const styles = useStyles();
  const hasTabs = tabs !== undefined && tabs.length > 0;
  const [host, setHost] = useState<HTMLElement | null>(null);
  return (
    <ActionsContext.Provider value={host}>
    <section className={styles.screen} data-ayq-screen={name}>
      {hasTabs ? (
        <div className={styles.strip} role="tablist" data-ayq-strip="">
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
      ) : null}
      <div className={styles.body} data-ayq-scroller="">
        {hasTabs ? null : (
          <div className={styles.head}>
            <div>
              {/* A page that names itself — a counterparty's — leaves the
                  frame's name empty and stands alone. */}
              {title === '' ? null : <h1 className={styles.title}>{title}</h1>}
              {blurb === undefined || blurb === '' ? null : (
                <p className={styles.blurb}>{blurb}</p>
              )}
            </div>
            <div className={styles.toolbar} ref={setHost} data-ayq-screen-actions="">
              {actions}
            </div>
          </div>
        )}
        {children}
      </div>
    </section>
    </ActionsContext.Provider>
  );
}
