// Settings → Rules: what AYQ will file by itself from now on (04 A7).
//
// A7 asks for four things and this screen is each of them: visible — every rule
// is listed, by the canonical counterparty it is keyed on (03 §4.1) and the
// category name it keeps (§4.2); verifiable — a rule naming a category this
// budget does not have files nothing, and says so, rather than looking like it
// works; correctable — the category is changed on the Categories tab, and the
// rules move with it; reversible — a rule can be taken away, and what it already
// filed stays where it is, because that was still a decision about those
// transactions.
//
// "Apply the rules now" exists because a rule written after an import has
// nothing to act on until somebody asks, and 03 §4.4 bounds what applying may
// touch: never a transaction filed by hand.

import { makeStyles } from '@fluentui/react-components';
import { useCallback, useEffect, useState, type ReactNode } from 'react';

import { ayqAsk } from '../ayq-bridge.ts';
import type { AyqCategory, AyqCategoryRule } from '../ayq-ipc-contract.ts';
import { ayqCount, ayqDate, ayqText } from '../ayq-strings.ts';
import { AYQ_METRIC } from '../ayq-tokens.ts';
import { AyqButton } from '../ayq-ui/ayq-button.tsx';
import { ayqBorder } from '../ayq-ui/ayq-css.ts';
import { AyqPane } from '../ayq-ui/ayq-pane.tsx';
import { AyqStateChip } from '../ayq-ui/ayq-state-chip.tsx';
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
  note: { margin: '0', color: 'var(--ayq-ink-quiet)' },
  said: { margin: '0', color: 'var(--ayq-ink)' },
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: `${AYQ_METRIC.space.medium}px`,
    padding: `13px ${AYQ_METRIC.space.screen}px`,
  },
  quiet: { color: 'var(--ayq-ink-faint)' },
  inline: { display: 'flex', gap: `${AYQ_METRIC.space.small}px`, alignItems: 'center' },
});

export function AyqSettingsRules({
  onFailure,
  onChanged,
}: {
  onFailure(message: string): void;
  onChanged(): void;
}): ReactNode {
  const styles = useStyles();
  const [rules, setRules] = useState<readonly AyqCategoryRule[] | null>(null);
  const [categories, setCategories] = useState<readonly AyqCategory[]>([]);
  const [said, setSaid] = useState<string | null>(null);
  const [round, setRound] = useState(0);

  useEffect(() => {
    let live = true;
    void (async () => {
      const ask = async <T,>(body: Parameters<typeof ayqAsk>[0]): Promise<T> => {
        const answer = await ayqAsk(body);
        if (!answer.ok) throw new Error(answer.message);
        return answer.result as T;
      };
      const [learned, filed] = await Promise.all([
        ask<AyqCategoryRule[]>({ kind: 'rules.list' }),
        ask<AyqCategory[]>({ kind: 'categories.list' }),
      ]);
      if (!live) return;
      setRules(learned);
      setCategories(filed);
    })().catch((error: unknown) => {
      if (live) onFailure(error instanceof Error ? error.message : String(error));
    });
    return () => {
      live = false;
    };
  }, [round, onFailure]);

  const again = useCallback(() => {
    setRound(one => one + 1);
    onChanged();
  }, [onChanged]);

  if (rules === null) {
    return <p className={styles.note}>{ayqText('common.loading')}</p>;
  }

  const has = (name: string): boolean =>
    categories.some(one => one.name.toLowerCase() === name.toLowerCase());

  const forget = (ruleId: string): void => {
    void (async () => {
      const answer = await ayqAsk({ kind: 'rules.remove', ruleId });
      if (!answer.ok) throw new Error(answer.message);
      setSaid(ayqText('rules.removed'));
      again();
    })().catch((error: unknown) => {
      onFailure(error instanceof Error ? error.message : String(error));
    });
  };

  const apply = (): void => {
    void (async () => {
      const answer = await ayqAsk({ kind: 'rules.apply' });
      if (!answer.ok) throw new Error(answer.message);
      if (answer.kind !== 'rules.apply') return;
      setSaid(
        ayqText('rules.applied', { count: ayqCount(answer.result.categorised) }),
      );
      again();
    })().catch((error: unknown) => {
      onFailure(error instanceof Error ? error.message : String(error));
    });
  };

  const columns: readonly AyqColumn<AyqCategoryRule>[] = [
    {
      id: 'counterparty',
      header: ayqText('rules.column.counterparty'),
      cell: row => (
        <span data-ayq-cell="counterparty" data-ayq-rule={row.id}>
          {row.counterpartyKey}
        </span>
      ),
    },
    {
      id: 'category',
      header: ayqText('rules.column.category'),
      cell: row => (
        <span className={styles.inline} data-ayq-cell="category">
          <span>{row.categoryName}</span>
          {has(row.categoryName) ? null : (
            <AyqStateChip
              state="overdue"
              label={ayqText('rules.missingCategory')}
            />
          )}
        </span>
      ),
    },
    {
      id: 'since',
      header: ayqText('rules.column.since'),
      cell: row => (
        <span data-ayq-cell="since" className={styles.quiet}>
          {ayqDate(row.createdAt.slice(0, 10))}
        </span>
      ),
    },
    {
      id: 'remove',
      header: ayqText('rules.column.remove'),
      cell: row => (
        <AyqButton
          size="small"
          mark={`rule-forget-${row.id}`}
          onClick={() => forget(row.id)}
        >
          {ayqText('rules.remove')}
        </AyqButton>
      ),
    },
  ];

  return (
    <>
      <div className={styles.bar} data-ayq-rules={String(rules.length)}>
        <AyqButton filled mark="rules-apply" onClick={apply}>
          {ayqText('rules.apply')}
        </AyqButton>
        <span className={styles.note}>{ayqText('rules.blurb')}</span>
      </div>

      <AyqPane
        mark="rules"
        title={ayqText('rules.title')}
        note={ayqCount(rules.length)}
      >
        <AyqTable
          mark="rules"
          columns={columns}
          rows={rules}
          keyOf={row => row.id}
          empty={ayqText('rules.empty')}
        />
        {said === null ? null : (
          <div className={styles.body}>
            <p className={styles.said} data-ayq-rules-said="">
              {said}
            </p>
          </div>
        )}
      </AyqPane>
    </>
  );
}
