// The filled button (04 A18), and the plain one beside it, as template r003
// draws them.
//
// One treatment everywhere: dark, with mint text, on the screens and in the
// detail pane alike. Hierarchy is carried by where a button sits, not by
// giving one action two colours — so there is no second filled appearance to
// choose between, and Fluent's own `appearance="primary"` is never used. Both
// are AYQ-owned compact controls: 28 high, 12.5 semibold, radius 3 (A39),
// the plain one on the pane's white with the control edge.
//
// The props are a chosen few rather than all of Fluent's. A button in AYQ is a
// button: it is not a link, it does not become an anchor, and the prop that
// would let it is the one that makes every other one ambiguous.

import type { MouseEventHandler, ReactNode } from 'react';

import { Button, makeStyles, mergeClasses } from '@fluentui/react-components';
import type { ButtonProps } from '@fluentui/react-components';

import { AYQ_METRIC, AYQ_TYPE } from '../ayq-tokens.ts';

import { ayqBorder } from './ayq-css.ts';

const useStyles = makeStyles({
  button: {
    height: `${AYQ_METRIC.controlHeight}px`,
    minHeight: `${AYQ_METRIC.controlHeight}px`,
    minWidth: '0',
    padding: '0 11px',
    borderRadius: `${AYQ_METRIC.radiusSmall}px`,
    fontSize: AYQ_TYPE.size.small,
    fontWeight: AYQ_TYPE.weight.semibold,
    lineHeight: '1',
    whiteSpace: 'nowrap',
    ...ayqBorder('var(--ayq-control-edge)'),
    backgroundColor: 'var(--ayq-pane)',
    color: 'var(--ayq-ink)',
    ':hover': {
      backgroundColor: 'var(--ayq-secondary-hover)',
      color: 'var(--ayq-ink)',
      ...ayqBorder('var(--ayq-control-edge)'),
    },
    ':active': {
      backgroundColor: 'var(--ayq-row-selected)',
      color: 'var(--ayq-ink)',
      ...ayqBorder('var(--ayq-control-edge)'),
    },
    ':disabled': {
      backgroundColor: 'var(--ayq-disabled-fill)',
      color: 'var(--ayq-disabled-ink)',
      ...ayqBorder('var(--ayq-line)'),
    },
  },
  filled: {
    backgroundColor: 'var(--ayq-button-fill)',
    ...ayqBorder('var(--ayq-button-edge)'),
    color: 'var(--ayq-button-ink)',
    ':hover': {
      backgroundColor: 'var(--ayq-button-fill-hover)',
      ...ayqBorder('var(--ayq-button-edge)'),
      color: 'var(--ayq-button-ink)',
    },
    ':active': {
      backgroundColor: 'var(--ayq-button-fill-pressed)',
      ...ayqBorder('var(--ayq-button-edge)'),
      color: 'var(--ayq-button-ink)',
    },
  },
  /** An icon-only button: a 28 square. */
  square: { width: `${AYQ_METRIC.controlHeight}px`, padding: '0' },
});

export type AyqButtonProps = {
  children?: ReactNode;
  /** Filled is the one treatment of A18; plain is everything else. */
  filled?: boolean;
  className?: string;
  disabled?: boolean;
  icon?: ButtonProps['icon'];
  /** Kept for the callers that name it; every AYQ button is the compact 28. */
  size?: ButtonProps['size'];
  onClick?: MouseEventHandler<HTMLButtonElement>;
  /** What a button with only an icon on it says to a screen reader. */
  ariaLabel?: string;
  /** A hook for the acceptance runs, never for styling. */
  mark?: string;
};

export function AyqButton({
  filled = false,
  className,
  ariaLabel,
  mark,
  children,
  size: _size,
  ...rest
}: AyqButtonProps): ReactNode {
  const styles = useStyles();
  return (
    <Button
      {...rest}
      appearance="secondary"
      aria-label={ariaLabel}
      className={mergeClasses(
        styles.button,
        filled ? styles.filled : undefined,
        children === undefined ? styles.square : undefined,
        className,
      )}
      data-ayq-filled={filled ? 'yes' : 'no'}
      data-ayq-action={mark}
    >
      {children}
    </Button>
  );
}
