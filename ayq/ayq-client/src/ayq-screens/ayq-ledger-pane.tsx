// A table of transactions with the detail pane beside it (04 A3, A4).
//
// The Register is this with a filter bar and totals over it; Today is this
// with a short filter and no bar. One piece, because "the same detail pane"
// has to mean the same one — a second copy would be a second place for the
// evidence, the provenance and the actions to drift apart.

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { ayqAsk } from '../ayq-bridge.ts';
import type {
  AyqCategory,
  AyqCounterparty,
  AyqLedger,
  AyqLedgerFilter,
  AyqLedgerRow,
  AyqTransactionDetail,
} from '../ayq-ipc-contract.ts';
import { ayqDate, ayqText } from '../ayq-strings.ts';
import { AyqFigure } from '../ayq-ui/ayq-figure.tsx';
import { AyqPane, AyqSplit } from '../ayq-ui/ayq-pane.tsx';
import { AyqStateChip } from '../ayq-ui/ayq-state-chip.tsx';
import { AyqTable, type AyqColumn } from '../ayq-ui/ayq-table.tsx';
import { AyqTransactionDetailPane } from './ayq-transaction-detail.tsx';

export function AyqLedgerPane({
  filter,
  mark,
  title,
  note,
  actions,
  footer,
  empty,
  onFailure,
  onShowTheRule,
  onLoaded,
  reloadToken,
}: {
  filter: AyqLedgerFilter;
  mark: string;
  title?: string;
  note?: string;
  actions?: ReactNode;
  /** Built by the caller from the ledger it was handed. */
  footer?: ReactNode;
  empty: ReactNode;
  onFailure(message: string): void;
  onShowTheRule(): void;
  onLoaded(ledger: AyqLedger): void;
  /** Changed by the caller to make this read the engine again. */
  reloadToken?: number;
}): ReactNode {
  const [ledger, setLedger] = useState<AyqLedger | null>(null);
  const [categories, setCategories] = useState<readonly AyqCategory[]>([]);
  const [counterparties, setCounterparties] = useState<
    readonly AyqCounterparty[] | null
  >(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AyqTransactionDetail | null>(null);
  const [round, setRound] = useState(0);

  const reload = useCallback(() => setRound(one => one + 1), []);

  // How long the table took, from asking to being on the screen. Published
  // rather than timed from outside: what a person feels is the whole of it,
  // and a stopwatch held by the acceptance run sees only the last of it.
  useEffect(() => {
    let live = true;
    const startedAt = performance.now();
    void (async () => {
      const listed = await ayqAsk({ kind: 'transactions.list', filter });
      if (!listed.ok) throw new Error(listed.message);
      const filed = await ayqAsk({ kind: 'categories.list' });
      if (!filed.ok) throw new Error(filed.message);
      if (!live) return;
      setLedger(listed.result as AyqLedger);
      setCategories(filed.result as AyqCategory[]);
      onLoaded(listed.result as AyqLedger);
      requestAnimationFrame(() => {
        document.body.dataset.ayqRegisterMs = String(
          Math.round(performance.now() - startedAt),
        );
      });
    })().catch((error: unknown) => {
      if (live) onFailure(error instanceof Error ? error.message : String(error));
    });
    return () => {
      live = false;
    };
  }, [filter, round, reloadToken, onFailure, onLoaded]);

  useEffect(() => {
    if (openId === null) {
      setDetail(null);
      return;
    }
    let live = true;
    void (async () => {
      const answered = await ayqAsk({
        kind: 'transaction.detail',
        transactionId: openId,
      });
      if (!answered.ok) throw new Error(answered.message);
      if (live) setDetail(answered.result as AyqTransactionDetail);
    })().catch((error: unknown) => {
      if (live) onFailure(error instanceof Error ? error.message : String(error));
    });
    return () => {
      live = false;
    };
  }, [openId, round, onFailure]);

  // A different question deserves its first row, not the one that was open.
  useEffect(() => setOpenId(null), [filter]);

  const columns: readonly AyqColumn<AyqLedgerRow>[] = useMemo(
    () => [
      {
        id: 'date',
        header: ayqText('register.column.date'),
        cell: row => ayqDate(row.date),
      },
      {
        id: 'payee',
        header: ayqText('register.column.counterparty'),
        cell: row => row.payee ?? '',
      },
      {
        id: 'category',
        header: ayqText('register.column.category'),
        cell: row =>
          row.category === null ? (
            <AyqStateChip
              state="uncategorised"
              label={ayqText('register.category.none')}
            />
          ) : (
            row.category
          ),
      },
      {
        id: 'account',
        header: ayqText('register.column.account'),
        cell: row => row.account,
      },
      {
        id: 'amount',
        header: ayqText('register.column.amount'),
        figures: true,
        cell: row => <AyqFigure cents={row.amountCents} />,
      },
    ],
    [],
  );

  return (
    <AyqSplit
      table={
        <AyqPane mark={mark} title={title} note={note} actions={actions}>
          <AyqTable
            mark={mark}
            columns={columns}
            rows={ledger?.rows ?? []}
            keyOf={row => row.id}
            selected={openId}
            onSelect={row => setOpenId(row.id)}
            empty={empty}
            footer={footer}
          />
        </AyqPane>
      }
      detail={
        <AyqPane mark={`${mark}-detail`}>
          <AyqTransactionDetailPane
            detail={detail}
            categories={categories}
            counterparties={counterparties}
            onCategory={categoryId => {
              void (async () => {
                if (openId === null) return;
                const done = await ayqAsk({
                  kind: 'transaction.categorise',
                  transactionId: openId,
                  categoryId,
                });
                if (!done.ok) {
                  onFailure(done.message);
                  return;
                }
                reload();
              })();
            }}
            onNeedCounterparties={() => {
              if (counterparties !== null) return;
              void (async () => {
                const listed = await ayqAsk({ kind: 'counterparties.list' });
                if (!listed.ok) {
                  onFailure(listed.message);
                  return;
                }
                setCounterparties(
                  (listed.result as { rows: AyqCounterparty[] }).rows,
                );
              })();
            }}
            onCorrectCounterparty={counterpartyKey => {
              const variantKey = detail?.provenance?.counterpartyKey ?? null;
              const variant =
                detail?.provenance?.counterpartyName ??
                detail?.importedPayee ??
                null;
              if (variantKey === null || variant === null) return;
              void (async () => {
                const done = await ayqAsk({
                  kind: 'alias.create',
                  variantKey,
                  variant,
                  counterpartyKey,
                });
                if (!done.ok) {
                  onFailure(done.message);
                  return;
                }
                reload();
              })();
            }}
            onShowTheRule={onShowTheRule}
          />
        </AyqPane>
      }
    />
  );
}
