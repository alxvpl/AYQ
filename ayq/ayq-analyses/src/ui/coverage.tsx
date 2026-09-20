import type { JSX } from 'react';
import { Popover, PopoverSurface, PopoverTrigger, Button } from '@fluentui/react-components';
import { ChevronDown16Regular } from '@fluentui/react-icons';
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

  // The button's text is one catalogue string. For a limited result the
  // marker that the limited string adds to the full one is the part shown in
  // the attention tone; the date and its label stay in the ordinary
  // foreground (PC7). Nothing is composed here that the catalogue did not.
  let label: JSX.Element | string;
  if (coverage.status === 'insufficient' || coverage.coveredThrough === null) {
    label = t('coverage.button.none');
  } else if (coverage.status === 'limited') {
    const date = formatDate(coverage.coveredThrough, locale);
    const full = t('coverage.button.full', { date });
    const limited = t('coverage.button.limited', { date });
    label = limited.startsWith(full) ? (
      // One inline run, so the catalogue string's own spacing between the
      // date and the marker survives the button's flex layout.
      <span className="coverage-label">
        {full}
        <span className="coverage-attention">{limited.slice(full.length)}</span>
      </span>
    ) : (
      limited
    );
  } else {
    label = t('coverage.button.full', { date: formatDate(coverage.coveredThrough, locale) });
  }

  // The sentence is chosen by the supplied state, never by testing the
  // difference against zero.
  const differs = result.reconciliation.some(fact => fact.state === 'differs');

  return (
    <Popover positioning="below-end" withArrow>
      <PopoverTrigger disableButtonEnhancement>
        <Button appearance="outline" icon={<ChevronDown16Regular />} iconPosition="after">
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
              {t('coverage.flyout.reconciliation.line', {
                account: fact.name,
                text:
                  fact.state === 'agrees'
                    ? t('coverage.flyout.reconciliation.agrees')
                    : // The magnitude the engine supplies (PC4); the signed
                      // difference stays in the structured result.
                      t('coverage.flyout.reconciliation.differs', {
                        amount: formatMoney(fact.differenceMagnitudeMinor, fact.currency, locale),
                      }),
              })}
            </li>
          ))}
        </ul>
        {differs && <p className="coverage-note">{t('coverage.flyout.reconcileNote')}</p>}
      </PopoverSurface>
    </Popover>
  );
}
