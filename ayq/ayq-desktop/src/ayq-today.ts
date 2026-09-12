// Today (04 A21): what you have, how long it lasts, and what is waiting on you.
//
// One answer, so that the three questions are answered from one reading of the
// budget rather than from four that could disagree with each other. Every
// figure is the engine's own and every count is counted here and now — a queue
// length that is stored is a queue length that can be wrong.

import type { AyqToday, AyqWaiting } from '../../ayq-client/src/ayq-ipc-contract.ts';

import { ayqAccountsView } from './ayq-coverage.ts';
import { ayqUnfiled } from './ayq-ledger.ts';
import { ayqForecast, ayqPlan, ayqRunMatching } from './ayq-plan.ts';
import { ayqMonthOf } from './ayq-dates.ts';
import { ayqUncategorisedCount } from './ayq-rules.ts';

export async function ayqTodayView(
  dataDir: string,
  today: string,
  now: string,
): Promise<AyqToday> {
  const accounts = await ayqAccountsView(dataDir);
  const forecast = await ayqForecast(dataDir, today);

  // 03 §7.13: an expected payment past its date and unmatched still counts,
  // and is flagged. Counted off the forecast rather than recounted here, so
  // the number on Today and the rows on Upcoming cannot come to disagree.
  const overdue = forecast.events.filter(event => event.flagged);

  const month = ayqMonthOf(today);
  const monthEnd = forecast.months.find(one => one.month === month) ?? null;

  // Offered and waiting for a person, never applied on their behalf (§7.16).
  const matches = await ayqRunMatching(dataDir, today, now);

  const plan = ayqPlan(dataDir, today);

  const waiting: AyqWaiting = {
    overdue: overdue.length,
    overdueCents: overdue.reduce((sum, event) => sum + event.amountCents, 0),
    matches: matches.proposals.length,
    uncategorised: await ayqUncategorisedCount(),
    suggestions: plan.records.filter(one => one.state === 'suggested').length,
    counterparties: (await ayqUnfiled(dataDir)).length,
    total: 0,
  };
  waiting.total =
    waiting.overdue +
    waiting.matches +
    waiting.uncategorised +
    waiting.suggestions +
    waiting.counterparties;

  return {
    today,
    accounts,
    lowest: forecast.lowest,
    monthEnd:
      monthEnd === null
        ? null
        : { month: monthEnd.month, closingCents: monthEnd.closingCents },
    waiting,
  };
}
