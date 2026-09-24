// AYQ Analyses — the renderer.
//
// The application opens on Explore, on the snapshot it holds (r003 §6.2).
// Fixed costs › Expected now reads the same snapshot (A2 Stage 1, DS r006
// §16). The other four analytical destinations are present, navigable and
// answer "Not in this version."; Settings is utility navigation at the rail
// footer. There
// is no Search, no Explore preset row, no archive selector, and Metric and
// Dimension are static text rather than controls.
//
// The renderer formats and selects from one engine result. It never recomputes
// a financial value, and it never touches the filesystem: it receives the
// validated snapshot and a display name, and no path of any kind.

import type { JSX, KeyboardEvent } from 'react';
import { StrictMode, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  FluentProvider,
} from '@fluentui/react-components';
import {
  ArrowRepeatAll20Regular,
  ArrowTrendingLines20Regular,
  Bookmark20Regular,
  BranchFork20Regular,
  CompassNorthwest20Regular,
  Home20Regular,
  Settings20Regular,
  type FluentIcon,
} from '@fluentui/react-icons';
import { analyse } from './engine.js';
import { anchorDate, defaultContext } from './context.js';
import {
  ANALYTICAL_DESTINATIONS,
  DESTINATION_LABEL,
  isAnalytical,
  isImplemented,
  placeholderKey,
  type AnalyticalDestination,
  type Destination,
} from './destinations.js';
import { formatDateTime } from './format.js';
import { applyLoadOutcome, applyRemovalOutcome, type LoadState, type Notice, type Transition } from './load-state.js';
import { DEFAULT_SORT, type SortState } from './sort.js';
import { LocaleContext, useLocale, useText } from './ui/text.js';
import { analysesTheme } from './ui/theme.js';
import { applyCssVariables } from './ui/tokens.js';
import { ContextBar } from './ui/context-bar.js';
import { ResultView } from './ui/result.js';
import { DetailPane, type DetailSelection } from './ui/detail.js';
import { FixedCosts } from './ui/fixed-costs.js';
import { transactionEvidence } from './fixed-costs.js';
import { SettingsView, type SettingsSnapshot } from './ui/settings.js';
import type { StringKey } from './strings.js';
import type { AnalysisContext } from './types.js';
import type { AyqAnalysesBridge, SnapshotLoadResult } from './preload.js';

declare global {
  interface Window {
    ayqAnalyses: AyqAnalysesBridge;
  }
}

// The icon of each tile (Fluent System Icons, A12). The icon is decorative:
// the tile's accessible name is its catalogue label.
const ICON: Record<Destination, FluentIcon> = {
  overview: Home20Regular,
  explore: CompassNorthwest20Regular,
  fixedCosts: ArrowRepeatAll20Regular,
  projection: ArrowTrendingLines20Regular,
  scenarios: BranchFork20Regular,
  savedAnalyses: Bookmark20Regular,
  settings: Settings20Regular,
};

const INVALID_REASON_KEYS: Record<string, StringKey> = {
  contractMajor: 'snapshot.invalid.reason.contractMajor',
  malformed: 'snapshot.invalid.reason.malformed',
  invariant: 'snapshot.invalid.reason.invariant',
  unknown: 'snapshot.invalid.reason.unknown',
};

function RailTile({
  destination,
  current,
  tabStop,
  unavailable,
  onSelect,
  onKeyDown,
  tileRef,
}: {
  destination: Destination;
  current: boolean;
  tabStop: boolean;
  unavailable: boolean;
  onSelect(): void;
  onKeyDown?(event: KeyboardEvent<HTMLButtonElement>): void;
  tileRef?(element: HTMLButtonElement | null): void;
}): JSX.Element {
  const t = useText();
  const Icon = ICON[destination];
  return (
    <button
      ref={tileRef}
      type="button"
      className={['rail-item', current ? 'active' : '', unavailable ? 'unavailable' : ''].filter(Boolean).join(' ')}
      tabIndex={tabStop ? 0 : -1}
      aria-current={current ? 'page' : undefined}
      onClick={onSelect}
      onKeyDown={onKeyDown}
    >
      <Icon aria-hidden="true" />
      {t(DESTINATION_LABEL[destination])}
    </button>
  );
}

/**
 * The analytical group is one Tab stop (A2 decision K-7; r003 §3.2): Tab
 * lands on the current tile — or, while Settings is current, on the
 * analytical destination last visited — Up/Down and Home/End move along the
 * tiles and open the destination as a click would, and Tab leaves for
 * Settings at the footer, its own stop, and then for the body. Every tile is
 * a real button, so a pointer and a screen reader see the same thing; an
 * unbuilt destination is a navigable placeholder, not a disabled control.
 */
function Rail({
  destination,
  analytical,
  onSelect,
}: {
  destination: Destination;
  /** The analytical destination the group's Tab stop rests on. */
  analytical: AnalyticalDestination;
  onSelect(destination: Destination): void;
}): JSX.Element {
  const t = useText();
  const tiles = useRef<Array<HTMLButtonElement | null>>([]);

  const move = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    const steps: Record<string, number | undefined> = {
      ArrowDown: index + 1,
      ArrowUp: index - 1,
      Home: 0,
      End: ANALYTICAL_DESTINATIONS.length - 1,
    };
    const next = steps[event.key];
    if (next === undefined) return;
    event.preventDefault();
    const target = Math.min(ANALYTICAL_DESTINATIONS.length - 1, Math.max(0, next));
    onSelect(ANALYTICAL_DESTINATIONS[target]);
    tiles.current[target]?.focus();
  };

  return (
    <nav className="rail" aria-label={t('app.wordmark')}>
      <span className="wordmark">{t('app.wordmark')}</span>
      <ul role="list">
        {ANALYTICAL_DESTINATIONS.map((entry, index) => (
          <li key={entry}>
            <RailTile
              destination={entry}
              current={destination === entry}
              tabStop={analytical === entry}
              unavailable={!isImplemented(entry)}
              onSelect={() => onSelect(entry)}
              onKeyDown={event => move(event, index)}
              tileRef={element => {
                tiles.current[index] = element;
              }}
            />
          </li>
        ))}
      </ul>
      <div className="rail-footer">
        <RailTile
          destination="settings"
          current={destination === 'settings'}
          tabStop
          unavailable={false}
          onSelect={() => onSelect('settings')}
        />
      </div>
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

function reasonKey(reason: string): StringKey {
  return INVALID_REASON_KEYS[reason] ?? 'snapshot.invalid.reason.unknown';
}

function InvalidSnapshot({ reason, onLoad }: { reason: string; onLoad(): void }): JSX.Element {
  const t = useText();
  return (
    <div className="centred-block invalid">
      <h1>{t('snapshot.invalid.title')}</h1>
      <p>{t(reasonKey(reason))}</p>
      <Button appearance="primary" onClick={onLoad}>
        {t('snapshot.invalid.retry')}
      </Button>
    </div>
  );
}

/**
 * What is said over the current surface, which stays as it is: a chosen file
 * refused while a copy is held — the refused-snapshot family over the result
 * that remains in use (r003 §6.3) — or one of the two failure sentences of
 * r003 §11.5 and §11.6. A sentence is its own title.
 */
function NoticeDialog({ notice, onClose }: { notice: Notice | null; onClose(): void }): JSX.Element {
  const t = useText();
  return (
    <Dialog
      open={notice !== null}
      onOpenChange={(_event, data) => {
        if (!data.open) onClose();
      }}
    >
      <DialogSurface>
        <DialogBody>
          {notice?.kind === 'refused' ? (
            <>
              <DialogTitle className="invalid-title">{t('snapshot.invalid.title')}</DialogTitle>
              <DialogContent>{t(reasonKey(notice.reason))}</DialogContent>
            </>
          ) : (
            <DialogTitle>{notice !== null && t(notice.key)}</DialogTitle>
          )}
          <DialogActions>
            <Button appearance="primary" onClick={onClose}>
              {t('dialog.close')}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

function NotInThisVersion({ destination }: { destination: AnalyticalDestination }): JSX.Element {
  const t = useText();
  const key = placeholderKey(destination);
  return <div className="centred-block">{key !== null && <p>{t(key)}</p>}</div>;
}

function App(): JSX.Element {
  const t = useText();
  const locale = useLocale();
  const [load, setLoad] = useState<LoadState>({ kind: 'pending' });
  const [notice, setNotice] = useState<Notice | null>(null);
  const [context, setContext] = useState<AnalysisContext | null>(null);
  const [destination, setDestination] = useState<Destination>('explore');
  const [analytical, setAnalytical] = useState<AnalyticalDestination>('explore');
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);
  const [selection, setSelection] = useState<DetailSelection | null>(null);
  // Fixed costs keeps its own open transaction: opening one there changes
  // nothing in Explore (checklist H9).
  const [fixedSelection, setFixedSelection] = useState<{ transactionKey: string; title: string } | null>(null);

  const select = (next: Destination): void => {
    setDestination(next);
    if (isAnalytical(next)) setAnalytical(next);
  };

  // Every outcome goes through one transition (load-state.ts), so what the
  // screen keeps, drops or says is the same thing the suite proves.
  const apply = (transition: Transition): void => {
    setLoad(transition.load);
    setNotice(transition.notice);
    if (transition.resetContext) {
      // The default context at every launch and at every load (r003 §6.1);
      // no context at all when nothing usable is held.
      setContext(transition.load.kind === 'loaded' ? defaultContext(transition.load.snapshot) : null);
      setSort(DEFAULT_SORT);
      setSelection(null);
      setFixedSelection(null);
    }
  };

  // The launch read: the active copy, revalidated, or nothing (r003 §6.2).
  useEffect(() => {
    let cancelled = false;
    void window.ayqAnalyses.activeSnapshot().then(active => {
      if (cancelled) return;
      if (active.status === 'loaded') apply(applyLoadOutcome({ kind: 'pending' }, active));
      else if (active.status === 'invalid') {
        setLoad({ kind: 'activeRefused', reason: active.reason, identity: active.identity });
      } else setLoad({ kind: 'none' });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const openSnapshot = async (): Promise<void> => {
    const result: SnapshotLoadResult = await window.ayqAnalyses.openSnapshot();
    apply(applyLoadOutcome(load, result));
  };

  const removeSnapshot = async (): Promise<void> => {
    apply(applyRemovalOutcome(load, await window.ayqAnalyses.removeSnapshot()));
  };

  const snapshot = load.kind === 'loaded' ? load.snapshot : null;

  useEffect(() => {
    if (selection === null && fixedSelection === null) return;
    const close = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        setSelection(null);
        setFixedSelection(null);
      }
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [selection, fixedSelection]);

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

  const settingsSnapshot: SettingsSnapshot =
    load.kind === 'loaded'
      ? { kind: 'loaded', snapshot: load.snapshot, identity: load.identity }
      : load.kind === 'activeRefused'
        ? { kind: 'refused', identity: load.identity }
        : { kind: 'none' };

  let body: JSX.Element | null;
  if (load.kind === 'pending') {
    body = null;
  } else if (destination === 'settings') {
    body = (
      <SettingsView active={settingsSnapshot} onLoad={() => void openSnapshot()} onRemove={() => void removeSnapshot()} />
    );
  } else if (!isImplemented(destination)) {
    body = <NotInThisVersion destination={destination} />;
  } else if (load.kind === 'none') {
    body = <NoData onLoad={() => void openSnapshot()} />;
  } else if (load.kind === 'candidateRefused' || load.kind === 'activeRefused') {
    body = <InvalidSnapshot reason={load.reason} onLoad={() => void openSnapshot()} />;
  } else if (destination === 'fixedCosts') {
    const evidence = fixedSelection !== null ? transactionEvidence(load.snapshot, fixedSelection.transactionKey) : null;
    body = (
      <div className="explore-body">
        <FixedCosts
          snapshot={load.snapshot}
          onShowTransaction={shown => setFixedSelection({ transactionKey: shown.transactionKey, title: shown.recordName })}
        />
        {fixedSelection !== null && evidence !== null && (
          <DetailPane
            result={evidence.result}
            selection={{ kind: 'transaction', title: fixedSelection.title, contribution: evidence.contribution }}
            onClose={() => setFixedSelection(null)}
          />
        )}
      </div>
    );
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
      <Rail destination={destination} analytical={analytical} onSelect={select} />
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
      <NoticeDialog notice={notice} onClose={() => setNotice(null)} />
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
