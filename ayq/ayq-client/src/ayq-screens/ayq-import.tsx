// Import (04 A20).
//
// The button, what the last import did, and every statement AYQ has read. The
// renderer touches no file: the host opens the picker and answers with a path,
// and the engine reads it (02 §3.1).

import { makeStyles } from '@fluentui/react-components';
import { useCallback, useState, type ReactNode } from 'react';

import { ayqAsk } from '../ayq-bridge.ts';
import type { AyqImportSummary } from '../ayq-ipc-contract.ts';
import { ayqCount, ayqText } from '../ayq-strings.ts';
import { AYQ_METRIC } from '../ayq-tokens.ts';
import { AyqButton } from '../ayq-ui/ayq-button.tsx';
import { AyqLegacyScreen } from '../ayq-ui/ayq-legacy-screen.tsx';
import { AyqPane } from '../ayq-ui/ayq-pane.tsx';

const useStyles = makeStyles({
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: `${AYQ_METRIC.space.wide}px`,
    flexWrap: 'wrap',
  },
  said: { color: 'var(--ayq-ink-quiet)', fontSize: 'var(--ayq-size-small)' },
  history: { padding: `0 ${AYQ_METRIC.space.screen}px ${AYQ_METRIC.space.wide}px` },
});

/**
 * Publishes what the import did where the acceptance run can read it.
 *
 * A packaged application writes nothing to a console, so this attribute is the
 * only way a run can tell an import that worked from one that was cancelled.
 */
function mark(
  state: 'working' | 'done' | 'cancelled' | 'error',
  summary?: AyqImportSummary,
): void {
  document.body.dataset.ayqImportState = state;
  if (summary) document.body.dataset.ayqImportSummary = JSON.stringify(summary);
}

export function AyqImportScreen({
  onImported,
  onFailure,
}: {
  onImported(): void;
  onFailure(message: string): void;
}): ReactNode {
  const styles = useStyles();
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const [round, setRound] = useState(0);

  const run = useCallback(async (): Promise<void> => {
    setBusy(true);
    mark('working');
    setSaid(ayqText('import.waiting'));
    try {
      const picked = await ayqAsk({ kind: 'import.pick' });
      if (!picked.ok) throw new Error(picked.message);
      const paths = (picked.result as { paths: string[] }).paths;
      if (paths.length === 0) {
        setSaid(ayqText('import.cancelled'));
        mark('cancelled');
        return;
      }

      setSaid(
        paths.length === 1
          ? ayqText('import.reading')
          : ayqText('import.readingMany', { count: ayqCount(paths.length) }),
      );
      const done = await ayqAsk({ kind: 'import.camt', paths });
      if (!done.ok) throw new Error(done.message);
      const summary = done.result as AyqImportSummary;

      const parts = [
        ayqText('import.outcome', {
          file: summary.file,
          imported: ayqCount(summary.imported),
          duplicates: ayqCount(summary.duplicates),
          account: summary.accountName,
        }),
      ];
      if (summary.categorised > 0) {
        parts.push(
          ayqText('import.categorised', { count: ayqCount(summary.categorised) }),
        );
      }
      if (summary.skipped > 0) {
        parts.push(ayqText('import.skipped', { count: ayqCount(summary.skipped) }));
      }
      for (const problem of summary.problems) {
        parts.push(`${problem.name} — ${problem.reason}`);
      }
      setSaid(parts.join(' · '));
      setRound(one => one + 1);
      onImported();
      mark('done', summary);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSaid(null);
      onFailure(ayqText('import.failed', { reason: message }));
      mark('error');
    } finally {
      setBusy(false);
    }
  }, [onImported, onFailure]);

  return (
    <>
      <AyqPane mark="import">
        <div
          className={styles.actions}
          style={{ padding: `${AYQ_METRIC.space.screen}px` }}
        >
          <AyqButton
            filled
            mark="import"
            disabled={busy}
            onClick={() => void run()}
          >
            {ayqText('import.action')}
          </AyqButton>
          {said === null ? null : <span className={styles.said}>{said}</span>}
        </div>
      </AyqPane>

      <AyqPane title={ayqText('import.history')} mark="import-history">
        <div className={styles.history}>
          <AyqLegacyScreen key={round} view="imports" onFailure={onFailure} />
        </div>
      </AyqPane>
    </>
  );
}
