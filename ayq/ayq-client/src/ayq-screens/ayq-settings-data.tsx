// Settings › Data: what AYQ writes out.
//
// One action — the analytical snapshot for AYQ Analyses (03 §13) — and it is
// an explicit act every time: the owner asks, chooses the file, and AYQ writes
// it there. The renderer touches no file: the host opens the save dialog and
// answers with a path, and the engine builds, validates and writes (02 §3.1).
// Nothing leaves the computer; there is no destination but a local path.

import { makeStyles } from '@fluentui/react-components';
import { useState, type ReactNode } from 'react';

import { ayqAsk } from '../ayq-bridge.ts';
import type { AyqSnapshotExport, AyqSnapshotTarget } from '../ayq-ipc-contract.ts';
import { ayqCount, ayqText } from '../ayq-strings.ts';
import { AYQ_METRIC } from '../ayq-tokens.ts';
import { AyqButton } from '../ayq-ui/ayq-button.tsx';
import { AyqPane } from '../ayq-ui/ayq-pane.tsx';

const useStyles = makeStyles({
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: `${AYQ_METRIC.space.medium}px`,
    padding: `${AYQ_METRIC.space.screen}px`,
    maxWidth: '74ch',
  },
  blurb: { color: 'var(--ayq-ink-quiet)' },
  note: { color: 'var(--ayq-ink-faint)', fontSize: 'var(--ayq-size-small)' },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: `${AYQ_METRIC.space.wide}px`,
    flexWrap: 'wrap',
  },
  said: {
    color: 'var(--ayq-ink-quiet)',
    fontSize: 'var(--ayq-size-small)',
    overflowWrap: 'anywhere',
  },
});

/**
 * The calendar date here, not the UTC one: after 02:00 the UTC date is still
 * yesterday's, and a file named for yesterday is a file nobody finds.
 */
export function ayqLocalDate(now: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * Publishes what the export did where the acceptance run can read it — the
 * same device as the import screen, and for the same reason: a packaged
 * application writes nothing to a console. The summary is counts and a path;
 * no figure from the money is in it.
 */
function mark(
  state: 'working' | 'done' | 'cancelled' | 'error',
  summary?: AyqSnapshotExport,
): void {
  document.body.dataset.ayqSnapshotState = state;
  if (summary) document.body.dataset.ayqSnapshotSummary = JSON.stringify(summary);
}

export function AyqSettingsData({
  onFailure,
}: {
  onFailure(message: string): void;
}): ReactNode {
  const styles = useStyles();
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);

  const run = async (): Promise<void> => {
    setBusy(true);
    mark('working');
    setSaid(ayqText('snapshot.waiting'));
    try {
      const suggestedName = ayqText('snapshot.suggestedName', {
        date: ayqLocalDate(new Date()),
      });
      const target = await ayqAsk({ kind: 'snapshot.pickTarget', suggestedName });
      if (!target.ok) throw new Error(target.message);
      const path = (target.result as AyqSnapshotTarget).path;
      if (path === null) {
        setSaid(ayqText('snapshot.cancelled'));
        mark('cancelled');
        return;
      }

      setSaid(ayqText('snapshot.writing'));
      const done = await ayqAsk({ kind: 'snapshot.export', path });
      if (!done.ok) throw new Error(done.message);
      const summary = done.result as AyqSnapshotExport;
      setSaid(
        ayqText('snapshot.done', {
          accounts: ayqCount(summary.accounts),
          transactions: ayqCount(summary.transactions),
          counterparties: ayqCount(summary.counterparties),
          path: summary.path,
        }),
      );
      mark('done', summary);
    } catch (error) {
      // Said in both places: the shell's banner, and here beside the button,
      // where a success would have been stated — so a failure is never a
      // blank where "Written:" was expected.
      const message = error instanceof Error ? error.message : String(error);
      setSaid(ayqText('snapshot.failed', { reason: message }));
      onFailure(ayqText('snapshot.failed', { reason: message }));
      mark('error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AyqPane title={ayqText('snapshot.title')} mark="snapshot">
      <div className={styles.body}>
        <p className={styles.blurb}>{ayqText('snapshot.blurb')}</p>
        <p className={styles.note}>{ayqText('snapshot.note')}</p>
        <div className={styles.actions}>
          <AyqButton
            filled
            mark="snapshot-export"
            disabled={busy}
            onClick={() => void run()}
          >
            {ayqText('snapshot.action')}
          </AyqButton>
          {said === null ? null : (
            <span className={styles.said} data-ayq-snapshot="said">
              {said}
            </span>
          )}
        </div>
      </div>
    </AyqPane>
  );
}
