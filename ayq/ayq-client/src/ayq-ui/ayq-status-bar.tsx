// The status bar (04 A20): what is true about this window, in one line.
//
// It carries no version number — not the application's, not the engine's — and
// nothing technical (04 A26): no engine state, no filesystem path, no internal
// budget name. Those belong to Settings → About and its copied technical
// information (06 §3.6–§3.7). What it carries is operational: when a statement
// last arrived, and how much AYQ is holding. An engine that does not answer is
// said in the window's notice, where it can be acted on, not here.

import { makeStyles } from '@fluentui/react-components';
import type { ReactNode } from 'react';

import { ayqCount, ayqMoment, ayqText } from '../ayq-strings.ts';
import { AYQ_METRIC, AYQ_TYPE } from '../ayq-tokens.ts';
import { ayqBorderTop } from './ayq-css.ts';
import type { AyqSummary } from '../ayq-ipc-contract.ts';

const useStyles = makeStyles({
  bar: {
    gridColumn: '2',
    gridRow: '3',
    height: 'var(--ayq-status-height)',
    display: 'flex',
    alignItems: 'center',
    gap: `${AYQ_METRIC.space.wide}px`,
    padding: `0 ${AYQ_METRIC.space.ten}px`,
    backgroundColor: 'var(--ayq-status)',
    ...ayqBorderTop('var(--ayq-line)'),
    color: 'var(--ayq-ink-quiet)',
    fontSize: 'var(--ayq-size-small)',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
  },
  right: { marginLeft: 'auto' },
  figures: { fontVariantNumeric: AYQ_TYPE.figures },
});

export function AyqStatusBar({ summary }: { summary: AyqSummary | null }): ReactNode {
  const styles = useStyles();

  const counted = summary?.accounts.filter(one => one.countsTowardFunds).length ?? 0;

  return (
    <footer className={styles.bar} data-ayq-status="">
      <span>
        {summary?.lastImportAt
          ? ayqText('status.lastImport', {
              when: ayqMoment(summary.lastImportAt),
            })
          : ayqText('status.noImport')}
      </span>
      <span className={styles.right}>
        <span className={styles.figures}>
          {ayqText('status.transactions', {
            count: ayqCount(summary?.transactionCount ?? 0),
          })}
        </span>
        {' · '}
        <span className={styles.figures}>
          {ayqText('status.accountsCounted', {
            counted: ayqCount(counted),
            total: ayqCount(summary?.accounts.length ?? 0),
          })}
        </span>
      </span>
    </footer>
  );
}
