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
  AyqLedgerFilter,
  AyqSummary,
} from './ayq-ipc-contract.ts';
import {
  ayqLegacyState,
  ayqOnOpenRegister,
  type AyqLegacyView,
} from './ayq-legacy-views.ts';
import { AyqImportScreen } from './ayq-screens/ayq-import.tsx';
import { AyqNotBuilt } from './ayq-screens/ayq-not-built.tsx';
import {
  AYQ_SETTINGS_TABS,
  AyqSettingsScreen,
  type AyqSettingsTab,
} from './ayq-screens/ayq-settings.tsx';
import { ayqText } from './ayq-strings.ts';
import { AYQ_METRIC } from './ayq-tokens.ts';
import { AyqLegacyScreen } from './ayq-ui/ayq-legacy-screen.tsx';
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

/** The legacy renderer a destination still uses, where it still uses one. */
const LEGACY: Partial<Record<AyqDestination, AyqLegacyView>> = {
  register: 'register',
  upcoming: 'upcoming',
  plan: 'plan',
  review: 'counterparties',
};

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
  const [drawn, setDrawn] = useState(0);
  const [damagedTold, setDamagedTold] = useState('');

  const reload = useCallback(() => setRound(one => one + 1), []);
  // A screen that has finished drawing has changed what the window is holding,
  // and the attributes below are read off that.
  const redrew = useCallback(() => setDrawn(one => one + 1), []);
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
      setNotice(null);
    })().catch((error: unknown) => {
      if (!live) return;
      const said = error instanceof Error ? error.message : String(error);
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
    setNotice(
      'AYQ could not read what it had kept beside this budget, so its rules ' +
        'and the record of where each name came from are gone. Your ' +
        `transactions are untouched. The unreadable file was kept as ${damaged}.`,
    );
  }, [status, damagedTold]);

  // The attributes the acceptance runs read, set from the answers. `drawn` is
  // in the dependencies so that a screen finishing its own load republishes
  // them: the row count belongs to the Register, and the Register is one
  // screen among nine.
  useEffect(() => {
    document.body.dataset.ayqState =
      failure !== null ? 'error' : status !== null ? 'ready' : '';
    if (status) document.body.dataset.ayqEngineHost = status.engineHost;
    document.body.dataset.ayqLedgerTotal = String(summary?.transactionCount ?? 0);
    document.body.dataset.ayqLedgerRows = String(
      ayqLegacyState.transactions.ledger?.rows.length ?? 0,
    );
  }, [status, summary, failure, drawn]);

  // A screen asking for the Register on something is asking the shell to move.
  useEffect(() => {
    ayqOnOpenRegister((filter: AyqLedgerFilter) => {
      ayqLegacyState.transactions.filter = filter;
      setDestination('register');
      reload();
    });
  }, [reload]);

  const settingsTabs = useMemo(
    () =>
      AYQ_SETTINGS_TABS.map(one => ({ id: one.id, label: ayqText(one.key) })),
    [],
  );

  const legacy = LEGACY[destination];
  let body: ReactNode;
  if (destination === 'import') {
    body = <AyqImportScreen onImported={reload} onFailure={say} />;
  } else if (destination === 'settings') {
    body = <AyqSettingsScreen tab={settingsTab} onFailure={say} />;
  } else if (destination === 'review') {
    body = (
      <>
        <AyqNotBuilt what={ayqText('notBuilt.review')} />
        <AyqLegacyScreen
          key={`review-${round}`}
          view="counterparties"
          onFailure={say}
          onLoaded={redrew}
        />
      </>
    );
  } else if (legacy !== undefined) {
    body = (
      <AyqLegacyScreen
        key={`${legacy}-${round}`}
        view={legacy}
        onFailure={say}
        onLoaded={redrew}
      />
    );
  } else if (destination === 'today') {
    body = <AyqNotBuilt what={ayqText('notBuilt.today')} />;
  } else if (destination === 'accounts') {
    body = <AyqNotBuilt what={ayqText('notBuilt.accounts')} />;
  } else {
    body = <AyqNotBuilt what={ayqText('notBuilt.reports')} />;
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
