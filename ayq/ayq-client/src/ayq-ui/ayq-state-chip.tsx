// A state, said in one word and one tone.
//
// The five states of 04 A17 are their own scale and never the accent, so this
// reads the state tokens and nothing else. The word comes from the caller,
// which got it from the catalogue: no component holds a string (A24).

import { makeStyles, mergeClasses } from '@fluentui/react-components';
import type { ReactNode } from 'react';

import { AYQ_METRIC, AYQ_TYPE, type AyqStateName } from '../ayq-tokens.ts';

const useStyles = makeStyles({
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: `${AYQ_METRIC.space.small}px`,
    padding: `1.5px ${AYQ_METRIC.space.medium}px`,
    borderRadius: `${AYQ_METRIC.radiusPill}px`,
    fontSize: AYQ_TYPE.size.small,
    whiteSpace: 'nowrap',
  },
  confirmed: {
    color: 'var(--ayq-state-confirmed-fg)',
    backgroundColor: 'var(--ayq-state-confirmed-bg)',
  },
  suggested: {
    color: 'var(--ayq-state-suggested-fg)',
    backgroundColor: 'var(--ayq-state-suggested-bg)',
    border: '1px dashed currentColor',
  },
  overdue: {
    color: 'var(--ayq-state-overdue-fg)',
    backgroundColor: 'var(--ayq-state-overdue-bg)',
    fontWeight: AYQ_TYPE.weight.semibold,
  },
  neutral: {
    color: 'var(--ayq-state-neutral-fg)',
    backgroundColor: 'var(--ayq-state-neutral-bg)',
  },
  uncategorised: {
    color: 'var(--ayq-state-uncategorised-fg)',
    backgroundColor: 'var(--ayq-state-uncategorised-bg)',
  },
});

export function AyqStateChip({
  state,
  label,
}: {
  state: AyqStateName;
  label: string;
}): ReactNode {
  const styles = useStyles();
  return (
    <span
      className={mergeClasses(styles.chip, styles[state])}
      data-ayq-state={state}
    >
      {label}
    </span>
  );
}
