// The bar over the Review backlog when counterparties have been gathered
// (04 A36, A29; 03 §4.1, §4.7).
//
// It says what the decision is about — how many counterparties, how many
// transactions between them, how much money — from the backlog rows
// themselves, which are the engine's own counts. Then the two decisions of
// A29, with their accepted meanings and nothing added: `File these` files the
// transactions of every gathered counterparty, by hand, and learns nothing;
// `File these and remember` also writes one rule per counterparty. The screen
// says the second writes rules, and how many, before it is pressed.
//
// One category for all of them. A person who gathered three coffee shops and a
// pharmacy is asking for a different decision; the bar does not guess which.

import { useState } from 'react';
import type { ReactNode } from 'react';

import { makeStyles, Select } from '@fluentui/react-components';

import { ayqAsk } from '../ayq-bridge.ts';
import type { AyqCategory, AyqUnfiled } from '../ayq-ipc-contract.ts';
import { ayqCount, ayqMoney, ayqText } from '../ayq-strings.ts';
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

export function AyqReviewBulkBar({
  gathered,
  categories,
  onClear,
  onDone,
  onFailure,
}: {
  /** The backlog rows that are ticked, exactly as the table shows them. */
  gathered: readonly AyqUnfiled[];
  categories: readonly AyqCategory[];
  onClear(): void;
  /** Something was filed; the caller reloads and says what happened. */
  onDone(outcome: string): void;
  onFailure(message: string): void;
}): ReactNode {
  const styles = useStyles();
  const [categoryId, setCategoryId] = useState('');

  const transactions = gathered.reduce((sum, row) => sum + row.transactions, 0);
  const cents = gathered.reduce((sum, row) => sum + row.cents, 0);

  /** Files every gathered counterparty, one decision each, and says which. */
  const file = (createRule: boolean): void => {
    if (categoryId === '') {
      onFailure(ayqText('review.needsCategory'));
      return;
    }
    void (async () => {
      let categorised = 0;
      let keptByHand = 0;
      // One request per counterparty, in order, so a failure part-way is a
      // failure at a named point and not a set half done in silence.
      for (const row of gathered) {
        const answer = await ayqAsk({
          kind: 'transaction.categoriseCounterparty',
          counterpartyKey: row.key,
          categoryId,
          createRule,
        });
        if (!answer.ok) throw new Error(answer.message);
        if (answer.kind !== 'transaction.categoriseCounterparty') return;
        categorised += answer.result.categorised;
        keptByHand += answer.result.keptByHand;
      }
      const counterparties = ayqCount(gathered.length);
      onDone(
        createRule
          ? ayqText('review.bulk.learned', {
              count: ayqCount(categorised),
              counterparties,
            })
          : keptByHand > 0
            ? ayqText('review.bulk.filed.kept', {
                count: ayqCount(categorised),
                counterparties,
                kept: ayqCount(keptByHand),
              })
            : ayqText('review.bulk.filed', {
                count: ayqCount(categorised),
                counterparties,
              }),
      );
    })().catch((error: unknown) => {
      onFailure(error instanceof Error ? error.message : String(error));
    });
  };

  return (
    <div
      className={styles.bar}
      role="region"
      aria-label={ayqText('review.select.count', {
        count: ayqCount(gathered.length),
      })}
      data-ayq-bulk=""
    >
      <div className={styles.line}>
        <span
          className={styles.count}
          data-ayq-bulk-count={String(gathered.length)}
        >
          {ayqText('review.select.count', { count: ayqCount(gathered.length) })}
        </span>
        <span className={styles.basis} data-ayq-bulk-basis="">
          {ayqText('review.select.basis', {
            transactions: ayqCount(transactions),
            out: ayqMoney(cents),
          })}
        </span>
        <span className={styles.grow} />
        <AyqButton size="small" mark="bulk-clear" onClick={onClear}>
          {ayqText('review.select.clear')}
        </AyqButton>
      </div>
      <div className={styles.line}>
        <Select
          data-ayq-bulk-category-choice=""
          aria-label={ayqText('review.do.category')}
          value={categoryId}
          onChange={(_event, data) => setCategoryId(data.value)}
        >
          <option value="">{ayqText('review.do.category')}</option>
          {categories
            .filter(one => !one.isIncome)
            .map(one => (
              <option key={one.id} value={one.id}>
                {one.name}
              </option>
            ))}
        </Select>
        <AyqButton mark="bulk-file" onClick={() => file(false)}>
          {ayqText('review.do.file')}
        </AyqButton>
        <AyqButton filled mark="bulk-learn" onClick={() => file(true)}>
          {ayqText('review.do.learn')}
        </AyqButton>
      </div>
      <p className={styles.note}>{ayqText('review.bulk.note')}</p>
    </div>
  );
}
