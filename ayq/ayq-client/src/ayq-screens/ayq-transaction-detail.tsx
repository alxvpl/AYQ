// The detail pane for one transaction (04 A4).
//
// What is here is what a person needs to judge a row: what the bank actually
// sent, how AYQ decided who the counterparty is, which category it is in and
// who put it there, whether it turned out to be a payment that was expected,
// and every decision anybody has made about it. Then the three actions that
// change any of that.
//
// Nothing is computed here. Every fact is the engine's answer, formatted.

import { Select, makeStyles } from '@fluentui/react-components';
import { useState, type ReactNode } from 'react';

import type {
  AyqCategory,
  AyqCounterparty,
  AyqTransactionDetail,
} from '../ayq-ipc-contract.ts';
import { ayqDate, ayqMoment, ayqText } from '../ayq-strings.ts';
import { AYQ_METRIC, AYQ_TYPE } from '../ayq-tokens.ts';
import { AyqButton } from '../ayq-ui/ayq-button.tsx';
import { ayqBorderTop } from '../ayq-ui/ayq-css.ts';
import { AyqFigure } from '../ayq-ui/ayq-figure.tsx';
import { AyqStateChip } from '../ayq-ui/ayq-state-chip.tsx';

const useStyles = makeStyles({
  pane: { padding: `${AYQ_METRIC.space.screen}px` },
  name: {
    margin: '0 0 2px',
    fontFamily: 'var(--ayq-font-display)',
    fontSize: 'var(--ayq-size-heading)',
    fontWeight: AYQ_TYPE.weight.semibold,
    color: 'var(--ayq-ink)',
    overflowWrap: 'anywhere',
  },
  big: { margin: `${AYQ_METRIC.space.small}px 0 ${AYQ_METRIC.space.wide}px` },
  field: {
    display: 'grid',
    gridTemplateColumns: '118px minmax(0, 1fr)',
    gap: `${AYQ_METRIC.space.medium}px`,
    padding: `${AYQ_METRIC.space.small}px 0`,
    ...ayqBorderTop('var(--ayq-line)'),
  },
  label: { color: 'var(--ayq-ink-faint)', fontSize: 'var(--ayq-size-small)' },
  value: { margin: '0', overflowWrap: 'anywhere', color: 'var(--ayq-ink)' },
  mono: { fontFamily: 'var(--ayq-font-mono)', fontSize: '12px' },
  heading: {
    margin: `${AYQ_METRIC.space.screen}px 0 ${AYQ_METRIC.space.small}px`,
    fontSize: 'var(--ayq-size-small)',
    color: 'var(--ayq-ink-quiet)',
    fontWeight: AYQ_TYPE.weight.semibold,
  },
  actions: {
    display: 'flex',
    gap: `${AYQ_METRIC.space.medium}px`,
    flexWrap: 'wrap',
    marginTop: `${AYQ_METRIC.space.screen}px`,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: `${AYQ_METRIC.space.medium}px`,
    marginTop: `${AYQ_METRIC.space.wide}px`,
  },
  history: { margin: '0', padding: '0', listStyle: 'none' },
  line: {
    margin: `0 0 ${AYQ_METRIC.space.tight}px`,
    color: 'var(--ayq-ink-quiet)',
    fontSize: 'var(--ayq-size-small)',
  },
  quiet: { color: 'var(--ayq-ink-faint)' },
  empty: { padding: '34px 18px', textAlign: 'center', color: 'var(--ayq-ink-faint)' },
});

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}): ReactNode {
  const styles = useStyles();
  return (
    <div className={styles.field}>
      <span className={styles.label}>{label}</span>
      <div className={styles.value}>{children}</div>
    </div>
  );
}

export function AyqTransactionDetailPane({
  detail,
  categories,
  counterparties,
  onCategory,
  onCorrectCounterparty,
  onShowTheRule,
  onNeedCounterparties,
}: {
  detail: AyqTransactionDetail | null;
  categories: readonly AyqCategory[];
  /** Loaded only when a correction is being made. */
  counterparties: readonly AyqCounterparty[] | null;
  onCategory(categoryId: string | null): void;
  onCorrectCounterparty(counterpartyKey: string): void;
  onShowTheRule(): void;
  onNeedCounterparties(): void;
}): ReactNode {
  const styles = useStyles();
  const [correcting, setCorrecting] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);

  if (detail === null) {
    return <div className={styles.empty}>{ayqText('detail.none')}</div>;
  }

  const { row, provenance, match, decisions, rule } = detail;
  const by =
    row.categorySource === 'rule'
      ? ayqText('detail.by.rule')
      : row.categorySource === 'manual'
        ? ayqText('detail.by.you')
        : ayqText('detail.by.nobody');

  return (
    <div className={styles.pane} data-ayq-detail={row.id}>
      <h3 className={styles.name}>{row.payee ?? ayqText('detail.category.none')}</h3>
      <div className={styles.big}>
        <AyqFigure cents={row.amountCents} size="large" withSymbol />
      </div>

      <Field label={ayqText('register.column.date')}>{ayqDate(row.date)}</Field>
      <Field label={ayqText('register.column.account')}>{row.account}</Field>

      <Field label={ayqText('detail.category')}>
        {row.category === null ? (
          <AyqStateChip
            state="uncategorised"
            label={ayqText('detail.category.none')}
          />
        ) : (
          <>
            {row.category} <span className={styles.quiet}>{by}</span>
          </>
        )}
      </Field>

      <Field label={ayqText('detail.match')}>
        {match === null ? (
          <span className={styles.quiet}>{ayqText('detail.match.none')}</span>
        ) : (
          <>
            {match.name}{' '}
            <span className={styles.quiet}>
              {ayqText('detail.match.due', { date: ayqDate(match.dueDate) })} ·{' '}
              {match.provenance === 'automatic'
                ? ayqText('detail.match.automatic')
                : ayqText('detail.match.manual')}
            </span>
          </>
        )}
      </Field>

      <h4 className={styles.heading}>{ayqText('detail.evidence')}</h4>
      {provenance === null ? (
        <p className={styles.line}>{ayqText('detail.evidence.none')}</p>
      ) : (
        <>
          <Field label={ayqText('detail.evidence.resolvedBy')}>
            {provenance.resolvedBy}
          </Field>
          <Field label={ayqText('detail.evidence.kind')}>{provenance.kind}</Field>
          {provenance.counterpartyName == null ? null : (
            <Field label={ayqText('detail.evidence.importedName')}>
              <span className={styles.mono}>{provenance.counterpartyName}</span>
            </Field>
          )}
          {provenance.counterpartyIban === null ? null : (
            <Field label={ayqText('detail.evidence.iban')}>
              <span className={styles.mono}>{provenance.counterpartyIban}</span>
            </Field>
          )}
          {provenance.intermediary === null ? null : (
            <Field label={ayqText('detail.evidence.intermediary')}>
              {provenance.intermediary}
            </Field>
          )}
          {provenance.mandateId === null ? null : (
            <Field label={ayqText('detail.evidence.mandate')}>
              <span className={styles.mono}>{provenance.mandateId}</span>
            </Field>
          )}
          {provenance.endToEndId === null ? null : (
            <Field label={ayqText('detail.evidence.endToEnd')}>
              <span className={styles.mono}>{provenance.endToEndId}</span>
            </Field>
          )}
          {provenance.bankTransactionCode === null ? null : (
            <Field label={ayqText('detail.evidence.code')}>
              <span className={styles.mono}>{provenance.bankTransactionCode}</span>
            </Field>
          )}
          {provenance.description === null ? null : (
            <Field label={ayqText('detail.bankSaid')}>
              <span className={styles.mono}>{provenance.description}</span>
            </Field>
          )}
          {provenance.file === null ? null : (
            <Field label={ayqText('detail.evidence.file')}>
              <span className={styles.mono}>{provenance.file}</span>
            </Field>
          )}
        </>
      )}

      <h4 className={styles.heading}>{ayqText('detail.history')}</h4>
      {decisions.length === 0 ? (
        <p className={styles.line}>{ayqText('detail.history.none')}</p>
      ) : (
        <ul className={styles.history} data-ayq-history={String(decisions.length)}>
          {[...decisions].reverse().map((one, index) => (
            <li key={`${one.at}-${index}`} className={styles.line}>
              {ayqText('detail.history.line', {
                category:
                  one.categoryName === ''
                    ? ayqText('detail.history.cleared')
                    : one.categoryName,
                by:
                  one.source === 'rule'
                    ? ayqText('detail.by.rule')
                    : ayqText('detail.by.you'),
                when: ayqMoment(one.at),
              })}
            </li>
          ))}
        </ul>
      )}

      <div className={styles.actions}>
        <Select
          data-ayq-category-choice=""
          aria-label={ayqText('detail.action.changeCategory')}
          value={row.categoryId ?? ''}
          onChange={(_event, data) =>
            onCategory(data.value === '' ? null : data.value)
          }
        >
          <option value="">{ayqText('detail.category.none')}</option>
          {categories.map(category => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>

        <AyqButton
          mark="correct-counterparty"
          onClick={() => {
            setCorrecting(one => !one);
            onNeedCounterparties();
          }}
        >
          {ayqText('detail.action.correctCounterparty')}
        </AyqButton>

        <AyqButton mark="show-the-rule" onClick={onShowTheRule}>
          {ayqText('detail.action.showTheRule')}
        </AyqButton>
      </div>

      <p className={styles.line}>
        {rule === null
          ? ayqText('detail.rule.none')
          : ayqText('detail.rule.stands', {
              counterparty: rule.counterpartyKey,
              category: rule.categoryName,
            })}
      </p>

      {!correcting ? null : (
        <div className={styles.form} data-ayq-correct-counterparty="">
          <Select
            data-ayq-counterparty-choice=""
            aria-label={ayqText('detail.action.correctCounterparty')}
            value={chosen ?? ''}
            onChange={(_event, data) => setChosen(data.value === '' ? null : data.value)}
          >
            <option value="">{ayqText('detail.counterparty.choose')}</option>
            {(counterparties ?? []).map(one => (
              <option key={one.key} value={one.key}>
                {one.name}
              </option>
            ))}
          </Select>
          <AyqButton
            filled
            mark="save-counterparty"
            disabled={chosen === null}
            onClick={() => {
              if (chosen === null) return;
              onCorrectCounterparty(chosen);
              setCorrecting(false);
            }}
          >
            {ayqText('detail.action.correctCounterparty')}
          </AyqButton>
        </div>
      )}
    </div>
  );
}
