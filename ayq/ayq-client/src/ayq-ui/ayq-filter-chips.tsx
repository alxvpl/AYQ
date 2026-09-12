// What is being filtered, shown and removable (review D2.1).
//
// A filter that is in force and invisible is how a person comes to believe
// their money has gone missing. Each one is a chip that says what it is and
// can be taken off on its own, and one action takes them all off.

import { makeStyles } from '@fluentui/react-components';
import { DismissRegular } from '@fluentui/react-icons';
import type { ReactNode } from 'react';

import { ayqText } from '../ayq-strings.ts';
import { AYQ_METRIC, AYQ_TYPE } from '../ayq-tokens.ts';
import { AyqButton } from './ayq-button.tsx';
import { AYQ_NO_BORDER, ayqBorder } from './ayq-css.ts';

const useStyles = makeStyles({
  bar: {
    display: 'flex',
    gap: `${AYQ_METRIC.space.small}px`,
    alignItems: 'center',
    flexWrap: 'wrap',
    color: 'var(--ayq-ink-faint)',
    fontSize: 'var(--ayq-size-small)',
    minHeight: '24px',
  },
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: `${AYQ_METRIC.space.small}px`,
    backgroundColor: 'var(--ayq-accent-soft)',
    color: 'var(--ayq-ink)',
    ...ayqBorder('var(--ayq-accent-line)', '1px'),
    borderRadius: `${AYQ_METRIC.radiusPill}px`,
    padding: '1.5px 6px 1.5px 9px',
    fontSize: 'var(--ayq-size-small)',
  },
  name: { color: 'var(--ayq-ink-quiet)' },
  value: { fontWeight: AYQ_TYPE.weight.medium },
  drop: {
    ...AYQ_NO_BORDER,
    backgroundColor: 'transparent',
    color: 'var(--ayq-ink-quiet)',
    cursor: 'pointer',
    lineHeight: 1,
    padding: '0 2px',
    display: 'inline-flex',
    ':hover': { color: 'var(--ayq-ink)' },
    ':focus-visible': {
      outlineWidth: `${AYQ_METRIC.focusRing}px`,
      outlineStyle: 'solid',
      outlineColor: 'var(--ayq-accent-focus)',
      outlineOffset: '1px',
    },
  },
});

export type AyqAppliedFilter = {
  id: string;
  /** What is being filtered on. */
  name: string;
  /** What it is filtered to. */
  value: string;
  remove(): void;
};

export function AyqFilterChips({
  applied,
  clearAll,
}: {
  applied: readonly AyqAppliedFilter[];
  clearAll(): void;
}): ReactNode {
  const styles = useStyles();
  if (applied.length === 0) return null;

  return (
    <div className={styles.bar} data-ayq-filters="">
      <span>{ayqText('register.filter.applied')}</span>
      {applied.map(one => (
        <span key={one.id} className={styles.chip} data-ayq-filter={one.id}>
          <span className={styles.name}>{one.name}</span>
          <span className={styles.value}>{one.value}</span>
          <button
            type="button"
            className={styles.drop}
            aria-label={ayqText('register.filter.remove', { filter: one.name })}
            data-ayq-filter-remove={one.id}
            onClick={one.remove}
          >
            <DismissRegular />
          </button>
        </span>
      ))}
      <AyqButton size="small" mark="clear-filters" onClick={clearAll}>
        {ayqText('register.filter.clearAll')}
      </AyqButton>
    </div>
  );
}
