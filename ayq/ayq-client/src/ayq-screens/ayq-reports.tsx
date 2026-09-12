// Reports (04 A2, A20): not built, and this screen says exactly that.
//
// It draws nothing and asks the engine nothing. Both of those are the point.
// An empty screen that has queried a budget looks like a budget with nothing in
// it; an empty screen that has asked nothing can only be read as a screen that
// has not been written. And it invents no reason — no history to accumulate, no
// threshold to reach, nothing waiting on anybody — because the only true reason
// is that the view is not built, and a screen that implies a person is at fault
// for it is worse than an empty screen.
//
// It also records, where the question now lives, that AYQ had a Spending screen
// before the accepted design and that it was removed: A20's rail has no such
// destination, and its question is this one. That is the owner's to overrule,
// and it should be readable on the screen rather than only in a progress file.

import { makeStyles } from '@fluentui/react-components';
import type { ReactNode } from 'react';

import { ayqText } from '../ayq-strings.ts';
import { AYQ_METRIC, AYQ_TYPE } from '../ayq-tokens.ts';
import { AyqButton } from '../ayq-ui/ayq-button.tsx';

const useStyles = makeStyles({
  nothing: { maxWidth: '62ch', padding: `${AYQ_METRIC.space.edge}px 2px` },
  title: {
    fontFamily: 'var(--ayq-font-display)',
    fontSize: 'var(--ayq-size-heading)',
    fontWeight: AYQ_TYPE.weight.semibold,
    margin: `0 0 ${AYQ_METRIC.space.medium}px`,
    color: 'var(--ayq-ink)',
  },
  body: {
    margin: `0 0 ${AYQ_METRIC.space.wide}px`,
    color: 'var(--ayq-ink-quiet)',
  },
});

export function AyqReportsScreen({
  onOpenRegister,
}: {
  onOpenRegister(): void;
}): ReactNode {
  const styles = useStyles();
  return (
    <div className={styles.nothing} data-ayq-not-built="reports">
      <h2 className={styles.title}>{ayqText('notBuilt.title')}</h2>
      <p className={styles.body} data-ayq-reports-says="">
        {ayqText('reports.notBuilt')}
      </p>
      <p className={styles.body}>{ayqText('reports.willAnswer')}</p>
      <p className={styles.body} data-ayq-reports-spending="">
        {ayqText('reports.spending')}
      </p>
      <p className={styles.body}>{ayqText('reports.meanwhile')}</p>
      <AyqButton mark="reports-register" onClick={onOpenRegister}>
        {ayqText('reports.open.register')}
      </AyqButton>
    </div>
  );
}
