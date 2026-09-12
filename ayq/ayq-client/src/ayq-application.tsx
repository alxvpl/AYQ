// The application: the rail, the screen, and the status bar (04 A20).
//
// It owns two things and nothing else — which destination is open, and what is
// true of the window as a whole (the engine's status, the summary, whatever
// went wrong). Every screen owns its own reading and its own drawing.
//
// The attributes the acceptance runs read are published from here, after the
// answers rather than before them: a screen that says it is ready before the
// engine has spoken is a screen that can pass a test it failed.

import { makeStyles } from '@fluentui/react-components';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { ayqAsk } from './ayq-bridge.ts';
import {
  AYQ_DESTINATION_BLURB,
  AYQ_DESTINATION_LABEL,
  AYQ_FIRST_DESTINATION,
  type AyqDestination,
} from './ayq-destinations.ts';
import type {
  AyqEngineStatus,
  AyqLedger,
  AyqLedgerFilter,
  AyqSummary,
} from './ayq-ipc-contract.ts';
import { AyqAccountsScreen } from './ayq-screens/ayq-accounts.tsx';
import { AyqPlanScreen } from './ayq-screens/ayq-plan.tsx';
import { AyqReportsScreen } from './ayq-screens/ayq-reports.tsx';
import { AyqReviewScreen } from './ayq-screens/ayq-review.tsx';
import { AyqTodayScreen } from './ayq-screens/ayq-today.tsx';
import { AyqUpcomingScreen } from './ayq-screens/ayq-upcoming.tsx';
import { AyqImportScreen } from './ayq-screens/ayq-import.tsx';
import { AyqRegisterScreen } from './ayq-screens/ayq-register.tsx';
import {
  AYQ_SETTINGS_TABS,
  AyqSettingsScreen,
  type AyqSettingsTab,
} from './ayq-screens/ayq-settings.tsx';
import { ayqText } from './ayq-strings.ts';
import { AYQ_METRIC } from './ayq-tokens.ts';
import { AyqNotice } from './ayq-ui/ayq-notice.tsx';
import { AyqRail } from './ayq-ui/ayq-rail.tsx';
import { AyqScreen } from './ayq-ui/ayq-screen.tsx';
import { AyqStatusBar } from './ayq-ui/ayq-status-bar.tsx';

const useStyles = makeStyles({
  window: {
    height: '100%',
    display: 'grid',
    gridTemplateColumns: `${AYQ_METRIC.railWidth}px minmax(0, 1fr)`,
    gridTemplateRows: `minmax(0, 1fr) var(--ayq-status-height)`,
    backgroundColor: 'var(--ayq-ground)',
    overflow: 'hidden',
  },
  middle: {
    gridColumn: '2',
    display: 'flex',
    flexDirection: 'column',
    minHeight: '0',
    minWidth: '0',
  },
});

export function AyqApplication(): ReactNode {
  const styles = useStyles();
  const [destination, setDestination] = useState<AyqDestination>(
    AYQ_FIRST_DESTINATION,
  );
  const [settingsTab, setSettingsTab] = useState<AyqSettingsTab>('appearance');
  const [status, setStatus] = useState<AyqEngineStatus | null>(null);
  const [summary, setSummary] = useState<AyqSummary | null>(null);
  // Two different things, and conflating them would be a defect rather than an
  // untidiness. `failure` is the shell's own read of the budget failing, which
  // is the window not working; `notice` is whatever is being said to the
  // person, which includes that but also an import that would not read and a
  // store that was lost — neither of which stops the window working.
  const [failure, setFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  const [damagedTold, setDamagedTold] = useState('');
  // The Register's filter lives here, not in the Register: arriving at it from
  // a counterparty is the shell moving a person somewhere, and the filter is
  // what it moved them to.
  const [filter, setFilter] = useState<AyqLedgerFilter>({});
  const [rowsShown, setRowsShown] = useState(0);
  /** What the Register's own answer said the budget holds; null until it has. */
  const [ledgerTotal, setLedgerTotal] = useState<number | null>(null);

  const reload = useCallback(() => setRound(one => one + 1), []);
  /** The last thing the shell's own read failed with, so it can be taken down. */
  const lastFailure = useRef<string | null>(null);
  // A screen that has finished drawing has changed what the window is holding,
  // and the attributes below are read off that.
  const say = useCallback((message: string) => setNotice(message), []);

  // What is true of the window, whichever screen is open.
  useEffect(() => {
    let live = true;
    void (async () => {
      const answered = await ayqAsk({ kind: 'engine.status' });
      if (!answered.ok) throw new Error(answered.message);
      const counted = await ayqAsk({ kind: 'summary' });
      if (!counted.ok) throw new Error(counted.message);
      if (!live) return;
      setStatus(answered.result as AyqEngineStatus);
      setSummary(counted.result as AyqSummary);
      setFailure(null);
      // Only the shell's own failure is taken down, and only because it is no
      // longer true. What is on screen may be something else entirely — a store
      // AYQ could not read, or what a screen has just said — and this used to
      // clear all of it, on every reload. Since the rail reloads on every move,
      // a person who clicked anything lost a message they had not dismissed.
      setNotice(current => (current === lastFailure.current ? null : current));
      lastFailure.current = null;
    })().catch((error: unknown) => {
      if (!live) return;
      const said = error instanceof Error ? error.message : String(error);
      lastFailure.current = said;
      setFailure(said);
      setNotice(said);
    });
    return () => {
      live = false;
    };
  }, [round]);

  // Losing what AYQ kept beside the budget is not a reason to refuse to open,
  // but it is a reason to say so. Once per launch, and dismissible.
  useEffect(() => {
    const damaged = status?.storeDamaged ?? null;
    if (damaged === null || damaged === damagedTold) return;
    setDamagedTold(damaged);
    // Said, not failed: the transactions are Actual's and are all there.
    setNotice(ayqText('store.damaged', { file: damaged }));
  }, [status, damagedTold]);

  // The attributes the acceptance runs read, set from the answers. The row
  // count is in the dependencies so that a screen finishing its own load
  // republishes them: that count belongs to the Register, and the Register is
  // one screen among nine.
  useEffect(() => {
    document.body.dataset.ayqState =
      failure !== null ? 'error' : status !== null ? 'ready' : '';
    if (status) document.body.dataset.ayqEngineHost = status.engineHost;
    document.body.dataset.ayqLedgerTotal = String(
      ledgerTotal ?? summary?.transactionCount ?? 0,
    );
    document.body.dataset.ayqLedgerRows = String(rowsShown);
  }, [status, summary, failure, rowsShown, ledgerTotal]);

  // What the Register drew, published for the acceptance runs. Held as state
  // rather than read out of a module, because the shell finishes reading
  // before the Register does and a value published once would be a stale one.
  //
  // The total is the *Register's* own, not the status bar's. They are the same
  // number, but they arrive at different moments: the Register now draws faster
  // than the summary behind the status bar comes back, so a run that read the
  // summary's figure read a zero for as long as that took and concluded the
  // budget was empty.
  const ledgerLoaded = useCallback((ledger: AyqLedger) => {
    setRowsShown(ledger.rows.length);
    setLedgerTotal(ledger.total);
  }, []);

  const settingsTabs = useMemo(
    () =>
      AYQ_SETTINGS_TABS.map(one => ({ id: one.id, label: ayqText(one.key) })),
    [],
  );

  // No screen is keyed on the shell's reload count. A screen that is remounted
  // loses what it was in the middle of saying — "7 filed, 2 left as they were"
  // went out with the remount — and every screen here reads the engine again by
  // itself when its own work changes something. The reload count belongs to the
  // status bar, which is the shell's.
  let body: ReactNode;
  if (destination === 'register') {
    body = (
      <AyqRegisterScreen
        accounts={summary?.accounts ?? []}
        filter={filter}
        onFilter={setFilter}
        onShowTheRule={() => {
          setDestination('settings');
          setSettingsTab('rules');
        }}
        onFailure={say}
        onLoaded={ledgerLoaded}
      />
    );
  } else if (destination === 'import') {
    body = <AyqImportScreen onImported={reload} onFailure={say} />;
  } else if (destination === 'settings') {
    body = (
      <AyqSettingsScreen
        tab={settingsTab}
        onFailure={say}
        onChanged={reload}
        onOpenAccounts={() => setDestination('accounts')}
      />
    );
  } else if (destination === 'review') {
    body = (
      <AyqReviewScreen
        onFailure={say}
        onOpenRegister={counterpartyKey => {
          setFilter({ counterpartyKey });
          setDestination('register');
        }}
        onChanged={reload}
      />
    );
  } else if (destination === 'accounts') {
    body = <AyqAccountsScreen onFailure={say} round={round} />;
  } else if (destination === 'upcoming') {
    body = (
      <AyqUpcomingScreen
        onFailure={say}
        onNotice={setNotice}
      />
    );
  } else if (destination === 'plan') {
    body = <AyqPlanScreen onFailure={say} />;
  } else if (destination === 'today') {
    body = (
      <AyqTodayScreen
        onFailure={say}
        onOpen={next => {
          setDestination(next);
          reload();
        }}
        round={round}
      />
    );
  } else {
    body = (
      <AyqReportsScreen
        onOpenRegister={() => {
          setFilter({});
          setDestination('register');
        }}
      />
    );
  }

  return (
    <div className={styles.window} data-ayq-window="">
      <AyqRail
        current={destination}
        open={next => {
          setDestination(next);
          reload();
        }}
      />
      <div className={styles.middle}>
        <AyqNotice
          message={notice}
          retry={reload}
          dismiss={() => setNotice(null)}
        />
        <AyqScreen
          name={destination}
          title={ayqText(AYQ_DESTINATION_LABEL[destination])}
          blurb={
            AYQ_DESTINATION_BLURB[destination] === undefined
              ? undefined
              : ayqText(AYQ_DESTINATION_BLURB[destination])
          }
          tabs={destination === 'settings' ? settingsTabs : undefined}
          tab={destination === 'settings' ? settingsTab : undefined}
          onTab={setSettingsTab}
        >
          {body}
        </AyqScreen>
      </div>
      <AyqStatusBar status={status} summary={summary} failure={failure} />
    </div>
  );
}
