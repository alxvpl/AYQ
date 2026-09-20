// AYQ Analyses — A1 renderer.
//
// The application opens on Explore. The other five destinations are present and
// visibly unavailable. There is no Search, no Explore preset row, no archive
// selector, and Metric and Dimension are static text rather than controls.
//
// The renderer formats and selects from one engine result. It never recomputes
// a financial value, and it never touches the filesystem.

import type { JSX } from 'react';
import { StrictMode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button, FluentProvider, webLightTheme } from '@fluentui/react-components';
import { analyse } from './engine.js';
import { anchorDate, defaultContext } from './context.js';
import { formatDateTime } from './format.js';
import { DEFAULT_SORT, type SortState } from './sort.js';
import { LocaleContext, useLocale, useText } from './ui/text.js';
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

const RAIL: Array<{ destination: Destination; key: StringKey }> = [
  { destination: 'overview', key: 'rail.overview' },
  { destination: 'explore', key: 'rail.explore' },
  { destination: 'fixedCosts', key: 'rail.fixedCosts' },
  { destination: 'projection', key: 'rail.projection' },
  { destination: 'scenarios', key: 'rail.scenarios' },
  { destination: 'savedAnalyses', key: 'rail.savedAnalyses' },
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

function Rail({
  destination,
  onSelect,
}: {
  destination: Destination;
  onSelect(destination: Destination): void;
}): JSX.Element {
  const t = useText();
  return (
    <nav className="rail" aria-label={t('app.wordmark')}>
      <span className="wordmark">{t('app.wordmark')}</span>
      <ul>
        {RAIL.map(entry => {
          const unavailable = entry.destination !== 'explore';
          return (
            <li key={entry.destination}>
              <button
                type="button"
                className={[
                  'rail-item',
                  destination === entry.destination ? 'active' : '',
                  unavailable ? 'unavailable' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-disabled={unavailable || undefined}
                aria-current={destination === entry.destination ? 'page' : undefined}
                onClick={() => onSelect(entry.destination)}
              >
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
      <FluentProvider theme={webLightTheme}>
        <App />
      </FluentProvider>
    </LocaleContext.Provider>
  );
}

const host = document.getElementById('root');
if (host !== null) {
  createRoot(host).render(
    <StrictMode>
      <Root />
    </StrictMode>,
  );
}
