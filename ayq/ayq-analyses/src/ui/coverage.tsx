import type { JSX } from 'react';
import { Popover, PopoverSurface, PopoverTrigger, Button } from '@fluentui/react-components';
import { formatDate, formatDateTime, formatList, formatRelative } from '../format.js';
import { formatMoney } from '../money.js';
import { useLocale, useText } from './text.js';
import type { AnalysisResult, CoverageLimit } from '../types.js';

function accountNames(result: AnalysisResult, limit: CoverageLimit, locale: string): string {
  const byKey = new Map(result.coverage.accounts.map(account => [account.accountKey, account.name] as const));
  return formatList(
    limit.accountKeys.map(key => byKey.get(key) ?? key),
    locale,
  );
}

export function accountsOfLimit(result: AnalysisResult, limit: CoverageLimit, locale: string): string {
  return accountNames(result, limit, locale);
}

export function CoverageIndicator({ result }: { result: AnalysisResult }): JSX.Element {
  const t = useText();
  const locale = useLocale();
  const { coverage } = result;

  const label =
    coverage.status === 'insufficient' || coverage.coveredThrough === null
      ? t('coverage.button.none')
      : coverage.status === 'limited'
        ? t('coverage.button.limited', { date: formatDate(coverage.coveredThrough, locale) })
        : t('coverage.button.full', { date: formatDate(coverage.coveredThrough, locale) });

  const differs = result.reconciliation.some(fact => fact.state === 'differs');

  return (
    <Popover positioning="below-end" withArrow>
      <PopoverTrigger disableButtonEnhancement>
        <Button appearance="subtle" className={coverage.status === 'limited' ? 'coverage-attention' : undefined}>
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverSurface className="coverage-flyout">
        <p>
          {t('coverage.flyout.generated', {
            datetime: formatDateTime(result.generatedAt, locale),
            relative: formatRelative(result.generatedAt, new Date(), locale),
          })}
        </p>
        <ul className="coverage-accounts">
          {coverage.accounts.map(account => (
            <li key={account.accountKey}>
              {t('coverage.flyout.account', {
                account: account.name,
                openingDate: formatDate(account.openingDate, locale),
                lastStatementDate: formatDate(account.lastStatementDate, locale),
              })}
            </li>
          ))}
        </ul>
        {coverage.startLimit !== null && (
          <p>
            {t('coverage.flyout.limitStart', {
              date: formatDate(coverage.startLimit.date, locale),
              accounts: accountNames(result, coverage.startLimit, locale),
            })}
          </p>
        )}
        {coverage.endLimit !== null && (
          <p>
            {t('coverage.flyout.limitEnd', {
              date: formatDate(coverage.endLimit.date, locale),
              accounts: accountNames(result, coverage.endLimit, locale),
            })}
          </p>
        )}
        <ul className="coverage-reconciliation">
          {result.reconciliation.map(fact => (
            <li key={fact.accountKey}>
              {fact.name}
              {' — '}
              {fact.state === 'agrees'
                ? t('coverage.flyout.reconciliation.agrees')
                : t('coverage.flyout.reconciliation.differs', {
                    amount: formatMoney(fact.differenceMinor, fact.currency, locale),
                  })}
            </li>
          ))}
        </ul>
        {differs && <p className="coverage-note">{t('coverage.flyout.reconcileNote')}</p>}
      </PopoverSurface>
    </Popover>
  );
}
