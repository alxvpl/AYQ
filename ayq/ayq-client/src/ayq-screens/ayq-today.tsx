// Today (04 A21): what you have, how long it lasts, what is waiting on you.
//
// In that order, and the order is the decision. Available funds is the first
// figure and the largest one, with the accounts beside it and the reliability
// boundary stated under it (03 §8.4) — a position without the date it can be
// relied on to is a number presented as more certain than it is.
//
// Then how long it lasts, then the transaction list, and the queues last. That
// is A21's own order, in its own words: "The transaction list follows. Queues
// come last." Drawn as template r003 composes it: one headline pane with the
// funds, the runway and the coverage line on the left and the accounts on the
// right; the recent transactions; the queues as a list with a count box, a
// title, a note and the way to each.
//
// None of the queue counts is stored: they are counted when the screen is
// opened, because a stored queue length is one that can be wrong.

import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import { makeStyles, mergeClasses } from '@fluentui/react-components';

import { ayqAsk } from '../ayq-bridge.ts';
import type { AyqDestination } from '../ayq-destinations.ts';
import type { AyqAttention, AyqLedger, AyqToday } from '../ayq-ipc-contract.ts';
import { ayqCount, ayqDate, ayqMoney, ayqMonthName, ayqText } from '../ayq-strings.ts';
import type { AyqStringKey } from '../ayq-strings.ts';
import { AYQ_METRIC, AYQ_TYPE } from '../ayq-tokens.ts';
import { AyqButton } from '../ayq-ui/ayq-button.tsx';
import {
  AYQ_NO_BORDER,
  ayqBorderLeft,
  ayqBorderTop,
} from '../ayq-ui/ayq-css.ts';
import { AyqFigure } from '../ayq-ui/ayq-figure.tsx';
import { AyqPane } from '../ayq-ui/ayq-pane.tsx';
import { AyqStateChip } from '../ayq-ui/ayq-state-chip.tsx';

import { AyqAttentionPane } from './ayq-attention.tsx';
import { AyqLedgerPane } from './ayq-ledger-pane.tsx';

const useStyles = makeStyles({
  headline: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.1fr)',
  },
  main: {
    padding: `${AYQ_METRIC.panePadding}px`,
    display: 'grid',
    gap: '14px',
    alignContent: 'start',
  },
  kicker: {
    fontSize: 'var(--ayq-size-small)',
    color: 'var(--ayq-label)',
    textTransform: 'uppercase',
    letterSpacing: '0.45px',
    fontWeight: AYQ_TYPE.weight.semibold,
  },
  sub: {
    fontSize: 'var(--ayq-size-small)',
    color: 'var(--ayq-ink-faint)',
  },
  block: { display: 'grid', gap: '2px', justifyItems: 'start' },
  runway: {
    paddingTop: `${AYQ_METRIC.space.wide}px`,
    ...ayqBorderTop('var(--ayq-section)'),
    display: 'grid',
    gap: '2px',
  },
  runwayFigures: {
    display: 'flex',
    gap: '34px',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
  },
  coverage: {
    display: 'flex',
    alignItems: 'center',
    gap: `${AYQ_METRIC.space.ten}px`,
    flexWrap: 'wrap',
    paddingTop: `${AYQ_METRIC.space.wide}px`,
    ...ayqBorderTop('var(--ayq-section)'),
  },
  side: {
    ...ayqBorderLeft('var(--ayq-line)'),
    display: 'flex',
    flexDirection: 'column',
    minWidth: '0',
  },
  sideHead: {
    height: `${AYQ_METRIC.paneHeaderHeight}px`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: `0 ${AYQ_METRIC.panePadding}px`,
    ...ayqBorderTop('transparent'),
    borderBottomWidth: 'var(--ayq-hairline)',
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--ayq-line)',
    fontWeight: AYQ_TYPE.weight.semibold,
    fontSize: 'var(--ayq-size-heading)',
  },
  account: {
    cursor: 'pointer',
    padding: `${AYQ_METRIC.space.ten}px ${AYQ_METRIC.panePadding}px`,
    ...ayqBorderTop('var(--ayq-section)'),
    ':first-of-type': { borderTopWidth: '0' },
  },
  accountLine: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: `${AYQ_METRIC.space.ten}px`,
  },
  // A row that opens something is a control, and is built as one so that a
  // keyboard reaches it. It keeps the look of a line of text.
  accountLink: {
    ...AYQ_NO_BORDER,
    backgroundColor: 'transparent',
    font: 'inherit',
    color: 'inherit',
    fontWeight: AYQ_TYPE.weight.semibold,
    cursor: 'pointer',
    padding: '1px 4px',
    marginLeft: '-4px',
    borderRadius: '2px',
    display: 'inline-flex',
    alignItems: 'baseline',
    gap: `${AYQ_METRIC.space.tight}px`,
    textAlign: 'left',
    ':hover': { backgroundColor: 'var(--ayq-row-hover)' },
    ':focus-visible': {
      outlineWidth: `${AYQ_METRIC.focusRing}px`,
      outlineStyle: 'solid',
      outlineColor: 'var(--ayq-accent-focus)',
      outlineOffset: '1px',
    },
  },
  chevron: {
    color: 'var(--ayq-ink-faint)',
    fontWeight: AYQ_TYPE.weight.regular,
    fontSize: 'var(--ayq-size-heading)',
    lineHeight: '1',
  },
  uncounted: { color: 'var(--ayq-ink-faint)' },
  ops: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: `${AYQ_METRIC.space.ten}px`,
    marginTop: `${AYQ_METRIC.space.tight}px`,
    flexWrap: 'wrap',
  },
  facts: {
    fontSize: 'var(--ayq-size-small)',
    color: 'var(--ayq-label)',
    display: 'flex',
    gap: `${AYQ_METRIC.space.ten}px`,
    flexWrap: 'wrap',
  },
  fact: { fontWeight: AYQ_TYPE.weight.semibold, color: 'var(--ayq-ink-quiet)' },
  fix: {
    display: 'flex',
    gap: `${AYQ_METRIC.space.medium}px`,
    alignItems: 'center',
  },
  total: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: `${AYQ_METRIC.space.ten}px ${AYQ_METRIC.panePadding}px`,
    ...ayqBorderTop('var(--ayq-line)'),
    marginTop: 'auto',
    fontSize: 'var(--ayq-size-small)',
    color: 'var(--ayq-ink-faint)',
  },
  note: { color: 'var(--ayq-ink-faint)', fontSize: 'var(--ayq-size-small)' },
  waiting: {
    listStyle: 'none',
    margin: '0',
    padding: `${AYQ_METRIC.panePadding}px`,
    display: 'grid',
  },
  waitItem: {
    display: 'grid',
    gridTemplateColumns: '28px 1fr auto',
    gap: `${AYQ_METRIC.space.ten}px`,
    alignItems: 'center',
    padding: '9px 0',
    ...ayqBorderTop('var(--ayq-section)'),
    ':first-child': { borderTopWidth: '0', paddingTop: '0' },
    ':last-child': { paddingBottom: '0' },
  },
  waitNum: {
    width: '26px',
    height: '26px',
    display: 'grid',
    placeItems: 'center',
    borderRadius: 'var(--ayq-radius-small)',
    backgroundColor: 'var(--ayq-quiet)',
    fontWeight: AYQ_TYPE.weight.bold,
    fontVariantNumeric: AYQ_TYPE.figures,
  },
  waitTitle: { fontWeight: AYQ_TYPE.weight.semibold },
  waitNone: { color: 'var(--ayq-ink-faint)' },
});

/** One line of the waiting list, drawn only when there is something in it. */
function Waiting({
  count,
  label,
  destination,
  onOpen,
}: {
  count: number;
  label: string;
  destination: AyqDestination;
  onOpen(destination: AyqDestination): void;
}): ReactNode {
  const styles = useStyles();
  if (count === 0) return null;
  return (
    <li className={styles.waitItem} data-ayq-waiting-line={destination}>
      <span className={styles.waitNum}>{ayqCount(count)}</span>
      <span className={styles.waitTitle}>{label}</span>
      <AyqButton
        mark={`today-${destination}`}
        onClick={() => onOpen(destination)}
      >
        {ayqText('today.open')}
      </AyqButton>
    </li>
  );
}

export function AyqTodayScreen({
  onFailure,
  onOpen,
  onOpenAccount,
  onOpenBackup,
  round,
}: {
  onFailure(message: string): void;
  onOpen(destination: AyqDestination): void;
  /** Opens one account's own detail — a secondary surface, not a workspace. */
  onOpenAccount(accountId: string): void;
  /** Settings → Data & Backup, where a failed backup is dealt with. */
  onOpenBackup(): void;
  round: number;
}): ReactNode {
  const styles = useStyles();
  const [today, setToday] = useState<AyqToday | null>(null);
  const [attention, setAttention] = useState<AyqAttention | null>(null);

  // What needs attention is the engine's answer (010 §8.1), asked beside Today's
  // own and drawn as it comes.
  useEffect(() => {
    let live = true;
    void (async () => {
      const answered = await ayqAsk({ kind: 'attention' });
      if (!answered.ok) throw new Error(answered.message);
      if (live) setAttention(answered.result as AyqAttention);
    })().catch((error: unknown) => {
      if (live) {
        onFailure(error instanceof Error ? error.message : String(error));
      }
    });
    return () => {
      live = false;
    };
  }, [round, onFailure]);

  useEffect(() => {
    let live = true;
    void (async () => {
      const answered = await ayqAsk({ kind: 'today' });
      if (!answered.ok) throw new Error(answered.message);
      if (live) setToday(answered.result as AyqToday);
    })().catch((error: unknown) => {
      if (live)
        {onFailure(error instanceof Error ? error.message : String(error));}
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

  const lines: Array<{ count: number; key: AyqStringKey; to: AyqDestination }> =
    [
      { count: waiting.matches, key: 'today.waiting.matches', to: 'upcoming' },
      {
        count: waiting.uncategorised,
        key: 'today.waiting.uncategorised',
        to: 'register',
      },
      {
        count: waiting.suggestions,
        key: 'today.waiting.suggestions',
        to: 'upcoming',
      },
      {
        count: waiting.counterparties,
        key: 'today.waiting.counterparties',
        to: 'review',
      },
    ];

  return (
    <>
      <AyqPane mark="today-funds">
        <div className={styles.headline} data-ayq-today="">
          <div className={styles.main}>
            <div className={styles.block}>
              <span className={styles.kicker}>{ayqText('today.funds')}</span>
              {/* Still first and still largest — and when it is unknown, the
                  word Unknown occupies that position rather than a number that
                  would be acted on (§5). */}
              <span
                data-ayq-available-funds={
                  accounts.availableFundsCents === null
                    ? 'unknown'
                    : String(accounts.availableFundsCents)
                }
              >
                <AyqFigure
                  cents={accounts.availableFundsCents}
                  size="headline"
                  withSymbol
                  align="left"
                />
              </span>
              <span className={styles.sub}>
                {accounts.availableFundsCents === null
                  ? ayqText('today.funds.unknown')
                  : ayqText('today.funds.counted', {
                      counted: ayqCount(counted.length),
                      total: ayqCount(accounts.accounts.length),
                    })}
              </span>
            </div>

            {/* How long it lasts, under the funds it is projected from. */}
            <div className={styles.runway} data-ayq-pane="today-lasts">
              <span className={styles.kicker}>{ayqText('today.lasts')}</span>
              {accounts.availableFundsCents === null ? (
                <>
                  <AyqFigure cents={null} size="large" align="left" />
                  <span className={styles.sub} data-ayq-no-position="">
                    {ayqText('today.noPosition')}
                  </span>
                </>
              ) : today.lowest === null ? (
                <>
                  <AyqFigure cents={null} size="large" align="left" />
                  <span className={styles.sub}>
                    {ayqText('today.noForecast')}
                  </span>
                </>
              ) : (
                <div className={styles.runwayFigures}>
                  <div
                    className={styles.block}
                    data-ayq-lowest={today.lowest.date}
                  >
                    <AyqFigure cents={today.lowest.balanceCents} size="large" align="left" />
                    <span className={styles.sub}>
                      {ayqText('today.lowest')}{' '}
                      {ayqText('today.lowest.on', {
                        date: ayqDate(today.lowest.date),
                      })}
                    </span>
                  </div>
                  {today.monthEnd === null ? null : (
                    <div
                      className={styles.block}
                      data-ayq-month-end={today.monthEnd.month}
                    >
                      <AyqFigure
                        cents={today.monthEnd.closingCents}
                        size="large"
                      />
                      <span className={styles.sub}>
                        {ayqText('today.monthEnd', {
                          month: ayqMonthName(today.monthEnd.month),
                        })}
                        , {ayqText('today.monthEnd.note')}
                      </span>
                    </div>
                  )}
                </div>
              )}
              <span className={styles.sub}>
                <AyqButton
                  mark="today-upcoming"
                  onClick={() => onOpen('upcoming')}
                >
                  {ayqText('today.open.upcoming')}
                </AyqButton>
              </span>
            </div>

            <div className={styles.coverage} data-ayq-today-coverage="">
              <AyqStateChip
                state="operational"
                ok={accounts.reliableTo !== null}
                label={coverage}
                wrap
              />
              <AyqButton
                mark="today-accounts"
                onClick={() => onOpen('accounts')}
              >
                {ayqText('today.open.accounts')}
              </AyqButton>
              {/* A20: Import is reachable from here, beside the coverage line,
                  where it is looked for. */}
              <AyqButton
                filled
                mark="today-import"
                onClick={() => onOpen('import')}
              >
                {ayqText('today.open.import')}
              </AyqButton>
            </div>
          </div>

          <div className={styles.side}>
            <div className={styles.sideHead}>
              <span>{ayqText('destination.accounts')}</span>
              <span className={styles.sub}>
                {ayqText('today.accounts.select')}
              </span>
            </div>
            {/* 7 §7.2: for every account, its name, its balance or Unknown,
                when an import last succeeded, how far the bank's own data
                reaches, whether AYQ agrees with the bank where there is a bank
                figure to agree with, and the way to fix a missing balance.
                Its name opens the account's own detail. */}
            {accounts.accounts.map(account => (
              <div
                key={account.id}
                className={mergeClasses(
                  styles.account,
                  account.countsTowardFunds ? undefined : styles.uncounted,
                )}
                data-ayq-today-account={account.id}
                data-ayq-account-balance={
                  account.balanceCents === null
                    ? 'unknown'
                    : String(account.balanceCents)
                }
                // The whole row opens the account, as it did; the name is the
                // control a keyboard reaches.
                onClick={() => onOpenAccount(account.id)}
              >
                <div className={styles.accountLine}>
                  <button
                    type="button"
                    className={styles.accountLink}
                    data-ayq-account-link={account.id}
                    onClick={() => onOpenAccount(account.id)}
                  >
                    {account.name}
                    <span className={styles.chevron} aria-hidden="true">
                      {ayqText('today.account.open')}
                    </span>
                  </button>
                  <AyqFigure cents={account.balanceCents} />
                </div>
                <div className={styles.ops}>
                  <span className={styles.facts}>
                    <span data-ayq-last-import={account.lastImportAt ?? ''}>
                      {account.lastImportAt === null
                        ? ayqText('today.account.lastImport.never')
                        : ayqText('today.account.lastImport', {
                            when: ayqDate(account.lastImportAt.slice(0, 10)),
                          })}
                    </span>
                    <span data-ayq-bank-through={account.bankDataThrough ?? ''}>
                      {account.bankDataThrough === null
                        ? ayqText('today.account.bankThrough.none')
                        : ayqText('today.account.bankThrough', {
                            date: ayqDate(account.bankDataThrough),
                          })}
                    </span>
                  </span>
                  {account.balanceCents === null ? (
                    <span className={styles.fix}>
                      <AyqStateChip
                        state="operational"
                        label={ayqText('today.account.noAnchor')}
                      />
                      <AyqButton
                        mark={`today-set-balance-${account.id}`}
                        onClick={() => onOpenAccount(account.id)}
                      >
                        {ayqText('today.account.setBalance')}
                      </AyqButton>
                    </span>
                  ) : account.reconciliation === null ? null : (
                    <span
                      data-ayq-agrees={String(account.reconciliation.agrees)}
                    >
                      <AyqStateChip
                        state="operational"
                        ok={account.reconciliation.agrees}
                        label={
                          account.reconciliation.agrees
                            ? ayqText('today.account.agrees')
                            : ayqText('today.account.differs', {
                                amount: ayqMoney(
                                  account.reconciliation.differenceCents,
                                ),
                              })
                        }
                      />
                    </span>
                  )}
                </div>
              </div>
            ))}
            <div className={styles.total}>
              <span>{ayqText('accounts.footer.held')}</span>
              <AyqFigure cents={accounts.totalBalanceCents} />
            </div>
          </div>
        </div>
      </AyqPane>

      <AyqLedgerPane
        mark="today-movements"
        title={ayqText('today.movements')}
        note={ayqText('today.movements.all')}
        actions={
          <AyqButton mark="today-register" onClick={() => onOpen('register')}>
            {ayqText('today.open.register')}
          </AyqButton>
        }
        filter={AYQ_TODAY_MOVEMENTS}
        empty={ayqText('today.movements.none')}
        onFailure={onFailure}
        onShowTheRule={() => onOpen('settings')}
        onLoaded={nothing}
        reloadToken={round}
        detailWhenChosen
      />

      {attention === null ? null : (
        <AyqAttentionPane
          attention={attention}
          routes={{ open: onOpen, openAccount: onOpenAccount, openBackup: onOpenBackup }}
        />
      )}

      <AyqPane
        mark="today-waiting"
        title={ayqText('today.waiting')}
        note={ayqCount(waiting.total)}
      >
        <ul className={styles.waiting} data-ayq-waiting={String(waiting.total)}>
          {waiting.total === 0 ? (
            <li className={mergeClasses(styles.waitItem, styles.waitNone)}>
              {ayqText('today.waiting.none')}
            </li>
          ) : null}
          <Waiting
            count={waiting.overdue}
            label={ayqText('today.waiting.overdue', {
              amount: ayqMoney(waiting.overdueCents),
            })}
            destination="upcoming"
            onOpen={onOpen}
          />
          {lines.map(line => (
            <Waiting
              key={line.key}
              count={line.count}
              label={ayqText(line.key)}
              destination={line.to}
              onOpen={onOpen}
            />
          ))}
        </ul>
      </AyqPane>
    </>
  );
}

/** The newest few, all accounts: enough to see what just happened. */
const AYQ_TODAY_MOVEMENTS = { limit: 8 } as const;
