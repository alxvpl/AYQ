// One account, in detail: what it holds, where that figure came from, how
// fresh it is, and whether AYQ agrees with the bank (03 §8, 04 A4, 7 §7.3).
//
// This is a **secondary surface**, not a workspace. 7 §7.1 takes Accounts off
// the rail: an account is not somewhere a person goes, it is something they
// look at when Today raises a question about it, so Today opens this for one
// account and this offers a way back. Configuring an account — including
// whether it counts toward available funds — is a different act and stays at
// Settings → Accounts.
//
// Reconciliation is a comparison and nothing more. A difference is stated and
// left standing — AYQ does not adjust a balance, create a balancing entry or
// reconcile by writing anything into the ledger (§8.3) — and it gates nothing
// (§8.6). It is derived on every read and is not a decision (§8.5), so there is
// nothing here to accept, dismiss or mark as done.
//
// The two things that *are* decisions live here: setting a balance the bank
// never stated, and correcting one that is wrong (§4.4, §4.5). Both add an
// anchor and keep every earlier one.

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
import { AyqButton } from '../ayq-ui/ayq-button.tsx';
import { ayqBorderTop } from '../ayq-ui/ayq-css.ts';
import { AyqBalanceForm } from './ayq-balance-form.tsx';
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

function AyqAccountDetail({
  row,
  onAnchor,
}: {
  row: AyqAccountRow | null;
  onAnchor(row: AyqAccountRow): void;
}): ReactNode {
  const styles = useStyles();
  if (row === null) {
    return <div className={styles.empty}>{ayqText('detail.none')}</div>;
  }
  const { coverage } = row;

  return (
    <div className={styles.pane} data-ayq-account-detail={row.id}>
      <h3 className={styles.name}>{row.name}</h3>

      <Field label={ayqText('accounts.detail.balance')}>
        <span
          data-ayq-detail-balance={
            row.balanceCents === null ? 'unknown' : String(row.balanceCents)
          }
        >
          <AyqFigure cents={row.balanceCents} withSymbol />
        </span>
      </Field>

      {/* Where the figure came from, always — a balance with no stated source
          is a balance nobody can check. */}
      {row.anchor === null ? (
        <p className={styles.note} data-ayq-no-anchor="">
          {ayqText('accounts.detail.anchor.none')}
        </p>
      ) : (
        <Field label={ayqText('accounts.detail.anchor')}>
          <span data-ayq-anchor-source={row.anchor.source}>
            {ayqText(
              row.anchor.source === 'bank'
                ? 'accounts.detail.anchor.bank'
                : 'accounts.detail.anchor.manual',
              { date: ayqDate(row.anchor.coverageDate) },
            )}
          </span>
        </Field>
      )}

      {/* The two freshness facts, apart, because they are two facts (§6). */}
      <Field label={ayqText('accounts.detail.lastImport')}>
        <span data-ayq-detail-last-import={row.lastImportAt ?? ''}>
          {row.lastImportAt === null
            ? ayqText('accounts.detail.lastImport.never')
            : ayqMoment(row.lastImportAt)}
        </span>
      </Field>
      <Field label={ayqText('accounts.detail.bankThrough')}>
        <span data-ayq-detail-bank-through={row.bankDataThrough ?? ''}>
          {row.bankDataThrough === null
            ? ayqText('accounts.detail.bankThrough.none')
            : ayqDate(row.bankDataThrough)}
        </span>
      </Field>

      {/* Reconciliation, and only where the bank stated a figure to reconcile
          against (§5). */}
      {row.reconciliation === null ? (
        <p className={styles.note}>{ayqText('accounts.detail.nothing')}</p>
      ) : (
        <>
          <Field label={ayqText('accounts.detail.statement')}>
            <AyqFigure
              cents={row.reconciliation.statementBalanceCents}
              withSymbol
            />
          </Field>
          <Field label={ayqText('accounts.detail.ledger')}>
            <AyqFigure cents={row.reconciliation.ledgerBalanceCents} withSymbol />
          </Field>
          {row.reconciliation.agrees ? null : (
            <Field label={ayqText('accounts.detail.difference')}>
              <span
                data-ayq-difference={String(row.reconciliation.differenceCents)}
              >
                <AyqFigure
                  cents={row.reconciliation.differenceCents}
                  withSymbol
                />
              </span>
            </Field>
          )}
          {row.reconciliation.file === null ? null : (
            <Field label={ayqText('accounts.detail.readFrom')}>
              {row.reconciliation.file}
            </Field>
          )}
          <Field label={ayqText('accounts.detail.readAt')}>
            {ayqMoment(row.reconciliation.readAt)}
          </Field>
          <p className={styles.note}>
            {ayqText(
              row.reconciliation.agrees
                ? 'accounts.detail.agrees'
                : 'accounts.detail.differs',
            )}
          </p>
        </>
      )}

      {/* Every anchor this account has ever had. A correction adds; it never
          writes over what was there (§4.5). */}
      {row.anchorHistory.length <= 1 ? null : (
        <Field label={ayqText('accounts.detail.anchorHistory')}>
          <span data-ayq-anchor-history={String(row.anchorHistory.length)}>
            {row.anchorHistory
              .slice(1)
              .map(one => `${ayqDate(one.coverageDate)}`)
              .join(', ')}
          </span>
        </Field>
      )}

      <p className={styles.note}>
        <AyqButton size="small" mark="account-anchor" onClick={() => onAnchor(row)}>
          {ayqText(
            row.anchor === null
              ? 'balance.set.title'
              : 'balance.reanchor.title',
          )}
        </AyqButton>
      </p>

      <p className={styles.note}>{ayqText('accounts.detail.informs')}</p>
      <p className={styles.note}>{ayqText('accounts.detail.configure')}</p>
    </div>
  );
}

export function AyqAccountsScreen({
  onFailure,
  round,
  accountId = null,
  onChanged,
  onBack,
}: {
  onFailure(message: string): void;
  /** Bumped by the shell when something has changed underneath. */
  round: number;
  /** The account Today opened, when it opened one. */
  accountId?: string | null;
  onChanged?(): void;
  onBack?(): void;
}): ReactNode {
  const styles = useStyles();
  const [view, setView] = useState<AyqAccountsView | null>(null);
  const [openId, setOpenId] = useState<string | null>(accountId);
  /** The account whose balance is being set or corrected, if any. */
  const [anchoring, setAnchoring] = useState<AyqAccountRow | null>(null);

  // Today opening one account is the same act as selecting it here, so the
  // selection follows what was asked for rather than being a second state that
  // can disagree with it.
  useEffect(() => {
    if (accountId !== null) setOpenId(accountId);
  }, [accountId]);

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
            {anchoring === null ? (
              <AyqAccountDetail row={open} onAnchor={setAnchoring} />
            ) : (
              <AyqBalanceForm
                title={ayqText(
                  anchoring.anchor === null
                    ? 'balance.set.title'
                    : 'balance.reanchor.title',
                )}
                accountName={anchoring.name}
                coverageDate={
                  anchoring.anchor?.coverageDate ??
                  anchoring.bankDataThrough ??
                  new Date().toISOString().slice(0, 10)
                }
                note={
                  anchoring.anchor === null
                    ? null
                    : ayqText('balance.reanchor')
                }
                cancelLabel={ayqText('balance.cancel')}
                onCancel={() => setAnchoring(null)}
                onSubmit={(amountCents, coverageDate) => {
                  const account = anchoring;
                  setAnchoring(null);
                  void (async () => {
                    const answered = await ayqAsk(
                      account.anchor === null
                        ? {
                            kind: 'accounts.setBalance',
                            accountId: account.id,
                            amountCents,
                            coverageDate,
                          }
                        : {
                            kind: 'accounts.reanchor',
                            accountId: account.id,
                            amountCents,
                            coverageDate,
                          },
                    );
                    if (!answered.ok) throw new Error(answered.message);
                    setView(answered.result as AyqAccountsView);
                    onChanged?.();
                  })().catch((error: unknown) => {
                    onFailure(
                      error instanceof Error ? error.message : String(error),
                    );
                  });
                }}
              />
            )}
          </AyqPane>
        }
      />

      {onBack === undefined ? null : (
        <p className={styles.boundary}>
          <AyqButton size="small" mark="accounts-back" onClick={onBack}>
            {ayqText('accounts.back')}
          </AyqButton>
        </p>
      )}
    </>
  );
}
