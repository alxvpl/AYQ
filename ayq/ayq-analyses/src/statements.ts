import { classifyUnmatchedOccurrences, fixedCosts, latestCompleteMonth, reliabilitySummary, summarizeMonthChange } from './analysis.js';
import type { AnalysisContext, AyqAnalyticalSnapshot } from './types.js';

export type StatementTier = 'Measured' | 'Derived' | 'Insufficient';
export type StatementPriority = 1 | 2 | 3 | 4;

export interface OverviewStatement {
  id: string;
  subject: string;
  subjectLabel: string;
  tier: StatementTier;
  priority: StatementPriority;
  attention: boolean;
  title: string;
  detail: string;
  evidencePath: string;
  routeContext?: Partial<AnalysisContext>;
}

export interface OverviewCard {
  subject: string;
  subjectLabel: string;
  primary: OverviewStatement;
  secondary: OverviewStatement[];
}

export interface OverviewPolicy {
  /**
   * Working-material threshold. Null means deliberately suppressed until the
   * exact r002d materiality value is recovered/accepted. Dominance remains 40%.
   */
  spendMaterialityAbsolute: number | null;
  spendDominanceShare: number;
  coverageLagDays: number;
}

export const DEFAULT_OVERVIEW_POLICY: OverviewPolicy = {
  spendMaterialityAbsolute: null,
  spendDominanceShare: 0.40,
  coverageLagDays: 21,
};

export const STATEMENT_REGISTRY = [
  { id: 'ST_SPEND_CHANGE', tier: 'Derived', evidencePath: 'Explore → Trends' },
  { id: 'ST_EXPECTED_MISSING', tier: 'Measured', evidencePath: 'Fixed costs / Expected vs actual' },
  { id: 'ST_RECURRING_CHANGE', tier: 'Measured', evidencePath: 'Fixed costs' },
  { id: 'ST_RECONCILIATION', tier: 'Measured', evidencePath: 'Reliability panel' },
  { id: 'ST_COVERAGE_LAG', tier: 'Measured', evidencePath: 'Reliability panel' },
] as const;

function routeForMonth(month: string): Partial<AnalysisContext> {
  return {
    fromMonth: month,
    toMonth: month,
    compare: 'previous',
    metric: 'money-out',
    dimension: 'categoryId',
  };
}

function daysBetween(a: string, b: string): number {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

export function buildOverviewStatements(
  snapshot: AyqAnalyticalSnapshot,
  reportingMonth = latestCompleteMonth(snapshot),
  policy: OverviewPolicy = DEFAULT_OVERVIEW_POLICY,
): OverviewStatement[] {
  const statements: OverviewStatement[] = [];
  const newestMonth = latestCompleteMonth(snapshot);
  const isNewest = reportingMonth === newestMonth;

  if (policy.spendMaterialityAbsolute !== null) {
    const change = summarizeMonthChange(snapshot, reportingMonth);
    const movement = Math.abs(change.delta);
    const leading = change.contributors[0];
    const dominantShare = movement > 0 && leading ? Math.abs(leading.delta) / movement : 0;
    if (movement >= policy.spendMaterialityAbsolute && leading && dominantShare >= policy.spendDominanceShare) {
      statements.push({
        id: 'ST_SPEND_CHANGE',
        subject: `spending:${reportingMonth}`,
        subjectLabel: 'Spending',
        tier: 'Derived',
        priority: 3,
        attention: true,
        title: `Spending changed by ${change.delta >= 0 ? '+' : '−'}${Math.abs(change.delta)} minor units`,
        detail: `${leading.label} explains ${Math.round(dominantShare * 100)}% of the movement.`,
        evidencePath: 'Explore → Trends',
        routeContext: routeForMonth(reportingMonth),
      });
    }
  }

  const costs = fixedCosts(snapshot);
  for (const item of costs.items) {
    const subject = `expectation:${item.recordKey}`;
    const historyBeforeEnd = item.paidHistory.filter(point => point.effectiveDate.slice(0, 7) <= reportingMonth);
    if (historyBeforeEnd.length >= 2) {
      const latest = historyBeforeEnd.at(-1)!;
      const previous = historyBeforeEnd.at(-2)!;
      const windowStart = `${Number(reportingMonth.slice(0, 4)) - 1}-${reportingMonth.slice(5, 7)}`;
      if (latest.effectiveDate.slice(0, 7) >= windowStart) {
        statements.push({
          id: 'ST_RECURRING_CHANGE',
          subject,
          subjectLabel: item.name,
          tier: item.evidenceStatus === 'proven' ? 'Measured' : 'Insufficient',
          priority: item.evidenceStatus === 'proven' ? 2 : 4,
          attention: false,
          title: `${item.name} changed amount`,
          detail: `${previous.amount} → ${latest.amount} minor units from ${latest.effectiveDate}.`,
          evidencePath: 'Fixed costs',
        });
      }
    }
  }

  if (isNewest) {
    for (const classification of classifyUnmatchedOccurrences(snapshot).filter(x => x.kind === 'missing')) {
      statements.push({
        id: 'ST_EXPECTED_MISSING',
        subject: `expectation:${classification.record.recordKey}`,
        subjectLabel: classification.record.name,
        tier: 'Measured',
        priority: 1,
        attention: true,
        title: `${classification.record.name} did not arrive`,
        detail: `Expected ${classification.occurrence.expectedDate}; the named account is already covered through that date.`,
        evidencePath: 'Fixed costs / Expected vs actual',
      });
    }

    const reliability = reliabilitySummary(snapshot);
    for (const account of reliability.accounts) {
      const subject = `account:${account.accountKey}`;
      if (account.reconciliationState !== 'agrees' && account.reconciliationDifference.amount !== 0) {
        statements.push({
          id: 'ST_RECONCILIATION',
          subject,
          subjectLabel: account.name,
          tier: 'Measured',
          priority: 1,
          attention: true,
          title: `${account.name} does not reconcile`,
          detail: `Difference: ${Math.abs(account.reconciliationDifference.amount)} minor units.`,
          evidencePath: 'Reliability panel',
        });
      }
      const lag = daysBetween(account.lastStatementDate, snapshot.meta.generatedAt.slice(0, 10));
      if (account.countsTowardAvailableFunds && lag > policy.coverageLagDays) {
        statements.push({
          id: 'ST_COVERAGE_LAG',
          subject,
          subjectLabel: account.name,
          tier: 'Measured',
          priority: 2,
          attention: true,
          title: `${account.name} statement coverage is behind`,
          detail: `Coverage ends ${account.lastStatementDate} (${lag} days before the snapshot).`,
          evidencePath: 'Reliability panel',
        });
      }
    }
  }

  return statements;
}

export function editorializeOverview(statements: OverviewStatement[]): OverviewCard[] {
  const bySubject = new Map<string, OverviewStatement[]>();
  for (const statement of statements) {
    const list = bySubject.get(statement.subject) ?? [];
    list.push(statement);
    bySubject.set(statement.subject, list);
  }

  const cards: OverviewCard[] = [];
  for (const [subject, group] of bySubject) {
    const attention = group.filter(x => x.attention);
    if (attention.length === 0) continue;
    const ordered = [...group].sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
    cards.push({
      subject,
      subjectLabel: ordered[0].subjectLabel,
      primary: ordered[0],
      secondary: ordered.slice(1),
    });
  }
  return cards.sort((a, b) => a.primary.priority - b.primary.priority || a.subjectLabel.localeCompare(b.subjectLabel));
}
