import type { JSX } from 'react';
import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import { formatDate, formatList } from '../format.js';
import { chartGeometry } from '../geometry.js';
import { formatCount, formatMoney, formatSignedMoney } from '../money.js';
import { nextSortState, sortRows, type SortColumn, type SortState } from '../sort.js';
import { useLocale, useText } from './text.js';
import { accountsOfLimit } from './coverage.js';
import { EXCLUSION_COUNT_ONLY_KEYS, EXCLUSION_KEYS, type DetailSelection } from './detail.js';
import type { StringKey } from '../strings.js';
import type { AnalysisResult, CounterpartyRow } from '../types.js';

interface ResultViewProps {
  result: AnalysisResult;
  accountsLabel: string;
  sort: SortState;
  selection: DetailSelection | null;
  onSort(sort: SortState): void;
  onSelect(selection: DetailSelection | null): void;
}

function Chart({ rows, locale }: { rows: readonly CounterpartyRow[]; locale: string }): JSX.Element {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (host.current === null) return undefined;
    const chart = echarts.init(host.current);
    // The chart follows the table's order and the table's values. Bar length is
    // geometry, so a bounded display-only Number is derived for it; every
    // printed figure is the exact bigint row value.
    const ordered = [...rows].reverse();
    const lengths = chartGeometry(ordered.map(row => row.moneyOutMinor));
    chart.setOption({
      grid: { left: 8, right: 24, top: 8, bottom: 24, containLabel: true },
      // The tooltip prints the exact row figure and nothing else: a sentence
      // composed around it would be interface text outside the catalogue.
      tooltip: {
        trigger: 'item',
        formatter: (params: { dataIndex: number }) =>
          formatMoney(ordered[params.dataIndex].moneyOutMinor, ordered[params.dataIndex].currency, locale),
      },
      // Axis ticks are geometry the chart chooses, not values the result
      // holds, so they are not printed as figures. Every figure the chart
      // prints — bar label and tooltip — is an exact row value. The axis ends
      // a quarter beyond the longest bar so that bar's label has room and is
      // never clipped at the edge of the chart.
      xAxis: {
        type: 'value',
        axisLabel: { show: false },
        max: (extent: { max: number }) => (extent.max > 0 ? extent.max * 1.25 : 0),
      },
      yAxis: { type: 'category', data: ordered.map(row => row.displayName) },
      series: [
        {
          type: 'bar',
          data: lengths,
          itemStyle: { color: '#22D3A6' },
          label: {
            show: true,
            position: 'right',
            formatter: (params: { dataIndex: number }) =>
              formatMoney(ordered[params.dataIndex].moneyOutMinor, ordered[params.dataIndex].currency, locale),
          },
        },
      ],
    });
    const resize = (): void => chart.resize();
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('resize', resize);
      chart.dispose();
    };
  }, [rows, locale]);

  return <div className="chart" ref={host} style={{ height: `${Math.max(140, rows.length * 44 + 48)}px` }} />;
}

const COLUMN_KEYS: Record<SortColumn, StringKey> = {
  counterparty: 'table.counterparty',
  transactions: 'table.transactions',
  moneyOut: 'table.moneyOut',
  previous: 'table.previous',
  change: 'table.change',
};

export function ResultView({
  result,
  accountsLabel,
  sort,
  selection,
  onSort,
  onSelect,
}: ResultViewProps): JSX.Element {
  const t = useText();
  const locale = useLocale();

  if (result.state === 'insufficient') {
    return (
      <section className="result">
        <p className="state-line">{t('explore.insufficient')}</p>
        <ul className="state-detail">
          {result.coverage.accounts.map(account => (
            <li key={account.accountKey}>
              {t('explore.insufficient.detail', {
                account: account.name,
                openingDate: formatDate(account.openingDate, locale),
                lastStatementDate: formatDate(account.lastStatementDate, locale),
              })}
            </li>
          ))}
        </ul>
      </section>
    );
  }

  const exclusionLine = (
    <ul className="exclusion-line">
      {result.exclusions.map(group => {
        const label =
          group.amountMinor === null || group.currency === null
            ? t(EXCLUSION_COUNT_ONLY_KEYS[group.exclusion], { n: group.transactionCount })
            : t(EXCLUSION_KEYS[group.exclusion], {
                n: group.transactionCount,
                amount: formatMoney(group.amountMinor, group.currency, locale),
              });
        return (
          <li key={group.exclusion}>
            <button
              type="button"
              className="exclusion-item"
              aria-pressed={selection?.kind === 'exclusion' && selection.exclusion === group.exclusion}
              onClick={() => onSelect({ kind: 'exclusion', exclusion: group.exclusion })}
            >
              {label}
            </button>
          </li>
        );
      })}
    </ul>
  );

  if (result.state === 'unsupported') {
    return (
      <section className="result">
        <p className="state-line">
          {t('explore.unsupported', { currencies: formatList(result.currencies, locale) })}
        </p>
        {exclusionLine}
      </section>
    );
  }

  if (result.state === 'empty') {
    return (
      <section className="result">
        <p className="state-line">{t('explore.empty')}</p>
      </section>
    );
  }

  const currency = result.currency!;
  const rows = sortRows(result.rows, sort);
  const comparison = result.comparison;
  const hasComparisonValue = comparison !== null && comparison.totalMinor !== null;

  const columns: SortColumn[] = hasComparisonValue
    ? ['counterparty', 'transactions', 'moneyOut', 'previous', 'change']
    : ['counterparty', 'transactions', 'moneyOut'];

  return (
    <section className="result">
      <p className="headline figure">{formatMoney(result.totalMinor!, currency, locale)}</p>
      <p className="scope secondary">
        {t('explore.result.scope', {
          from: formatDate(result.coverage.fromDate, locale),
          to: formatDate(result.coverage.toDate, locale),
          accounts: accountsLabel,
        })}
      </p>

      {result.coverage.endLimit !== null && (
        <p className="coverage-sentence">
          {t('explore.coverage.endLimit', {
            accounts: accountsOfLimit(result, result.coverage.endLimit, locale),
            date: formatDate(result.coverage.endLimit.date, locale),
          })}
        </p>
      )}
      {result.coverage.startLimit !== null && (
        <p className="coverage-sentence">
          {t('explore.coverage.startLimit', {
            accounts: accountsOfLimit(result, result.coverage.startLimit, locale),
            date: formatDate(result.coverage.startLimit.date, locale),
          })}
        </p>
      )}

      {hasComparisonValue && (
        <p className="comparison">
          <span>{t('explore.comparison.previous', { amount: formatMoney(comparison!.totalMinor!, currency, locale) })}</span>
          <span>{t('explore.comparison.change', { amount: formatSignedMoney(result.deltaMinor!, currency, locale) })}</span>
        </p>
      )}
      {comparison !== null && comparison.unavailable !== null && (
        <p className="comparison unavailable">
          {t('explore.comparison.unavailable', {
            reason:
              comparison.unavailable === 'currency'
                ? t('explore.comparison.reason.currency', {
                    currency: formatList(comparison.currencies, locale),
                  })
                : comparison.unavailable === 'noData'
                  ? t('explore.comparison.reason.noData', {
                      from: formatDate(comparison.fromDate, locale),
                      to: formatDate(comparison.toDate, locale),
                    })
                  : t('explore.comparison.reason.coverage', {
                      accounts: formatList(
                        (comparison.coverage.startLimit?.accountKeys ?? [])
                          .concat(comparison.coverage.endLimit?.accountKeys ?? [])
                          .filter((key, index, all) => all.indexOf(key) === index)
                          .map(key => comparison.coverage.accounts.find(x => x.accountKey === key)?.name ?? key),
                        locale,
                      ),
                      from: formatDate(comparison.fromDate, locale),
                      to: formatDate(comparison.toDate, locale),
                    }),
          })}
        </p>
      )}

      {exclusionLine}

      <Chart rows={rows} locale={locale} />

      <table className="rows">
        <thead>
          <tr>
            {columns.map(column => (
              <th
                key={column}
                scope="col"
                aria-sort={sort.column === column ? sort.direction : 'none'}
                className={column === 'counterparty' ? 'text' : 'numeric'}
              >
                <button type="button" onClick={() => onSort(nextSortState(sort, column))}>
                  {t(COLUMN_KEYS[column])}
                  {sort.column === column && (
                    <span aria-hidden="true" className="sort-direction">
                      {sort.direction === 'ascending' ? '↑' : '↓'}
                    </span>
                  )}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr
              key={row.counterpartyKey}
              className={
                selection?.kind === 'counterparty' && selection.counterpartyKey === row.counterpartyKey
                  ? 'selected'
                  : undefined
              }
              onClick={() => onSelect({ kind: 'counterparty', counterpartyKey: row.counterpartyKey })}
            >
              <td className="text">{row.displayName}</td>
              <td className="numeric figure">{formatCount(row.transactionCount, locale)}</td>
              <td className="numeric figure">{formatMoney(row.moneyOutMinor, row.currency, locale)}</td>
              {hasComparisonValue && (
                <td className="numeric figure">{formatMoney(row.previousMinor ?? 0n, row.currency, locale)}</td>
              )}
              {hasComparisonValue && (
                <td className="numeric figure">{formatSignedMoney(row.changeMinor ?? 0n, row.currency, locale)}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
