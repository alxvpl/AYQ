// The filled button (04 A18), and the plain one beside it.
//
// One treatment everywhere: dark, with mint text, on the screens and in the
// detail pane alike. Hierarchy is carried by where a button sits, not by
// giving one action two colours — so there is no second filled appearance to
// choose between, and Fluent's own `appearance="primary"` is never used.
//
// The props are a chosen few rather than all of Fluent's. A button in AYQ is a
// button: it is not a link, it does not become an anchor, and the prop that
// would let it is the one that makes every other one ambiguous.

import { Button, makeStyles, mergeClasses } from '@fluentui/react-components';
import type { ButtonProps } from '@fluentui/react-components';
import type { MouseEventHandler, ReactNode } from 'react';

import { AYQ_TYPE } from '../ayq-tokens.ts';

const useStyles = makeStyles({
  filled: {
    backgroundColor: 'var(--ayq-button-fill)',
    borderTopColor: 'var(--ayq-button-fill)',
    borderRightColor: 'var(--ayq-button-fill)',
    borderBottomColor: 'var(--ayq-button-fill)',
    borderLeftColor: 'var(--ayq-button-fill)',
    color: 'var(--ayq-accent)',
    fontWeight: AYQ_TYPE.weight.semibold,
    ':hover': {
      backgroundColor: 'var(--ayq-button-fill-hover)',
      borderTopColor: 'var(--ayq-button-fill-hover)',
      borderRightColor: 'var(--ayq-button-fill-hover)',
      borderBottomColor: 'var(--ayq-button-fill-hover)',
      borderLeftColor: 'var(--ayq-button-fill-hover)',
      color: 'var(--ayq-accent)',
    },
    ':active': {
      backgroundColor: 'var(--ayq-button-fill-pressed)',
      borderTopColor: 'var(--ayq-button-fill-pressed)',
      borderRightColor: 'var(--ayq-button-fill-pressed)',
      borderBottomColor: 'var(--ayq-button-fill-pressed)',
      borderLeftColor: 'var(--ayq-button-fill-pressed)',
      color: 'var(--ayq-accent)',
    },
  },
});

export type AyqButtonProps = {
  children?: ReactNode;
  /** Filled is the one treatment of A18; plain is everything else. */
  filled?: boolean;
  className?: string;
  disabled?: boolean;
  icon?: ButtonProps['icon'];
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
  ...rest
}: AyqButtonProps): ReactNode {
  const styles = useStyles();
  return (
    <Button
      {...rest}
      appearance="secondary"
      aria-label={ariaLabel}
      className={filled ? mergeClasses(styles.filled, className) : className}
      data-ayq-filled={filled ? 'yes' : 'no'}
      data-ayq-action={mark}
    >
      {children}
    </Button>
  );
}
