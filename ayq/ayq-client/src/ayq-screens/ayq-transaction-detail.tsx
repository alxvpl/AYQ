// The detail pane for one transaction (04 A4).
//
// What is here is what a person needs to judge a row: what the bank actually
// sent, how AYQ decided who the counterparty is, which category it is in and
// who put it there, whether it turned out to be a payment that was expected,
// and every decision anybody has made about it. Then the three actions that
// change any of that.
//
// Nothing is computed here. Every fact is the engine's answer, formatted.

import { Select, makeStyles, mergeClasses } from '@fluentui/react-components';
import { useState, type ReactNode } from 'react';

import type {
  AyqCategory,
  AyqCounterparty,
  AyqTransactionDetail,
} from '../ayq-ipc-contract.ts';
import {
  ayqFilingReasonText,
  ayqPaymentKindText,
  ayqResolvedByText,
} from '../ayq-reasons.ts';
import { ayqDate, ayqMoment, ayqText } from '../ayq-strings.ts';
import { AYQ_METRIC, AYQ_TYPE } from '../ayq-tokens.ts';
import { AyqButton } from '../ayq-ui/ayq-button.tsx';
import { ayqBorderTop } from '../ayq-ui/ayq-css.ts';
import { useAyqFieldStyles } from '../ayq-ui/ayq-field.ts';
import { AyqFigure } from '../ayq-ui/ayq-figure.tsx';
import { AyqStateChip } from '../ayq-ui/ayq-state-chip.tsx';
import { AyqRuleCard } from './ayq-rule-card.tsx';

const useStyles = makeStyles({
  // Template r003's detail: sections on 14×18, the counterparty at 20, the
  // figure at 28, facts on a 138 grid parted by the section line.
  pane: { padding: `14px ${AYQ_METRIC.panePadding}px` },
  name: {
    margin: '2px 0',
    fontFamily: 'var(--ayq-font-display)',
    fontSize: 'var(--ayq-size-screen)',
    fontWeight: AYQ_TYPE.weight.semibold,
    color: 'var(--ayq-ink)',
    overflowWrap: 'anywhere',
  },
  sub: {
    margin: '0',
    fontSize: 'var(--ayq-size-small)',
    color: 'var(--ayq-ink-faint)',
  },
  big: { margin: `${AYQ_METRIC.space.ten}px 0 14px` },
  field: {
    display: 'grid',
    gridTemplateColumns: '138px minmax(0, 1fr)',
    gap: `${AYQ_METRIC.space.wide}px`,
    padding: `${AYQ_METRIC.space.small}px 0`,
    ...ayqBorderTop('var(--ayq-section)'),
  },
  label: { color: 'var(--ayq-label)', fontSize: 'var(--ayq-size-small)' },
  value: { margin: '0', overflowWrap: 'anywhere', color: 'var(--ayq-ink)' },
  mono: { fontFamily: 'var(--ayq-font-mono)', fontSize: '12px' },
  heading: {
    margin: `14px 0 ${AYQ_METRIC.space.ten}px`,
    fontSize: 'var(--ayq-size-heading)',
    color: 'var(--ayq-ink)',
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
  section: {
    margin: `0 -${AYQ_METRIC.panePadding}px`,
    padding: `14px ${AYQ_METRIC.panePadding}px`,
    ...ayqBorderTop('var(--ayq-line)'),
  },
  sectionTitle: {
    margin: `0 0 ${AYQ_METRIC.space.ten}px`,
    fontSize: 'var(--ayq-size-heading)',
    fontWeight: AYQ_TYPE.weight.semibold,
    color: 'var(--ayq-ink)',
  },
  full: { width: '100%' },
  help: {
    margin: `${AYQ_METRIC.space.small}px 0 0`,
    fontSize: 'var(--ayq-size-small)',
    color: 'var(--ayq-ink-faint)',
  },
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
  onRuleChanged,
  onFailure,
  onManageCounterparty,
}: {
  detail: AyqTransactionDetail | null;
  categories: readonly AyqCategory[];
  /** Loaded only when a correction is being made. */
  counterparties: readonly AyqCounterparty[] | null;
  onCategory(categoryId: string | null): void;
  onCorrectCounterparty(counterpartyKey: string): void;
  onShowTheRule(): void;
  onNeedCounterparties(): void;
  /** The rule that files this row was corrected or removed here (04 A7). */
  onRuleChanged(said: string): void;
  onFailure(message: string): void;
  /** Opens the counterparty's own page (04 A37), when the caller has one. */
  onManageCounterparty?(counterpartyKey: string): void;
}): ReactNode {
  const styles = useStyles();
  const fields = useAyqFieldStyles();
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
        : row.categorySource === 'auto'
          ? ayqText('detail.by.ayq')
          : ayqText('detail.by.nobody');

  return (
    <div className={styles.pane} data-ayq-detail={row.id}>
      <h3 className={styles.name}>{row.payee ?? ayqText('detail.category.none')}</h3>
      <p className={styles.sub}>
        {ayqDate(row.date)} · {row.account}
      </p>
      <div className={styles.big}>
        <AyqFigure cents={row.amountCents} size="large" withSymbol align="left" />
      </div>

      <div className={styles.section} data-ayq-detail-category="">
        <h4 className={styles.sectionTitle}>{ayqText('detail.category')}</h4>
        <Select
          className={mergeClasses(fields.field, styles.full)}
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
        <p className={styles.help}>
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
        </p>
        {/* The rule that files this counterparty is inspected, corrected and
            removed where it is seen, with the consequence stated first (A7). */}
        {rule === null ? (
          <p className={styles.line}>{ayqText('detail.rule.none')}</p>
        ) : (
          <AyqRuleCard
            rule={rule}
            categories={categories}
            onFailure={onFailure}
            onDone={onRuleChanged}
          />
        )}
      </div>

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
          {/* Identifiers, worded (04 A24): the raw value never reaches the screen. */}
          <Field label={ayqText('detail.evidence.resolvedBy')}>
            <span data-ayq-evidence-resolved-by="">
              {ayqResolvedByText(provenance.resolvedBy)}
            </span>
          </Field>
          <Field label={ayqText('detail.evidence.kind')}>
            <span data-ayq-evidence-kind="">
              {ayqPaymentKindText(provenance.kind)}
            </span>
          </Field>
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
            <li
              key={`${one.at}-${index}`}
              className={styles.line}
              data-ayq-decision={one.source}
            >
              {ayqText(
                one.reason === undefined
                  ? 'detail.history.line'
                  : 'detail.history.lineBecause',
                {
                  category:
                    one.categoryName === ''
                      ? ayqText('detail.history.cleared')
                      : one.categoryName,
                  // AYQ's own filing is AYQ's, not the owner's (03 §11.11).
                  by:
                    one.source === 'rule'
                      ? ayqText('detail.by.rule')
                      : one.source === 'auto'
                        ? ayqText('detail.by.ayq')
                        : ayqText('detail.by.you'),
                  when: ayqMoment(one.at),
                  ...(one.reason === undefined
                    ? {}
                    : { because: ayqFilingReasonText(one.reason) }),
                },
              )}
            </li>
          ))}
        </ul>
      )}

      <div className={styles.actions}>
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

        {onManageCounterparty === undefined ||
        detail.counterpartyKey === null ? null : (
          <AyqButton
            mark="manage-counterparty"
            onClick={() => onManageCounterparty(detail.counterpartyKey ?? '')}
          >
            {ayqText('detail.action.manageCounterparty')}
          </AyqButton>
        )}
      </div>


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
