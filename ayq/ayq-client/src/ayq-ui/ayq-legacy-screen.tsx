// A screen that has not been brought over to Fluent yet, drawn inside the new
// frame.
//
// The interface is being replaced one screen at a time, and this is what makes
// that possible without taking the working application down for the duration:
// the screens that are still the old imperative renderers are mounted into the
// new shell, keep their own markup and their own acceptance hooks, and are
// replaced one by one. When the last of them goes, so does this file.
//
// It owns no state of its own beyond when to redraw. What to load and what to
// draw belongs to `ayq-legacy-views.ts`.

import { makeStyles } from '@fluentui/react-components';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import {
  ayqDrawLegacy,
  ayqLoadLegacy,
  type AyqLegacyView,
} from '../ayq-legacy-views.ts';
import { ayqText } from '../ayq-strings.ts';

const useStyles = makeStyles({
  host: { minWidth: '0' },
  reading: { color: 'var(--ayq-ink-faint)' },
});

export function AyqLegacyScreen({
  view,
  onFailure,
  onLoaded,
}: {
  view: AyqLegacyView;
  onFailure(message: string): void;
  onLoaded?(): void;
}): ReactNode {
  const styles = useStyles();
  const host = useRef<HTMLDivElement>(null);
  const [drawn, setDrawn] = useState(false);
  const [round, setRound] = useState(0);

  useEffect(() => {
    let live = true;
    setDrawn(false);
    void ayqLoadLegacy(view)
      .then(() => {
        if (!live || host.current === null) return;
        ayqDrawLegacy(view, host.current, () => setRound(one => one + 1));
        setDrawn(true);
        onLoaded?.();
      })
      .catch((error: unknown) => {
        if (!live) return;
        onFailure(error instanceof Error ? error.message : String(error));
      });
    return () => {
      live = false;
    };
    // `round` is in here on purpose: a redraw asked for by the screen itself is
    // a reload, because what it changed was the engine's state and not the
    // screen's.
  }, [view, round, onFailure, onLoaded]);

  // Two elements, deliberately: the old renderer replaces the children of the
  // one it is given, and React must not be holding anything inside it.
  return (
    <div className={styles.host} data-ayq-legacy={view}>
      {drawn ? null : (
        <p className={styles.reading}>{ayqText('common.loading')}</p>
      )}
      <div ref={host} />
    </div>
  );
}
