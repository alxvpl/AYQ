// A destination whose screen has not been built.
//
// It says so plainly and says nothing else. In particular it invents no reason
// — no threshold of data to reach, no condition to satisfy — because the only
// true reason is that the view is not built, and a screen that implies a person
// is at fault for an empty screen is worse than an empty screen.

import { makeStyles } from '@fluentui/react-components';
import type { ReactNode } from 'react';

import { ayqText } from '../ayq-strings.ts';
import { AYQ_METRIC, AYQ_TYPE } from '../ayq-tokens.ts';

const useStyles = makeStyles({
  nothing: { maxWidth: '58ch', padding: `${AYQ_METRIC.space.edge}px 2px` },
  title: {
    fontFamily: 'var(--ayq-font-display)',
    fontSize: 'var(--ayq-size-heading)',
    fontWeight: AYQ_TYPE.weight.semibold,
    margin: `0 0 ${AYQ_METRIC.space.medium}px`,
    color: 'var(--ayq-ink)',
  },
  body: { margin: `0 0 ${AYQ_METRIC.space.wide}px`, color: 'var(--ayq-ink-quiet)' },
});

export function AyqNotBuilt({
  what,
  children,
}: {
  /** What is missing, in the catalogue's words. */
  what: string;
  children?: ReactNode;
}): ReactNode {
  const styles = useStyles();
  return (
    <div className={styles.nothing} data-ayq-not-built="">
      <h2 className={styles.title}>{ayqText('notBuilt.title')}</h2>
      <p className={styles.body}>{what}</p>
      {children}
    </div>
  );
}
