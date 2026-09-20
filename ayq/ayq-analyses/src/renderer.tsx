// AYQ Analyses — A1 renderer.
//
// The application opens on Explore. The other five destinations are present and
// visibly unavailable. There is no Search, no Explore preset row, no archive
// selector, and Metric and Dimension are static text rather than controls.
//
// The renderer formats and selects from one engine result. It never recomputes
// a financial value, and it never touches the filesystem.

import type { JSX, KeyboardEvent } from 'react';
import { StrictMode, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button, FluentProvider } from '@fluentui/react-components';
import {
  ArrowRepeatAll20Regular,
  ArrowTrendingLines20Regular,
  Bookmark20Regular,
  BranchFork20Regular,
  CompassNorthwest20Regular,
  Home20Regular,
  type FluentIcon,
} from '@fluentui/react-icons';
import { analyse } from './engine.js';
import { anchorDate, defaultContext } from './context.js';
import { formatDateTime } from './format.js';
import { DEFAULT_SORT, type SortState } from './sort.js';
import { LocaleContext, useLocale, useText } from './ui/text.js';
import { analysesTheme } from './ui/theme.js';
import { applyCssVariables } from './ui/tokens.js';
import { ContextBar } from './ui/context-bar.js';
import { ResultView } from './ui/result.js';
import { DetailPane, type DetailSelection } from './ui/detail.js';
import type { StringKey } from './strings.js';
import type { AnalysisContext, AyqAnalyticalSnapshot } from './types.js';
import type { AyqAnalysesBridge, SnapshotLoadResult } from './preload.js';

declare global {
  interface Window {
    ayqAnalyses: AyqAnalysesBridge;
  }
}

type Destination = 'overview' | 'explore' | 'fixedCosts' | 'projection' | 'scenarios' | 'savedAnalyses';

// The six destinations in the accepted order (r05 §2), each a tile of icon
// above label (A2 decision K-1; Fluent System Icons, A12). The icon is
// decorative: the tile's accessible name is its catalogue label.
const RAIL: Array<{ destination: Destination; key: StringKey; icon: FluentIcon }> = [
  { destination: 'overview', key: 'rail.overview', icon: Home20Regular },
  { destination: 'explore', key: 'rail.explore', icon: CompassNorthwest20Regular },
  { destination: 'fixedCosts', key: 'rail.fixedCosts', icon: ArrowRepeatAll20Regular },
  { destination: 'projection', key: 'rail.projection', icon: ArrowTrendingLines20Regular },
  { destination: 'scenarios', key: 'rail.scenarios', icon: BranchFork20Regular },
  { destination: 'savedAnalyses', key: 'rail.savedAnalyses', icon: Bookmark20Regular },
];

const INVALID_REASON_KEYS: Record<string, StringKey> = {
  contractMajor: 'snapshot.invalid.reason.contractMajor',
  malformed: 'snapshot.invalid.reason.malformed',
  invariant: 'snapshot.invalid.reason.invariant',
  unknown: 'snapshot.invalid.reason.unknown',
};

type LoadState =
  | { kind: 'none' }
  | { kind: 'invalid'; reason: string }
  | { kind: 'loaded'; snapshot: AyqAnalyticalSnapshot };

/**
 * The rail is one Tab stop (A2 decision K-7): Tab lands on the current
 * destination, Up/Down and Home/End move along the tiles and open the
 * destination as a click would, and Tab leaves for the body. Every tile
 * remains a real button, so a pointer and a screen reader see the same thing.
 */
function Rail({
  destination,
  onSelect,
}: {
  destination: Destination;
  onSelect(destination: Destination): void;
}): JSX.Element {
  const t = useText();
  const tiles = useRef<Array<HTMLButtonElement | null>>([]);

  const move = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    const steps: Record<string, number | undefined> = {
      ArrowDown: index + 1,
      ArrowUp: index - 1,
      Home: 0,
      End: RAIL.length - 1,
    };
    const next = steps[event.key];
    if (next === undefined) return;
    event.preventDefault();
    const target = Math.min(RAIL.length - 1, Math.max(0, next));
    onSelect(RAIL[target].destination);
    tiles.current[target]?.focus();
  };

  return (
    <nav className="rail" aria-label={t('app.wordmark')}>
      <span className="wordmark">{t('app.wordmark')}</span>
      <ul role="list">
        {RAIL.map((entry, index) => {
          const unavailable = entry.destination !== 'explore';
          const active = destination === entry.destination;
          const Icon = entry.icon;
          return (
            <li key={entry.destination}>
              <button
                ref={element => {
                  tiles.current[index] = element;
                }}
                type="button"
                className={['rail-item', active ? 'active' : '', unavailable ? 'unavailable' : '']
                  .filter(Boolean)
                  .join(' ')}
                tabIndex={active ? 0 : -1}
                aria-disabled={unavailable || undefined}
                aria-current={active ? 'page' : undefined}
                onClick={() => onSelect(entry.destination)}
                onKeyDown={event => move(event, index)}
              >
                <Icon aria-hidden="true" />
                {t(entry.key)}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function NoData({ onLoad }: { onLoad(): void }): JSX.Element {
  const t = useText();
  return (
    <div className="centred-block">
      <h1>{t('snapshot.empty.title')}</h1>
      <p>{t('snapshot.empty.body')}</p>
      <Button appearance="primary" onClick={onLoad}>
        {t('snapshot.empty.action')}
      </Button>
    </div>
  );
}

function InvalidSnapshot({ reason, onLoad }: { reason: string; onLoad(): void }): JSX.Element {
  const t = useText();
  const key = INVALID_REASON_KEYS[reason] ?? 'snapshot.invalid.reason.unknown';
  return (
    <div className="centred-block invalid">
      <h1>{t('snapshot.invalid.title')}</h1>
      <p>{t(key)}</p>
      <Button appearance="primary" onClick={onLoad}>
        {t('snapshot.invalid.retry')}
      </Button>
    </div>
  );
}

function NotInThisVersion(): JSX.Element {
  const t = useText();
  return (
    <div className="centred-block">
      <p>{t('rail.notInThisVersion')}</p>
    </div>
  );
}

function App(): JSX.Element {
  const t = useText();
  const locale = useLocale();
  const [load, setLoad] = useState<LoadState>({ kind: 'none' });
  const [context, setContext] = useState<AnalysisContext | null>(null);
  const [destination, setDestination] = useState<Destination>('explore');
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);
  const [selection, setSelection] = useState<DetailSelection | null>(null);

  const openSnapshot = async (): Promise<void> => {
    const result: SnapshotLoadResult = await window.ayqAnalyses.openSnapshot();
    if (result.status === 'cancelled') return;
    if (result.status === 'invalid') {
      // The previous result does not stay on screen beside a refused file, and
      // the status bar empties.
      setLoad({ kind: 'invalid', reason: result.reason });
      setContext(null);
      setSelection(null);
      return;
    }
    setLoad({ kind: 'loaded', snapshot: result.snapshot });
    setContext(defaultContext(result.snapshot));
    setSort(DEFAULT_SORT);
    setSelection(null);
  };

  const snapshot = load.kind === 'loaded' ? load.snapshot : null;

  useEffect(() => {
    if (selection === null) return;
    const close = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape' && !event.defaultPrevented) setSelection(null);
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [selection]);

  const result = useMemo(
    () => (snapshot !== null && context !== null ? analyse(snapshot, context) : null),
    [snapshot, context],
  );

  const accountsLabel =
    snapshot !== null && context !== null
      ? context.accountKeys.length === snapshot.accounts.length
        ? t('context.accounts.all')
        : t('context.accounts.some', { n: context.accountKeys.length, m: snapshot.accounts.length })
      : '';

  let body: JSX.Element;
  if (destination !== 'explore') {
    body = <NotInThisVersion />;
  } else if (load.kind === 'none') {
    body = <NoData onLoad={() => void openSnapshot()} />;
  } else if (load.kind === 'invalid') {
    body = <InvalidSnapshot reason={load.reason} onLoad={() => void openSnapshot()} />;
  } else {
    body = (
      <div className="explore">
        <ContextBar
          snapshot={load.snapshot}
          context={context!}
          result={result!}
          anchor={anchorDate(load.snapshot)}
          onChange={next => {
            setContext(next);
            setSelection(null);
          }}
        />
        <div className="explore-body">
          <ResultView
            result={result!}
            accountsLabel={accountsLabel}
            sort={sort}
            selection={selection}
            onSort={setSort}
            onSelect={setSelection}
          />
          {selection !== null && (
            <DetailPane result={result!} selection={selection} onClose={() => setSelection(null)} />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="shell">
      <Rail destination={destination} onSelect={setDestination} />
      <main className="body">{body}</main>
      <footer className="status-bar">
        {load.kind === 'loaded' && (
          <>
            <span>{t('status.snapshot', { datetime: formatDateTime(load.snapshot.meta.generatedAt, locale) })}</span>
            <Button appearance="subtle" onClick={() => void openSnapshot()}>
              {t('status.loadAnother')}
            </Button>
          </>
        )}
      </footer>
    </div>
  );
}

function Root(): JSX.Element {
  const [locale, setLocale] = useState('en');
  useEffect(() => {
    void window.ayqAnalyses.presentationContext().then(presentation => setLocale(presentation.locale));
  }, []);
  return (
    <LocaleContext.Provider value={locale}>
      {/*
        The provider is the shell's parent, so it must span the window for the
        rail and the status bar to reach the bottom edge on every screen.
      */}
      <FluentProvider theme={analysesTheme} style={{ height: '100%' }}>
        <App />
      </FluentProvider>
    </LocaleContext.Provider>
  );
}

// The roles of tokens.ts become the custom properties the stylesheet reads,
// before anything is painted.
applyCssVariables(document.documentElement);

const host = document.getElementById('root');
if (host !== null) {
  createRoot(host).render(
    <StrictMode>
      <Root />
    </StrictMode>,
  );
}
