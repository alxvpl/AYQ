// The bar over the Register when rows have been gathered (04 A36; 03 §4.7–§4.9).
//
// Its first job is to say, in words, what a decision made here would touch —
// before the decision, not after. The count is one of two things and the bar
// says which: the rows a person ticked, or every transaction the current
// filter holds, which is more than the page on the screen. Switching between
// the two is one button, and the screen never offers the second where 03 §4.8
// would refuse it.
//
// Its second job is to make the decision the smallest thing it can be. Setting
// a category over a set files those rows by hand and learns nothing; a rule is
// a different statement and there is no control here that makes one. Rows
// already filed by hand are named before the decision and kept unless the
// person says otherwise (§4.9). Recording a counterparty reaches every
// transaction under the bank names it is about, and the bar states how far that
// is, from the engine's own count, before the button is pressed.

import { useEffect, useState, type ReactNode } from 'react';

import { Checkbox, Select, makeStyles } from '@fluentui/react-components';

import { ayqAsk } from '../ayq-bridge.ts';
import type {
  AyqBulkScope,
  AyqBulkScopeReport,
  AyqCategory,
  AyqCounterparty,
} from '../ayq-ipc-contract.ts';
import { ayqCount, ayqText } from '../ayq-strings.ts';
import { AYQ_METRIC, AYQ_TYPE } from '../ayq-tokens.ts';
import { AyqButton } from '../ayq-ui/ayq-button.tsx';
import { ayqBorder } from '../ayq-ui/ayq-css.ts';

const useStyles = makeStyles({
  // Template r003's bulk bar: the selection surface on the strong line, 6×10.
  bar: {
    display: 'flex',
    flexDirection: 'column',
    gap: `${AYQ_METRIC.space.small}px`,
    minHeight: '40px',
    justifyContent: 'center',
    padding: `${AYQ_METRIC.space.small}px ${AYQ_METRIC.space.ten}px`,
    backgroundColor: 'var(--ayq-row-selected)',
    ...ayqBorder('var(--ayq-line-strong)'),
    borderRadius: 'var(--ayq-radius-medium)',
  },
  line: {
    display: 'flex',
    alignItems: 'center',
    gap: `${AYQ_METRIC.space.ten}px`,
    flexWrap: 'wrap',
  },
  count: { fontWeight: AYQ_TYPE.weight.semibold, color: 'var(--ayq-ink)', fontSize: 'var(--ayq-size-small)' },
  basis: { color: 'var(--ayq-ink-quiet)', fontSize: 'var(--ayq-size-small)' },
  note: {
    margin: '0',
    color: 'var(--ayq-ink-quiet)',
    fontSize: 'var(--ayq-size-small)',
  },
  grow: { flexGrow: 1 },
});

export type AyqBulkMode = 'category' | 'counterparty';

export function AyqRegisterBulkBar({
  scope,
  count,
  shown,
  total,
  wholeFilter,
  canWholeFilter,
  categories,
  onWholeFilter,
  onClear,
  onDone,
  onFailure,
}: {
  /** What a decision would be about, exactly as the engine will be asked. */
  scope: AyqBulkScope;
  /** The size of that scope, as the screen states it. */
  count: number;
  shown: number;
  total: number;
  wholeFilter: boolean;
  /** Whether the whole filter is a scope 03 §4.8 admits, and wider than the page. */
  canWholeFilter: boolean;
  categories: readonly AyqCategory[];
  onWholeFilter(on: boolean): void;
  onClear(): void;
  /** Something changed; the caller reloads and says what happened. */
  onDone(outcome: string): void;
  onFailure(message: string): void;
}): ReactNode {
  const styles = useStyles();
  const [mode, setMode] = useState<AyqBulkMode | null>(null);
  const [report, setReport] = useState<AyqBulkScopeReport | null>(null);
  const [categoryId, setCategoryId] = useState('');
  const [includeByHand, setIncludeByHand] = useState(false);
  const [counterparties, setCounterparties] = useState<
    readonly AyqCounterparty[] | null
  >(null);
  const [counterpartyKey, setCounterpartyKey] = useState('');

  // What the decision would reach, asked of the engine for this exact scope
  // and asked again whenever the scope moves. Nothing is stated from memory.
  useEffect(() => {
    if (mode === null) return;
    let live = true;
    setReport(null);
    void (async () => {
      const answer = await ayqAsk({ kind: 'transactions.scope', scope });
      if (!answer.ok) throw new Error(answer.message);
      if (live) setReport(answer.result as AyqBulkScopeReport);
    })().catch((error: unknown) => {
      if (live)
        onFailure(error instanceof Error ? error.message : String(error));
    });
    return () => {
      live = false;
    };
  }, [mode, scope, onFailure]);

  useEffect(() => {
    if (mode !== 'counterparty' || counterparties !== null) return;
    let live = true;
    void (async () => {
      const listed = await ayqAsk({ kind: 'counterparties.list' });
      if (!listed.ok) throw new Error(listed.message);
      if (live)
        setCounterparties((listed.result as { rows: AyqCounterparty[] }).rows);
    })().catch((error: unknown) => {
      if (live)
        onFailure(error instanceof Error ? error.message : String(error));
    });
    return () => {
      live = false;
    };
  }, [mode, counterparties, onFailure]);

  const file = (): void => {
    void (async () => {
      const answer = await ayqAsk({
        kind: 'transactions.categoriseMany',
        scope,
        categoryId: categoryId === '' ? null : categoryId,
        includeByHand,
      });
      if (!answer.ok) throw new Error(answer.message);
      if (answer.kind !== 'transactions.categoriseMany') return;
      const { categorised, keptByHand } = answer.result;
      onDone(
        keptByHand > 0
          ? ayqText('register.bulk.filed.kept', {
              count: ayqCount(categorised),
              kept: ayqCount(keptByHand),
            })
          : ayqText('register.bulk.filed', { count: ayqCount(categorised) }),
      );
    })().catch((error: unknown) => {
      onFailure(error instanceof Error ? error.message : String(error));
    });
  };

  const record = (): void => {
    if (counterpartyKey === '') return;
    void (async () => {
      const answer = await ayqAsk({
        kind: 'transactions.correctCounterparty',
        scope,
        counterpartyKey,
      });
      if (!answer.ok) throw new Error(answer.message);
      if (answer.kind !== 'transactions.correctCounterparty') return;
      const { variants, moved, counterpartyName } = answer.result;
      onDone(
        variants === 0
          ? ayqText('register.bulk.moved.none', { name: counterpartyName })
          : ayqText('register.bulk.moved', {
              names: ayqCount(variants),
              moved: ayqCount(moved),
              name: counterpartyName,
            }),
      );
    })().catch((error: unknown) => {
      onFailure(error instanceof Error ? error.message : String(error));
    });
  };

  const names = report?.variants.length ?? 0;
  const reach = report?.variantTransactions ?? 0;

  return (
    <div
      className={styles.bar}
      role="region"
      aria-label={ayqText('register.select.count', { count: ayqCount(count) })}
      data-ayq-bulk=""
    >
      <div className={styles.line}>
        <span className={styles.count} data-ayq-bulk-count={String(count)}>
          {wholeFilter
            ? ayqText('register.select.whole', { total: ayqCount(total) })
            : ayqText('register.select.count', { count: ayqCount(count) })}
        </span>
        <span
          className={styles.basis}
          data-ayq-bulk-basis={wholeFilter ? 'filter' : 'shown'}
        >
          {wholeFilter
            ? ayqText('register.select.whole.basis')
            : total > shown
              ? ayqText('register.select.basis', {
                  shown: ayqCount(shown),
                  total: ayqCount(total),
                })
              : ayqText('register.select.basis.all', {
                  shown: ayqCount(shown),
                })}
        </span>
        <span className={styles.grow} />
        {!canWholeFilter ? null : (
          <AyqButton
            size="small"
            mark="bulk-scope"
            onClick={() => onWholeFilter(!wholeFilter)}
          >
            {wholeFilter
              ? ayqText('register.select.shownOnly', { shown: ayqCount(shown) })
              : ayqText('register.select.wholeFilter', {
                  total: ayqCount(total),
                })}
          </AyqButton>
        )}
        <AyqButton
          size="small"
          mark="bulk-category"
          onClick={() => setMode(mode === 'category' ? null : 'category')}
        >
          {ayqText('register.bulk.category')}
        </AyqButton>
        <AyqButton
          size="small"
          mark="bulk-counterparty"
          onClick={() =>
            setMode(mode === 'counterparty' ? null : 'counterparty')
          }
        >
          {ayqText('register.bulk.counterparty')}
        </AyqButton>
        <AyqButton size="small" mark="bulk-clear" onClick={onClear}>
          {ayqText('register.select.clear')}
        </AyqButton>
      </div>

      {mode !== 'category' ? null : (
        <div className={styles.line} data-ayq-bulk-mode="category">
          <Select
            data-ayq-bulk-category-choice=""
            aria-label={ayqText('register.bulk.category')}
            value={categoryId}
            onChange={(_event, data) => setCategoryId(data.value)}
          >
            <option value="">{ayqText('register.bulk.category.clear')}</option>
            {categories.map(category => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
          {report === null || report.byHand === 0 ? null : (
            <Checkbox
              data-ayq-bulk-include-by-hand=""
              label={ayqText('register.bulk.byHand.include', {
                count: ayqCount(report.byHand),
              })}
              checked={includeByHand}
              onChange={(_event, data) =>
                setIncludeByHand(data.checked === true)
              }
            />
          )}
          <AyqButton
            filled
            size="small"
            mark="bulk-category-apply"
            disabled={report === null}
            onClick={file}
          >
            {ayqText('register.bulk.category.apply', {
              count: ayqCount(count),
            })}
          </AyqButton>
          {report === null || report.byHand === 0 ? null : (
            <p
              className={styles.note}
              data-ayq-bulk-by-hand={String(report.byHand)}
            >
              {ayqText('register.bulk.byHand', {
                count: ayqCount(report.byHand),
              })}
            </p>
          )}
        </div>
      )}

      {mode !== 'counterparty' ? null : (
        <div className={styles.line} data-ayq-bulk-mode="counterparty">
          <Select
            data-ayq-bulk-counterparty-choice=""
            aria-label={ayqText('register.bulk.counterparty')}
            value={counterpartyKey}
            onChange={(_event, data) => setCounterpartyKey(data.value)}
          >
            <option value="">
              {ayqText('register.bulk.counterparty.choose')}
            </option>
            {(counterparties ?? []).map(one => (
              <option key={one.key} value={one.key}>
                {one.name}
              </option>
            ))}
          </Select>
          <AyqButton
            filled
            size="small"
            mark="bulk-counterparty-apply"
            disabled={report === null || names === 0 || counterpartyKey === ''}
            onClick={record}
          >
            {ayqText('register.bulk.counterparty.apply', {
              names: ayqCount(names),
            })}
          </AyqButton>
          {report === null ? null : (
            <p className={styles.note} data-ayq-bulk-reach={String(reach)}>
              {names === 0
                ? ayqText('register.bulk.counterparty.none')
                : ayqText('register.bulk.counterparty.reach', {
                    names: ayqCount(names),
                    reach: ayqCount(reach),
                    beyond: ayqCount(Math.max(0, reach - report.transactions)),
                  })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
