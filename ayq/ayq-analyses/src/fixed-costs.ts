// AYQ Analyses — Fixed costs › Expected now (A2 Stage 1).
//
// The question (A2 specification r001 §2): has a payment I expect arrived —
// and if not, is it really missing, or is the period not imported yet?
//
// Everything here is read from the validated contract 1.1 snapshot and
// nothing is computed that AYQ owns (r001 §4). AYQ matched the payment or it
// did not; AYQ states the last day of its automatic matching window; AYQ
// states whether its proven statement coverage spans that window; AYQ states
// the one date all of this is judged as of. This module only reads those
// facts in the order r001 §8 fixes. It does no matching, no date-window
// arithmetic, no coverage arithmetic, and it never reads a clock: every
// comparison below is between two dates the snapshot supplies.

import { parseContractVersion } from '../../ayq-analytical-contract/src/index.ts';
import type { AyqAnalyticalSnapshot, ExpectationRecord, ExpectedOccurrence, IsoDate, Money, Transaction } from './types.js';

/** The five readings, in the one order the summary and the groups use (DS r006 §16.1). Never rendered. */
export type Reading = 'missing' | 'notImported' | 'cantTell' | 'pending' | 'arrived';

export const READING_ORDER: readonly Reading[] = ['missing', 'notImported', 'cantTell', 'pending', 'arrived'];

/** r001 §8.2: which of the three Pending sentences applies. */
export type PendingPresentation = 'future' | 'today' | 'openWindow';

/** r001 §10.4: A — the data ends before the window ends; B — it reaches that far but the window is not proven covered. */
export type NotImportedPresentation = 'dataEnds' | 'gap';

export type Classification =
  | { reading: 'arrived'; transaction: Transaction }
  | { reading: 'pending'; presentation: PendingPresentation }
  | { reading: 'cantTell' }
  | { reading: 'notImported'; presentation: NotImportedPresentation; lastStatementDate: IsoDate }
  | { reading: 'missing' };

export interface FixedCostRow {
  occurrenceKey: string;
  recordKey: string;
  recordName: string;
  /** The occurrence's expected date — its effective date, moved when AYQ rescheduled it. */
  expectedDate: IsoDate;
  expectedAmount: Money;
  automaticMatchThroughDate: IsoDate;
  /** The record's canonical expected account, when the snapshot names one; never inferred. */
  account: { accountKey: string; name: string } | null;
  classification: Classification;
}

export interface FixedCostGroup {
  reading: Reading;
  rows: FixedCostRow[];
}

export type FixedCostsView =
  /** r001 §11.1: a valid snapshot without the contract 1.1 facts. */
  | { kind: 'olderSnapshot' }
  /** r001 §11.2: no confirmed expected expense. */
  | { kind: 'empty'; asOf: IsoDate }
  | {
      kind: 'ready';
      asOf: IsoDate;
      /** One count per reading, zeros included, equal to the rows of its group (r001 §9.2). */
      counts: Record<Reading, number>;
      /** Non-empty groups only, in READING_ORDER (r001 §9.3). */
      groups: FixedCostGroup[];
    };

/**
 * The capability test (r001 §5.1, §11.1): the snapshot declares contract minor
 * 1 or later and therefore carries the expectation facts. The product or build
 * version is never the test. The validator guarantees that a snapshot passing
 * this carries every fact the classification reads.
 */
export function hasExpectationFacts(snapshot: AyqAnalyticalSnapshot): boolean {
  const version = parseContractVersion(snapshot.meta.contractVersion);
  return version !== null && version.minor >= 1 && snapshot.meta.expectationsAsOfDate !== undefined;
}

/**
 * One eligible occurrence's reading, in the normative precedence of r001 §8:
 * Arrived, then Pending while the automatic window is still open, and only
 * once it has closed Can't tell, Not imported yet or Missing.
 */
export function classify(
  occurrence: ExpectedOccurrence,
  record: ExpectationRecord,
  asOf: IsoDate,
  accountLastStatement: ReadonlyMap<string, IsoDate>,
  transactions: ReadonlyMap<string, Transaction>,
): Classification {
  // §8.1 — AYQ matched it to a supplied transaction. The transaction is the
  // evidence; nothing is re-matched.
  if (occurrence.state === 'matched' && occurrence.match !== undefined) {
    const transaction = transactions.get(occurrence.match.transactionKey);
    if (transaction !== undefined) return { reading: 'arrived', transaction };
  }

  const through = requiredFact(occurrence.automaticMatchThroughDate, 'automaticMatchThroughDate', occurrence);

  // §8.2 — the automatic matching date window is still open on the basis date.
  if (through >= asOf) {
    const presentation: PendingPresentation =
      occurrence.expectedDate > asOf ? 'future' : occurrence.expectedDate === asOf ? 'today' : 'openWindow';
    return { reading: 'pending', presentation };
  }

  // §8.3–§8.4 — the window has closed. Without a canonical expected account
  // nothing can be told, whatever the reason the snapshot names none.
  if (record.expectedAccountKey === undefined) return { reading: 'cantTell' };

  const lastStatementDate = accountLastStatement.get(record.expectedAccountKey);
  if (lastStatementDate === undefined) {
    // The validator refuses an expectedAccountKey that does not resolve; a
    // snapshot that reaches this point is not a validated one.
    throw new Error(`expected account ${record.expectedAccountKey} is not in the snapshot`);
  }
  const covered = requiredFact(occurrence.automaticMatchWindowCovered, 'automaticMatchWindowCovered', occurrence);

  // §8.5 — AYQ cannot prove the whole window is covered. lastStatementDate
  // only chooses which of the two sentences says so; it is never the test.
  if (!covered) {
    return { reading: 'notImported', presentation: lastStatementDate < through ? 'dataEnds' : 'gap', lastStatementDate };
  }

  // §8.6 — the whole window is proven covered and no payment was matched.
  return { reading: 'missing' };
}

function requiredFact<T>(value: T | undefined, name: string, occurrence: ExpectedOccurrence): T {
  if (value === undefined) throw new Error(`occurrence ${occurrence.occurrenceKey} carries no ${name}`);
  return value;
}

/** Most recent expected date first; the pending group alone is soonest first (r001 §9.3). */
function compareRows(reading: Reading, a: FixedCostRow, b: FixedCostRow): number {
  const byDate = reading === 'pending' ? compare(a.expectedDate, b.expectedDate) : compare(b.expectedDate, a.expectedDate);
  return byDate || compare(a.recordName, b.recordName) || compare(a.occurrenceKey, b.occurrenceKey);
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Fixed costs › Expected now, from one validated snapshot (r001 §9).
 *
 * Only confirmed expense records take part: expected income and suggestions
 * never appear (r001 §3; spec §9.4). Per record the view shows every
 * occurrence on or before the basis date that has not arrived — with no age
 * limit — the most recent Arrived one, and the next one after the basis date.
 * Dismissed occurrences are never shown.
 */
export function fixedCostsView(snapshot: AyqAnalyticalSnapshot): FixedCostsView {
  const asOf = snapshot.meta.expectationsAsOfDate;
  if (asOf === undefined || !hasExpectationFacts(snapshot)) return { kind: 'olderSnapshot' };

  const records = snapshot.expectationRecords.filter(record => record.kind === 'expense' && record.state === 'confirmed');
  if (records.length === 0) return { kind: 'empty', asOf };

  const accountNames = new Map(snapshot.accounts.map(account => [account.accountKey, account.name] as const));
  const lastStatement = new Map(
    snapshot.accounts.map(account => [account.accountKey, account.statementCoverage.lastStatementDate] as const),
  );
  const transactions = new Map(snapshot.transactions.map(transaction => [transaction.transactionKey, transaction] as const));

  const rows: FixedCostRow[] = [];
  for (const record of records) {
    const account =
      record.expectedAccountKey === undefined
        ? null
        : { accountKey: record.expectedAccountKey, name: accountNames.get(record.expectedAccountKey) ?? record.expectedAccountKey };
    const candidates = snapshot.expectedOccurrences
      .filter(occurrence => occurrence.recordKey === record.recordKey && occurrence.state !== 'dismissed')
      .map(occurrence => ({
        occurrence,
        classification: classify(occurrence, record, asOf, lastStatement, transactions),
      }));

    const shown = new Set<ExpectedOccurrence>();
    // Every occurrence on or before the basis date that has not arrived.
    for (const { occurrence, classification } of candidates) {
      if (occurrence.expectedDate <= asOf && classification.reading !== 'arrived') shown.add(occurrence);
    }
    // The most recent Arrived one.
    const arrived = candidates
      .filter(candidate => candidate.classification.reading === 'arrived')
      .sort((a, b) => compare(b.occurrence.expectedDate, a.occurrence.expectedDate));
    if (arrived.length > 0) shown.add(arrived[0].occurrence);
    // The next one after the basis date.
    const next = candidates
      .filter(candidate => candidate.occurrence.expectedDate > asOf)
      .sort((a, b) => compare(a.occurrence.expectedDate, b.occurrence.expectedDate));
    if (next.length > 0) shown.add(next[0].occurrence);

    for (const { occurrence, classification } of candidates) {
      if (!shown.has(occurrence)) continue;
      rows.push({
        occurrenceKey: occurrence.occurrenceKey,
        recordKey: record.recordKey,
        recordName: record.name,
        expectedDate: occurrence.expectedDate,
        expectedAmount: occurrence.amount,
        automaticMatchThroughDate: requiredFact(occurrence.automaticMatchThroughDate, 'automaticMatchThroughDate', occurrence),
        account,
        classification,
      });
    }
  }

  const counts = Object.fromEntries(READING_ORDER.map(reading => [reading, 0])) as Record<Reading, number>;
  const groups: FixedCostGroup[] = [];
  for (const reading of READING_ORDER) {
    const members = rows.filter(row => row.classification.reading === reading).sort((a, b) => compareRows(reading, a, b));
    counts[reading] = members.length;
    if (members.length > 0) groups.push({ reading, rows: members });
  }
  return { kind: 'ready', asOf, counts, groups };
}
