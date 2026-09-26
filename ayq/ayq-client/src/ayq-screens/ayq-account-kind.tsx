// What kind of account one is (CL_001 D3, CL_002 D11, PF-006 F2).
//
// Two shapes of the same decision. The question is what an import asks once
// about an account AYQ has just met: one plain sentence and four plain choices,
// and AYQ fills in the five properties behind them. The control is where the
// answer is changed later, beside the account's other settings. Neither guesses
// anything from the bank file — the engine does not know, which is why it asks.

import { makeStyles } from '@fluentui/react-components';
import { useState, type ReactNode } from 'react';

import type {
  AyqAccountKind,
  AyqAccountSummary,
  AyqAccountTemplate,
} from '../ayq-ipc-contract.ts';
import { ayqText, type AyqStringKey } from '../ayq-strings.ts';
import { AYQ_METRIC, AYQ_TYPE } from '../ayq-tokens.ts';
import { AyqButton } from '../ayq-ui/ayq-button.tsx';
import { ayqBorder } from '../ayq-ui/ayq-css.ts';

const TEMPLATES: readonly AyqAccountTemplate[] = [
  'payment',
  'savings',
  'term-deposit',
  'other',
];

const LABEL: Record<AyqAccountTemplate, AyqStringKey> = {
  payment: 'kind.payment',
  savings: 'kind.savings',
  'term-deposit': 'kind.term-deposit',
  other: 'kind.other',
};

const NOTE: Record<AyqAccountTemplate, AyqStringKey> = {
  payment: 'kind.payment.note',
  savings: 'kind.savings.note',
  'term-deposit': 'kind.term-deposit.note',
  other: 'kind.other.note',
};

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

const useStyles = makeStyles({
  question: {
    display: 'flex',
    flexDirection: 'column',
    gap: `${AYQ_METRIC.space.medium}px`,
    padding: `${AYQ_METRIC.space.wide}px ${AYQ_METRIC.panePadding}px`,
    backgroundColor: 'var(--ayq-quiet)',
    ...ayqBorder('var(--ayq-line)'),
    borderRadius: 'var(--ayq-radius-medium)',
  },
  title: {
    fontSize: 'var(--ayq-size-body)',
    fontWeight: AYQ_TYPE.weight.semibold,
    color: 'var(--ayq-ink)',
  },
  note: { color: 'var(--ayq-ink-quiet)', fontSize: 'var(--ayq-size-small)' },
  choices: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: `${AYQ_METRIC.space.medium}px`,
  },
  choice: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    alignItems: 'flex-start',
  },
  control: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: `${AYQ_METRIC.space.medium}px`,
  },
  label: { color: 'var(--ayq-ink-faint)', fontSize: 'var(--ayq-size-small)' },
  input: {
    fontFamily: 'var(--ayq-font-ui)',
    fontSize: 'var(--ayq-size-body)',
    padding: '4px 6px',
    backgroundColor: 'var(--ayq-surface)',
    color: 'var(--ayq-ink)',
    ...ayqBorder('var(--ayq-line)'),
  },
});

/** The kind as one short phrase, for a row or a detail line. */
export function ayqKindLabel(kind: AyqAccountKind | null): string {
  if (kind === null || kind.template === null) return ayqText('kind.unknown');
  return ayqText(LABEL[kind.template]);
}

/**
 * The one question an import asks about a new account.
 *
 * Every choice is an answer, "decide later" included; nothing is chosen for
 * the owner by closing it.
 */
export function AyqAccountKindQuestion({
  account,
  onAnswer,
}: {
  account: AyqAccountSummary;
  onAnswer(template: AyqAccountTemplate): void;
}): ReactNode {
  const styles = useStyles();
  return (
    <div className={styles.question} data-ayq-kind-question={account.id}>
      <span className={styles.title}>
        {ayqText('kind.question', { account: account.name })}
      </span>
      <span className={styles.note}>{ayqText('kind.question.note')}</span>
      <div className={styles.choices}>
        {TEMPLATES.map(template => (
          <span key={template} className={styles.choice}>
            <AyqButton
              mark={`kind-${template}-${account.id}`}
              onClick={() => onAnswer(template)}
            >
              {ayqText(LABEL[template])}
            </AyqButton>
            <span className={styles.note}>{ayqText(NOTE[template])}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Changing an account's kind later, and the end of a term deposit's term.
 *
 * The date is optional: CAMT.053 carries no element for it, so it is the
 * owner's to enter, and a deposit without one is shown as locked with no date.
 */
export function AyqAccountKindControl({
  account,
  onChange,
}: {
  account: AyqAccountSummary;
  onChange(template: AyqAccountTemplate, lockedUntil: string | null): void;
}): ReactNode {
  const styles = useStyles();
  const template = account.kind?.template ?? null;
  const [day, setDay] = useState(account.kind?.lockedUntil ?? '');
  const [problem, setProblem] = useState(false);

  return (
    <span className={styles.control} data-ayq-kind-control={account.id}>
      <label className={styles.control}>
        <span className={styles.label}>{ayqText('kind.label')}</span>
        <select
          className={styles.input}
          data-ayq-kind-select={account.id}
          value={template ?? ''}
          onChange={event => {
            const chosen = event.target.value;
            if (TEMPLATES.includes(chosen as AyqAccountTemplate)) {
              onChange(chosen as AyqAccountTemplate, day.trim() === '' ? null : day.trim());
            }
          }}
        >
          {template === null ? (
            <option value="" disabled>
              {ayqText('kind.unknown')}
            </option>
          ) : null}
          {TEMPLATES.map(one => (
            <option key={one} value={one}>
              {ayqText(LABEL[one])}
            </option>
          ))}
        </select>
      </label>
      {template !== 'term-deposit' ? null : (
        <label className={styles.control}>
          <span className={styles.label}>{ayqText('kind.lockedUntil')}</span>
          <input
            className={styles.input}
            data-ayq-kind-locked={account.id}
            value={day}
            placeholder={ayqText('kind.lockedUntil.placeholder')}
            onChange={event => setDay(event.target.value)}
            onBlur={() => {
              const typed = day.trim();
              if (typed !== '' && !ISO_DAY.test(typed)) {
                setProblem(true);
                return;
              }
              setProblem(false);
              if (typed !== (account.kind?.lockedUntil ?? '')) {
                onChange('term-deposit', typed === '' ? null : typed);
              }
            }}
          />
          <span className={styles.note}>
            {problem ? ayqText('kind.lockedUntil.invalid') : ayqText('kind.lockedUntil.hint')}
          </span>
        </label>
      )}
    </span>
  );
}
