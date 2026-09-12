// Upcoming (03 §7.2, 04 A3, A4): what is coming, and what it does to the money.
//
// The table is the *forecast*, not the record list. That is the decision the
// rest of the screen follows from: the forecast is the one place the running
// position, the overdue flag and 03 §7.10's "larger of, never the sum" are
// worked out, so drawing anything else here would be a second arithmetic that
// could disagree with Today's counts and with the Plan sheet. Records are read
// beside it, in the pane, where they are edited.
//
// A row that is a record can be acted on and a row that is the unaccounted part
// of a category's plan (§7.11) cannot — and the pane says which it is rather
// than offering buttons that would do nothing.
//
// Every action names what it reaches. 03 §7.17 is the reason: a single payment
// has a date and not a rhythm, no action over it may reach beyond itself, and an
// overdue occurrence of a series never cancels the next one. So dismissing and
// moving are occurrence-scoped, ending a series is a separate action, and each
// is labelled with its scope in words.

import { Input, Select, makeStyles } from '@fluentui/react-components';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { ayqAsk } from '../ayq-bridge.ts';
import type {
  AyqCategory,
  AyqForecast,
  AyqMatchProposal,
  AyqMatches,
  AyqPlan,
  AyqPlanDraft,
  AyqPlanFrequency,
  AyqPlanOccurrence,
  AyqPlannedRecord,
  AyqRequestBody,
} from '../ayq-ipc-contract.ts';
import {
  ayqCount,
  ayqDate,
  ayqList,
  ayqMoney,
  ayqText,
  type AyqStringKey,
} from '../ayq-strings.ts';
import { AYQ_METRIC } from '../ayq-tokens.ts';
import { AyqButton } from '../ayq-ui/ayq-button.tsx';
import { ayqBorder, ayqBorderTop } from '../ayq-ui/ayq-css.ts';
import { AyqFigure } from '../ayq-ui/ayq-figure.tsx';
import { AyqPane, AyqSplit } from '../ayq-ui/ayq-pane.tsx';
import { AyqStateChip } from '../ayq-ui/ayq-state-chip.tsx';
import { AyqTable, type AyqColumn } from '../ayq-ui/ayq-table.tsx';

const useStyles = makeStyles({
  bar: {
    display: 'flex',
    gap: `${AYQ_METRIC.space.medium}px`,
    alignItems: 'center',
    flexWrap: 'wrap',
    padding: `10px ${AYQ_METRIC.space.wide}px`,
    backgroundColor: 'var(--ayq-pane)',
    ...ayqBorder('var(--ayq-line)'),
    borderRadius: 'var(--ayq-radius-medium)',
  },
  lowest: { marginLeft: 'auto', color: 'var(--ayq-ink-quiet)' },
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: `${AYQ_METRIC.space.wide}px`,
    padding: `13px ${AYQ_METRIC.space.screen}px`,
  },
  note: { margin: '0', color: 'var(--ayq-ink-quiet)' },
  quiet: { color: 'var(--ayq-ink-faint)' },
  group: {
    display: 'flex',
    flexDirection: 'column',
    gap: `${AYQ_METRIC.space.small}px`,
  },
  label: {
    color: 'var(--ayq-ink-quiet)',
    fontSize: 'var(--ayq-size-small)',
  },
  actions: {
    display: 'flex',
    flexDirection: 'column',
    gap: `${AYQ_METRIC.space.small}px`,
    paddingTop: `${AYQ_METRIC.space.wide}px`,
    ...ayqBorderTop('var(--ayq-line)'),
  },
  inline: {
    display: 'flex',
    gap: `${AYQ_METRIC.space.small}px`,
    alignItems: 'flex-end',
    flexWrap: 'wrap',
  },
  scope: {
    color: 'var(--ayq-ink-faint)',
    fontSize: 'var(--ayq-size-small)',
  },
  proposal: {
    display: 'grid',
    gap: `${AYQ_METRIC.space.medium}px`,
    gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) auto',
    alignItems: 'center',
    padding: `10px ${AYQ_METRIC.space.screen}px`,
    ...ayqBorderTop('var(--ayq-line)'),
  },
  evidence: { color: 'var(--ayq-ink-quiet)', fontSize: 'var(--ayq-size-small)' },
});

/** The tone each row state is drawn in. A17: states are their own scale. */
const AYQ_ROW_TONE = {
  expected: 'confirmed',
  overdue: 'overdue',
  suggested: 'suggested',
  plan: 'neutral',
  dismissed: 'neutral',
} as const;

const FREQUENCIES: readonly AyqPlanFrequency[] = [
  'once',
  'weekly',
  'fortnightly',
  'monthly',
  'quarterly',
  'half-yearly',
  'yearly',
];

/** How often, in words, from the catalogue rather than from a component. */
function rhythm(record: AyqPlannedRecord): string {
  if (record.recurrence.frequency === 'once') {
    return ayqText('upcoming.pane.once', { date: ayqDate(record.startDate) });
  }
  const every = ayqText(`frequency.${record.recurrence.frequency}` as AyqStringKey);
  return ayqText('upcoming.pane.every', {
    frequency:
      record.recurrence.interval > 1
        ? `${ayqCount(record.recurrence.interval)} ${every}`
        : every,
  });
}

/** Signed cents, so a table of figures reads as money and not as magnitudes. */
function signed(event: { kind: 'expense' | 'income'; amountCents: number }): number {
  return event.kind === 'income' ? event.amountCents : -event.amountCents;
}

/**
 * One row of the table.
 *
 * The forecast's events, and beside them the occurrences a person has dismissed.
 * The dismissed ones are *not* in the forecast — that is what dismissing does
 * (03 §7.13) — so they carry no position, and the column says so rather than
 * showing a figure that would imply they were counted. They are here because a
 * decision a person cannot see is a decision they cannot undo.
 */
type AyqUpcomingRow = {
  key: string;
  date: string;
  label: string;
  categoryName: string | null;
  /** Signed. */
  amountCents: number;
  /** Where the projection stands after it, or null when it is not in one. */
  balanceCents: number | null;
  state: 'expected' | 'overdue' | 'suggested' | 'plan' | 'dismissed';
  recordId: string | null;
  dueDate: string | null;
};

function rowsOf(forecast: AyqForecast, plan: AyqPlan): AyqUpcomingRow[] {
  const rows: AyqUpcomingRow[] = forecast.events.map(event => ({
    key:
      event.recordId === null
        ? `plan:${event.date}:${event.categoryName ?? ''}:${event.amountCents}`
        : `record:${event.recordId}:${event.dueDate ?? event.date}`,
    date: event.date,
    label: event.label,
    categoryName: event.categoryName,
    amountCents: signed(event),
    balanceCents: event.balanceCents,
    state: event.flagged
      ? 'overdue'
      : event.suggested
        ? 'suggested'
        : event.source === 'plan'
          ? 'plan'
          : 'expected',
    recordId: event.recordId,
    dueDate: event.dueDate,
  }));

  for (const one of plan.occurrences) {
    if (one.state !== 'dismissed') continue;
    rows.push({
      key: `record:${one.recordId}:${one.dueDate}`,
      date: one.effectiveDate,
      label: one.name,
      categoryName: one.categoryName,
      amountCents: signed(one),
      balanceCents: null,
      state: 'dismissed',
      recordId: one.recordId,
      dueDate: one.dueDate,
    });
  }

  // Soonest first. By date only: `sort` is stable, so two things falling on the
  // same day keep the order the forecast put them in rather than being given a
  // second one here that could disagree with it.
  return rows.sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? -1 : 1));
}

export function AyqUpcomingScreen({
  onFailure,
  onNotice,
}: {
  onFailure(message: string): void;
  /** Something the engine did, said in passing rather than as a problem. */
  onNotice(message: string): void;
}): ReactNode {
  const styles = useStyles();
  const [forecast, setForecast] = useState<AyqForecast | null>(null);
  const [plan, setPlan] = useState<AyqPlan | null>(null);
  const [proposals, setProposals] = useState<readonly AyqMatchProposal[]>([]);
  const [categories, setCategories] = useState<readonly AyqCategory[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState<AyqPlanDraft | null>(null);
  const [round, setRound] = useState(0);
  const again = useCallback(() => setRound(one => one + 1), []);

  // One read of the engine per round. The forecast is what the position does and
  // the plan is what the records are: two questions because they answer
  // different halves of the screen, and neither is derived from the other here.
  useEffect(() => {
    let live = true;
    void (async () => {
      const ask = async <T,>(body: AyqRequestBody): Promise<T> => {
        const answer = await ayqAsk(body);
        if (!answer.ok) throw new Error(answer.message);
        return answer.result as T;
      };
      // Matching runs first, because what it applies changes what the forecast
      // then says. 03 §7.16 allows AYQ to apply only the matches nothing about
      // could be in doubt; everything else comes back as an offer and waits.
      const offers = await ask<AyqMatches>({ kind: 'match.propose' });
      const [projection, records, filed] = await Promise.all([
        ask<AyqForecast>({ kind: 'forecast' }),
        ask<AyqPlan>({ kind: 'plan.list' }),
        ask<AyqCategory[]>({ kind: 'categories.list' }),
      ]);
      if (!live) return;
      setProposals(offers.proposals);
      setForecast(projection);
      setPlan(records);
      setCategories(filed);
    })().catch((error: unknown) => {
      if (live) onFailure(error instanceof Error ? error.message : String(error));
    });
    return () => {
      live = false;
    };
  }, [round, onFailure]);

  /** Sends one decision and reads the screen back. Never a silent failure. */
  const decide = useCallback(
    (body: AyqRequestBody, said?: string) => {
      void (async () => {
        const answer = await ayqAsk(body);
        if (!answer.ok) throw new Error(answer.message);
        if (said !== undefined) onNotice(said);
        again();
      })().catch((error: unknown) => {
        onFailure(error instanceof Error ? error.message : String(error));
      });
    },
    [again, onFailure, onNotice],
  );

  const lookForMatches = useCallback(() => {
    void (async () => {
      const answer = await ayqAsk({ kind: 'match.propose' });
      if (!answer.ok) throw new Error(answer.message);
      if (answer.kind !== 'match.propose') return;
      setProposals(answer.result.proposals);
      again();
    })().catch((error: unknown) => {
      onFailure(error instanceof Error ? error.message : String(error));
    });
  }, [again, onFailure]);

  const records = useMemo(
    () => new Map((plan?.records ?? []).map(one => [one.id, one])),
    [plan],
  );
  const occurrences = useMemo(() => {
    const held = new Map<string, AyqPlanOccurrence>();
    for (const one of plan?.occurrences ?? []) {
      held.set(`${one.recordId}:${one.dueDate}`, one);
    }
    return held;
  }, [plan]);

  if (forecast === null || plan === null) {
    return <p className={styles.note}>{ayqText('common.loading')}</p>;
  }

  const columns: readonly AyqColumn<AyqUpcomingRow>[] = [
    {
      id: 'date',
      header: ayqText('upcoming.column.date'),
      cell: row => <span data-ayq-cell="date">{ayqDate(row.date)}</span>,
    },
    {
      id: 'name',
      header: ayqText('upcoming.column.name'),
      cell: row => <span data-ayq-cell="name">{row.label}</span>,
    },
    {
      id: 'category',
      header: ayqText('upcoming.column.category'),
      cell: row => (
        <span data-ayq-cell="category" className={styles.quiet}>
          {row.categoryName ?? ''}
        </span>
      ),
    },
    {
      id: 'amount',
      header: ayqText('upcoming.column.amount'),
      figures: true,
      cell: row => (
        <span data-ayq-cell="amount">
          <AyqFigure cents={row.amountCents} />
        </span>
      ),
    },
    {
      id: 'balance',
      header: ayqText('upcoming.column.balance'),
      figures: true,
      // A dismissed occurrence is not in the projection, so there is no
      // position after it. Said in words rather than drawn as a figure.
      cell: row => (
        <span data-ayq-cell="balance">
          {row.balanceCents === null ? (
            <span className={styles.quiet}>{ayqText('upcoming.notCounted')}</span>
          ) : (
            <AyqFigure cents={row.balanceCents} />
          )}
        </span>
      ),
    },
    {
      id: 'state',
      header: ayqText('upcoming.column.state'),
      cell: row => (
        <span data-ayq-cell="state">
          <AyqStateChip
            state={AYQ_ROW_TONE[row.state]}
            label={ayqText(`upcoming.state.${row.state}` as AyqStringKey)}
          />
        </span>
      ),
    },
  ];

  const rows = rowsOf(forecast, plan);
  const chosen = rows.find(one => one.key === open) ?? null;

  return (
    <>
      <div className={styles.bar} data-ayq-matches={String(proposals.length)}>
        <AyqButton
          filled
          mark="plan-new"
          onClick={() => {
            setOpen(null);
            setDraft({
              name: '',
              kind: 'expense',
              amountCents: 0,
              categoryName: null,
              startDate: forecast.today,
              recurrence: { frequency: 'monthly', interval: 1 },
            });
          }}
        >
          {ayqText('upcoming.new')}
        </AyqButton>
        <AyqButton mark="plan-match" onClick={lookForMatches}>
          {ayqText('upcoming.match')}
        </AyqButton>
        <AyqButton
          mark="plan-suggest"
          onClick={() => decide({ kind: 'plan.suggest' })}
        >
          {ayqText('upcoming.suggest')}
        </AyqButton>
        <span className={styles.lowest} data-ayq-lowest={forecast.lowest.date}>
          {ayqText('upcoming.lowest', {
            amount: ayqMoney(forecast.lowest.balanceCents),
            date: ayqDate(forecast.lowest.date),
          })}
        </span>
      </div>

      {proposals.length === 0 ? null : (
        <AyqPane
          mark="upcoming-matches"
          title={ayqText('upcoming.matches')}
          note={ayqCount(proposals.length)}
        >
          <p className={`${styles.note} ${styles.body}`}>
            {ayqText('upcoming.matches.note')}
          </p>
          {proposals.map(one => (
            <div
              key={`${one.recordId}:${one.dueDate}:${one.transactionId}`}
              className={styles.proposal}
              data-ayq-proposal={`${one.recordId}:${one.dueDate}`}
            >
              <div className={styles.group}>
                <span className={styles.label}>
                  {ayqText('upcoming.matches.expected')}
                </span>
                <span>
                  {one.recordName} · {ayqDate(one.expectedDate)} ·{' '}
                  {ayqMoney(one.expectedAmountCents)}
                </span>
              </div>
              <div className={styles.group}>
                <span className={styles.label}>
                  {ayqText('upcoming.matches.happened')}
                </span>
                <span>
                  {one.transactionPayee ?? ''} · {ayqDate(one.transactionDate)} ·{' '}
                  {ayqMoney(one.transactionAmountCents)}
                </span>
                <span className={styles.evidence} data-ayq-evidence="">
                  {ayqList([
                    ...one.evidence,
                    ayqText('upcoming.matches.apart', {
                      days: ayqCount(one.daysApart),
                    }),
                  ])}
                </span>
              </div>
              <div className={styles.inline}>
                <AyqButton
                  filled
                  size="small"
                  mark="match-apply"
                  onClick={() => {
                    setProposals(kept =>
                      kept.filter(
                        other =>
                          other.transactionId !== one.transactionId ||
                          other.recordId !== one.recordId ||
                          other.dueDate !== one.dueDate,
                      ),
                    );
                    decide({
                      kind: 'match.apply',
                      recordId: one.recordId,
                      dueDate: one.dueDate,
                      transactionId: one.transactionId,
                    });
                  }}
                >
                  {ayqText('upcoming.matches.yes')}
                </AyqButton>
                <AyqButton
                  size="small"
                  mark="match-reject"
                  onClick={() => {
                    setProposals(kept =>
                      kept.filter(
                        other =>
                          other.transactionId !== one.transactionId ||
                          other.recordId !== one.recordId ||
                          other.dueDate !== one.dueDate,
                      ),
                    );
                    decide({
                      kind: 'match.reject',
                      recordId: one.recordId,
                      dueDate: one.dueDate,
                      transactionId: one.transactionId,
                    });
                  }}
                >
                  {ayqText('upcoming.matches.no')}
                </AyqButton>
              </div>
            </div>
          ))}
        </AyqPane>
      )}

      <AyqSplit
        table={
          <AyqPane
            mark="upcoming-forecast"
            title={ayqText('upcoming.title')}
            note={ayqCount(rows.length)}
          >
            <AyqTable
              mark="upcoming"
              columns={columns}
              rows={rows}
              keyOf={row => row.key}
              selected={open}
              onSelect={row => {
                setDraft(null);
                setOpen(row.key);
              }}
              empty={ayqText('upcoming.empty')}
            />
          </AyqPane>
        }
        detail={
          draft !== null ? (
            <AyqRecordForm
              draft={draft}
              categories={categories}
              onChange={setDraft}
              onCancel={() => setDraft(null)}
              onSave={record => {
                setDraft(null);
                decide({ kind: 'plan.save', record });
              }}
              onFailure={onFailure}
            />
          ) : (
            <AyqOccurrencePane
              row={chosen}
              record={
                chosen === null || chosen.recordId === null
                  ? null
                  : records.get(chosen.recordId) ?? null
              }
              occurrence={
                chosen === null || chosen.recordId === null
                  ? null
                  : occurrences.get(`${chosen.recordId}:${chosen.dueDate}`) ?? null
              }
              onEdit={record =>
                setDraft({
                  id: record.id,
                  name: record.name,
                  kind: record.kind,
                  amountCents: record.amountCents,
                  categoryName: record.categoryName,
                  counterpartyKey: record.counterpartyKey,
                  accountId: record.accountId,
                  startDate: record.startDate,
                  recurrence: record.recurrence,
                  endDate: record.endDate,
                  mandateId: record.mandateId,
                })
              }
              onDecide={decide}
            />
          )
        }
      />
    </>
  );
}

/* ------------------------------------------------------------------ the pane

   What is behind one row, and the actions that belong to it. The scope of every
   action is stated beside it, because 03 §7.17 turns on exactly that: an action
   over one occurrence must not reach the series, and a single payment has no
   series for anything to reach.                                             */

function AyqOccurrencePane({
  row,
  record,
  occurrence,
  onEdit,
  onDecide,
}: {
  row: AyqUpcomingRow | null;
  record: AyqPlannedRecord | null;
  occurrence: AyqPlanOccurrence | null;
  onEdit(record: AyqPlannedRecord): void;
  onDecide(body: AyqRequestBody, said?: string): void;
}): ReactNode {
  const styles = useStyles();
  const [moveTo, setMoveTo] = useState('');
  const [endOn, setEndOn] = useState('');

  if (row === null) {
    return (
      <AyqPane mark="upcoming-detail">
        <p className={`${styles.note} ${styles.body}`}>
          {ayqText('upcoming.pane.none')}
        </p>
      </AyqPane>
    );
  }

  // 03 §7.11: the part of a category's plan no record accounts for. It is a
  // figure in the forecast and not a record, so there is nothing to act on, and
  // the pane says that rather than offering buttons that would do nothing.
  if (row.recordId === null || record === null) {
    return (
      <AyqPane mark="upcoming-detail" title={row.label}>
        <div className={styles.body} data-ayq-plan-remainder="">
          <p className={styles.note}>
            {row.categoryName === null
              ? ayqText('upcoming.pane.planOnlyNoCategory')
              : ayqText('upcoming.pane.planOnly', { category: row.categoryName })}
          </p>
        </div>
      </AyqPane>
    );
  }

  const once = record.recurrence.frequency === 'once';
  const dueDate = row.dueDate ?? row.date;
  const matched = occurrence?.matchedTransactionId ?? null;

  return (
    <AyqPane mark="upcoming-detail" title={record.name}>
      <div className={styles.body} data-ayq-record={record.id}>
        <div className={styles.group} data-ayq-occurrence={dueDate}>
          <span className={styles.label}>
            {ayqText('upcoming.pane.occurrence')}
          </span>
          <AyqFigure cents={row.amountCents} size="large" />
          <span>{ayqText('upcoming.pane.due', { date: ayqDate(dueDate) })}</span>
          {dueDate === row.date ? null : (
            <span className={styles.quiet}>
              {ayqText('upcoming.pane.moved', { date: ayqDate(row.date) })}
            </span>
          )}
          {row.state === 'overdue' ? (
            <p className={styles.note} data-ayq-overdue="">
              {ayqText('upcoming.pane.overdueNote')}
            </p>
          ) : null}
          {matched === null ? null : (
            <span className={styles.quiet} data-ayq-matched={matched}>
              {occurrence?.matchProvenance === null
                ? ''
                : ayqText(
                    `upcoming.pane.matchedBy.${occurrence?.matchProvenance ?? 'automatic'}` as AyqStringKey,
                  )}
            </span>
          )}
        </div>

        <div className={styles.group}>
          <span className={styles.label}>{ayqText('upcoming.pane.record')}</span>
          <span data-ayq-rhythm="">{rhythm(record)}</span>
          {once ? (
            <p className={styles.note} data-ayq-single="">
              {ayqText('upcoming.pane.onceNote')}
            </p>
          ) : (
            <span className={styles.quiet}>
              {record.endDate === null
                ? ayqText('upcoming.pane.endsNever')
                : ayqText('upcoming.pane.ends', { date: ayqDate(record.endDate) })}
            </span>
          )}
          {record.state === 'suggested' ? (
            <p className={styles.note} data-ayq-suggested="">
              {ayqText('upcoming.pane.suggestedNote')}
            </p>
          ) : null}
          {record.confirmedAt === null ? null : (
            <span className={styles.quiet}>
              {ayqText('upcoming.pane.confirmedAt', {
                date: ayqDate(record.confirmedAt),
              })}
            </span>
          )}
          {record.suggestedAt === null || record.confirmedAt !== null ? null : (
            <span className={styles.quiet}>
              {ayqText('upcoming.pane.suggestedAt', {
                date: ayqDate(record.suggestedAt),
              })}
            </span>
          )}
        </div>

        {/* Occurrence-scoped. Each of these reaches this date and no other. */}
        <div className={styles.actions} data-ayq-scope="occurrence">
          <span className={styles.scope}>
            {ayqText('upcoming.do.scope.occurrence')}
          </span>
          <div className={styles.inline}>
            <Input
              type="date"
              value={moveTo}
              size="small"
              aria-label={ayqText('upcoming.do.rescheduleTo')}
              data-ayq-move-to=""
              onChange={(_event, data) => setMoveTo(data.value)}
            />
            <AyqButton
              size="small"
              mark="occurrence-reschedule"
              disabled={moveTo === ''}
              onClick={() => {
                onDecide({
                  kind: 'plan.reschedule',
                  recordId: record.id,
                  dueDate,
                  to: moveTo,
                });
                setMoveTo('');
              }}
            >
              {ayqText('upcoming.do.reschedule')}
            </AyqButton>
          </div>
          <div className={styles.inline}>
            <AyqButton
              size="small"
              mark="occurrence-dismiss"
              onClick={() =>
                onDecide({
                  kind: 'plan.dismissOccurrence',
                  recordId: record.id,
                  dueDate,
                  dismissed: row.state !== 'dismissed',
                })
              }
            >
              {row.state === 'dismissed'
                ? ayqText('upcoming.do.undismiss')
                : ayqText('upcoming.do.dismiss')}
            </AyqButton>
            {matched === null ? null : (
              <AyqButton
                size="small"
                mark="occurrence-unmatch"
                onClick={() =>
                  onDecide({
                    kind: 'match.unmatch',
                    recordId: record.id,
                    dueDate,
                  })
                }
              >
                {ayqText('upcoming.do.unmatch')}
              </AyqButton>
            )}
          </div>
        </div>

        {/* Record-scoped, and said so. Ending a series is its own action and is
            never what "dismiss" does (03 §7.17). */}
        <div className={styles.actions} data-ayq-scope="record">
          <span className={styles.scope}>{ayqText('upcoming.do.scope.record')}</span>
          <div className={styles.inline}>
            <AyqButton size="small" mark="record-edit" onClick={() => onEdit(record)}>
              {ayqText('upcoming.do.edit')}
            </AyqButton>
            {record.state === 'suggested' ? (
              <AyqButton
                filled
                size="small"
                mark="record-accept"
                onClick={() =>
                  onDecide({
                    kind: 'plan.setState',
                    recordId: record.id,
                    state: 'confirmed',
                  })
                }
              >
                {ayqText('upcoming.do.accept')}
              </AyqButton>
            ) : (
              <AyqButton
                size="small"
                mark="record-put-away"
                onClick={() =>
                  onDecide({
                    kind: 'plan.setState',
                    recordId: record.id,
                    state: 'dismissed',
                  })
                }
              >
                {ayqText('upcoming.do.putAway')}
              </AyqButton>
            )}
            <AyqButton
              size="small"
              mark="record-remove"
              onClick={() => onDecide({ kind: 'plan.remove', recordId: record.id })}
            >
              {ayqText('upcoming.do.remove')}
            </AyqButton>
          </div>
          {/* A single payment has no series, so there is nothing here to end. */}
          {once ? null : (
            <div className={styles.inline}>
              <Input
                type="date"
                size="small"
                value={endOn}
                aria-label={ayqText('upcoming.do.endSeriesOn')}
                data-ayq-end-on=""
                onChange={(_event, data) => setEndOn(data.value)}
              />
              <AyqButton
                size="small"
                mark="record-end-series"
                disabled={endOn === ''}
                onClick={() => {
                  onDecide({
                    kind: 'plan.save',
                    record: {
                      id: record.id,
                      name: record.name,
                      kind: record.kind,
                      amountCents: record.amountCents,
                      categoryName: record.categoryName,
                      counterpartyKey: record.counterpartyKey,
                      accountId: record.accountId,
                      startDate: record.startDate,
                      recurrence: record.recurrence,
                      endDate: endOn,
                      mandateId: record.mandateId,
                    },
                  });
                  setEndOn('');
                }}
              >
                {ayqText('upcoming.do.endSeries')}
              </AyqButton>
            </div>
          )}
        </div>
      </div>
    </AyqPane>
  );
}

/* ---------------------------------------------------------------- the editor

   One editor for a new record and for an existing one, because they are the
   same record with and without an id — two forms would be two places for the
   rules about what a record must have.                                      */

function AyqRecordForm({
  draft,
  categories,
  onChange,
  onCancel,
  onSave,
  onFailure,
}: {
  draft: AyqPlanDraft;
  categories: readonly AyqCategory[];
  onChange(draft: AyqPlanDraft): void;
  onCancel(): void;
  onSave(draft: AyqPlanDraft): void;
  onFailure(message: string): void;
}): ReactNode {
  const styles = useStyles();
  const [amount, setAmount] = useState(
    draft.amountCents === 0 ? '' : (draft.amountCents / 100).toFixed(2),
  );

  const save = (): void => {
    const cents = Math.round(Number(amount.replace(',', '.')) * 100);
    if (draft.name.trim() === '') {
      onFailure(ayqText('upcoming.form.needsName'));
      return;
    }
    if (!Number.isFinite(cents) || cents <= 0) {
      onFailure(ayqText('upcoming.form.needsAmount'));
      return;
    }
    if (draft.startDate === '') {
      onFailure(ayqText('upcoming.form.needsDate'));
      return;
    }
    onSave({ ...draft, amountCents: cents });
  };

  return (
    <AyqPane
      mark="upcoming-form"
      title={
        draft.id === undefined
          ? ayqText('upcoming.form.new')
          : ayqText('upcoming.form.edit', { name: draft.name })
      }
    >
      <div className={styles.body} data-ayq-record-form="">
        <div className={styles.group}>
          <span className={styles.label}>{ayqText('upcoming.form.name')}</span>
          <Input
            value={draft.name}
            data-ayq-field="name"
            onChange={(_event, data) => onChange({ ...draft, name: data.value })}
          />
        </div>
        <div className={styles.group}>
          <span className={styles.label}>{ayqText('upcoming.form.kind')}</span>
          <Select
            value={draft.kind}
            data-ayq-field="kind"
            onChange={(_event, data) =>
              onChange({ ...draft, kind: data.value as AyqPlanDraft['kind'] })
            }
          >
            <option value="expense">{ayqText('upcoming.form.kind.expense')}</option>
            <option value="income">{ayqText('upcoming.form.kind.income')}</option>
          </Select>
        </div>
        <div className={styles.group}>
          <span className={styles.label}>{ayqText('upcoming.form.amount')}</span>
          <Input
            value={amount}
            data-ayq-field="amount"
            onChange={(_event, data) => setAmount(data.value)}
          />
        </div>
        <div className={styles.group}>
          <span className={styles.label}>{ayqText('upcoming.form.category')}</span>
          <Select
            value={draft.categoryName ?? ''}
            data-ayq-field="category"
            onChange={(_event, data) =>
              onChange({
                ...draft,
                categoryName: data.value === '' ? null : data.value,
              })
            }
          >
            <option value="">{ayqText('upcoming.form.category.none')}</option>
            {categories
              .filter(one => !one.isIncome)
              .map(one => (
                <option key={one.id} value={one.name}>
                  {one.name}
                </option>
              ))}
          </Select>
        </div>
        <div className={styles.group}>
          <span className={styles.label}>{ayqText('upcoming.form.start')}</span>
          <Input
            type="date"
            value={draft.startDate}
            data-ayq-field="start"
            onChange={(_event, data) =>
              onChange({ ...draft, startDate: data.value })
            }
          />
        </div>
        <div className={styles.group}>
          <span className={styles.label}>{ayqText('upcoming.form.frequency')}</span>
          <Select
            value={draft.recurrence.frequency}
            data-ayq-field="frequency"
            onChange={(_event, data) =>
              onChange({
                ...draft,
                recurrence: {
                  ...draft.recurrence,
                  frequency: data.value as AyqPlanFrequency,
                },
              })
            }
          >
            {FREQUENCIES.map(one => (
              <option key={one} value={one}>
                {one === 'once'
                  ? ayqText('frequency.once')
                  : ayqText('upcoming.pane.every', {
                      frequency: ayqText(`frequency.${one}` as AyqStringKey),
                    })}
              </option>
            ))}
          </Select>
        </div>
        {draft.recurrence.frequency === 'once' ? null : (
          <div className={styles.group}>
            <span className={styles.label}>{ayqText('upcoming.form.interval')}</span>
            <Input
              type="number"
              value={String(draft.recurrence.interval)}
              data-ayq-field="interval"
              onChange={(_event, data) =>
                onChange({
                  ...draft,
                  recurrence: {
                    ...draft.recurrence,
                    interval: Math.max(1, Number(data.value) || 1),
                  },
                })
              }
            />
          </div>
        )}
        {draft.recurrence.frequency === 'once' ? null : (
          <div className={styles.group}>
            <span className={styles.label}>{ayqText('upcoming.form.end')}</span>
            <Input
              type="date"
              value={draft.endDate ?? ''}
              data-ayq-field="end"
              onChange={(_event, data) =>
                onChange({ ...draft, endDate: data.value === '' ? null : data.value })
              }
            />
          </div>
        )}
        <div className={styles.inline}>
          <AyqButton filled mark="record-save" onClick={save}>
            {ayqText('upcoming.form.save')}
          </AyqButton>
          <AyqButton mark="record-cancel" onClick={onCancel}>
            {ayqText('upcoming.form.cancel')}
          </AyqButton>
        </div>
      </div>
    </AyqPane>
  );
}
