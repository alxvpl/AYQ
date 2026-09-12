// Plan (03 §7.8, §7.10; 04 A8): the monthly worksheet, not envelope budgeting.
//
// Categories down, one month across: what was planned, what happened, what is
// left of the plan, and what AYQ still expects before the month is out. A
// worksheet, because that is what a person doing this actually works in — not a
// row of cards, and not money that has to be assigned before it can be spent.
//
// Two things this screen must not imply. A plan does not carry: what is left of
// September is left in September and is gone in October (§7.8). And "still
// expected" is the *larger* of what is left of the plan and the records expected
// in the category, never their sum (§7.10) — the engine decides that and the
// screen states the rule in words, because a column of figures a person cannot
// reconstruct is a column they cannot trust.
//
// A month outside the range the budget can be planned in is readable and not
// editable, and the screen says which it is rather than letting somebody type
// into a cell that will refuse them.

import { Input, Select, makeStyles } from '@fluentui/react-components';
import {
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

import { ayqAsk } from '../ayq-bridge.ts';
import type { AyqPlanSheet, AyqPlanSheetRow } from '../ayq-ipc-contract.ts';
import { ayqMonthName, ayqText } from '../ayq-strings.ts';
import { AYQ_METRIC } from '../ayq-tokens.ts';
import { ayqBorder } from '../ayq-ui/ayq-css.ts';
import { AyqFigure } from '../ayq-ui/ayq-figure.tsx';
import { AyqPane } from '../ayq-ui/ayq-pane.tsx';
import { AyqTable, type AyqColumn } from '../ayq-ui/ayq-table.tsx';

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
  label: { color: 'var(--ayq-ink-quiet)', fontSize: 'var(--ayq-size-small)' },
  note: { margin: '0', color: 'var(--ayq-ink-quiet)' },
  said: { marginLeft: 'auto', color: 'var(--ayq-ink-quiet)' },
  cell: { width: '110px' },
  quiet: { color: 'var(--ayq-ink-faint)' },
  totals: {
    display: 'flex',
    gap: `${AYQ_METRIC.space.wide}px`,
    flexWrap: 'wrap',
  },
  foot: {
    display: 'flex',
    gap: `${AYQ_METRIC.space.wide}px`,
    padding: `10px ${AYQ_METRIC.space.screen}px`,
    color: 'var(--ayq-ink-quiet)',
  },
});

/** Cents from what somebody typed; nothing when it was not a number. */
function cents(typed: string): number | null {
  const value = Number(typed.replace(',', '.'));
  return typed.trim() === '' ? 0 : Number.isFinite(value) ? Math.round(value * 100) : null;
}

export function AyqPlanScreen({
  onFailure,
}: {
  onFailure(message: string): void;
}): ReactNode {
  const styles = useStyles();
  const [sheet, setSheet] = useState<AyqPlanSheet | null>(null);
  const [month, setMonth] = useState<string | undefined>(undefined);
  // What is being typed into one cell, so the figure in the table stays the
  // engine's until the edit is committed. A cell that shows what was typed is a
  // cell that disagrees with the budget for as long as somebody is looking.
  const [typing, setTyping] = useState<{ id: string; value: string } | null>(null);
  const [round, setRound] = useState(0);

  useEffect(() => {
    let live = true;
    void (async () => {
      const answer = await ayqAsk(
        month === undefined ? { kind: 'plan.month' } : { kind: 'plan.month', month },
      );
      if (!answer.ok) throw new Error(answer.message);
      if (answer.kind !== 'plan.month') return;
      if (live) setSheet(answer.result);
    })().catch((error: unknown) => {
      if (live) onFailure(error instanceof Error ? error.message : String(error));
    });
    return () => {
      live = false;
    };
  }, [month, round, onFailure]);

  const commit = useCallback(
    (row: AyqPlanSheetRow, typed: string) => {
      const value = cents(typed);
      setTyping(null);
      if (value === null || value === row.planCents) return;
      void (async () => {
        const answer = await ayqAsk({
          kind: 'budget.setPlan',
          month: sheet?.month ?? '',
          categoryId: row.categoryId,
          cents: value,
        });
        if (!answer.ok) throw new Error(answer.message);
        setRound(one => one + 1);
      })().catch((error: unknown) => {
        onFailure(error instanceof Error ? error.message : String(error));
      });
    },
    [sheet, onFailure],
  );

  if (sheet === null) {
    return <p className={styles.note}>{ayqText('common.loading')}</p>;
  }

  const columns: readonly AyqColumn<AyqPlanSheetRow>[] = [
    {
      id: 'category',
      header: ayqText('plan.column.category'),
      cell: row => (
        <span data-ayq-cell="category" data-ayq-category={row.categoryId}>
          {row.categoryName}
          <br />
          <span className={styles.quiet}>{row.groupName}</span>
        </span>
      ),
    },
    {
      id: 'plan',
      header: ayqText('plan.column.plan'),
      figures: true,
      cell: row => (
        <span data-ayq-cell="plan">
          {sheet.editable ? (
            <Input
              className={styles.cell}
              size="small"
              appearance="underline"
              aria-label={`${row.categoryName} ${ayqText('plan.column.plan')}`}
              data-ayq-plan-cell={row.categoryId}
              value={
                typing?.id === row.categoryId
                  ? typing.value
                  : row.planCents === 0
                    ? ''
                    : (row.planCents / 100).toFixed(2)
              }
              onChange={(_event, data) =>
                setTyping({ id: row.categoryId, value: data.value })
              }
              onBlur={() =>
                typing?.id === row.categoryId ? commit(row, typing.value) : undefined
              }
              onKeyDown={event => {
                if (event.key === 'Enter' && typing?.id === row.categoryId) {
                  commit(row, typing.value);
                }
              }}
            />
          ) : (
            <AyqFigure cents={row.planCents} />
          )}
        </span>
      ),
    },
    {
      id: 'actual',
      header: ayqText('plan.column.actual'),
      figures: true,
      cell: row => (
        <span data-ayq-cell="actual">
          <AyqFigure cents={row.actualCents} />
        </span>
      ),
    },
    {
      id: 'remaining',
      header: ayqText('plan.column.remaining'),
      figures: true,
      cell: row => (
        <span data-ayq-cell="remaining">
          <AyqFigure cents={row.remainingCents} />
        </span>
      ),
    },
    {
      id: 'expected',
      header: ayqText('plan.column.expected'),
      figures: true,
      cell: row => (
        <span data-ayq-cell="expected" data-ayq-expected={String(row.expectedCents)}>
          <AyqFigure cents={row.expectedCents} />
        </span>
      ),
    },
  ];

  return (
    <>
      <div className={styles.bar}>
        <span className={styles.label}>{ayqText('plan.month')}</span>
        <Select
          value={sheet.month}
          data-ayq-plan-month=""
          onChange={(_event, data) => {
            setTyping(null);
            setMonth(data.value);
          }}
        >
          {sheet.months.map(one => (
            <option key={one} value={one}>
              {ayqMonthName(one)}
            </option>
          ))}
        </Select>
        <span className={styles.said} data-ayq-plan-editable={String(sheet.editable)}>
          {sheet.editable ? '' : ayqText('plan.notEditable')}
        </span>
      </div>

      <AyqPane mark="plan-sheet" title={ayqMonthName(sheet.month)}>
        <AyqTable
          mark="plan"
          columns={columns}
          rows={sheet.rows}
          keyOf={row => row.categoryId}
          empty={ayqText('plan.empty')}
          footer={
            <span className={styles.totals} data-ayq-plan-totals="">
              <span>{ayqText('plan.total')}</span>
              <span data-ayq-total="plan">
                {ayqText('plan.column.plan')}{' '}
                <AyqFigure cents={sheet.totalPlanCents} withSymbol />
              </span>
              <span data-ayq-total="actual">
                {ayqText('plan.column.actual')}{' '}
                <AyqFigure cents={sheet.totalActualCents} withSymbol />
              </span>
              <span data-ayq-total="remaining">
                {ayqText('plan.column.remaining')}{' '}
                <AyqFigure cents={sheet.totalRemainingCents} withSymbol />
              </span>
              <span data-ayq-total="expected">
                {ayqText('plan.column.expected')}{' '}
                <AyqFigure cents={sheet.totalExpectedCents} withSymbol />
              </span>
            </span>
          }
        />
        <p className={`${styles.note} ${styles.foot}`} data-ayq-plan-rule="">
          {ayqText('plan.expectedNote')}
        </p>
      </AyqPane>
    </>
  );
}
