// Saying what an account holds, and correcting it later.
//
// One form, two errands. After an import that carried no bank balance it is the
// question the import could not answer for itself (§4.4); from an account's own
// detail it is the correction (§4.5). Both write a manual anchor and neither
// writes a transaction into the ledger.
//
// The date is shown and editable rather than assumed to be today, and the hint
// under the amount says the thing that makes the figure meaningful: the balance
// entered has to already include everything imported up to that day. A person
// reading a balance off yesterday's banking app while AYQ holds statements to
// the end of last month would otherwise set an anchor that is true of neither.

import { makeStyles } from '@fluentui/react-components';
import { useState, type ReactNode } from 'react';

import { ayqText } from '../ayq-strings.ts';
import { AYQ_METRIC } from '../ayq-tokens.ts';
import { AyqButton } from '../ayq-ui/ayq-button.tsx';

const useStyles = makeStyles({
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: `${AYQ_METRIC.space.medium}px`,
    padding: `${AYQ_METRIC.space.screen}px`,
  },
  field: { display: 'flex', flexDirection: 'column', gap: '3px' },
  label: { color: 'var(--ayq-ink-faint)', fontSize: 'var(--ayq-size-small)' },
  hint: { color: 'var(--ayq-ink-quiet)', fontSize: 'var(--ayq-size-small)' },
  input: {
    fontFamily: 'var(--ayq-font-ui)',
    fontSize: 'var(--ayq-size-body)',
    padding: '5px 7px',
    backgroundColor: 'var(--ayq-surface)',
    color: 'var(--ayq-ink)',
    borderTopWidth: 'var(--ayq-hairline)',
    borderRightWidth: 'var(--ayq-hairline)',
    borderBottomWidth: 'var(--ayq-hairline)',
    borderLeftWidth: 'var(--ayq-hairline)',
    borderTopStyle: 'solid',
    borderRightStyle: 'solid',
    borderBottomStyle: 'solid',
    borderLeftStyle: 'solid',
    borderTopColor: 'var(--ayq-line)',
    borderRightColor: 'var(--ayq-line)',
    borderBottomColor: 'var(--ayq-line)',
    borderLeftColor: 'var(--ayq-line)',
  },
  actions: { display: 'flex', gap: `${AYQ_METRIC.space.medium}px` },
  problem: { color: 'var(--ayq-ink)', fontSize: 'var(--ayq-size-small)' },
});

/**
 * Euro as a person types it, in cents — or null when it is not a number.
 *
 * Both separators are accepted because both are typed, and thousands
 * separators are stripped. It is deliberately strict about everything else:
 * an amount that cannot be read is refused rather than rounded to something.
 */
export function ayqParseEuro(typed: string): number | null {
  const cleaned = typed.trim().replace(/\s/g, '').replace(/−/g, '-');
  if (cleaned === '') return null;
  // 1.234,56 and 1,234.56 both occur. The last separator is the decimal one.
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  const decimal = lastComma > lastDot ? ',' : lastDot > lastComma ? '.' : '';
  const grouped =
    decimal === ''
      ? cleaned.replace(/[.,]/g, '')
      : cleaned
          .slice(0, decimal === ',' ? lastComma : lastDot)
          .replace(/[.,]/g, '') +
        '.' +
        cleaned.slice((decimal === ',' ? lastComma : lastDot) + 1);
  if (!/^-?\d+(\.\d{1,2})?$/.test(grouped)) return null;
  return Math.round(Number(grouped) * 100);
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function AyqBalanceForm({
  title,
  accountName,
  coverageDate,
  note,
  cancelLabel,
  onSubmit,
  onCancel,
}: {
  title: string;
  accountName: string;
  /** What the date field starts at: the day the evidence reaches to. */
  coverageDate: string;
  note: string | null;
  cancelLabel: string;
  onSubmit(amountCents: number, coverageDate: string): void;
  onCancel(): void;
}): ReactNode {
  const styles = useStyles();
  const [amount, setAmount] = useState('');
  const [day, setDay] = useState(coverageDate);
  const [problem, setProblem] = useState<string | null>(null);

  return (
    <div className={styles.form} data-ayq-balance-form="">
      <strong>{title}</strong>
      {note === null ? null : <p className={styles.hint}>{note}</p>}

      <div className={styles.field}>
        <span className={styles.label}>{ayqText('balance.account')}</span>
        <span data-ayq-balance-account="">{accountName}</span>
      </div>

      <label className={styles.field}>
        <span className={styles.label}>{ayqText('balance.amount')}</span>
        <input
          className={styles.input}
          data-ayq-balance-amount=""
          value={amount}
          onChange={event => setAmount(event.target.value)}
        />
        <span className={styles.hint}>{ayqText('balance.amount.hint')}</span>
      </label>

      <label className={styles.field}>
        <span className={styles.label}>{ayqText('balance.date')}</span>
        <input
          className={styles.input}
          data-ayq-balance-date=""
          value={day}
          onChange={event => setDay(event.target.value)}
        />
        {/* The sentence §4.4 requires the interface to say out loud. */}
        <span className={styles.hint}>{ayqText('balance.date.hint')}</span>
      </label>

      {problem === null ? null : (
        <p className={styles.problem} data-ayq-balance-problem="">
          {problem}
        </p>
      )}

      <div className={styles.actions}>
        <AyqButton
          mark="balance-save"
          onClick={() => {
            const cents = ayqParseEuro(amount);
            if (cents === null) {
              setProblem(ayqText('balance.invalid'));
              return;
            }
            if (!ISO_DAY.test(day.trim())) {
              setProblem(ayqText('balance.invalidDate'));
              return;
            }
            setProblem(null);
            onSubmit(cents, day.trim());
          }}
        >
          {ayqText('balance.save')}
        </AyqButton>
        <AyqButton mark="balance-cancel" onClick={onCancel}>
          {cancelLabel}
        </AyqButton>
      </div>
    </div>
  );
}
