// One learned rule, where it is seen (04 A7, A28; 03 §4.4).
//
// The Register detail and Settings → Rules both show a rule with this. It
// names the rule, states what the rule has done — counted by the engine at the
// moment of asking, never remembered — and offers the two things a person may
// do about it, each with its consequence stated before the button that does
// it. Correcting re-files what the rule itself filed and never what a person
// filed by hand; removing stops the rule and re-files nothing. Neither is a
// side effect of anything else on the screen.

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import { makeStyles, Select } from '@fluentui/react-components';

import { ayqAsk } from '../ayq-bridge.ts';
import type {
  AyqCategory,
  AyqCategoryRule,
  AyqRuleImpact,
} from '../ayq-ipc-contract.ts';
import { ayqCount, ayqDate, ayqText } from '../ayq-strings.ts';
import { AYQ_METRIC } from '../ayq-tokens.ts';
import { AyqButton } from '../ayq-ui/ayq-button.tsx';
import { ayqBorder } from '../ayq-ui/ayq-css.ts';
import { AyqStateChip } from '../ayq-ui/ayq-state-chip.tsx';

const useStyles = makeStyles({
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: `${AYQ_METRIC.space.small}px`,
    padding: `${AYQ_METRIC.space.medium}px ${AYQ_METRIC.space.wide}px`,
    marginTop: `${AYQ_METRIC.space.medium}px`,
    backgroundColor: 'var(--ayq-pane)',
    ...ayqBorder('var(--ayq-line)'),
    borderRadius: 'var(--ayq-radius-medium)',
    fontSize: 'var(--ayq-size-small)',
  },
  line: { margin: '0', color: 'var(--ayq-ink)' },
  quiet: { margin: '0', color: 'var(--ayq-ink-quiet)' },
  inline: {
    display: 'flex',
    gap: `${AYQ_METRIC.space.small}px`,
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  actions: {
    display: 'flex',
    gap: `${AYQ_METRIC.space.medium}px`,
    flexWrap: 'wrap',
    marginTop: `${AYQ_METRIC.space.tight}px`,
  },
});

type AyqRuleMode = 'idle' | 'correct' | 'remove';

export function AyqRuleCard({
  rule,
  categories,
  onDone,
  onFailure,
}: {
  rule: AyqCategoryRule;
  categories: readonly AyqCategory[];
  /** The rule was corrected or removed; the caller reads again. */
  onDone(said: string): void;
  onFailure(message: string): void;
}): ReactNode {
  const styles = useStyles();
  const [impact, setImpact] = useState<AyqRuleImpact | null>(null);
  const [mode, setMode] = useState<AyqRuleMode>('idle');
  const [chosen, setChosen] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setImpact(null);
    setMode('idle');
    setChosen(null);
    void (async () => {
      const answered = await ayqAsk({ kind: 'rules.impact', ruleId: rule.id });
      if (!answered.ok) throw new Error(answered.message);
      if (live) setImpact(answered.result as AyqRuleImpact);
    })().catch((error: unknown) => {
      if (live)
        {onFailure(error instanceof Error ? error.message : String(error));}
    });
    return () => {
      live = false;
    };
  }, [rule.id, rule.categoryName, onFailure]);

  const current =
    categories.find(
      one => one.name.toLowerCase() === rule.categoryName.toLowerCase(),
    ) ?? null;
  const target = categories.find(one => one.id === chosen) ?? null;

  const correct = (): void => {
    if (target === null) return;
    void (async () => {
      const answered = await ayqAsk({
        kind: 'rules.correct',
        ruleId: rule.id,
        categoryId: target.id,
      });
      if (!answered.ok) throw new Error(answered.message);
      if (answered.kind !== 'rules.correct') return;
      onDone(
        ayqText('rules.corrected', {
          counterparty: answered.result.rule.counterpartyKey,
          category: answered.result.rule.categoryName,
          filed: ayqCount(answered.result.filed),
        }),
      );
    })().catch((error: unknown) => {
      onFailure(error instanceof Error ? error.message : String(error));
    });
  };

  const remove = (): void => {
    void (async () => {
      const answered = await ayqAsk({ kind: 'rules.remove', ruleId: rule.id });
      if (!answered.ok) throw new Error(answered.message);
      onDone(ayqText('rules.removed'));
    })().catch((error: unknown) => {
      onFailure(error instanceof Error ? error.message : String(error));
    });
  };

  return (
    <div className={styles.card} data-ayq-rule-card={rule.id}>
      <p className={styles.line}>
        <span className={styles.inline}>
          <span>
            {ayqText('rules.card.stands', {
              counterparty: rule.counterpartyKey,
              category: rule.categoryName,
              date: ayqDate(rule.createdAt.slice(0, 10)),
            })}
          </span>
          {impact === null || impact.categoryExists ? null : (
            <AyqStateChip
              state="overdue"
              label={ayqText('rules.missingCategory')}
            />
          )}
        </span>
      </p>

      {impact === null ? (
        <p className={styles.quiet}>{ayqText('common.loading')}</p>
      ) : (
        <p className={styles.quiet} data-ayq-rule-impact="">
          {ayqText('rules.card.filed', { filed: ayqCount(impact.filed) })}
          {impact.byHand === 0
            ? null
            : ` ${ayqText('rules.card.byHand', { byHand: ayqCount(impact.byHand) })}`}
        </p>
      )}

      {mode !== 'idle' ? null : (
        <div className={styles.actions}>
          <AyqButton
            size="small"
            mark="rule-correct"
            disabled={impact === null}
            onClick={() => {
              setChosen(current?.id ?? null);
              setMode('correct');
            }}
          >
            {ayqText('rules.card.correct')}
          </AyqButton>
          <AyqButton
            size="small"
            mark="rule-remove"
            disabled={impact === null}
            onClick={() => setMode('remove')}
          >
            {ayqText('rules.card.remove')}
          </AyqButton>
        </div>
      )}

      {mode !== 'correct' || impact === null ? null : (
        <>
          <Select
            data-ayq-rule-category=""
            aria-label={ayqText('rules.card.category')}
            value={chosen ?? ''}
            onChange={(_event, data) =>
              setChosen(data.value === '' ? null : data.value)
            }
          >
            <option value="">{ayqText('rules.card.category')}</option>
            {categories.map(category => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
          {target === null || target.id === current?.id ? null : (
            <p className={styles.quiet} data-ayq-rule-consequence="">
              {ayqText('rules.card.correctConsequence', {
                filed: ayqCount(impact.filed),
                category: target.name,
                byHand: ayqCount(impact.byHand),
              })}
            </p>
          )}
          <div className={styles.actions}>
            <AyqButton
              filled
              size="small"
              mark="rule-correct-apply"
              disabled={target === null || target.id === current?.id}
              onClick={correct}
            >
              {ayqText('rules.card.correctApply')}
            </AyqButton>
            <AyqButton
              size="small"
              mark="rule-cancel"
              onClick={() => setMode('idle')}
            >
              {ayqText('rules.card.cancel')}
            </AyqButton>
          </div>
        </>
      )}

      {mode !== 'remove' || impact === null ? null : (
        <>
          <p className={styles.quiet} data-ayq-rule-remove-consequence="">
            {ayqText('rules.card.removeConsequence', {
              filed: ayqCount(impact.filed),
            })}
          </p>
          <div className={styles.actions}>
            <AyqButton
              filled
              size="small"
              mark="rule-remove-confirm"
              onClick={remove}
            >
              {ayqText('rules.card.removeConfirm')}
            </AyqButton>
            <AyqButton
              size="small"
              mark="rule-cancel"
              onClick={() => setMode('idle')}
            >
              {ayqText('rules.card.cancel')}
            </AyqButton>
          </div>
        </>
      )}
    </div>
  );
}
