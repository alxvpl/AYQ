// Which of these keep coming back.
//
// A subscription is not a category, it is a rhythm: the same counterparty, at
// roughly the same interval, for roughly the same amount. Two things make it
// findable here rather than guessable — the canonical counterparty key, so the
// same shop is one series, and the SEPA mandate, which the bank itself uses to
// mark a standing authorisation.
//
// Everything is decided from the dates and amounts already imported. Nothing is
// predicted beyond the next expected date, which is simply the last one plus
// the median interval.

import api from '@actual-app/api';

import type { AyqRecurring } from '../../ayq-client/src/ayq-ipc-contract.ts';
import { ayqReadStore } from './ayq-store.ts';

/** Below this a rhythm is a coincidence. */
const MINIMUM_OCCURRENCES = 3;

type Occurrence = {
  date: string;
  amount: number;
  mandateId: string | null;
  name: string;
};

function days(from: string, to: string): number {
  return Math.round(
    (Date.parse(to) - Date.parse(from)) / (24 * 60 * 60 * 1000),
  );
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[middle - 1] + sorted[middle]) / 2)
    : sorted[middle];
}

/**
 * The name a rhythm goes by.
 *
 * Weekly is 5–9 days rather than exactly 7 because a direct debit lands on a
 * working day, and monthly is 24–38 because months are not equal and a mandate
 * collected on the 31st arrives on the 28th in February.
 */
function cadenceOf(interval: number): string {
  if (interval >= 5 && interval <= 9) return 'weekly';
  if (interval >= 12 && interval <= 17) return 'fortnightly';
  if (interval >= 24 && interval <= 38) return 'monthly';
  if (interval >= 80 && interval <= 100) return 'quarterly';
  if (interval >= 170 && interval <= 195) return 'half-yearly';
  if (interval >= 350 && interval <= 380) return 'yearly';
  return 'irregular';
}

function addDays(date: string, count: number): string {
  const moment = new Date(`${date}T00:00:00Z`);
  moment.setUTCDate(moment.getUTCDate() + count);
  return moment.toISOString().slice(0, 10);
}

/**
 * Every counterparty that comes back.
 *
 * Only money going out: an employer paying a salary every month is a rhythm
 * too, but it is not what a person is looking for when they ask what they are
 * subscribed to. Income keeps its place in the summary.
 */
export async function ayqRecurring(dataDir: string): Promise<AyqRecurring[]> {
  const store = ayqReadStore(dataDir);

  const answer = (await api.aqlQuery(
    api
      .q('transactions')
      .select(['id', 'date', 'amount', 'imported_id', { payee: 'payee.name' }]),
  )) as {
    data?: Array<{
      date: string;
      amount: number;
      imported_id: string | null;
      payee: string | null;
    }>;
  };

  const series = new Map<string, Occurrence[]>();
  for (const row of answer.data ?? []) {
    const amount = Number(row.amount ?? 0);
    if (amount >= 0) continue;

    const provenance = row.imported_id
      ? store.provenance[row.imported_id]
      : undefined;
    const key = provenance?.counterpartyKey ?? row.payee;
    if (!key) continue;

    const bucket = series.get(key);
    const occurrence: Occurrence = {
      date: String(row.date),
      amount,
      mandateId: provenance?.mandateId ?? null,
      name: row.payee ?? key,
    };
    if (bucket) bucket.push(occurrence);
    else series.set(key, [occurrence]);
  }

  const found: AyqRecurring[] = [];
  for (const [key, occurrences] of series) {
    if (occurrences.length < MINIMUM_OCCURRENCES) continue;
    occurrences.sort((left, right) => (left.date < right.date ? -1 : 1));

    const intervals: number[] = [];
    for (let index = 1; index < occurrences.length; index += 1) {
      intervals.push(days(occurrences[index - 1].date, occurrences[index].date));
    }
    const step = median(intervals);
    const cadence = cadenceOf(step);

    const amounts = occurrences.map(occurrence => Math.abs(occurrence.amount));
    const smallest = Math.min(...amounts);
    const largest = Math.max(...amounts);
    const total = amounts.reduce((sum, amount) => sum + amount, 0);
    const mandateId =
      occurrences.find(occurrence => occurrence.mandateId)?.mandateId ?? null;

    // A mandate is the bank's own word that this is a standing arrangement, so
    // it counts even when the dates wander. Without one, the rhythm has to be
    // recognisable on its own.
    if (cadence === 'irregular' && mandateId === null) continue;

    const last = occurrences[occurrences.length - 1];
    found.push({
      key,
      name: last.name,
      occurrences: occurrences.length,
      cadence,
      amountVaries: smallest * 4 < largest * 3,
      averageAmountCents: -Math.round(total / amounts.length),
      lastAmountCents: last.amount,
      firstDate: occurrences[0].date,
      lastDate: last.date,
      nextExpectedDate:
        cadence === 'irregular' ? null : addDays(last.date, step),
      mandateId,
    });
  }

  // Most recent first, then the busiest: what was charged yesterday matters
  // more than what was charged in March.
  found.sort((left, right) => {
    if (left.lastDate !== right.lastDate) {
      return left.lastDate < right.lastDate ? 1 : -1;
    }
    return right.occurrences - left.occurrences;
  });
  return found;
}
