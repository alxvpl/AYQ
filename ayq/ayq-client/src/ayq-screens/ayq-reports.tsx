// Reports (04 A2, A20, A32): what was spent, by category, over a period.
//
// The last step of the working cycle, and a retrospective one: every figure
// here is the engine's answer to `spending` for the period and account asked,
// including the part nobody has filed yet, because a total that quietly omits
// the unfiled is a total that lies. Nothing is computed on the screen beyond
// dividing by the months in the period.
//
// The one thing this screen *does* is open the Register. Choosing a category
// hands the shell the same period, account and category as a filter the
// Register actually applies and shows as chips — the real filter, not a claim
// that one was applied (03 §7.26). Uncategorised is a row like any other and
// opens the Register on the transactions without a category.

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import { makeStyles, Select } from '@fluentui/react-components';

import { ayqAsk } from '../ayq-bridge.ts';
import type {
  AyqAccountSummary,
  AyqLedgerFilter,
  AyqSpending,
  AyqSpendingRow,
} from '../ayq-ipc-contract.ts';
import { ayqCount, ayqDate, ayqText } from '../ayq-strings.ts';
import type { AyqStringKey } from '../ayq-strings.ts';
import { AYQ_METRIC } from '../ayq-tokens.ts';
import { ayqBorder } from '../ayq-ui/ayq-css.ts';
import { AyqFigure } from '../ayq-ui/ayq-figure.tsx';
import { AyqPane } from '../ayq-ui/ayq-pane.tsx';
import { AyqStateChip } from '../ayq-ui/ayq-state-chip.tsx';
import { AyqTable } from '../ayq-ui/ayq-table.tsx';
import type { AyqColumn } from '../ayq-ui/ayq-table.tsx';

import { ayqPeriodBounds } from './ayq-register.tsx';
import type { AyqPeriod } from './ayq-register.tsx';

const useStyles = makeStyles({
  bar: {
    display: 'flex',
    gap: `${AYQ_METRIC.space.medium}px`,
    alignItems: 'center',
    flexWrap: 'wrap',
    padding: `10px ${AYQ_METRIC.space.wide}px`,
    backgroundColor: 'var(--ayq-pane)',
    ...ayqBorder('var(--ayq-line)'),
    borderRadius: 'var(--ayq-radius-medium)',
  },
  totals: {
    display: 'flex',
    gap: `${AYQ_METRIC.space.edge}px`,
    flexWrap: 'wrap',
    padding: `${AYQ_METRIC.space.medium}px 2px`,
  },
  total: {
    display: 'flex',
    flexDirection: 'column',
    gap: `${AYQ_METRIC.space.tight}px`,
  },
  label: { color: 'var(--ayq-ink-quiet)', fontSize: 'var(--ayq-size-small)' },
  note: {
    margin: '0',
    padding: `${AYQ_METRIC.space.medium}px ${AYQ_METRIC.space.screen}px`,
    color: 'var(--ayq-ink-quiet)',
    fontSize: 'var(--ayq-size-small)',
  },
  quiet: { color: 'var(--ayq-ink-faint)' },
});

const PERIODS: readonly AyqPeriod[] = [
  'thisMonth',
  'threeMonths',
  'thisYear',
  'allTime',
];

const PERIOD_LABEL: Record<AyqPeriod, AyqStringKey> = {
  thisMonth: 'register.period.thisMonth',
  threeMonths: 'register.period.threeMonths',
  thisYear: 'register.period.thisYear',
  allTime: 'register.period.allTime',
};

/** How many months the period spans, for the average; never fewer than one. */
function monthsIn(
  period: AyqPeriod,
  today: string,
  spending: AyqSpending,
): number {
  const month = Number(today.slice(5, 7));
  if (period === 'thisMonth') return 1;
  if (period === 'threeMonths') return 3;
  if (period === 'thisYear') return Math.max(1, month);
  return Math.max(1, spending.months.length);
}

export function AyqReportsScreen({
  accounts,
  onOpenRegister,
  onFailure,
}: {
  accounts: readonly AyqAccountSummary[];
  /** Reports does not navigate; the shell applies this filter to the Register. */
  onOpenRegister(filter: AyqLedgerFilter): void;
  onFailure(message: string): void;
}): ReactNode {
  const styles = useStyles();
  const [period, setPeriod] = useState<AyqPeriod>('threeMonths');
  const [accountId, setAccountId] = useState('');
  const [spending, setSpending] = useState<AyqSpending | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const bounds = ayqPeriodBounds(period, today);

  useEffect(() => {
    let live = true;
    void (async () => {
      const answered = await ayqAsk({
        kind: 'spending',
        filter: {
          ...ayqPeriodBounds(period, today),
          accountId: accountId === '' ? undefined : accountId,
        },
      });
      if (!answered.ok) throw new Error(answered.message);
      if (live) setSpending(answered.result as AyqSpending);
    })().catch((error: unknown) => {
      if (live)
        {onFailure(error instanceof Error ? error.message : String(error));}
    });
    return () => {
      live = false;
    };
  }, [period, accountId, today, onFailure]);

  /** The Register filter that is the same question as one row here. */
  const filterFor = (row: AyqSpendingRow): AyqLedgerFilter => ({
    ...bounds,
    accountId: accountId === '' ? undefined : accountId,
    ...(row.categoryId === null
      ? { uncategorised: true }
      : { categoryId: row.categoryId }),
  });

  const months = spending === null ? 1 : monthsIn(period, today, spending);

  const columns: readonly AyqColumn<AyqSpendingRow>[] = [
    {
      id: 'category',
      header: ayqText('reports.column.category'),
      cell: row =>
        row.categoryId === null ? (
          <AyqStateChip
            state="uncategorised"
            label={ayqText('register.category.none')}
          />
        ) : (
          <span data-ayq-report-category={row.categoryId}>
            {row.categoryName}
          </span>
        ),
    },
    {
      id: 'spent',
      header: ayqText('reports.column.spent'),
      figures: true,
      cell: row => <AyqFigure cents={row.cents} />,
    },
    {
      id: 'share',
      header: ayqText('reports.column.share'),
      figures: true,
      cell: row => (
        <span
          className={styles.quiet}
        >{`${(row.share * 100).toFixed(1)}%`}</span>
      ),
    },
    {
      id: 'average',
      header: ayqText('reports.column.average'),
      figures: true,
      cell: row => <AyqFigure cents={Math.round(row.cents / months)} />,
    },
    {
      id: 'transactions',
      header: ayqText('reports.column.transactions'),
      figures: true,
      cell: row => (
        <span data-ayq-report-transactions={String(row.transactions)}>
          {ayqCount(row.transactions)}
        </span>
      ),
    },
  ];

  return (
    <>
      <div className={styles.bar} data-ayq-reports-bar="">
        <Select
          data-ayq-reports-period=""
          aria-label={ayqText('register.filter.period')}
          value={period}
          onChange={(_event, data) => setPeriod(data.value as AyqPeriod)}
        >
          {PERIODS.map(one => (
            <option key={one} value={one}>
              {ayqText(PERIOD_LABEL[one])}
            </option>
          ))}
        </Select>
        <Select
          data-ayq-reports-account=""
          aria-label={ayqText('register.filter.account')}
          value={accountId}
          onChange={(_event, data) => setAccountId(data.value)}
        >
          <option value="">{ayqText('register.all.accounts')}</option>
          {accounts.map(one => (
            <option key={one.id} value={one.id}>
              {one.name}
            </option>
          ))}
        </Select>
        <span className={styles.label}>{ayqText('reports.magnitudes')}</span>
      </div>

      {spending === null ? (
        <p className={styles.note}>{ayqText('common.loading')}</p>
      ) : (
        <>
          <div className={styles.totals} data-ayq-reports-totals="">
            <span className={styles.total}>
              <span className={styles.label}>{ayqText('reports.income')}</span>
              <AyqFigure cents={spending.incomeCents} size="large" withSymbol />
            </span>
            <span className={styles.total}>
              <span className={styles.label}>
                {ayqText('reports.expenses')}
              </span>
              <AyqFigure cents={spending.totalCents} size="large" withSymbol />
            </span>
            <span className={styles.total}>
              <span className={styles.label}>{ayqText('reports.net')}</span>
              <AyqFigure
                cents={spending.incomeCents - spending.totalCents}
                size="large"
                withSymbol
              />
            </span>
          </div>

          <AyqPane
            mark="reports"
            title={ayqText('reports.byCategory')}
            note={
              spending.from === null && spending.to === null
                ? ayqText('register.period.allTime')
                : ayqText('reports.period', {
                    from: spending.from === null ? '…' : ayqDate(spending.from),
                    to:
                      spending.to === null
                        ? ayqDate(today)
                        : ayqDate(spending.to),
                  })
            }
          >
            <p className={styles.note}>{ayqText('reports.select')}</p>
            <AyqTable
              mark="reports"
              columns={columns}
              rows={spending.rows}
              keyOf={row => row.categoryId ?? 'uncategorised'}
              onSelect={row => onOpenRegister(filterFor(row))}
              empty={ayqText('reports.empty')}
            />
            {spending.transferCount === 0 ? null : (
              <p className={styles.note} data-ayq-reports-transfers="">
                {ayqText('reports.transfers', {
                  count: ayqCount(spending.transferCount),
                })}
              </p>
            )}
          </AyqPane>
        </>
      )}
    </>
  );
}
