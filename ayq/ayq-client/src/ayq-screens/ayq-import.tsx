// Import (04 A20).
//
// The button, what the last import did, and every statement AYQ has read. The
// renderer touches no file: the host opens the picker and answers with a path,
// and the engine reads it (02 §3.1).

import { makeStyles } from '@fluentui/react-components';
import { useCallback, useEffect, useState, type ReactNode } from 'react';

import { ayqAsk } from '../ayq-bridge.ts';
import type { AyqAccountSummary, AyqImportSummary } from '../ayq-ipc-contract.ts';
import { ayqImportProblemText } from '../ayq-reasons.ts';
import { ayqCount, ayqDate, ayqMoment, ayqText } from '../ayq-strings.ts';
import { AYQ_METRIC, AYQ_TYPE } from '../ayq-tokens.ts';
import { AyqButton } from '../ayq-ui/ayq-button.tsx';
import { ayqBorder } from '../ayq-ui/ayq-css.ts';
import { AyqPane } from '../ayq-ui/ayq-pane.tsx';
import { AyqScreenActions } from '../ayq-ui/ayq-screen.tsx';
import { AyqStateChip } from '../ayq-ui/ayq-state-chip.tsx';
import { AyqTable, type AyqColumn } from '../ayq-ui/ayq-table.tsx';
import { AyqBalanceForm } from './ayq-balance-form.tsx';
import { AyqImportHistory } from './ayq-import-history.tsx';

const useStyles = makeStyles({
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: `${AYQ_METRIC.space.wide}px`,
    flexWrap: 'wrap',
  },
  said: { color: 'var(--ayq-ink-quiet)', fontSize: 'var(--ayq-size-small)' },
  history: {},
  quiet: { color: 'var(--ayq-ink-faint)', fontSize: 'var(--ayq-size-small)' },
  // Template r003's info bar: a glyph, a title and a note, the action at the right.
  info: {
    display: 'flex',
    gap: `${AYQ_METRIC.space.wide}px`,
    alignItems: 'center',
    padding: `${AYQ_METRIC.space.wide}px ${AYQ_METRIC.panePadding}px`,
    backgroundColor: 'var(--ayq-quiet)',
    ...ayqBorder('var(--ayq-line)'),
    borderRadius: 'var(--ayq-radius-medium)',
  },
  glyph: {
    width: '26px',
    height: '26px',
    flex: 'none',
    display: 'grid',
    placeItems: 'center',
    borderRadius: 'var(--ayq-radius-small)',
    backgroundColor: 'var(--ayq-pane)',
    ...ayqBorder('var(--ayq-line)'),
    fontFamily: 'var(--ayq-font-mono)',
    fontWeight: AYQ_TYPE.weight.bold,
    color: 'var(--ayq-ink-quiet)',
  },
  infoText: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    flexGrow: 1,
    fontSize: 'var(--ayq-size-small)',
    color: 'var(--ayq-ink-quiet)',
  },
  infoTitle: {
    fontSize: 'var(--ayq-size-body)',
    fontWeight: AYQ_TYPE.weight.semibold,
    color: 'var(--ayq-ink)',
  },
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
  onOpenAccount,
}: {
  onImported(): void;
  onFailure(message: string): void;
  /** Opens one account's detail, where a balance is set. */
  onOpenAccount?(accountId: string): void;
}): ReactNode {
  const styles = useStyles();
  const [busy, setBusy] = useState(false);

  const [said, setSaid] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  const [accounts, setAccounts] = useState<readonly AyqAccountSummary[]>([]);
  /** The account the last import left without a balance, if it left one. */
  const [wanted, setWanted] = useState<{
    accountId: string;
    accountName: string;
    importId: string;
    coverageDate: string;
  } | null>(null);

  // Import freshness by account (template r003): what each account's imports
  // reach, read afresh after every import.
  useEffect(() => {
    let live = true;
    void (async () => {
      const listed = await ayqAsk({ kind: 'accounts.list' });
      if (!listed.ok) throw new Error(listed.message);
      if (live) setAccounts(listed.result as AyqAccountSummary[]);
    })().catch((error: unknown) => {
      if (live) onFailure(error instanceof Error ? error.message : String(error));
    });
    return () => {
      live = false;
    };
  }, [round, onFailure]);

  const freshness: readonly AyqColumn<AyqAccountSummary>[] = [
    {
      id: 'account',
      header: ayqText('accounts.column.name'),
      cell: account => account.name,
    },
    {
      id: 'lastImport',
      header: ayqText('accounts.detail.lastImport'),
      cell: account =>
        account.lastImportAt === null
          ? ayqText('accounts.detail.lastImport.never')
          : ayqMoment(account.lastImportAt),
    },
    {
      id: 'bankThrough',
      header: ayqText('accounts.detail.bankThrough'),
      cell: account =>
        account.bankDataThrough === null
          ? ayqText('accounts.detail.bankThrough.none')
          : ayqDate(account.bankDataThrough),
    },
    {
      id: 'coverage',
      header: ayqText('accounts.detail.statements'),
      cell: account =>
        account.bankDataThrough === null ? (
          <span className={styles.quiet}>{ayqText('accounts.statements.none')}</span>
        ) : (
          <AyqStateChip
            state="operational"
            ok
            label={ayqText('import.coverage.through', {
              date: ayqDate(account.bankDataThrough),
            })}
          />
        ),
    },
    {
      id: 'anchor',
      header: ayqText('import.column.anchor'),
      cell: account =>
        account.anchor === null ? (
          <AyqStateChip state="operational" label={ayqText('import.anchor.none')} />
        ) : (
          ayqDate(account.anchor.coverageDate)
        ),
    },
  ];
  const unanchored = accounts.filter(account => account.anchor === null);

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
        parts.push(ayqImportProblemText(problem));
      }
      setSaid(parts.join(' · '));
      setRound(one => one + 1);
      onImported();
      mark('done', summary);

      // §4.4: the files carried no balance from the bank and this account has
      // none from before, so AYQ cannot say what it holds. Asking is the only
      // honest option — and the import has already succeeded, so skipping the
      // question costs nothing but the balance staying Unknown.
      if (summary.balanceWanted) {
        setWanted({
          accountId: summary.accountId,
          accountName: summary.accountName,
          importId: summary.id,
          coverageDate: summary.anchoredAt ?? new Date().toISOString().slice(0, 10),
        });
      }
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
      <AyqScreenActions>
        {said === null ? null : <span className={styles.said}>{said}</span>}
        <AyqButton
          filled
          mark="import"
          disabled={busy}
          onClick={() => void run()}
        >
          {ayqText('import.action')}
        </AyqButton>
      </AyqScreenActions>

      <AyqPane mark="import-freshness" title={ayqText('import.freshness')}>
        <AyqTable
          mark="import-freshness"
          columns={freshness}
          rows={accounts}
          keyOf={account => account.id}
          empty={ayqText('accounts.empty')}
        />
      </AyqPane>

      {unanchored.map(account => (
        <div key={account.id} className={styles.info} data-ayq-import-unanchored={account.id}>
          <span className={styles.glyph} aria-hidden="true">
            {ayqText('upcoming.match.glyph')}
          </span>
          <span className={styles.infoText}>
            <span className={styles.infoTitle}>
              {ayqText('import.anchor.missing', { account: account.name })}
            </span>
            <span>{ayqText('import.anchor.missing.note')}</span>
          </span>
          {onOpenAccount === undefined ? null : (
            <AyqButton
              mark={`import-set-balance-${account.id}`}
              onClick={() => onOpenAccount(account.id)}
            >
              {ayqText('today.account.setBalance')}
            </AyqButton>
          )}
        </div>
      ))}

      {wanted === null ? null : (
      <AyqPane mark="import">
        {(
          <AyqBalanceForm
            title={ayqText('balance.set.title')}
            accountName={wanted.accountName}
            coverageDate={wanted.coverageDate}
            note={ayqText('balance.wanted')}
            cancelLabel={ayqText('balance.skip')}
            onCancel={() => setWanted(null)}
            onSubmit={(amountCents, coverageDate) => {
              const account = wanted;
              setWanted(null);
              void (async () => {
                const answered = await ayqAsk({
                  kind: 'accounts.setBalance',
                  accountId: account.accountId,
                  amountCents,
                  coverageDate,
                  importId: account.importId,
                });
                if (!answered.ok) throw new Error(answered.message);
                onImported();
              })().catch((error: unknown) => {
                onFailure(
                  error instanceof Error ? error.message : String(error),
                );
              });
            }}
          />
        )}
      </AyqPane>
      )}

      <AyqPane
        title={ayqText('import.history')}
        mark="import-history"
        actions={<span className={styles.quiet}>{ayqText('import.history.note')}</span>}
      >
        <div className={styles.history}>
          <AyqImportHistory round={round} onFailure={onFailure} />
        </div>
      </AyqPane>
    </>
  );
}
