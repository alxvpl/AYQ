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

import { Input, Select, makeStyles, mergeClasses } from '@fluentui/react-components';
import {
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

import { ayqAsk } from '../ayq-bridge.ts';
import type { AyqPlanSheet, AyqPlanSheetRow } from '../ayq-ipc-contract.ts';
import { ayqCount, ayqMoney, ayqMonthName, ayqText } from '../ayq-strings.ts';
import { AYQ_METRIC } from '../ayq-tokens.ts';
import { AyqButton } from '../ayq-ui/ayq-button.tsx';
import { ayqBorder } from '../ayq-ui/ayq-css.ts';
import { AyqFigure } from '../ayq-ui/ayq-figure.tsx';
import { useAyqFieldStyles } from '../ayq-ui/ayq-field.ts';
import { AyqPane } from '../ayq-ui/ayq-pane.tsx';
import { AyqStateChip } from '../ayq-ui/ayq-state-chip.tsx';
import { AyqScreenActions } from '../ayq-ui/ayq-screen.tsx';
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
  cell: { width: '88px', minWidth: '88px' },
  cellInput: { textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
  currency: { color: 'var(--ayq-ink-faint)', marginRight: '6px', fontSize: 'var(--ayq-size-small)' },
  name: { fontWeight: 600 },
  quiet: { color: 'var(--ayq-ink-faint)', fontSize: 'var(--ayq-size-small)' },
  suggestion: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: `${AYQ_METRIC.space.medium}px`,
    flexWrap: 'wrap',
  },
  rowButton: {
    height: '24px',
    minHeight: '24px',
    padding: `0 ${AYQ_METRIC.space.medium}px`,
    backgroundColor: 'transparent',
    color: 'var(--ayq-ink-quiet)',
    fontWeight: 400,
    ...ayqBorder('transparent'),
    ':hover': {
      backgroundColor: 'var(--ayq-row-hover)',
      color: 'var(--ayq-ink)',
      ...ayqBorder('var(--ayq-control-edge)'),
    },
  },
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
  const fields = useAyqFieldStyles();
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

  const use = useCallback(
    (scope: { categoryId: string } | { all: true }) => {
      void (async () => {
        const answer = await ayqAsk(
          'all' in scope
            ? { kind: 'plan.useAllSuggestions', month: sheet?.month ?? '' }
            : {
                kind: 'plan.useSuggestion',
                month: sheet?.month ?? '',
                categoryId: scope.categoryId,
              },
        );
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

  const suggestions = new Map(
    sheet.suggestions.map(one => [one.categoryId, one] as const),
  );
  // What a bulk acceptance would actually do: fill the empty rows, and only
  // those. If there are none, the control is not offered.
  const usable = sheet.rows.filter(
    row =>
      row.planCents === 0 &&
      (suggestions.get(row.categoryId)?.suggestedCents ?? 0) > 0,
  ).length;
  const basis = sheet.suggestions.find(one => one.monthsUsed > 0) ?? null;

  const columns: readonly AyqColumn<AyqPlanSheetRow>[] = [
    {
      id: 'category',
      header: ayqText('plan.column.category'),
      cell: row => (
        <span data-ayq-cell="category" data-ayq-category={row.categoryId}>
          <span className={styles.name} data-ayq-category-name="">
            {row.categoryName}
          </span>{' '}
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
            <>
            <span className={styles.currency}>{ayqText('plan.currency')}</span>
            <Input
              className={mergeClasses(fields.field, styles.cell)}
              size="small"
              input={{ className: styles.cellInput }}
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
            </>
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
    {
      // 10 §10.3: visibly distinct from the four columns above, because it is a
      // different kind of thing. Planned, Actual, Left and Still expected are
      // facts about this month; this is what history suggests, and it becomes a
      // plan only when somebody says so.
      id: 'suggested',
      header: ayqText('plan.column.suggested'),
      cell: row => {
        const suggestion = suggestions.get(row.categoryId);
        if (suggestion === undefined || suggestion.suggestedCents === null) {
          return (
            <span className={styles.quiet} data-ayq-suggestion="none">
              {ayqText('plan.suggestion.none')}
            </span>
          );
        }
        return (
          <span
            className={styles.suggestion}
            data-ayq-suggestion={String(suggestion.suggestedCents)}
            data-ayq-suggestion-months={String(suggestion.monthsUsed)}
          >
            {/* A suggestion that differs from the plan is a chip; one that
                agrees is a plain figure (template r003). The basis is said
                once, in the column's heading. */}
            {suggestion.suggestedCents === row.planCents ? (
              <span className={styles.quiet}>
                <AyqFigure cents={suggestion.suggestedCents} />
              </span>
            ) : (
              <AyqStateChip
                state="suggested"
                label={ayqMoney(suggestion.suggestedCents)}
              />
            )}
            <span className={styles.quiet} data-ayq-suggestion-basis={String(suggestion.monthsUsed)}>
              {ayqText('plan.suggestion.basis', {
                months: ayqCount(suggestion.monthsUsed),
              })}
            </span>
            {sheet.editable ? (
              <AyqButton
                className={styles.rowButton}
                mark={`plan-use-${row.categoryId}`}
                onClick={() => use({ categoryId: row.categoryId })}
              >
                {ayqText('plan.suggestion.use')}
              </AyqButton>
            ) : null}
          </span>
        );
      },
    },
  ];

  return (
    <>
      {/* The month and the one action at the right of the screen's name
          (template r003's toolbar). */}
      <AyqScreenActions>
        <Select
          className={fields.field}
          aria-label={ayqText('plan.month')}
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
        {/* Fills only the rows that carry no plan. Never a figure somebody
            typed (10 §10.3). */}
        {sheet.editable && usable > 0 ? (
          <AyqButton mark="plan-use-all" onClick={() => use({ all: true })}>
            {ayqText('plan.suggestion.useAll')}
          </AyqButton>
        ) : null}
        <span className={styles.said} data-ayq-plan-editable={String(sheet.editable)}>
          {sheet.editable ? '' : ayqText('plan.notEditable')}
        </span>
      </AyqScreenActions>

      <AyqPane mark="plan-sheet">
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
        <p className={`${styles.note} ${styles.foot}`} data-ayq-plan-basis="">
          {basis === null
            ? ayqText('plan.suggestion.noBasis')
            : ayqText('plan.suggestion.wholeBasis', {
                months: ayqCount(basis.monthsUsed),
                from: ayqMonthName(basis.fromMonth ?? ''),
                to: ayqMonthName(basis.toMonth ?? ''),
              })}
        </p>
      </AyqPane>
    </>
  );
}
