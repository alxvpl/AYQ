// The title bar, in the rail's surface (04 A26 as the owner decided it).
//
// Windows draws the window controls; AYQ draws the bar they sit on, in the
// same surface as the rail, so that the frame and the rail read as one
// object in both grounds. The bar carries the mark and the name, and nothing
// else: no menu, no search, no version, no path. Everything in it is drag
// region, because a bar with nothing to press is a bar to move the window by.
//
// The controls themselves stay native: their colours follow the ground through
// the host, which the bar tells whenever the resolved ground changes, and the
// close button keeps the red Windows gives it.

import { useEffect, type ReactNode } from 'react';

import { makeStyles } from '@fluentui/react-components';

import { AyqMark } from '../ayq-brand/ayq-mark.tsx';
import { ayqAsk } from '../ayq-bridge.ts';
import { ayqText } from '../ayq-strings.ts';
import { AYQ_METRIC, AYQ_TYPE } from '../ayq-tokens.ts';

import { ayqBorderBottom } from './ayq-css.ts';
import { useAyqGround } from './ayq-ground-provider.tsx';

const useStyles = makeStyles({
  bar: {
    gridColumn: '1 / span 2',
    gridRow: '1',
    height: `${AYQ_METRIC.titleBarHeight}px`,
    display: 'flex',
    alignItems: 'center',
    gap: `${AYQ_METRIC.space.small}px`,
    paddingLeft: `${AYQ_METRIC.space.wide}px`,
    backgroundColor: 'var(--ayq-rail)',
    color: 'var(--ayq-rail-ink-on)',
    ...ayqBorderBottom('var(--ayq-rail-line)'),
    userSelect: 'none',
    // The whole bar moves the window; the native controls sit over its right end.
    WebkitAppRegion: 'drag',
    // The full width, so the surface runs under the native controls too; the
    // brand sits at the left, far from them.
    width: '100%',
    boxSizing: 'border-box',
  },
  name: {
    fontFamily: 'var(--ayq-font-display)',
    fontSize: '12px',
    fontWeight: AYQ_TYPE.weight.semibold,
    letterSpacing: '1.2px',
  },
});

export function AyqTitleBar(): ReactNode {
  const styles = useStyles();
  const { resolved } = useAyqGround();

  // The host paints the native controls to match; told on every change, so a
  // ground chosen on Appearance reaches the frame at once, not on relaunch.
  useEffect(() => {
    void ayqAsk({ kind: 'window.ground', resolved });
  }, [resolved]);

  return (
    <div className={styles.bar} data-ayq-title-bar={resolved}>
      <AyqMark size={16} />
      <span className={styles.name}>{ayqText('app.name')}</span>
    </div>
  );
}
