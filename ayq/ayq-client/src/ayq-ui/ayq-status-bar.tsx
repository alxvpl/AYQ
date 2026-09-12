// The status bar (04 A20): what is true about this window, in one line.
//
// It carries no version number — not the application's, not the engine's. What
// it does carry is where the money is (the budget and the directory it lives
// in), whether the engine is answering, when a statement last arrived, and how
// much AYQ is holding.

import { makeStyles } from '@fluentui/react-components';
import type { ReactNode } from 'react';

import { ayqCount, ayqMoment, ayqText } from '../ayq-strings.ts';
import { AYQ_METRIC, AYQ_TYPE } from '../ayq-tokens.ts';
import { ayqBorderTop } from './ayq-css.ts';
import type {
  AyqEngineStatus,
  AyqSummary,
} from '../ayq-ipc-contract.ts';

const useStyles = makeStyles({
  bar: {
    gridColumn: '2',
    height: 'var(--ayq-status-height)',
    display: 'flex',
    alignItems: 'center',
    gap: `${AYQ_METRIC.space.edge}px`,
    padding: `0 ${AYQ_METRIC.space.wide}px`,
    backgroundColor: 'var(--ayq-pane)',
    ...ayqBorderTop('var(--ayq-line)'),
    color: 'var(--ayq-ink-faint)',
    fontSize: 'var(--ayq-size-small)',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
  },
  engine: { display: 'inline-flex', alignItems: 'center', gap: '6px' },
  running: { color: 'var(--ayq-state-confirmed-fg)' },
  failed: { color: 'var(--ayq-state-overdue-fg)' },
  right: { marginLeft: 'auto' },
  figures: { fontVariantNumeric: AYQ_TYPE.figures },
  path: {
    fontFamily: 'var(--ayq-font-mono)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    minWidth: '0',
  },
});

export function AyqStatusBar({
  status,
  summary,
  failure,
}: {
  status: AyqEngineStatus | null;
  summary: AyqSummary | null;
  failure: string | null;
}): ReactNode {
  const styles = useStyles();

  const engine =
    status !== null
      ? ayqText('status.engine.running')
      : failure === null
        ? ayqText('status.engine.starting')
        : ayqText('status.engine.failed');

  const counted = summary?.accounts.filter(one => one.countsTowardFunds).length ?? 0;

  return (
    <footer className={styles.bar} data-ayq-status="">
      <span className={styles.engine}>
        <span
          className={
            status !== null
              ? styles.running
              : failure === null
                ? undefined
                : styles.failed
          }
          aria-hidden="true"
        >
          ●
        </span>
        {engine}
      </span>
      {status === null ? null : (
        <>
          <span>{ayqText('status.budget', { name: status.budgetName })}</span>
          <span className={styles.path} title={status.dataDir}>
            {status.dataDir}
          </span>
        </>
      )}
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
