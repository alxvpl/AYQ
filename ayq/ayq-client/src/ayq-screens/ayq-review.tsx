// Review (04 A6, A5; 03 §4.1, §3.6): who these payments are, and where they go.
//
// Transitional by design, and the screen says so. What is drawn is the backlog
// of counterparties AYQ has resolved and nobody has filed, largest first — so
// one decision covers the most transactions it can, which is what makes the
// queue shrink rather than a list somebody works through for ever.
//
// The pane carries the two things a person needs to decide: the names the bank
// actually printed, so "AYQ thinks these are one shop" can be checked and
// corrected (03 §3.6), and the transactions themselves.
//
// And then the two decisions, side by side and never one control: filing these
// is a statement about the transactions in front of you; learning a rule is a
// statement about every one that arrives from now on (03 §4.1). AYQ will not
// make the second from the first, and the screen says which is which.

import { Select, makeStyles } from '@fluentui/react-components';
import {
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

import { ayqAsk } from '../ayq-bridge.ts';
import type {
  AyqCategory,
  AyqCounterpartyDetail,
  AyqRequestBody,
  AyqUnfiled,
} from '../ayq-ipc-contract.ts';
import {
  ayqCount,
  ayqDate,
  ayqList,
  ayqMoney,
  ayqText,
} from '../ayq-strings.ts';
import { AYQ_METRIC } from '../ayq-tokens.ts';
import { AyqButton } from '../ayq-ui/ayq-button.tsx';
import { ayqBorderTop } from '../ayq-ui/ayq-css.ts';
import { AyqFigure } from '../ayq-ui/ayq-figure.tsx';
import { AyqPane, AyqSplit } from '../ayq-ui/ayq-pane.tsx';
import { AyqStateChip } from '../ayq-ui/ayq-state-chip.tsx';
import { AyqTable, type AyqColumn } from '../ayq-ui/ayq-table.tsx';

const useStyles = makeStyles({
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: `${AYQ_METRIC.space.wide}px`,
    padding: `13px ${AYQ_METRIC.space.screen}px`,
  },
  note: { margin: '0', color: 'var(--ayq-ink-quiet)' },
  quiet: { color: 'var(--ayq-ink-faint)' },
  label: { color: 'var(--ayq-ink-quiet)', fontSize: 'var(--ayq-size-small)' },
  group: {
    display: 'flex',
    flexDirection: 'column',
    gap: `${AYQ_METRIC.space.small}px`,
  },
  decide: {
    display: 'flex',
    flexDirection: 'column',
    gap: `${AYQ_METRIC.space.medium}px`,
    paddingTop: `${AYQ_METRIC.space.wide}px`,
    ...ayqBorderTop('var(--ayq-line)'),
  },
  inline: {
    display: 'flex',
    gap: `${AYQ_METRIC.space.small}px`,
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  variant: {
    display: 'flex',
    flexDirection: 'column',
    gap: `${AYQ_METRIC.space.hair}px`,
    paddingTop: `${AYQ_METRIC.space.small}px`,
    ...ayqBorderTop('var(--ayq-line)'),
  },
  names: { color: 'var(--ayq-ink-quiet)', fontSize: 'var(--ayq-size-small)' },
  outcome: { color: 'var(--ayq-ink)', margin: '0' },
});

export function AyqReviewScreen({
  onFailure,
  onOpenRegister,
  onChanged,
}: {
  onFailure(message: string): void;
  /** Review does not navigate; it asks the shell to open the Register. */
  onOpenRegister(counterpartyKey: string): void;
  /** Something was filed, so what the shell is holding has moved. */
  onChanged(): void;
}): ReactNode {
  const styles = useStyles();
  const [backlog, setBacklog] = useState<readonly AyqUnfiled[] | null>(null);
  const [categories, setCategories] = useState<readonly AyqCategory[]>([]);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [detail, setDetail] = useState<AyqCounterpartyDetail | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [round, setRound] = useState(0);

  const ask = useCallback(async <T,>(body: AyqRequestBody): Promise<T> => {
    const answer = await ayqAsk(body);
    if (!answer.ok) throw new Error(answer.message);
    return answer.result as T;
  }, []);

  useEffect(() => {
    let live = true;
    void (async () => {
      const [unfiled, filed] = await Promise.all([
        ask<AyqUnfiled[]>({ kind: 'counterparties.unfiled' }),
        ask<AyqCategory[]>({ kind: 'categories.list' }),
      ]);
      if (!live) return;
      setBacklog(unfiled);
      setCategories(filed);
    })().catch((error: unknown) => {
      if (live) onFailure(error instanceof Error ? error.message : String(error));
    });
    return () => {
      live = false;
    };
  }, [round, ask, onFailure]);

  // The pane reads the counterparty it was asked to, and nothing until then.
  useEffect(() => {
    if (openKey === null) {
      setDetail(null);
      return;
    }
    let live = true;
    void (async () => {
      const found = await ask<AyqCounterpartyDetail>({
        kind: 'counterparty.detail',
        key: openKey,
      });
      if (live) setDetail(found);
    })().catch((error: unknown) => {
      if (live) onFailure(error instanceof Error ? error.message : String(error));
    });
    return () => {
      live = false;
    };
  }, [openKey, round, ask, onFailure]);

  const again = useCallback(() => {
    setRound(one => one + 1);
    onChanged();
  }, [onChanged]);

  if (backlog === null) {
    return <p className={styles.note}>{ayqText('common.loading')}</p>;
  }

  const columns: readonly AyqColumn<AyqUnfiled>[] = [
    {
      id: 'name',
      header: ayqText('review.column.name'),
      cell: row => <span data-ayq-cell="name">{row.name}</span>,
    },
    {
      id: 'transactions',
      header: ayqText('review.column.transactions'),
      figures: true,
      cell: row => <span data-ayq-cell="transactions">{ayqCount(row.transactions)}</span>,
    },
    {
      id: 'spent',
      header: ayqText('review.column.spent'),
      figures: true,
      cell: row => (
        <span data-ayq-cell="spent">
          <AyqFigure cents={row.cents} />
        </span>
      ),
    },
    {
      id: 'seen',
      header: ayqText('review.column.seen'),
      cell: row => (
        <span data-ayq-cell="seen" className={styles.quiet}>
          {ayqText('review.seen', {
            first: ayqDate(row.firstDate),
            last: ayqDate(row.lastDate),
          })}
        </span>
      ),
    },
  ];

  return (
    <AyqSplit
      table={
        <AyqPane
          mark="review-backlog"
          title={ayqText('review.backlog')}
          note={ayqCount(backlog.length)}
        >
          <p className={`${styles.note} ${styles.body}`} data-ayq-backlog={String(backlog.length)}>
            {ayqText('review.backlog.note')}
          </p>
          <AyqTable
            mark="review"
            columns={columns}
            rows={backlog}
            keyOf={row => row.key}
            selected={openKey}
            onSelect={row => {
              setOutcome(null);
              setOpenKey(row.key);
            }}
            empty={ayqText('review.backlog.none')}
          />
        </AyqPane>
      }
      detail={
        <AyqReviewPane
          detail={openKey === null ? null : detail}
          categories={categories}
          outcome={outcome}
          onFailure={onFailure}
          onOpenRegister={onOpenRegister}
          onOutcome={setOutcome}
          onOpenKey={setOpenKey}
          onChanged={again}
        />
      }
    />
  );
}

function AyqReviewPane({
  detail,
  categories,
  outcome,
  onFailure,
  onOpenRegister,
  onOutcome,
  onOpenKey,
  onChanged,
}: {
  detail: AyqCounterpartyDetail | null;
  categories: readonly AyqCategory[];
  outcome: string | null;
  onFailure(message: string): void;
  onOpenRegister(counterpartyKey: string): void;
  onOutcome(said: string): void;
  onOpenKey(key: string): void;
  onChanged(): void;
}): ReactNode {
  const styles = useStyles();
  const [categoryId, setCategoryId] = useState('');

  if (detail === null) {
    return (
      <AyqPane mark="review-detail">
        <p className={`${styles.note} ${styles.body}`}>
          {ayqText('review.pane.none')}
        </p>
      </AyqPane>
    );
  }

  const counterparty = detail.counterparty;

  /** Files this counterparty, and says which of the two decisions it was. */
  const file = (createRule: boolean): void => {
    if (categoryId === '') {
      onFailure(ayqText('review.needsCategory'));
      return;
    }
    void (async () => {
      const answer = await ayqAsk({
        kind: 'transaction.categoriseCounterparty',
        counterpartyKey: counterparty.key,
        categoryId,
        createRule,
      });
      if (!answer.ok) throw new Error(answer.message);
      if (answer.kind !== 'transaction.categoriseCounterparty') return;
      const filed = answer.result;
      onOutcome(
        filed.ruleWritten
          ? ayqText('review.learned', { count: ayqCount(filed.categorised) })
          : filed.keptByHand > 0
            ? ayqText('review.filed.kept', {
                count: ayqCount(filed.categorised),
                kept: ayqCount(filed.keptByHand),
              })
            : ayqText('review.filed', { count: ayqCount(filed.categorised) }),
      );
      onChanged();
    })().catch((error: unknown) => {
      onFailure(error instanceof Error ? error.message : String(error));
    });
  };

  /** "This variant is really that counterparty" — an identity decision. */
  const move = (variantKey: string, variant: string, toKey: string): void => {
    void (async () => {
      const answer = await ayqAsk({
        kind: 'alias.create',
        variantKey,
        variant,
        counterpartyKey: toKey,
      });
      if (!answer.ok) throw new Error(answer.message);
      if (answer.kind !== 'alias.create') return;
      onOutcome(
        ayqText('review.moved', {
          count: ayqCount(answer.result.moved),
          name: answer.result.counterpartyName,
        }),
      );
      // The transactions went somewhere; the pane follows them.
      onOpenKey(answer.result.counterpartyKey);
      onChanged();
    })().catch((error: unknown) => {
      onFailure(error instanceof Error ? error.message : String(error));
    });
  };

  return (
    <AyqPane mark="review-detail" title={counterparty.name}>
      <div className={styles.body} data-ayq-counterparty={counterparty.key}>
        <div className={styles.group}>
          <AyqFigure cents={-counterparty.outgoingCents} size="large" />
          <span className={styles.quiet}>
            {ayqText('review.seen', {
              first: ayqDate(counterparty.firstDate),
              last: ayqDate(counterparty.lastDate),
            })}{' '}
            · {ayqCount(counterparty.transactions)}
          </span>
          {detail.recurring === null ? null : (
            <span className={styles.quiet} data-ayq-rhythm={detail.recurring.cadence}>
              {ayqText('review.pane.rhythm', {
                cadence: detail.recurring.cadence,
                amount: ayqMoney(detail.recurring.averageAmountCents),
              })}
            </span>
          )}
        </div>

        {outcome === null ? null : (
          <p className={styles.outcome} data-ayq-outcome="">
            {outcome}
          </p>
        )}

        {/* The two decisions, and which is which said in words. */}
        <div className={styles.decide} data-ayq-file="">
          <span className={styles.label}>{ayqText('review.pane.file')}</span>
          <p className={styles.note}>{ayqText('review.pane.file.note')}</p>
          <Select
            value={categoryId}
            data-ayq-review-category=""
            aria-label={ayqText('review.do.category')}
            onChange={(_event, data) => setCategoryId(data.value)}
          >
            <option value="">{ayqText('review.do.category')}</option>
            {categories
              .filter(one => !one.isIncome)
              .map(one => (
                <option key={one.id} value={one.id}>
                  {one.name}
                </option>
              ))}
          </Select>
          <div className={styles.inline}>
            <AyqButton mark="review-file" onClick={() => file(false)}>
              {ayqText('review.do.file')}
            </AyqButton>
            <AyqButton filled mark="review-learn" onClick={() => file(true)}>
              {ayqText('review.do.learn')}
            </AyqButton>
          </div>
        </div>

        {/* 03 §3.5, §3.6: the evidence the resolver decided on, so that "these
            are one shop" can be checked and corrected rather than trusted. */}
        <div className={styles.decide}>
          <span className={styles.label}>{ayqText('review.pane.evidence')}</span>
          <p className={styles.note}>{ayqText('review.pane.evidence.note')}</p>
          {detail.variants.map(variant => (
            <div
              key={variant.key}
              className={styles.variant}
              data-ayq-variant={variant.key}
            >
              <div className={styles.inline}>
                <span>{variant.key}</span>
                <AyqStateChip
                  state={variant.aliased ? 'confirmed' : 'neutral'}
                  label={
                    variant.aliased
                      ? ayqText('review.pane.byHand')
                      : ayqText('review.pane.byStatement')
                  }
                />
                <span className={styles.quiet}>
                  {ayqCount(variant.transactions)}
                </span>
              </div>
              <span className={styles.names} data-ayq-variant-names="">
                {ayqList(variant.names)}
              </span>
              {detail.variants.length < 2 ? null : (
                <Select
                  data-ayq-variant-move={variant.key}
                  aria-label={ayqText('review.pane.moveTo')}
                  value=""
                  onChange={(_event, data) => {
                    if (data.value === '') return;
                    move(variant.key, variant.names[0] ?? variant.key, data.value);
                  }}
                >
                  <option value="">{ayqText('review.pane.moveTo.none')}</option>
                  {detail.variants
                    .filter(other => other.key !== variant.key)
                    .map(other => (
                      <option key={other.key} value={other.key}>
                        {other.key}
                      </option>
                    ))}
                </Select>
              )}
            </div>
          ))}
        </div>

        <div className={styles.decide}>
          <span className={styles.label}>{ayqText('review.pane.recent')}</span>
          {detail.recent.slice(0, 6).map(row => (
            <div key={row.id} className={styles.inline} data-ayq-recent={row.id}>
              <span className={styles.quiet}>{ayqDate(row.date)}</span>
              <span>{row.payee ?? ''}</span>
              <AyqFigure cents={row.amountCents} />
            </div>
          ))}
          <div className={styles.inline}>
            <AyqButton
              size="small"
              mark="review-register"
              onClick={() => onOpenRegister(counterparty.key)}
            >
              {ayqText('today.open.register')}
            </AyqButton>
          </div>
        </div>
      </div>
    </AyqPane>
  );
}
