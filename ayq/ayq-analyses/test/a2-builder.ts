// A2 test helper: a valid contract 1.1 snapshot with exactly the expectation
// records and occurrences a test names, built on the contract's own synthetic
// 1.1 baseline and passed through the shared validator. Its world:
// generatedAt 2026-03-05T06:00Z, judged as of 2026-03-05; "Everyday account"
// covered 2025-01-01 – 2026-03-04; "Card account" through 2026-02-28 with its
// start not established. All values are invented.

import { baselineV11Json } from '../../ayq-analytical-contract/fixtures/synthetic.ts';
import { validateSnapshot } from '../src/validate.js';
import type { AyqAnalyticalSnapshot } from '../src/types.js';

export const AS_OF = '2026-03-05';

export type RecordSpec = {
  key: string;
  name?: string;
  kind?: 'expense' | 'income';
  state?: 'confirmed' | 'suggested';
  account?: string;
  amount?: number;
  counterpartyKey?: string;
};

export type OccurrenceSpec = {
  key: string;
  record: string;
  expected: string;
  through: string;
  covered?: boolean;
  amount?: number;
  dismissed?: boolean;
  matchedTo?: string;
};

/** A valid 1.1 snapshot with exactly these records and occurrences. */
export function build(records: RecordSpec[], occurrences: OccurrenceSpec[], asOf = AS_OF): AyqAnalyticalSnapshot {
  const raw = baselineV11Json() as Record<string, any>;
  raw.meta.expectationsAsOfDate = asOf;
  const withAccount = new Set(records.filter(r => r.account !== undefined).map(r => r.key));
  raw.expectationRecords = records.map(r => ({
    recordKey: r.key,
    kind: r.kind ?? 'expense',
    name: r.name ?? r.key,
    ...(r.counterpartyKey !== undefined ? { counterpartyKey: r.counterpartyKey } : {}),
    category: { state: 'uncategorised' },
    amount: { amount: r.amount ?? 5000, currency: 'EUR' },
    schedule: { type: 'recurring', frequency: 'monthly', interval: 1, anchorDate: '2025-01-10' },
    state: r.state ?? 'confirmed',
    stateSince: '2025-01-01',
    ...(r.account !== undefined ? { expectedAccountKey: r.account } : {}),
  }));
  raw.expectedOccurrences = occurrences.map(o => ({
    occurrenceKey: o.key,
    recordKey: o.record,
    expectedDate: o.expected,
    amount: { amount: o.amount ?? records.find(r => r.key === o.record)?.amount ?? 5000, currency: 'EUR' },
    state: o.matchedTo !== undefined ? 'matched' : o.dismissed ? 'dismissed' : o.expected < asOf ? 'overdue' : 'expected',
    ...(o.matchedTo !== undefined ? { match: { transactionKey: o.matchedTo, source: 'automatic', matchedOn: asOf } } : {}),
    automaticMatchThroughDate: o.through,
    ...(withAccount.has(o.record) ? { automaticMatchWindowCovered: o.covered ?? false } : {}),
  }));
  raw.meta.counts.expectedOccurrences = occurrences.length;
  return validateSnapshot(raw);
}

