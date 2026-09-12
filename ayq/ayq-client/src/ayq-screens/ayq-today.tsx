// Today (04 A21): what you have, how long it lasts, what is waiting on you.
//
// In that order, and the order is the decision. Available funds is the first
// figure and the largest one, with the accounts beside it and the reliability
// boundary stated under it (03 §8.4) — a position without the date it can be
// relied on to is a number presented as more certain than it is.
//
// Then how long it lasts, then what is waiting, then the movements. Queues come
// last (A21) and none of their counts is stored: they are counted when the
// screen is opened, because a stored queue length is one that can be wrong.

import { makeStyles } from '@fluentui/react-components';
import { useCallback, useEffect, useState, type ReactNode } from 'react';

import { ayqAsk } from '../ayq-bridge.ts';
import type { AyqDestination } from '../ayq-destinations.ts';
import type { AyqLedger, AyqToday } from '../ayq-ipc-contract.ts';
import {
  ayqCount,
  ayqDate,
  ayqMoney,
  ayqMonthName,
  ayqText,
  type AyqStringKey,
} from '../ayq-strings.ts';
import { AYQ_METRIC, AYQ_TYPE } from '../ayq-tokens.ts';
import { AyqButton } from '../ayq-ui/ayq-button.tsx';
import { ayqBorderTop } from '../ayq-ui/ayq-css.ts';
import { AyqFigure } from '../ayq-ui/ayq-figure.tsx';
import { AyqPane } from '../ayq-ui/ayq-pane.tsx';
import { AyqLedgerPane } from './ayq-ledger-pane.tsx';

const useStyles = makeStyles({
  headline: {
    display: 'grid',
    gridTemplateColumns: 'minmax(260px, 1fr) 2fr',
    overflow: 'hidden',
  },
  funds: {
    padding: `18px ${AYQ_METRIC.space.edge}px`,
    borderRightWidth: 'var(--ayq-hairline)',
    borderRightStyle: 'solid',
    borderRightColor: 'var(--ayq-line)',
  },
  label: {
    display: 'block',
    color: 'var(--ayq-ink-faint)',
    fontSize: 'var(--ayq-size-small)',
  },
  strip: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    padding: `${AYQ_METRIC.space.wide}px ${AYQ_METRIC.space.edge}px`,
  },
  account: {
    display: 'flex',
    alignItems: 'baseline',
    gap: `${AYQ_METRIC.space.screen}px`,
    padding: '4px 0',
  },
  accountName: { flexGrow: 1 },
  uncounted: { color: 'var(--ayq-ink-faint)' },
  total: {
    ...ayqBorderTop('var(--ayq-line)'),
    marginTop: `${AYQ_METRIC.space.tight}px`,
    paddingTop: '7px',
    fontWeight: AYQ_TYPE.weight.semibold,
  },
  coverage: {
    gridColumn: '1 / -1',
    display: 'flex',
    alignItems: 'center',
    gap: `${AYQ_METRIC.space.wide}px`,
    flexWrap: 'wrap',
    padding: `9px ${AYQ_METRIC.space.edge}px`,
    ...ayqBorderTop('var(--ayq-line)'),
    backgroundColor: 'var(--ayq-ground)',
    color: 'var(--ayq-ink-quiet)',
    fontSize: 'var(--ayq-size-small)',
  },
  twoUp: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: `${AYQ_METRIC.space.wide}px`,
  },
  body: {
    display: 'flex',
    gap: '34px',
    padding: `13px ${AYQ_METRIC.space.screen}px`,
    flexWrap: 'wrap',
  },
  figureBlock: { display: 'flex', flexDirection: 'column', gap: '2px' },
  note: { color: 'var(--ayq-ink-faint)', fontSize: 'var(--ayq-size-small)' },
  waiting: {
    listStyle: 'none',
    margin: '0',
    padding: `${AYQ_METRIC.space.medium}px ${AYQ_METRIC.space.screen}px ${AYQ_METRIC.space.wide}px`,
  },
  waitingLine: { padding: '4px 0', color: 'var(--ayq-ink-quiet)' },
  waitingCount: {
    display: 'inline-block',
    minWidth: '26px',
    fontVariantNumeric: AYQ_TYPE.figures,
    color: 'var(--ayq-ink)',
    fontWeight: AYQ_TYPE.weight.semibold,
  },
});

/** One line of the waiting list, drawn only when there is something in it. */
function Waiting({
  count,
  label,
}: {
  count: number;
  label: string;
}): ReactNode {
  const styles = useStyles();
  if (count === 0) return null;
  return (
    <li className={styles.waitingLine}>
      <span className={styles.waitingCount}>{ayqCount(count)}</span> {label}
    </li>
  );
}

export function AyqTodayScreen({
  onFailure,
  onOpen,
  round,
}: {
  onFailure(message: string): void;
  onOpen(destination: AyqDestination): void;
  round: number;
}): ReactNode {
  const styles = useStyles();
  const [today, setToday] = useState<AyqToday | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      const answered = await ayqAsk({ kind: 'today' });
      if (!answered.ok) throw new Error(answered.message);
      if (live) setToday(answered.result as AyqToday);
    })().catch((error: unknown) => {
      if (live) onFailure(error instanceof Error ? error.message : String(error));
    });
    return () => {
      live = false;
    };
  }, [round, onFailure]);

  const nothing = useCallback((_ledger: AyqLedger) => {}, []);

  if (today === null) {
    return <p className={styles.note}>{ayqText('common.loading')}</p>;
  }

  const { accounts, waiting } = today;
  const counted = accounts.accounts.filter(one => one.countsTowardFunds);

  const coverage =
    accounts.accounts.length === 0
      ? ayqText('today.coverage.nothing')
      : accounts.reliableTo === null
        ? ayqText('today.coverage.unknown')
        : ayqText('today.coverage.to', { date: ayqDate(accounts.reliableTo) });

  const lines: Array<{ count: number; key: AyqStringKey }> = [
    { count: waiting.matches, key: 'today.waiting.matches' },
    { count: waiting.uncategorised, key: 'today.waiting.uncategorised' },
    { count: waiting.suggestions, key: 'today.waiting.suggestions' },
    { count: waiting.counterparties, key: 'today.waiting.counterparties' },
  ];

  return (
    <>
      <AyqPane mark="today-funds">
        <div className={styles.headline} data-ayq-today="">
          <div className={styles.funds}>
            <span className={styles.label}>{ayqText('today.funds')}</span>
            <span data-ayq-available-funds={String(accounts.availableFundsCents)}>
              <AyqFigure
                cents={accounts.availableFundsCents}
                size="headline"
                withSymbol
              />
            </span>
            <span className={styles.label}>
              {ayqText('today.funds.counted', {
                counted: ayqCount(counted.length),
                total: ayqCount(accounts.accounts.length),
              })}
            </span>
          </div>

          <div className={styles.strip}>
            {accounts.accounts.map(account => (
              <div
                key={account.id}
                className={
                  account.countsTowardFunds
                    ? styles.account
                    : `${styles.account} ${styles.uncounted}`
                }
                data-ayq-today-account={account.id}
              >
                <span className={styles.accountName}>{account.name}</span>
                <AyqFigure cents={account.balanceCents} />
              </div>
            ))}
            <div className={`${styles.account} ${styles.total}`}>
              <span className={styles.accountName}>
                {ayqText('accounts.footer.held')}
              </span>
              <AyqFigure cents={accounts.totalBalanceCents} />
            </div>
          </div>

          <div className={styles.coverage} data-ayq-today-coverage="">
            <span>{coverage}</span>
            <AyqButton
              size="small"
              mark="today-accounts"
              onClick={() => onOpen('accounts')}
            >
              {ayqText('today.open.accounts')}
            </AyqButton>
            {/* A20: Import is reachable from here, beside the coverage line,
                where it is looked for. */}
            <AyqButton
              size="small"
              mark="today-import"
              onClick={() => onOpen('import')}
            >
              {ayqText('today.open.import')}
            </AyqButton>
          </div>
        </div>
      </AyqPane>

      <div className={styles.twoUp}>
        <AyqPane
          mark="today-lasts"
          title={ayqText('today.lasts')}
          actions={
            <AyqButton
              size="small"
              mark="today-upcoming"
              onClick={() => onOpen('upcoming')}
            >
              {ayqText('today.open.upcoming')}
            </AyqButton>
          }
        >
          <div className={styles.body}>
            {today.lowest === null ? (
              <p className={styles.note}>{ayqText('today.noForecast')}</p>
            ) : (
              <>
                <div className={styles.figureBlock} data-ayq-lowest={today.lowest.date}>
                  <span className={styles.label}>{ayqText('today.lowest')}</span>
                  <AyqFigure cents={today.lowest.balanceCents} size="large" />
                  <span className={styles.note}>
                    {ayqText('today.lowest.on', {
                      date: ayqDate(today.lowest.date),
                    })}
                  </span>
                </div>
                {today.monthEnd === null ? null : (
                  <div className={styles.figureBlock} data-ayq-month-end={today.monthEnd.month}>
                    <span className={styles.label}>
                      {ayqText('today.monthEnd', {
                        month: ayqMonthName(today.monthEnd.month),
                      })}
                    </span>
                    <AyqFigure
                      cents={today.monthEnd.closingCents}
                      size="large"
                    />
                    <span className={styles.note}>
                      {ayqText('today.monthEnd.note')}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        </AyqPane>

        <AyqPane
          mark="today-waiting"
          title={ayqText('today.waiting')}
          note={ayqCount(waiting.total)}
          actions={
            <AyqButton
              size="small"
              mark="today-review"
              onClick={() => onOpen('review')}
            >
              {ayqText('today.open.review')}
            </AyqButton>
          }
        >
          <ul className={styles.waiting} data-ayq-waiting={String(waiting.total)}>
            {waiting.total === 0 ? (
              <li className={styles.waitingLine}>
                {ayqText('today.waiting.none')}
              </li>
            ) : null}
            <Waiting
              count={waiting.overdue}
              label={ayqText('today.waiting.overdue', {
                amount: ayqMoney(waiting.overdueCents),
              })}
            />
            {lines.map(line => (
              <Waiting
                key={line.key}
                count={line.count}
                label={ayqText(line.key)}
              />
            ))}
          </ul>
        </AyqPane>
      </div>

      <AyqLedgerPane
        mark="today-movements"
        title={ayqText('today.movements')}
        note={ayqText('today.movements.all')}
        actions={
          <AyqButton
            size="small"
            mark="today-register"
            onClick={() => onOpen('register')}
          >
            {ayqText('today.open.register')}
          </AyqButton>
        }
        filter={AYQ_TODAY_MOVEMENTS}
        empty={ayqText('today.movements.none')}
        onFailure={onFailure}
        onShowTheRule={() => onOpen('settings')}
        onLoaded={nothing}
        reloadToken={round}
      />
    </>
  );
}

/** The newest few. A constant, so the pane is not asked to read again on
 * every draw by a filter object that is new each time. */
const AYQ_TODAY_MOVEMENTS = { limit: 8 } as const;
