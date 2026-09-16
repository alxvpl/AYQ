// A figure, in the Ledger treatment (04 A19).
//
// The interface typeface, tabular numerals, right-aligned, the minus sign
// carrying direction. A negative amount is not coloured — red means one thing
// in AYQ, and "this is money going out" is not it.
//
// Every amount on every screen goes through here, so that the treatment is one
// decision rather than a convention people remember to follow.
//
// Which is also why `null` is drawn here rather than guarded at every call
// site: §5 makes an unknown balance a real state, and the one thing that must
// never happen is a null quietly becoming a nought somewhere on the way to the
// screen. A figure AYQ does not know says so, in words, in the place the number
// would have been.

import { makeStyles, mergeClasses } from '@fluentui/react-components';
import type { ReactNode } from 'react';

import { ayqAmount, ayqMoney, ayqText } from '../ayq-strings.ts';
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
  // Quieter than a figure and in the interface face rather than the figure
  // one: it is a word standing where a number would be, and dressing it up as
  // a number is exactly the confusion to avoid.
  unknown: {
    fontFamily: 'var(--ayq-font-ui)',
    fontVariantNumeric: 'normal',
    fontWeight: AYQ_TYPE.weight.regular,
    color: 'var(--ayq-ink-quiet)',
  },
});

export type AyqFigureSize = 'body' | 'large' | 'headline';

export function AyqFigure({
  cents,
  size = 'body',
  withSymbol = false,
}: {
  /** Null is Unknown, and is drawn as the word. Never as nought (§5). */
  cents: number | null;
  size?: AyqFigureSize;
  /** A column of figures carries the symbol in its heading, not in every row. */
  withSymbol?: boolean;
}): ReactNode {
  const styles = useStyles();

  if (cents === null) {
    return (
      <span
        className={mergeClasses(styles.figure, styles[size], styles.unknown)}
        data-ayq-figure="unknown"
      >
        {ayqText('figure.unknown')}
      </span>
    );
  }

  return (
    <span
      className={mergeClasses(styles.figure, styles[size])}
      data-ayq-figure={String(cents)}
    >
      {withSymbol ? ayqMoney(cents) : ayqAmount(cents)}
    </span>
  );
}
