import type { JSX } from 'react';
import { ACCENT } from './tokens.js';
import { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';
import { formatDate, formatList } from '../format.js';
import { CATEGORY_AXIS_LABEL, canvasFitsRaster, categoryLabelGutter, chartGeometry } from '../geometry.js';
import { formatCount, formatMoney, formatSignedMoney } from '../money.js';
import { nextSortState, sortRows, type SortColumn, type SortState } from '../sort.js';
import { useLocale, useText } from './text.js';
import { accountsOfLimit, namesOf } from './coverage.js';
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

/** The chart's height follows its rows (a provisional build value, r004 §12). */
function chartHeight(rows: number): number {
  return Math.max(140, rows * 44 + 48);
}

/** A name's full width in the category label's own font, as the canvas will draw it. */
function measureCategoryLabel(): (text: string) => number {
  const context = document.createElement('canvas').getContext('2d');
  if (context === null) return () => CATEGORY_AXIS_LABEL.width;
  context.font = `${CATEGORY_AXIS_LABEL.fontSize}px "${CATEGORY_AXIS_LABEL.fontFamily}"`;
  return text => context.measureText(text).width;
}

function Chart({ rows, locale }: { rows: readonly CounterpartyRow[]; locale: string }): JSX.Element {
  const t = useText();
  const frame = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const height = chartHeight(rows.length);
  // The guard of r004 §8.2: before anything is drawn, the canvas the chart
  // would allocate — the frame's width by the rows' height, at the device
  // pixel ratio — is checked against what the platform will rasterise. A
  // result the chart cannot show is stated, never left blank. Re-checked on
  // resize, because the width and the pixel ratio can change with the window
  // and the display it is on.
  const [tooLarge, setTooLarge] = useState(false);
  useEffect(() => {
    const decide = (): void => {
      const width = frame.current?.clientWidth ?? 0;
      setTooLarge(!canvasFitsRaster(width, height, window.devicePixelRatio));
    };
    decide();
    window.addEventListener('resize', decide);
    return () => window.removeEventListener('resize', decide);
  }, [height]);

  useEffect(() => {
    if (tooLarge || host.current === null) return undefined;
    const chart = echarts.init(host.current);
    // The chart follows the table's order and the table's values. Bar length is
    // geometry, so a bounded display-only Number is derived for it; every
    // printed figure is the exact bigint row value.
    const ordered = [...rows].reverse();
    const lengths = chartGeometry(ordered.map(row => row.moneyOutMinor));
    chart.setOption({
      // The labels' gutter is measured over every row in the label's own font
      // (geometry.ts), so no label starts beyond the canvas's left edge.
      grid: { left: 8 + categoryLabelGutter(ordered.map(row => row.displayName), measureCategoryLabel()), right: 24, top: 8, bottom: 24 },
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
      yAxis: { type: 'category', data: ordered.map(row => row.displayName), axisLabel: CATEGORY_AXIS_LABEL },
      series: [
        {
          type: 'bar',
          data: lengths,
          // The bars take the accent's fill from the tokens; nothing else about the
          // chart is decided here (A2 K-10: tokens propagate, chart language does not).
          itemStyle: { color: ACCENT.fill },
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
  }, [rows, locale, tooLarge]);

  return (
    <div className="chart-frame" ref={frame}>
      {tooLarge ? (
        <p className="chart-too-large">{t('chart.tooLarge')}</p>
      ) : (
        <div className="chart" ref={host} style={{ height: `${height}px` }} />
      )}
    </div>
  );
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
              {account.coverageStartDate === null
                ? // The flyout's unknown-start form, rather than an interval
                  // with a missing end (010 §3).
                  t('coverage.flyout.account.unknownStart', {
                    account: account.name,
                    lastStatementDate: formatDate(account.lastStatementDate, locale),
                  })
                : t('explore.insufficient.detail', {
                    account: account.name,
                    openingDate: formatDate(account.coverageStartDate, locale),
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

  const unknownStart = result.coverage.unknownStartAccountKeys;

  if (result.state === 'empty') {
    return (
      <section className="result">
        <p className="state-line">
          {unknownStart.length > 0
            ? // Replaces the ordinary sentence, never appears beside it
              // (010 §3): it states what was found and refuses the claim
              // the ordinary sentence would make.
              t('explore.empty.unknownStart', { accounts: namesOf(result, unknownStart, locale), n: unknownStart.length })
            : t('explore.empty')}
        </p>
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
      {unknownStart.length > 0 && (
        <p className="coverage-sentence">
          {/* The verb agrees with the number of accounts named, though none is printed (r002 §10.3). */}
          {t('explore.coverage.unknownStart', { accounts: namesOf(result, unknownStart, locale), n: unknownStart.length })}
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
                  : comparison.unavailable === 'unknownStart'
                    ? t('explore.comparison.reason.unknownStart', {
                        accounts: namesOf(result, comparison.coverage.unknownStartAccountKeys, locale),
                        n: comparison.coverage.unknownStartAccountKeys.length,
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
