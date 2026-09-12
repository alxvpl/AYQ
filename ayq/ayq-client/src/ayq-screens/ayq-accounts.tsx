// Accounts: what each holds, how far its statements reach, and whether AYQ
// agrees with the bank (03 §8, 04 A4).
//
// The whole screen is a comparison and nothing more. A difference is stated and
// left standing — AYQ does not adjust a balance, create a balancing entry or
// reconcile by writing anything into the ledger (§8.3) — and it gates nothing
// (§8.6). Reconciliation state is derived on every read and is not a decision
// (§8.5), so there is nothing here to accept, dismiss or mark as done.

import { makeStyles } from '@fluentui/react-components';
import { useEffect, useMemo, useState, type ReactNode } from 'react';

import { ayqAsk } from '../ayq-bridge.ts';
import type {
  AyqAccountCoverage,
  AyqAccountSummary,
  AyqAccountsView,
} from '../ayq-ipc-contract.ts';
import { ayqCount, ayqDate, ayqMoment, ayqMoney, ayqText } from '../ayq-strings.ts';
import { AYQ_METRIC } from '../ayq-tokens.ts';
import { ayqBorderTop } from '../ayq-ui/ayq-css.ts';
import { AyqFigure } from '../ayq-ui/ayq-figure.tsx';
import { AyqPane, AyqSplit } from '../ayq-ui/ayq-pane.tsx';
import { AyqStateChip } from '../ayq-ui/ayq-state-chip.tsx';
import { AyqTable, type AyqColumn } from '../ayq-ui/ayq-table.tsx';

const useStyles = makeStyles({
  boundary: { color: 'var(--ayq-ink-quiet)', fontSize: 'var(--ayq-size-small)' },
  totals: {
    display: 'flex',
    gap: `${AYQ_METRIC.space.edge}px`,
    color: 'var(--ayq-ink-quiet)',
    flexWrap: 'wrap',
  },
  pane: { padding: `${AYQ_METRIC.space.screen}px` },
  name: {
    margin: '0 0 6px',
    fontFamily: 'var(--ayq-font-display)',
    fontSize: 'var(--ayq-size-heading)',
  },
  field: {
    display: 'grid',
    gridTemplateColumns: '150px minmax(0, 1fr)',
    gap: `${AYQ_METRIC.space.medium}px`,
    padding: `${AYQ_METRIC.space.small}px 0`,
    ...ayqBorderTop('var(--ayq-line)'),
  },
  label: { color: 'var(--ayq-ink-faint)', fontSize: 'var(--ayq-size-small)' },
  note: {
    margin: `${AYQ_METRIC.space.wide}px 0 0`,
    color: 'var(--ayq-ink-quiet)',
    fontSize: 'var(--ayq-size-small)',
  },
  empty: { padding: '34px 18px', textAlign: 'center', color: 'var(--ayq-ink-faint)' },
});

type AyqAccountRow = AyqAccountSummary & { coverage: AyqAccountCoverage };

function Field({ label, children }: { label: string; children: ReactNode }): ReactNode {
  const styles = useStyles();
  return (
    <div className={styles.field}>
      <span className={styles.label}>{label}</span>
      <div>{children}</div>
    </div>
  );
}

function AyqAccountDetail({ row }: { row: AyqAccountRow | null }): ReactNode {
  const styles = useStyles();
  if (row === null) {
    return <div className={styles.empty}>{ayqText('detail.none')}</div>;
  }
  const { coverage } = row;

  return (
    <div className={styles.pane} data-ayq-account-detail={row.id}>
      <h3 className={styles.name}>{row.name}</h3>

      <Field label={ayqText('accounts.detail.counts')}>
        {ayqText(row.countsTowardFunds ? 'accounts.counts.yes' : 'accounts.counts.no')}
      </Field>
      <Field label={ayqText('accounts.detail.ledger')}>
        <AyqFigure cents={coverage.ledgerBalanceCents} withSymbol />
      </Field>

      {coverage.toDate === null ? (
        <p className={styles.note}>{ayqText('accounts.detail.nothing')}</p>
      ) : (
        <>
          <Field label={ayqText('accounts.column.statements')}>
            {ayqDate(coverage.toDate)}
          </Field>
          <Field label={ayqText('accounts.detail.statement')}>
            <AyqFigure cents={coverage.statementBalanceCents ?? 0} withSymbol />
          </Field>
          {coverage.differenceCents === 0 ? null : (
            <Field label={ayqText('accounts.detail.difference')}>
              <span data-ayq-difference={String(coverage.differenceCents)}>
                <AyqFigure cents={coverage.differenceCents ?? 0} withSymbol />
              </span>
            </Field>
          )}
          {coverage.file === null ? null : (
            <Field label={ayqText('accounts.detail.readFrom')}>{coverage.file}</Field>
          )}
          {coverage.readAt === null ? null : (
            <Field label={ayqText('accounts.detail.readAt')}>
              {ayqMoment(coverage.readAt)}
            </Field>
          )}
          <p className={styles.note}>
            {ayqText(
              coverage.agrees === true
                ? 'accounts.detail.agrees'
                : 'accounts.detail.differs',
            )}
          </p>
        </>
      )}
      <p className={styles.note}>{ayqText('accounts.detail.informs')}</p>
    </div>
  );
}

export function AyqAccountsScreen({
  onFailure,
  round,
}: {
  onFailure(message: string): void;
  /** Bumped by the shell when something has changed underneath. */
  round: number;
}): ReactNode {
  const styles = useStyles();
  const [view, setView] = useState<AyqAccountsView | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      const answered = await ayqAsk({ kind: 'accounts.view' });
      if (!answered.ok) throw new Error(answered.message);
      if (live) setView(answered.result as AyqAccountsView);
    })().catch((error: unknown) => {
      if (live) onFailure(error instanceof Error ? error.message : String(error));
    });
    return () => {
      live = false;
    };
  }, [round, onFailure]);

  const rows: AyqAccountRow[] = useMemo(() => {
    if (view === null) return [];
    return view.accounts.map(account => ({
      ...account,
      coverage:
        view.coverage.find(one => one.accountId === account.id) ??
        ({
          accountId: account.id,
          toDate: null,
          statementBalanceCents: null,
          ledgerBalanceCents: account.balanceCents,
          differenceCents: null,
          agrees: null,
          file: null,
          readAt: null,
        } satisfies AyqAccountCoverage),
    }));
  }, [view]);

  const columns: readonly AyqColumn<AyqAccountRow>[] = useMemo(
    () => [
      {
        id: 'name',
        header: ayqText('accounts.column.name'),
        cell: row => row.name,
      },
      {
        id: 'counts',
        header: ayqText('accounts.column.counts'),
        cell: row =>
          ayqText(
            row.countsTowardFunds ? 'accounts.counts.yes' : 'accounts.counts.no',
          ),
      },
      {
        id: 'statements',
        header: ayqText('accounts.column.statements'),
        cell: row =>
          row.coverage.toDate === null
            ? ayqText('accounts.statements.none')
            : ayqDate(row.coverage.toDate),
      },
      {
        id: 'balance',
        header: ayqText('accounts.column.balance'),
        figures: true,
        cell: row => <AyqFigure cents={row.balanceCents} />,
      },
      {
        id: 'agrees',
        header: ayqText('accounts.column.agrees'),
        cell: row =>
          row.coverage.agrees === null ? (
            <AyqStateChip
              state="neutral"
              label={ayqText('accounts.agrees.unknown')}
            />
          ) : row.coverage.agrees ? (
            <AyqStateChip
              state="confirmed"
              label={ayqText('accounts.agrees.yes')}
            />
          ) : (
            <AyqStateChip
              state="overdue"
              label={ayqText('accounts.agrees.no', {
                amount: ayqMoney(Math.abs(row.coverage.differenceCents ?? 0)),
              })}
            />
          ),
      },
    ],
    [],
  );

  const open = rows.find(row => row.id === openId) ?? null;
  const counted = rows.filter(row => row.countsTowardFunds).length;

  return (
    <>
      <p className={styles.boundary} data-ayq-reliable-to={view?.reliableTo ?? ''}>
        {view === null
          ? ayqText('common.loading')
          : view.reliableTo === null
            ? ayqText('accounts.reliableUnknown')
            : ayqText('accounts.reliableTo', { date: ayqDate(view.reliableTo) })}
      </p>

      <AyqSplit
        table={
          <AyqPane mark="accounts">
            <AyqTable
              mark="accounts"
              columns={columns}
              rows={rows}
              keyOf={row => row.id}
              selected={openId}
              onSelect={row => setOpenId(row.id)}
              empty={ayqText('accounts.empty')}
              footer={
                view === null ? null : (
                  <span className={styles.totals} data-ayq-account-totals="">
                    <span>
                      {ayqText('accounts.footer.available', {
                        counted: ayqCount(counted),
                        total: ayqCount(rows.length),
                      })}{' '}
                      <AyqFigure cents={view.availableFundsCents} withSymbol />
                    </span>
                    <span>
                      {ayqText('accounts.footer.held')}{' '}
                      <AyqFigure cents={view.totalBalanceCents} withSymbol />
                    </span>
                  </span>
                )
              }
            />
          </AyqPane>
        }
        detail={
          <AyqPane mark="accounts-detail">
            <AyqAccountDetail row={open} />
          </AyqPane>
        }
      />
    </>
  );
}
