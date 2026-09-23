// Settings → Data & Backup → Analytical snapshot (02 §7.8–§7.16; 03 §13).
//
// One button, and what it came to. Pressing it is the only way a snapshot is
// ever made: nothing exports on a timer, on import or on quitting. The owner
// chooses where it goes in the host's save dialog; this screen never sees a
// path until the file is written, and never names one to anybody. The engine
// assembles, validates and writes the file all or nothing, so a failure here
// always leaves the previous snapshot as it was — and the screen says so.
//
// AYQ works the same whether or not a snapshot was ever made.

import { useState } from 'react';
import type { ReactNode } from 'react';

import { makeStyles } from '@fluentui/react-components';

import { ayqAsk } from '../ayq-bridge.ts';
import type { AyqSnapshotExported } from '../ayq-ipc-contract.ts';
import { ayqText } from '../ayq-strings.ts';
import { AYQ_METRIC } from '../ayq-tokens.ts';
import { AyqButton } from '../ayq-ui/ayq-button.tsx';
import { AyqPane } from '../ayq-ui/ayq-pane.tsx';

import { AyqSettingBody, AyqSettingRow } from './ayq-settings.tsx';

const useStyles = makeStyles({
  said: {
    margin: '0',
    padding: `${AYQ_METRIC.space.wide}px ${AYQ_METRIC.panePadding}px`,
    color: 'var(--ayq-ink-quiet)',
    fontSize: 'var(--ayq-size-small)',
    overflowWrap: 'anywhere',
  },
});

/** What the screen last said about an export. */
type Said =
  | { outcome: 'done'; text: string; path: string; transactions: number }
  | { outcome: 'cancelled' | 'failed'; text: string };

export function AyqSettingsSnapshot(): ReactNode {
  const styles = useStyles();
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<Said | null>(null);

  const exportNow = (): void => {
    setBusy(true);
    setSaid(null);
    void (async () => {
      const answered = await ayqAsk({ kind: 'snapshot.export' });
      setBusy(false);
      if (!answered.ok) {
        // Already the catalogue's sentence for the engine's code (04 A24).
        setSaid({ outcome: 'failed', text: answered.message });
        return;
      }
      const done = answered.result as AyqSnapshotExported;
      if (done.outcome === 'cancelled') {
        setSaid({ outcome: 'cancelled', text: ayqText('snapshot.cancelled') });
        return;
      }
      setSaid({
        outcome: 'done',
        text: ayqText('snapshot.done', { file: done.path }),
        path: done.path,
        transactions: done.transactions,
      });
    })();
  };

  return (
    <AyqPane mark="snapshot" title={ayqText('snapshot.pane')}>
      <AyqSettingBody>
        <AyqSettingRow
          mark="snapshot-export"
          name={ayqText('snapshot.name')}
          note={ayqText('snapshot.note')}
        >
          <AyqButton mark="snapshot-export" disabled={busy} onClick={exportNow}>
            {busy ? ayqText('snapshot.working') : ayqText('snapshot.action')}
          </AyqButton>
        </AyqSettingRow>
      </AyqSettingBody>
      {said === null ? null : (
        <p
          className={styles.said}
          data-ayq-snapshot-said={said.outcome}
          data-ayq-snapshot-path={
            said.outcome === 'done' ? said.path : undefined
          }
          data-ayq-snapshot-transactions={
            said.outcome === 'done' ? String(said.transactions) : undefined
          }
          aria-live="polite"
        >
          {said.text}
        </p>
      )}
    </AyqPane>
  );
}
