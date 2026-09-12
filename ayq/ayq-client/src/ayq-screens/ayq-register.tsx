// Register (04 A3, A4): every transaction AYQ holds, and what is behind one.
//
// The pattern every other screen reuses — a table with a detail pane beside it
// — and the one screen where the filters live (review D2). What is filtered is
// visible and removable, and the totals say which set they describe, because a
// total that silently describes a filtered set is a total that misleads.
//
// Uncategorised is a state like any other and stays in every total (03 §4.5).

import {
  Checkbox,
  Input,
  Select,
  makeStyles,
} from '@fluentui/react-components';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { ayqAsk } from '../ayq-bridge.ts';
import type {
  AyqAccountSummary,
  AyqCategory,
  AyqLedger,
  AyqLedgerFilter,
} from '../ayq-ipc-contract.ts';
import { ayqAmount, ayqCount, ayqMoney, ayqText } from '../ayq-strings.ts';
import { AYQ_METRIC } from '../ayq-tokens.ts';
import { AyqButton } from '../ayq-ui/ayq-button.tsx';
import { ayqBorder } from '../ayq-ui/ayq-css.ts';
import {
  AyqFilterChips,
  type AyqAppliedFilter,
} from '../ayq-ui/ayq-filter-chips.tsx';
import { AyqLedgerPane } from './ayq-ledger-pane.tsx';

const useStyles = makeStyles({
  filters: {
    display: 'flex',
    gap: `${AYQ_METRIC.space.medium}px`,
    alignItems: 'center',
    flexWrap: 'wrap',
    padding: `10px ${AYQ_METRIC.space.wide}px`,
    backgroundColor: 'var(--ayq-pane)',
    ...ayqBorder('var(--ayq-line)'),
    borderRadius: 'var(--ayq-radius-medium)',
  },
  search: { flexGrow: 1, minWidth: '220px' },
  amount: { width: '110px' },
  totals: { color: 'var(--ayq-ink-quiet)' },
  quiet: { color: 'var(--ayq-ink-faint)' },
});

export type AyqPeriod = 'thisMonth' | 'threeMonths' | 'thisYear' | 'allTime';

const PERIODS: readonly AyqPeriod[] = [
  'thisMonth',
  'threeMonths',
  'thisYear',
  'allTime',
];

const PERIOD_LABEL = {
  thisMonth: 'register.period.thisMonth',
  threeMonths: 'register.period.threeMonths',
  thisYear: 'register.period.thisYear',
  allTime: 'register.period.allTime',
} as const;

/** A period as the two dates the engine filters on. `today` is a day. */
export function ayqPeriodBounds(
  period: AyqPeriod,
  today: string,
): { from?: string; to?: string } {
  const [year, month] = today.split('-').map(Number);
  const pad = (value: number): string => String(value).padStart(2, '0');
  if (period === 'allTime') return {};
  if (period === 'thisMonth') return { from: `${year}-${pad(month)}-01` };
  if (period === 'thisYear') return { from: `${year}-01-01` };
  // Three months back, counting this one: September asks from 1 July.
  const start = month - 2;
  return start >= 1
    ? { from: `${year}-${pad(start)}-01` }
    : { from: `${year - 1}-${pad(start + 12)}-01` };
}

/** Cents from what somebody typed, or nothing if it was not a number. */
function cents(typed: string): number | undefined {
  const value = Number(typed.replace(',', '.'));
  return typed.trim() === '' || Number.isNaN(value)
    ? undefined
    : Math.round(value * 100);
}

export function AyqRegisterScreen({
  accounts,
  filter,
  onFilter,
  onShowTheRule,
  onFailure,
  onLoaded,
}: {
  accounts: readonly AyqAccountSummary[];
  /** The filter the shell is holding, so arriving from another screen keeps it. */
  filter: AyqLedgerFilter;
  onFilter(filter: AyqLedgerFilter): void;
  onShowTheRule(): void;
  onFailure(message: string): void;
  onLoaded(ledger: AyqLedger): void;
}): ReactNode {
  const styles = useStyles();
  const [ledger, setLedger] = useState<AyqLedger | null>(null);
  const [categories, setCategories] = useState<readonly AyqCategory[]>([]);
  const [period, setPeriod] = useState<AyqPeriod>('allTime');
  // How far back the table has been asked to reach. The engine answers with a
  // page; this is how a person asks for the next one, and it is the Register's
  // own rather than the shell's, because it is about this table and not about
  // what is being looked at.
  const [limit, setLimit] = useState<number | undefined>(undefined);

  // The categories the filter offers. The pane beside the table reads its own
  // — this one is the filter bar's, and it is asked for once.
  useEffect(() => {
    let live = true;
    void (async () => {
      const filed = await ayqAsk({ kind: 'categories.list' });
      if (!filed.ok) throw new Error(filed.message);
      if (live) setCategories(filed.result as AyqCategory[]);
    })().catch((error: unknown) => {
      if (live) onFailure(error instanceof Error ? error.message : String(error));
    });
    return () => {
      live = false;
    };
  }, [onFailure]);

  const change = useCallback(
    (next: AyqLedgerFilter) => {
      // A different question deserves its first page, not the page depth the
      // last question had been read to.
      setLimit(undefined);
      onFilter(next);
    },
    [onFilter],
  );

  // One object per question, so the pane reads the engine when the question
  // changes and not on every keystroke that redraws the bar.
  const asked = useMemo(
    () => (limit === undefined ? filter : { ...filter, limit }),
    [filter, limit],
  );

  const loaded = useCallback(
    (answer: AyqLedger) => {
      setLedger(answer);
      onLoaded(answer);
    },
    [onLoaded],
  );

  const applied: AyqAppliedFilter[] = [];
  if ((filter.search ?? '') !== '') {
    applied.push({
      id: 'search',
      name: ayqText('register.filter.search'),
      value: filter.search ?? '',
      remove: () => change({ ...filter, search: undefined }),
    });
  }
  if (filter.accountId !== undefined) {
    applied.push({
      id: 'account',
      name: ayqText('register.filter.account'),
      value:
        accounts.find(one => one.id === filter.accountId)?.name ??
        filter.accountId,
      remove: () => change({ ...filter, accountId: undefined }),
    });
  }
  if (filter.categoryId !== undefined) {
    applied.push({
      id: 'category',
      name: ayqText('register.filter.category'),
      value:
        categories.find(one => one.id === filter.categoryId)?.name ??
        filter.categoryId,
      remove: () => change({ ...filter, categoryId: undefined }),
    });
  }
  if (filter.counterpartyKey !== undefined) {
    applied.push({
      id: 'counterparty',
      name: ayqText('register.filter.counterparty'),
      value: filter.counterpartyKey,
      remove: () => change({ ...filter, counterpartyKey: undefined }),
    });
  }
  if (filter.uncategorised === true) {
    applied.push({
      id: 'uncategorised',
      name: ayqText('register.filter.uncategorised'),
      value: ayqText('register.category.none'),
      remove: () => change({ ...filter, uncategorised: undefined }),
    });
  }
  if (period !== 'allTime') {
    applied.push({
      id: 'period',
      name: ayqText('register.filter.period'),
      value: ayqText(PERIOD_LABEL[period]),
      remove: () => {
        setPeriod('allTime');
        change({ ...filter, from: undefined, to: undefined });
      },
    });
  }
  if (filter.minCents !== undefined || filter.maxCents !== undefined) {
    applied.push({
      id: 'amount',
      name: ayqText('register.column.amount'),
      value: `${filter.minCents === undefined ? '' : ayqAmount(filter.minCents)}–${
        filter.maxCents === undefined ? '' : ayqAmount(filter.maxCents)
      }`,
      remove: () =>
        change({ ...filter, minCents: undefined, maxCents: undefined }),
    });
  }

  const totals =
    ledger === null
      ? ''
      : ayqText(
          applied.length === 0 ? 'register.totals.all' : 'register.totals.filtered',
          {
            count: ayqCount(ledger.total),
            in: ayqMoney(ledger.incomeCents),
            out: ayqMoney(ledger.expenseCents),
            net: ayqMoney(ledger.netCents),
          },
        );

  return (
    <>
      <div className={styles.filters} data-ayq-filter-bar="">
        <Input
          className={styles.search}
          data-ayq-search=""
          placeholder={ayqText('register.search')}
          value={filter.search ?? ''}
          onChange={(_event, data) =>
            change({ ...filter, search: data.value === '' ? undefined : data.value })
          }
        />
        <Select
          data-ayq-filter-period=""
          aria-label={ayqText('register.filter.period')}
          value={period}
          onChange={(_event, data) => {
            const next = data.value as AyqPeriod;
            setPeriod(next);
            const today = new Date().toISOString().slice(0, 10);
            change({ ...filter, ...ayqPeriodBounds(next, today), to: undefined });
          }}
        >
          {PERIODS.map(one => (
            <option key={one} value={one}>
              {ayqText(PERIOD_LABEL[one])}
            </option>
          ))}
        </Select>
        <Select
          data-ayq-filter-account=""
          aria-label={ayqText('register.filter.account')}
          value={filter.accountId ?? ''}
          onChange={(_event, data) =>
            change({
              ...filter,
              accountId: data.value === '' ? undefined : data.value,
            })
          }
        >
          <option value="">{ayqText('register.all.accounts')}</option>
          {accounts.map(one => (
            <option key={one.id} value={one.id}>
              {one.name}
            </option>
          ))}
        </Select>
        <Select
          data-ayq-filter-category=""
          aria-label={ayqText('register.filter.category')}
          value={filter.categoryId ?? ''}
          onChange={(_event, data) =>
            change({
              ...filter,
              categoryId: data.value === '' ? undefined : data.value,
            })
          }
        >
          <option value="">{ayqText('register.all.categories')}</option>
          {categories.map(one => (
            <option key={one.id} value={one.id}>
              {one.name}
            </option>
          ))}
        </Select>
        <Input
          className={styles.amount}
          data-ayq-filter-amount-from=""
          placeholder={ayqText('register.filter.amountFrom')}
          defaultValue={
            filter.minCents === undefined ? '' : String(filter.minCents / 100)
          }
          onBlur={event =>
            change({ ...filter, minCents: cents(event.currentTarget.value) })
          }
        />
        <Input
          className={styles.amount}
          data-ayq-filter-amount-to=""
          placeholder={ayqText('register.filter.amountTo')}
          defaultValue={
            filter.maxCents === undefined ? '' : String(filter.maxCents / 100)
          }
          onBlur={event =>
            change({ ...filter, maxCents: cents(event.currentTarget.value) })
          }
        />
        <Checkbox
          data-ayq-filter-uncategorised=""
          label={ayqText('register.filter.uncategorised')}
          checked={filter.uncategorised === true}
          onChange={(_event, data) =>
            change({
              ...filter,
              uncategorised: data.checked === true ? true : undefined,
            })
          }
        />
      </div>

      <AyqFilterChips
        applied={applied}
        clearAll={() => {
          setPeriod('allTime');
          change({});
        }}
      />

      <AyqLedgerPane
        mark="register"
        filter={asked}
        onFailure={onFailure}
        onShowTheRule={onShowTheRule}
        onLoaded={loaded}
        empty={
          applied.length === 0
            ? ayqText('register.empty')
            : ayqText('register.emptyFiltered')
        }
        footer={
          ledger === null ? null : (
            <span className={styles.totals} data-ayq-totals="">
              {totals}
              {ledger.uncategorised === 0 ? null : (
                <>
                  {' '}
                  {ayqText('register.totals.uncategorised', {
                    count: ayqCount(ledger.uncategorised),
                  })}
                </>
              )}
              {ledger.shown >= ledger.total ? null : (
                <>
                  {' '}
                  <span className={styles.quiet}>
                    {ayqText('register.showing', {
                      shown: ayqCount(ledger.shown),
                      total: ayqCount(ledger.total),
                    })}
                  </span>{' '}
                  <AyqButton
                    size="small"
                    mark="show-more"
                    onClick={() => setLimit(ledger.shown + 500)}
                  >
                    {ayqText('register.showMore')}
                  </AyqButton>
                </>
              )}
            </span>
          )
        }
      />
    </>
  );
}
