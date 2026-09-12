// A figure, in the Ledger treatment (04 A19).
//
// The interface typeface, tabular numerals, right-aligned, the minus sign
// carrying direction. A negative amount is not coloured — red means one thing
// in AYQ, and "this is money going out" is not it.
//
// Every amount on every screen goes through here, so that the treatment is one
// decision rather than a convention people remember to follow.

import { makeStyles, mergeClasses } from '@fluentui/react-components';
import type { ReactNode } from 'react';

import { ayqAmount, ayqMoney } from '../ayq-strings.ts';
import { AYQ_TYPE } from '../ayq-tokens.ts';

const useStyles = makeStyles({
  figure: {
    fontFamily: 'var(--ayq-font-ui)',
    fontVariantNumeric: AYQ_TYPE.figures,
    textAlign: 'right',
    whiteSpace: 'nowrap',
    color: 'var(--ayq-ink)',
  },
  body: { fontSize: 'var(--ayq-size-body)' },
  large: {
    fontFamily: 'var(--ayq-font-display)',
    fontSize: 'var(--ayq-size-figure)',
    fontWeight: AYQ_TYPE.weight.semibold,
  },
  headline: {
    fontFamily: 'var(--ayq-font-display)',
    fontSize: 'var(--ayq-size-headline)',
    fontWeight: AYQ_TYPE.weight.semibold,
    lineHeight: 1.12,
  },
});

export type AyqFigureSize = 'body' | 'large' | 'headline';

export function AyqFigure({
  cents,
  size = 'body',
  withSymbol = false,
}: {
  cents: number;
  size?: AyqFigureSize;
  /** A column of figures carries the symbol in its heading, not in every row. */
  withSymbol?: boolean;
}): ReactNode {
  const styles = useStyles();
  return (
    <span
      className={mergeClasses(styles.figure, styles[size])}
      data-ayq-figure={String(cents)}
    >
      {withSymbol ? ayqMoney(cents) : ayqAmount(cents)}
    </span>
  );
}
