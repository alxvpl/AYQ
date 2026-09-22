// A state, said in one word and one tone.
//
// The five domain roles of 04 A17 as template r003 draws them — owner set,
// rule applied (dashed, with the ƒ glyph), suggested, uncategorised,
// attention — plus neutral, and the operational chip: coverage, reconciliation
// and the balance anchor as an outlined chip that is visibly not a domain
// state. Distinct in colour, edge and glyph, so none of them depends on colour
// alone. The word comes from the caller, which got it from the catalogue: no
// component holds a string (A24).

import { makeStyles, mergeClasses } from '@fluentui/react-components';
import type { ReactNode } from 'react';

import { ayqText } from '../ayq-strings.ts';
import { AYQ_METRIC, AYQ_TYPE, type AyqStateName } from '../ayq-tokens.ts';
import { ayqBorder } from './ayq-css.ts';

const useStyles = makeStyles({
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    minHeight: '22px',
    padding: `1px 7px`,
    borderRadius: `${AYQ_METRIC.radiusSmall}px`,
    fontSize: AYQ_TYPE.size.small,
    fontWeight: AYQ_TYPE.weight.semibold,
    lineHeight: '1.2',
    whiteSpace: 'nowrap',
    ...ayqBorder('transparent'),
  },
  glyph: {
    fontFamily: 'var(--ayq-font-mono)',
    fontWeight: AYQ_TYPE.weight.bold,
    fontSize: AYQ_TYPE.size.caption,
  },
  tick: { fontSize: AYQ_TYPE.size.caption },
  confirmed: {
    color: 'var(--ayq-state-confirmed-fg)',
    backgroundColor: 'var(--ayq-state-confirmed-bg)',
  },
  rule: {
    color: 'var(--ayq-state-rule-fg)',
    backgroundColor: 'var(--ayq-state-rule-bg)',
    ...ayqBorder('var(--ayq-state-rule-edge)', 'var(--ayq-hairline)', 'dashed'),
  },
  suggested: {
    color: 'var(--ayq-state-suggested-fg)',
    backgroundColor: 'var(--ayq-state-suggested-bg)',
    ...ayqBorder('var(--ayq-state-suggested-edge)'),
  },
  overdue: {
    color: 'var(--ayq-state-overdue-fg)',
    backgroundColor: 'var(--ayq-state-overdue-bg)',
  },
  neutral: {
    color: 'var(--ayq-state-neutral-fg)',
    backgroundColor: 'var(--ayq-state-neutral-bg)',
  },
  uncategorised: {
    color: 'var(--ayq-state-uncategorised-fg)',
    backgroundColor: 'var(--ayq-state-uncategorised-bg)',
  },
  operational: {
    color: 'var(--ayq-state-operational-fg)',
    backgroundColor: 'transparent',
    ...ayqBorder('var(--ayq-state-operational-edge)'),
    fontWeight: AYQ_TYPE.weight.regular,
  },
});

export function AyqStateChip({
  state,
  label,
  ok = false,
}: {
  state: AyqStateName;
  label: string;
  /** An operational fact that holds carries a tick before its word. */
  ok?: boolean;
}): ReactNode {
  const styles = useStyles();
  return (
    <span
      className={mergeClasses(styles.chip, styles[state])}
      data-ayq-state={state}
    >
      {state === 'rule' ? (
        <span className={styles.glyph} aria-hidden="true">
          {ayqText('state.rule.glyph')}
        </span>
      ) : null}
      {state === 'operational' && ok ? (
        <span className={styles.tick} aria-hidden="true">
          {ayqText('state.operational.tick')}
        </span>
      ) : null}
      {label}
    </span>
  );
}
