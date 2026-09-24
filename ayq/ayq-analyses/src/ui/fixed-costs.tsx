// AYQ Analyses — Fixed costs › Expected now (DS r006 §16; A2 specification
// r001 §9–§12).
//
// This component presents the view model of ../fixed-costs.ts and decides
// nothing about it: which reading a payment has, and which payments appear,
// were settled there from the snapshot's own facts. Every sentence is a
// catalogue sentence of r006 §16; no internal reading name reaches the screen.
// Missing, Not imported yet and Can't tell carry the attention tone on their
// names — in the summary, on their group heading and on each row — and on
// nothing else; Pending and Arrived take no state colour (§16.2).

import type { JSX } from 'react';
import { Button, Popover, PopoverSurface, PopoverTrigger } from '@fluentui/react-components';
import { fixedCostsView, paidMagnitude, READING_ORDER, type FixedCostRow, type Reading } from '../fixed-costs.js';
import { formatDate } from '../format.js';
import { formatCount, formatMoney } from '../money.js';
import type { StringKey } from '../strings.js';
import type { Account, AyqAnalyticalSnapshot } from '../types.js';
import { useLocale, useText } from './text.js';

export const READING_KEYS: Record<Reading, StringKey> = {
  missing: 'fixedCosts.reading.missing',
  notImported: 'fixedCosts.reading.notImported',
  cantTell: 'fixedCosts.reading.cantTell',
  pending: 'fixedCosts.reading.pending',
  arrived: 'fixedCosts.reading.arrived',
};

/** The three readings that may need the owner to act (r006 §16.2). */
const ATTENTION: ReadonlySet<Reading> = new Set<Reading>(['missing', 'notImported', 'cantTell']);

function readingClass(reading: Reading): string {
  return ATTENTION.has(reading) ? 'fc-reading attention-text' : 'fc-reading';
}

export interface ShowTransaction {
  transactionKey: string;
  recordName: string;
}

interface FixedCostsProps {
  snapshot: AyqAnalyticalSnapshot;
  onShowTransaction(selection: ShowTransaction): void;
}

export function FixedCosts({ snapshot, onShowTransaction }: FixedCostsProps): JSX.Element {
  const t = useText();
  const view = fixedCostsView(snapshot);
  const accounts = new Map(snapshot.accounts.map(account => [account.accountKey, account] as const));

  return (
    <section className="fixed-costs" aria-labelledby="fixed-costs-title">
      <h1 id="fixed-costs-title">{t('fixedCosts.title')}</h1>
      {view.kind === 'olderSnapshot' && <p className="fc-state">{t('fixedCosts.unavailable.olderSnapshot')}</p>}
      {view.kind !== 'olderSnapshot' && <AsOf date={view.asOf} />}
      {view.kind === 'empty' && <p className="fc-state">{t('fixedCosts.empty')}</p>}
      {view.kind === 'ready' && (
        <>
          <Summary counts={view.counts} />
          {view.groups.map(group => (
            <section key={group.reading} className="fc-group" data-reading-group={group.reading}>
              <h2 className={readingClass(group.reading)}>{t(READING_KEYS[group.reading])}</h2>
              <ul className="fc-rows">
                {group.rows.map(row => (
                  <Row key={row.occurrenceKey} row={row} accounts={accounts} onShowTransaction={onShowTransaction} />
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
      <p className="secondary fc-not-shown">{t('fixedCosts.notShown.income')}</p>
    </section>
  );
}

/** The one basis date, directly below the title, and its explainer (r006 §16.3). */
function AsOf({ date }: { date: string }): JSX.Element {
  const t = useText();
  const locale = useLocale();
  return (
    <Popover positioning={{ position: 'below', align: 'start' }} withArrow>
      <PopoverTrigger disableButtonEnhancement>
        <Button appearance="transparent" className="fc-as-of" data-fixed-costs-as-of="">
          {t('fixedCosts.asOf', { date: formatDate(date, locale) })}
        </Button>
      </PopoverTrigger>
      <PopoverSurface className="fc-explainer">
        <p>{t('fixedCosts.asOf.explainer')}</p>
      </PopoverSurface>
    </Popover>
  );
}

/**
 * All five counts, zeros included (r006 §16.4), as the one catalogue
 * sentence. The reading names inside it are located in the sentence and the
 * three that need attention take the tone; the sentence itself is never
 * composed here.
 */
function Summary({ counts }: { counts: Record<Reading, number> }): JSX.Element {
  const t = useText();
  const locale = useLocale();
  const sentence = t('fixedCosts.summary', {
    missing: formatCount(counts.missing, locale),
    notImported: formatCount(counts.notImported, locale),
    cantTell: formatCount(counts.cantTell, locale),
    pending: formatCount(counts.pending, locale),
    arrived: formatCount(counts.arrived, locale),
  });
  const parts: JSX.Element[] = [];
  let cursor = 0;
  for (const reading of READING_ORDER) {
    const name = t(READING_KEYS[reading]);
    const at = sentence.indexOf(name, cursor);
    if (at < 0) continue;
    if (at > cursor) parts.push(<span key={`${reading}-before`}>{sentence.slice(cursor, at)}</span>);
    parts.push(
      <span key={reading} className={readingClass(reading)}>
        {name}
      </span>,
    );
    cursor = at + name.length;
  }
  if (cursor < sentence.length) parts.push(<span key="rest">{sentence.slice(cursor)}</span>);
  return (
    <p className="fc-summary" data-fixed-costs-summary="">
      {parts}
    </p>
  );
}

function Row({
  row,
  accounts,
  onShowTransaction,
}: {
  row: FixedCostRow;
  accounts: ReadonlyMap<string, Account>;
  onShowTransaction(selection: ShowTransaction): void;
}): JSX.Element {
  const t = useText();
  const locale = useLocale();
  const { classification } = row;
  const date = (value: string): string => formatDate(value, locale);
  const accountName = row.account?.name ?? '';

  let line: string;
  let secondary: string | null = null;
  let expected: string | null = null;
  switch (classification.reading) {
    case 'arrived': {
      const paid = classification.transaction;
      const paidMinor = paidMagnitude(paid);
      line = t('fixedCosts.arrived.line', {
        date: date(paid.bookingDate),
        amount: formatMoney(paidMinor, paid.amount.currency, locale),
        account: accounts.get(paid.accountKey)?.name ?? paid.accountKey,
      });
      // Only when the paid amount differs, and with no comment (r006 §16.5).
      if (paidMinor !== BigInt(row.expectedAmount.amount) || paid.amount.currency !== row.expectedAmount.currency) {
        expected = t('fixedCosts.arrived.expected', {
          amount: formatMoney(row.expectedAmount.amount, row.expectedAmount.currency, locale),
        });
      }
      break;
    }
    case 'pending':
      line =
        classification.presentation === 'future'
          ? t('fixedCosts.pending.future', { date: date(row.expectedDate) })
          : classification.presentation === 'today'
            ? t('fixedCosts.pending.today')
            : t('fixedCosts.pending.openWindow', { date: date(row.automaticMatchThroughDate) });
      break;
    case 'missing':
      line = t('fixedCosts.missing.line', { account: accountName, date: date(row.automaticMatchThroughDate) });
      secondary = t('fixedCosts.missing.secondary');
      break;
    case 'notImported':
      if (classification.presentation === 'dataEnds') {
        line = t('fixedCosts.notImported.dataEnds', {
          account: accountName,
          lastStatementDate: date(classification.lastStatementDate),
          date: date(row.automaticMatchThroughDate),
        });
      } else {
        line = t('fixedCosts.notImported.gap', {
          account: accountName,
          lastStatementDate: date(classification.lastStatementDate),
        });
        secondary = t('fixedCosts.notImported.gap.secondary');
      }
      break;
    case 'cantTell':
      line = t('fixedCosts.cantTell.line');
      secondary = t('fixedCosts.cantTell.secondary');
      break;
  }

  const coverageAccount =
    (classification.reading === 'missing' || classification.reading === 'notImported') && row.account !== null
      ? accounts.get(row.account.accountKey)
      : undefined;

  return (
    <li className="fc-row" data-occurrence={row.occurrenceKey} data-reading={classification.reading}>
      <div className="fc-row-main">
        <span className="fc-name">{row.recordName}</span>
        <span className="figure fc-amount">{formatMoney(row.expectedAmount.amount, row.expectedAmount.currency, locale)}</span>
        <span className="fc-date">{date(row.expectedDate)}</span>
        {/* A Can't tell row carries no account field (r006 §16.5). */}
        {classification.reading !== 'cantTell' && <span className="fc-account">{accountName}</span>}
      </div>
      <p className="fc-status">
        <span className={readingClass(classification.reading)}>{t(READING_KEYS[classification.reading])}</span>
        <span className="fc-line">{line}</span>
      </p>
      {expected !== null && <p className="fc-secondary">{expected}</p>}
      {secondary !== null && <p className="fc-secondary">{secondary}</p>}
      {(classification.reading === 'arrived' || coverageAccount !== undefined) && (
        <div className="fc-actions">
          {classification.reading === 'arrived' && (
            <Button
              appearance="subtle"
              data-action="show-transaction"
              onClick={() =>
                onShowTransaction({ transactionKey: classification.transaction.transactionKey, recordName: row.recordName })
              }
            >
              {t('fixedCosts.arrived.show')}
            </Button>
          )}
          {coverageAccount !== undefined && <AccountCoverage account={coverageAccount} />}
        </div>
      )}
    </li>
  );
}

/**
 * The row's own account, in the §7 coverage details (r006 §16.11): its
 * coverage interval — or §6.6's form when its start is not established — and
 * its reconciliation line. No production date is shown: the view carries one
 * date, its basis (§16.3).
 */
function AccountCoverage({ account }: { account: Account }): JSX.Element {
  const t = useText();
  const locale = useLocale();
  const coverage = account.statementCoverage;
  const reconciliation = account.reconciliation;
  const text: Record<typeof reconciliation.state, StringKey> = {
    agrees: 'coverage.flyout.reconciliation.agrees',
    differs: 'coverage.flyout.reconciliation.differs',
    unavailable: 'coverage.flyout.reconciliation.unavailable',
  };
  const differsBy =
    reconciliation.state === 'differs'
      ? formatMoney(
          BigInt(reconciliation.difference.amount) < 0n ? -BigInt(reconciliation.difference.amount) : BigInt(reconciliation.difference.amount),
          reconciliation.difference.currency,
          locale,
        )
      : '';
  return (
    <Popover positioning={{ position: 'below', align: 'start' }} withArrow>
      <PopoverTrigger disableButtonEnhancement>
        <Button appearance="subtle" data-action="row-coverage">
          {t('coverage.button.full', { date: formatDate(coverage.lastStatementDate, locale) })}
        </Button>
      </PopoverTrigger>
      <PopoverSurface className="coverage-flyout">
        <ul className="coverage-accounts">
          <li>
            {coverage.coverageStartDate === undefined
              ? t('coverage.flyout.account.unknownStart', {
                  account: account.name,
                  lastStatementDate: formatDate(coverage.lastStatementDate, locale),
                })
              : t('coverage.flyout.account', {
                  account: account.name,
                  openingDate: formatDate(coverage.coverageStartDate, locale),
                  lastStatementDate: formatDate(coverage.lastStatementDate, locale),
                })}
          </li>
        </ul>
        <ul className="coverage-reconciliation">
          <li>
            {t('coverage.flyout.reconciliation.line', {
              account: account.name,
              text: t(text[reconciliation.state], { amount: differsBy }),
            })}
          </li>
        </ul>
        {reconciliation.state === 'differs' && <p className="coverage-note">{t('coverage.flyout.reconcileNote')}</p>}
      </PopoverSurface>
    </Popover>
  );
}
