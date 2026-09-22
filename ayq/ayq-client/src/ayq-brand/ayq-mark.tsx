// The AYQ mark, drawn from its vector master (06 §3.6).
//
// One drawing, `ayq-mark.svg` beside this file, and this is the window's copy of
// it: the same file the icon build rasterises, brought in as text at build
// time and drawn inline, so that the mark in the title bar, on About and on
// the taskbar are one mark. Decorative wherever it appears — the name beside
// it is the text, and this carries none.

import type { ReactNode } from 'react';

import { makeStyles, mergeClasses } from '@fluentui/react-components';

import master from './ayq-mark.svg';

const useStyles = makeStyles({
  mark: {
    display: 'inline-flex',
    flex: 'none',
    lineHeight: '0',
    '& > svg': { width: '100%', height: '100%', display: 'block' },
  },
});

export function AyqMark({
  size,
  className,
}: {
  /** In CSS pixels; the master is square. */
  size: number;
  className?: string;
}): ReactNode {
  const styles = useStyles();
  return (
    <span
      className={mergeClasses(styles.mark, className)}
      style={{ width: `${size}px`, height: `${size}px` }}
      data-ayq-mark={String(size)}
      aria-hidden="true"
      // The master is this repository's own file, read at build time; it is
      // not content that arrived from anywhere.
      dangerouslySetInnerHTML={{ __html: master }}
    />
  );
}
