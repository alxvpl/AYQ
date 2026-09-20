import type { JSX } from 'react';
import { Button } from '@fluentui/react-components';
import { reversalEvidence } from '../evidence.js';
import { formatDate } from '../format.js';
import { formatMoney } from '../money.js';
import { useLocale, useText } from './text.js';
import type { StringKey } from '../strings.js';
import {
  categorisationSourceOf,
  type AnalysisResult,
  type CategorisationSource,
  type Contribution,
  type ExclusionClass,
  type TransactionClass,
} from '../types.js';

const CLASS_KEYS: Record<TransactionClass, StringKey> = {
  credit_transfer: 'class.credit_transfer',
  direct_debit: 'class.direct_debit',
  card_payment: 'class.card_payment',
  bank_fee: 'class.bank_fee',
  cash_withdrawal: 'class.cash_withdrawal',
  other: 'class.other',
};

/**
 * Exactly four mappings (r05 §9, T3; 017 PC1): the three sources of a set
 * category the contract admits, and none. A validated snapshot carries one of
 * these on every contributing transaction, so there is no fifth case and no
 * fallback.
 */
const PROVENANCE_KEYS: Record<CategorisationSource, StringKey> = {
  manual: 'evidence.provenance.manual',
  learned_rule: 'evidence.provenance.learned_rule',
  automatic: 'evidence.provenance.automatic',
  none: 'evidence.provenance.none',
};

export const EXCLUSION_KEYS: Record<ExclusionClass, StringKey> = {
  notApplicable: 'exclusion.notApplicable',
  notIdentified: 'exclusion.notIdentified',
};

export const EXCLUSION_COUNT_ONLY_KEYS: Record<ExclusionClass, StringKey> = {
  notApplicable: 'exclusion.notApplicable.countOnly',
  notIdentified: 'exclusion.notIdentified.countOnly',
};

export type DetailSelection =
  | { kind: 'counterparty'; counterpartyKey: string }
  | { kind: 'exclusion'; exclusion: ExclusionClass };

interface DetailPaneProps {
  result: AnalysisResult;
  selection: DetailSelection;
  onClose(): void;
}

function ContributionRow({ contribution, result }: { contribution: Contribution; result: AnalysisResult }): JSX.Element {
  const t = useText();
  const locale = useLocale();
  const { transaction } = contribution;

  const provenanceKey = PROVENANCE_KEYS[categorisationSourceOf(transaction)];

  return (
    <li className="detail-row">
      <div className="detail-row-main">
        <span>{formatDate(transaction.bookingDate, locale)}</span>
        <span className="figure">{formatMoney(contribution.amountMinor, contribution.currency, locale)}</span>
        <span>{contribution.accountName}</span>
        <span>{contribution.categoryName ?? t('context.category.uncategorised')}</span>
        <span>{t(CLASS_KEYS[transaction.transactionClass as TransactionClass] ?? 'class.other')}</span>
      </div>
      <div className="detail-row-evidence">
        {transaction.evidenceText !== '' && (
          <p>
            <span className="label">{t('evidence.text')}</span> {transaction.evidenceText}
          </p>
        )}
        <p>{t(provenanceKey)}</p>
        {reversalEvidence(contribution, result.coverage, t, locale).map((line, index) => (
          <p key={index}>{line}</p>
        ))}
      </div>
    </li>
  );
}

export function DetailPane({ result, selection, onClose }: DetailPaneProps): JSX.Element | null {
  const t = useText();
  const locale = useLocale();

  if (selection.kind === 'counterparty') {
    const row = result.rows.find(x => x.counterpartyKey === selection.counterpartyKey);
    if (!row) return null;
    return (
      <aside className="detail-pane">
        <header>
          <h2>{row.displayName}</h2>
          <span className="figure detail-total">{formatMoney(row.moneyOutMinor, row.currency, locale)}</span>
          <span className="secondary">{t('detail.count', { n: row.transactionCount })}</span>
          <span className="secondary">
            {t('detail.period', {
              from: formatDate(result.coverage.fromDate, locale),
              to: formatDate(result.coverage.toDate, locale),
            })}
          </span>
          <Button appearance="subtle" onClick={onClose}>
            {t('detail.close')}
          </Button>
        </header>
        <div className="detail-columns">
          <span>{t('detail.column.date')}</span>
          <span>{t('detail.column.amount')}</span>
          <span>{t('detail.column.account')}</span>
          <span>{t('detail.column.category')}</span>
          <span>{t('detail.column.class')}</span>
        </div>
        <ul className="detail-list">
          {row.contributions.map(contribution => (
            <ContributionRow key={contribution.transactionKey} contribution={contribution} result={result} />
          ))}
        </ul>
      </aside>
    );
  }

  const group = result.exclusions.find(x => x.exclusion === selection.exclusion);
  if (!group) return null;
  const label =
    group.amountMinor === null || group.currency === null
      ? t(EXCLUSION_COUNT_ONLY_KEYS[group.exclusion], { n: group.transactionCount })
      : t(EXCLUSION_KEYS[group.exclusion], {
          n: group.transactionCount,
          amount: formatMoney(group.amountMinor, group.currency, locale),
        });

  return (
    <aside className="detail-pane">
      <header>
        <h2>{label}</h2>
        <span className="secondary">
          {t('detail.period', {
            from: formatDate(result.coverage.fromDate, locale),
            to: formatDate(result.coverage.toDate, locale),
          })}
        </span>
        <Button appearance="subtle" onClick={onClose}>
          {t('detail.close')}
        </Button>
      </header>
      <div className="detail-columns">
        <span>{t('detail.column.date')}</span>
        <span>{t('detail.column.amount')}</span>
        <span>{t('detail.column.account')}</span>
        <span>{t('detail.column.category')}</span>
        <span>{t('detail.column.class')}</span>
      </div>
      <ul className="detail-list">
        {group.contributions.map(contribution => (
          <ContributionRow key={contribution.transactionKey} contribution={contribution} result={result} />
        ))}
      </ul>
    </aside>
  );
}
