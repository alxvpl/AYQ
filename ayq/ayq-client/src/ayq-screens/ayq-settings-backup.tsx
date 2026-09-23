// Settings → Data & Backup (04 A38; 03 §12; 02 §5.8).
//
// Four things and no more: **Create backup now**, when the last backup was made
// and whether the last attempt failed, whether automatic backups are running,
// and **Restore backup** for any backup in the history.
// Beside them, and separate from them, the analytical snapshot export
// (ayq-settings-snapshot.tsx): a file for AYQ Analyses, not a backup.
//
// A backup is one thing on this screen, never two. There is no control that
// restores the budget alone or AYQ's records alone, and nothing here could
// offer one: the contract names a backup by an opaque id and the engine does
// every part of the work (02 §5.8). This screen asks, and says what happened.
//
// Every sentence comes from the catalogue (04 A24), including the reason a
// backup was refused — the engine answers with a code, never with prose.

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import { makeStyles } from '@fluentui/react-components';

import { ayqAsk } from '../ayq-bridge.ts';
import type {
  AyqBackupAttempt,
  AyqBackupCreated,
  AyqBackupEntry,
  AyqBackupOverview,
  AyqRestored,
} from '../ayq-ipc-contract.ts';
import { ayqMegabytes, ayqMoment, ayqText } from '../ayq-strings.ts';
import type { AyqStringKey } from '../ayq-strings.ts';
import { AYQ_METRIC } from '../ayq-tokens.ts';
import { AyqButton } from '../ayq-ui/ayq-button.tsx';
import { AyqPane } from '../ayq-ui/ayq-pane.tsx';
import { AyqStateChip } from '../ayq-ui/ayq-state-chip.tsx';
import { AyqTable } from '../ayq-ui/ayq-table.tsx';
import type { AyqColumn } from '../ayq-ui/ayq-table.tsx';

import { AyqSettingBody, AyqSettingRow } from './ayq-settings.tsx';
import { AyqSettingsSnapshot } from './ayq-settings-snapshot.tsx';

const useStyles = makeStyles({
  stack: {
    display: 'flex',
    flexDirection: 'column',
    gap: `${AYQ_METRIC.splitGap}px`,
  },
  said: {
    margin: '0',
    padding: `${AYQ_METRIC.space.wide}px ${AYQ_METRIC.panePadding}px`,
    color: 'var(--ayq-ink-quiet)',
    fontSize: 'var(--ayq-size-small)',
  },
  confirm: {
    display: 'flex',
    alignItems: 'center',
    gap: `${AYQ_METRIC.space.medium}px`,
    padding: `${AYQ_METRIC.space.wide}px ${AYQ_METRIC.panePadding}px`,
    flexWrap: 'wrap',
  },
  confirmText: { flex: '1 1 320px', margin: '0', color: 'var(--ayq-ink)' },
  kind: {
    display: 'flex',
    gap: `${AYQ_METRIC.space.medium}px`,
    alignItems: 'center',
  },
});

/** What the screen last said, and whether it was good news. */
type Said = { text: string; outcome: 'done' | 'refused' | 'failed' };

const KIND: Record<AyqBackupEntry['trigger'], AyqStringKey> = {
  manual: 'backup.kind.manual',
  automatic: 'backup.kind.automatic',
  'before-restore': 'backup.kind.before-restore',
};

function failureWords(attempt: AyqBackupAttempt): string {
  return attempt.failure === null
    ? ''
    : ayqText(`backup.failure.${attempt.failure}`);
}

export function AyqSettingsBackup({
  onFailure,
  onChanged,
}: {
  onFailure(message: string): void;
  /** A restore changes everything the shell shows. */
  onChanged(): void;
}): ReactNode {
  const styles = useStyles();
  const [overview, setOverview] = useState<AyqBackupOverview | null>(null);
  const [busy, setBusy] = useState<'backup' | 'restore' | null>(null);
  const [asking, setAsking] = useState<AyqBackupEntry | null>(null);
  const [said, setSaid] = useState<Said | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      const answered = await ayqAsk({ kind: 'backup.overview' });
      if (!answered.ok) throw new Error(answered.message);
      if (live) setOverview(answered.result as AyqBackupOverview);
    })().catch((error: unknown) => {
      if (live) {
        onFailure(error instanceof Error ? error.message : String(error));
      }
    });
    return () => {
      live = false;
    };
  }, [onFailure]);

  const backUpNow = (): void => {
    setBusy('backup');
    setSaid(null);
    void (async () => {
      const answered = await ayqAsk({ kind: 'backup.create' });
      setBusy(null);
      if (!answered.ok) {
        onFailure(answered.message);
        return;
      }
      const made = answered.result as AyqBackupCreated;
      setOverview(made.overview);
      setSaid(
        made.outcome === 'created'
          ? { text: ayqText('backup.created'), outcome: 'done' }
          : {
              text: ayqText('backup.failed', {
                why: ayqText(`backup.failure.${made.failure}`),
              }),
              outcome: 'failed',
            },
      );
    })();
  };

  const restore = (entry: AyqBackupEntry): void => {
    setAsking(null);
    setBusy('restore');
    setSaid(null);
    void (async () => {
      const answered = await ayqAsk({
        kind: 'backup.restore',
        backupId: entry.backupId,
      });
      setBusy(null);
      if (!answered.ok) {
        onFailure(answered.message);
        return;
      }
      const done = answered.result as AyqRestored;
      setOverview(done.overview);
      if (done.outcome === 'restored') {
        setSaid({
          text: ayqText('backup.restored', {
            when: ayqMoment(entry.createdAt),
          }),
          outcome: 'done',
        });
        // Everything the window shows came from the state that was replaced.
        onChanged();
      } else if (done.outcome === 'refused') {
        setSaid({
          text: ayqText('backup.refused', {
            why: ayqText(`backup.refusal.${done.refusal}`),
          }),
          outcome: 'refused',
        });
      } else {
        setSaid({
          text: ayqText('backup.restoreFailed', {
            why: ayqText(`backup.failure.${done.failure}`),
          }),
          outcome: 'failed',
        });
      }
    })();
  };

  if (overview === null) {
    return <p className={styles.said}>{ayqText('common.loading')}</p>;
  }

  const latest = overview.backups.find(
    one => one.backupId === overview.latestBackupId,
  );
  const last = overview.lastAttempt;
  const automatic = overview.lastAutomaticAttempt;

  const columns: AyqColumn<AyqBackupEntry>[] = [
    {
      id: 'created',
      header: ayqText('backup.column.created'),
      cell: one => ayqMoment(one.createdAt),
    },
    {
      id: 'kind',
      header: ayqText('backup.column.kind'),
      cell: one => (
        <span className={styles.kind}>
          {ayqText(KIND[one.trigger])}
          {one.backupId === overview.latestBackupId ? (
            <AyqStateChip
              state="neutral"
              label={ayqText('backup.latestMark')}
            />
          ) : null}
        </span>
      ),
    },
    {
      id: 'build',
      header: ayqText('backup.column.build'),
      cell: one =>
        ayqText('backup.build', {
          version: one.productVersion,
          build: one.buildNumber,
        }),
    },
    {
      id: 'size',
      header: ayqText('backup.column.size'),
      figures: true,
      cell: one => ayqMegabytes(one.bytes),
    },
    {
      id: 'restore',
      header: '',
      cell: one =>
        one.restorable ? (
          <AyqButton
            mark="backup-restore"
            disabled={busy !== null}
            onClick={() => {
              setSaid(null);
              setAsking(one);
            }}
          >
            {ayqText('backup.restore')}
          </AyqButton>
        ) : (
          <AyqStateChip
            state="overdue"
            label={ayqText('backup.notRestorable')}
          />
        ),
    },
  ];

  return (
    <div className={styles.stack} data-ayq-backup-screen="">
      <AyqPane mark="backup" title={ayqText('backup.pane')}>
        <AyqSettingBody>
          <AyqSettingRow
            mark="backup-now"
            name={
              latest === undefined
                ? ayqText('backup.latest.none')
                : ayqText('backup.latest', {
                    when: ayqMoment(latest.createdAt),
                  })
            }
            note={ayqText('backup.now.note')}
          >
            {last !== null &&
            last.outcome === 'failed' &&
            last.trigger !== 'automatic' ? (
              <AyqStateChip
                state="overdue"
                wrap
                label={ayqText('backup.lastFailed', {
                  when: ayqMoment(last.at),
                  why: failureWords(last),
                })}
              />
            ) : null}
            <AyqButton
              filled
              mark="backup-now"
              disabled={busy !== null}
              onClick={backUpNow}
            >
              {busy === 'backup'
                ? ayqText('backup.now.working')
                : ayqText('backup.now')}
            </AyqButton>
          </AyqSettingRow>
          <AyqSettingRow
            mark="backup-automatic"
            name={ayqText('backup.automatic')}
            note={ayqText('backup.automatic.note', {
              hours: overview.automatic.everyHours,
              kept: overview.automatic.kept,
            })}
          >
            {automatic === null ? (
              <AyqStateChip
                state="neutral"
                label={ayqText('backup.automatic.never')}
              />
            ) : automatic.outcome === 'failed' ? (
              <AyqStateChip
                state="overdue"
                wrap
                label={ayqText('backup.automatic.failed', {
                  when: ayqMoment(automatic.at),
                  why: failureWords(automatic),
                })}
              />
            ) : (
              <AyqStateChip
                state="operational"
                ok
                wrap
                label={ayqText('backup.automatic.ok', {
                  when: ayqMoment(automatic.at),
                })}
              />
            )}
          </AyqSettingRow>
        </AyqSettingBody>
        {said === null ? null : (
          <p
            className={styles.said}
            data-ayq-backup-said={said.outcome}
            aria-live="polite"
          >
            {said.text}
          </p>
        )}
      </AyqPane>

      <AyqSettingsSnapshot />

      <AyqPane
        mark="backup-history"
        title={ayqText('backup.history')}
        note={ayqText('backup.history.note')}
      >
        {asking === null ? null : (
          <div
            className={styles.confirm}
            data-ayq-backup-confirm={asking.backupId}
          >
            <p className={styles.confirmText}>
              {ayqText('backup.restore.confirm', {
                when: ayqMoment(asking.createdAt),
              })}
            </p>
            <AyqButton
              filled
              mark="backup-restore-go"
              onClick={() => restore(asking)}
            >
              {ayqText('backup.restore.go')}
            </AyqButton>
            <AyqButton
              mark="backup-restore-cancel"
              onClick={() => setAsking(null)}
            >
              {ayqText('backup.restore.cancel')}
            </AyqButton>
          </div>
        )}
        {busy === 'restore' ? (
          <p className={styles.said} aria-live="polite">
            {ayqText('backup.restore.working')}
          </p>
        ) : null}
        <AyqTable
          mark="backups"
          columns={columns}
          rows={overview.backups}
          keyOf={one => one.backupId}
          empty={ayqText('backup.empty')}
        />
      </AyqPane>
    </div>
  );
}
