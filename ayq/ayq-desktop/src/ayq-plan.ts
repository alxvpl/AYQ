// What is expected to happen: the planned and recurring records, and what has
// been decided about individual occurrences of them.
//
// This is AYQ's own, and deliberately so. Actual has schedules, and two things
// measured at the pinned baseline rule them out: a schedule created through
// `@actual-app/api` carries no category at all, and `importTransactions` links
// an imported transaction to a matching schedule by itself, through the
// schedule's own rule — a decision nobody asked for and nothing records, which
// is the exact automation 03 §4.3–§4.4 exist to prevent.
//
// The rhythm generates the occurrences; only the exceptions are stored. A
// hundred rows that each say "as expected" are a hundred rows that can come to
// disagree with the record they were generated from. The rhythm itself lives in
// `ayq-plan-series.ts`, which touches neither a store nor the API.

import api from '@actual-app/api';

import type {
  AyqForecast,
  AyqForecastPlanRow,
  AyqMatchCandidate,
  AyqMatchProposal,
  AyqMatches,
  AyqPlan,
  AyqPlanDraft,
  AyqPlanFrequency,
  AyqPlanSheet,
  AyqPlanSheetRow,
  AyqPlanState,
  AyqPlanSuggested,
  AyqPlannedRecord,
} from '../../ayq-client/src/ayq-ipc-contract.ts';

import { ayqCanonicalKey } from './ayq-aliases.ts';
import { ayqBudgetMonth, ayqBudgetMonths } from './ayq-budget.ts';
import { ayqMonthOf, ayqMonthsBetween } from './ayq-dates.ts';
import { ayqComputeForecast } from './ayq-forecast.ts';
import { ayqAvailableFunds } from './ayq-funds.ts';
import { ayqAccounts } from './ayq-ledger.ts';
import { ayqProposeMatches } from './ayq-match.ts';
import {
  AYQ_DATE,
  ayqIsOccurrenceOf,
  ayqOccurrencesBetween,
  ayqPlanWindow,
} from './ayq-plan-series.ts';
import { ayqRecurring } from './ayq-recurring.ts';
import {
  ayqId,
  ayqReadStore,
  ayqRowKey,
  ayqWriteStore,
  type AyqPlanOccurrenceRecord,
  type AyqStore,
} from './ayq-store.ts';

export function ayqPlan(dataDir: string, today: string): AyqPlan {
  const store = ayqReadStore(dataDir);
  const { from, to } = ayqPlanWindow(today, store.planned);
  return {
    records: [...store.planned].sort((left, right) =>
      left.name.toLowerCase() < right.name.toLowerCase() ? -1 : 1,
    ),
    occurrences: ayqOccurrencesBetween(
      store.planned,
      store.occurrences,
      from,
      to,
      today,
    ),
    today,
    horizon: to,
  };
}

/**
 * Gathers what the forecast needs, and hands it to the calculation.
 *
 * Everything the forecast reads is decided somewhere else and read back here:
 * the flags say which balances count, the records say what is coming, and
 * Actual's tracking budget says what each category is planned to take. This
 * function does no arithmetic of its own on purpose — the arithmetic is in
 * `ayq-forecast.ts`, which touches no store and no API and can therefore be
 * proved rather than demonstrated.
 */
export async function ayqForecast(
  dataDir: string,
  today: string,
): Promise<AyqForecast> {
  const store = ayqReadStore(dataDir);
  const { from, to } = ayqPlanWindow(today, store.planned);

  const plan: AyqForecastPlanRow[] = [];
  for (const month of ayqMonthsBetween(ayqMonthOf(today), ayqMonthOf(to))) {
    for (const category of (await ayqBudgetMonth(dataDir, month)).categories) {
      // Income categories are not a plan to spend against, and a category with
      // no plan contributes nothing but a row.
      if (category.isIncome || category.planCents <= 0) continue;
      plan.push({
        month,
        categoryName: category.categoryName,
        planCents: category.planCents,
        remainingCents: category.remainingCents,
      });
    }
  }

  return ayqComputeForecast({
    today,
    horizon: to,
    availableFundsCents: ayqAvailableFunds(await ayqAccounts(dataDir)),
    occurrences: ayqOccurrencesBetween(
      store.planned,
      store.occurrences,
      from,
      to,
      today,
    ),
    plan,
  });
}

/**
 * The worksheet for one month.
 *
 * Actual answers the plan and the actual; the forecast answers what is still
 * expected. Both are read here rather than recomputed, so the sheet and the
 * Upcoming screen cannot come to disagree about the same month — which is what
 * 04 A9 is about: Plan and Upcoming read one set of records.
 */
export async function ayqPlanSheet(
  dataDir: string,
  today: string,
  month?: string,
): Promise<AyqPlanSheet> {
  const chosen = month ?? ayqMonthOf(today);
  const budget = await ayqBudgetMonth(dataDir, chosen);

  const expected = new Map<string, number>();
  for (const event of (await ayqForecast(dataDir, today)).events) {
    if (event.kind !== 'expense') continue;
    if (ayqMonthOf(event.date) !== chosen) continue;
    // A record with no category has nothing to sit in on this sheet. It is in
    // the month's own total, and it is on the Upcoming screen where it belongs.
    if (event.categoryName === null) continue;
    expected.set(
      event.categoryName,
      (expected.get(event.categoryName) ?? 0) + event.amountCents,
    );
  }

  const rows: AyqPlanSheetRow[] = budget.categories.map(category => ({
    ...category,
    expectedCents: category.isIncome
      ? 0
      : (expected.get(category.categoryName) ?? 0),
  }));

  return {
    month: chosen,
    editable: budget.editable,
    today,
    months: await ayqBudgetMonths(),
    rows,
    totalPlanCents: budget.totalPlanCents,
    totalActualCents: budget.totalActualCents,
    totalRemainingCents: budget.totalRemainingCents,
    totalExpectedCents: rows.reduce((sum, row) => sum + row.expectedCents, 0),
  };
}

function validate(draft: AyqPlanDraft): void {
  if (draft.name.trim() === '') {
    throw new Error('a planned payment needs a name');
  }
  if (!Number.isInteger(draft.amountCents) || draft.amountCents <= 0) {
    throw new Error('a planned payment needs an amount above zero, in cents');
  }
  if (!AYQ_DATE.test(draft.startDate)) {
    throw new Error('a planned payment needs a start date as YYYY-MM-DD');
  }
  if (draft.endDate != null) {
    if (!AYQ_DATE.test(draft.endDate)) throw new Error('an end date is YYYY-MM-DD');
    if (draft.endDate < draft.startDate) {
      throw new Error('an end date cannot be before the start date');
    }
  }
  if (
    !Number.isFinite(draft.recurrence.interval) ||
    draft.recurrence.interval < 1
  ) {
    throw new Error('an interval is a whole number of periods, at least one');
  }
}

/**
 * Creates or edits a record.
 *
 * A record a person types is `confirmed`: they are the one confirming it
 * (03 §7.7). Only the detection produces `suggested`, and an edit never quietly
 * promotes a suggestion — accepting one is its own act, so the difference
 * between what AYQ noticed and what a person decided survives an edit.
 */
export function ayqSavePlan(
  dataDir: string,
  draft: AyqPlanDraft,
  now: string,
  today: string,
): AyqPlannedRecord {
  validate(draft);
  const store = ayqReadStore(dataDir);

  const fields = {
    name: draft.name.trim(),
    kind: draft.kind,
    amountCents: draft.amountCents,
    categoryName: draft.categoryName?.trim() || null,
    counterpartyKey: draft.counterpartyKey ?? null,
    accountId: draft.accountId ?? null,
    startDate: draft.startDate,
    recurrence: {
      frequency: draft.recurrence.frequency,
      interval: Math.max(1, Math.round(draft.recurrence.interval)),
    },
    endDate: draft.endDate ?? null,
    mandateId: draft.mandateId ?? null,
    updatedAt: now,
  };

  if (draft.id !== undefined) {
    const existing = store.planned.find(one => one.id === draft.id);
    if (!existing) throw new Error('no such planned payment');
    Object.assign(existing, fields);
    ayqWriteStore(dataDir, store);
    return existing;
  }

  const record: AyqPlannedRecord = {
    id: ayqId('plan'),
    ...fields,
    state: 'confirmed',
    provenance: 'manual',
    // Typed and confirmed in one act, so both dates are the day it was typed
    // (03 §7.14). It expects nothing before that, however far back its start
    // date reaches.
    confirmedAt: today,
    suggestedAt: today,
    createdAt: now,
  };
  store.planned.push(record);
  ayqWriteStore(dataDir, store);
  return record;
}

export function ayqSetPlanState(
  dataDir: string,
  recordId: string,
  state: AyqPlanState,
  now: string,
  today: string,
): void {
  const store = ayqReadStore(dataDir);
  const record = store.planned.find(one => one.id === recordId);
  if (!record) throw new Error('no such planned payment');
  record.state = state;
  record.updatedAt = now;
  // Accepting an offer makes it a person's decision, and the record has to say
  // so — otherwise a later detection pass could not tell what AYQ suggested
  // from what somebody agreed to (03 §4.3).
  if (state === 'confirmed') {
    record.provenance = 'manual';
    // The day it was accepted is the day it starts expecting things (§7.14).
    // Only the first confirmation counts: dismissing a record and confirming it
    // again is not a decision to forget the months in between, and moving the
    // date forward would silently drop occurrences already matched against it.
    record.confirmedAt ??= today;
  }
  ayqWriteStore(dataDir, store);
}

export function ayqRemovePlan(dataDir: string, recordId: string): void {
  const store = ayqReadStore(dataDir);
  const before = store.planned.length;
  store.planned = store.planned.filter(one => one.id !== recordId);
  if (store.planned.length === before) {
    throw new Error('no such planned payment');
  }
  // Its occurrences go with it: a decision about an occurrence of a record that
  // no longer exists is a row nothing will ever read again.
  store.occurrences = store.occurrences.filter(
    one => one.recordId !== recordId,
  );
  ayqWriteStore(dataDir, store);
}

/** The stored decision for one occurrence, created if this is the first. */
function decide(
  store: AyqStore,
  record: AyqPlannedRecord,
  dueDate: string,
): AyqPlanOccurrenceRecord {
  const existing = store.occurrences.find(
    one => one.recordId === record.id && one.dueDate === dueDate,
  );
  if (existing) return existing;
  const created: AyqPlanOccurrenceRecord = {
    recordId: record.id,
    dueDate,
    rescheduledTo: null,
    matchedTransactionId: null,
    matchedAt: null,
    matchProvenance: null,
    dismissed: false,
    rejected: [],
  };
  store.occurrences.push(created);
  return created;
}

/** The record and the occurrence, or a refusal that says which was wrong. */
function occurrenceOf(
  store: AyqStore,
  recordId: string,
  dueDate: string,
): AyqPlannedRecord {
  const record = store.planned.find(one => one.id === recordId);
  if (!record) throw new Error('no such planned payment');
  if (!ayqIsOccurrenceOf(record, dueDate)) {
    throw new Error('that payment does not fall on that date');
  }
  return record;
}

export function ayqReschedule(
  dataDir: string,
  recordId: string,
  dueDate: string,
  to: string,
): void {
  if (!AYQ_DATE.test(to)) throw new Error('a date is YYYY-MM-DD');
  const store = ayqReadStore(dataDir);
  const record = occurrenceOf(store, recordId, dueDate);
  // Moving it back to where the rhythm put it is not a reschedule, and is
  // stored as the absence of one rather than as a date that happens to match.
  decide(store, record, dueDate).rescheduledTo = to === dueDate ? null : to;
  ayqWriteStore(dataDir, store);
}

export function ayqDismissOccurrence(
  dataDir: string,
  recordId: string,
  dueDate: string,
  dismissed: boolean,
): void {
  const store = ayqReadStore(dataDir);
  const record = occurrenceOf(store, recordId, dueDate);
  decide(store, record, dueDate).dismissed = dismissed;
  ayqWriteStore(dataDir, store);
}

/** The cadence names the detection uses, as this module's frequencies. */
const CADENCE: Record<string, AyqPlanFrequency> = {
  weekly: 'weekly',
  fortnightly: 'fortnightly',
  monthly: 'monthly',
  quarterly: 'quarterly',
  'half-yearly': 'half-yearly',
  yearly: 'yearly',
};

/**
 * Turns the detected rhythms into offers.
 *
 * Offers, and nothing more: every record created here is `suggested` with
 * `detected` provenance. A rhythm that already has a record — however it got
 * there — is left alone, so running this twice creates nothing and a suggestion
 * somebody dismissed does not come back.
 *
 * The amount is the larger of the last charge and the average of them, because
 * the forecast errs toward showing less money available (03 §7.5).
 */
export async function ayqSuggestFromRecurring(
  dataDir: string,
  now: string,
  today: string,
): Promise<number> {
  const rhythms = await ayqRecurring(dataDir);
  const store = ayqReadStore(dataDir);
  const known = new Set(
    store.planned
      .map(record => record.counterpartyKey)
      .filter((key): key is string => key !== null),
  );

  let added = 0;
  for (const rhythm of rhythms) {
    if (known.has(rhythm.key)) continue;
    const frequency = CADENCE[rhythm.cadence];
    // An irregular rhythm has no next date to project onto. It stays in the
    // Recurring view, which is where a person can still see it.
    if (frequency === undefined || rhythm.nextExpectedDate === null) continue;

    store.planned.push({
      id: ayqId('plan'),
      name: rhythm.name,
      kind: 'expense',
      amountCents: Math.max(
        Math.abs(rhythm.lastAmountCents),
        Math.abs(rhythm.averageAmountCents),
      ),
      categoryName: null,
      counterpartyKey: rhythm.key,
      accountId: null,
      startDate: rhythm.nextExpectedDate,
      recurrence: { frequency, interval: 1 },
      endDate: null,
      state: 'suggested',
      provenance: 'detected',
      mandateId: rhythm.mandateId,
      // A rhythm found in years of statements is suggested today, and expects
      // nothing before today (03 §7.14). The payments it was detected from
      // already happened; they are history, not arrears.
      confirmedAt: null,
      suggestedAt: today,
      createdAt: now,
      updatedAt: now,
    });
    known.add(rhythm.key);
    added += 1;
  }

  if (added > 0) ayqWriteStore(dataDir, store);
  return added;
}

/* ----------------------------------------------------------------- matching

   Everything the matcher needs from the budget, and what it writes back. The
   comparison itself is in `ayq-match.ts` and touches neither.               */

/** The transactions the matcher may consider. */
async function candidates(
  dataDir: string,
  store: AyqStore,
): Promise<AyqMatchCandidate[]> {
  const answer = (await api.aqlQuery(
    api
      .q('transactions')
      // The opening balance is the account's starting point, not a payment
      // anybody planned.
      .filter({ starting_balance_flag: false })
      .select(['id', 'date', 'amount', 'imported_id', { payee: 'payee.name' }]),
  )) as {
    data?: Array<{
      id: string;
      date: string;
      amount: number;
      imported_id: string | null;
      payee: string | null;
    }>;
  };

  return (answer.data ?? []).map(row => {
    const provenance = store.provenance[ayqRowKey(row)];
    return {
      transactionId: String(row.id),
      date: String(row.date),
      amountCents: Number(row.amount ?? 0),
      payee: row.payee ?? null,
      // The canonical key, aliases applied, because that is what a record
      // written against a counterparty is written against.
      counterpartyKey: ayqCanonicalKey(store, provenance?.counterpartyKey),
      mandateId: provenance?.mandateId ?? null,
    };
  });
}

function matchInput(store: AyqStore, today: string) {
  const { from, to } = ayqPlanWindow(today, store.planned);
  const occurrences = ayqOccurrencesBetween(
    store.planned,
    store.occurrences,
    from,
    to,
    today,
  ).filter(
    one => one.state !== 'matched' && one.state !== 'dismissed',
  );

  return {
    occurrences,
    recordKeys: new Map(
      store.planned.map(record => [
        record.id,
        { key: record.counterpartyKey, mandateId: record.mandateId },
      ]),
    ),
    taken: new Set(
      store.occurrences
        .map(one => one.matchedTransactionId)
        .filter((id): id is string => id !== null),
    ),
    refused: new Map(
      store.occurrences.map(one => [
        `${one.recordId} ${one.dueDate}`,
        new Set(one.rejected),
      ]),
    ),
  };
}

/**
 * Looks for matches, applies the clear ones, and offers the rest.
 *
 * Only the clear ones, and only where nothing is being overwritten: an
 * occurrence a person has already matched by hand is left exactly as it is
 * (03 §4.4). Automation revising its own earlier work would be allowed; it does
 * not need to here, because a matched occurrence is not offered again.
 */
export async function ayqRunMatching(
  dataDir: string,
  today: string,
  now: string,
): Promise<AyqMatches> {
  const store = ayqReadStore(dataDir);
  const proposals = ayqProposeMatches({
    ...matchInput(store, today),
    candidates: await candidates(dataDir, store),
  });

  let applied = 0;
  const waiting: AyqMatchProposal[] = [];
  for (const proposal of proposals) {
    if (!proposal.confident) {
      waiting.push(proposal);
      continue;
    }
    const record = store.planned.find(one => one.id === proposal.recordId);
    if (!record) continue;
    const decided = decide(store, record, proposal.dueDate);
    // Never over a person's decision, in either direction.
    if (decided.matchProvenance === 'manual') continue;
    decided.matchedTransactionId = proposal.transactionId;
    decided.matchedAt = now;
    decided.matchProvenance = 'automatic';
    applied += 1;
  }

  if (applied > 0) ayqWriteStore(dataDir, store);
  return { applied, proposals: waiting, plan: ayqPlan(dataDir, today) };
}

/**
 * A person saying these two are the same payment.
 *
 * And AYQ learning from it: a record typed by hand has no counterparty key, so
 * it can never match automatically. Taking the key from the transaction the
 * person just pointed at means next month's does — which is 04 A6, review
 * shrinking as decisions accumulate, applied to the forecast.
 */
export async function ayqApplyMatch(
  dataDir: string,
  recordId: string,
  dueDate: string,
  transactionId: string,
  today: string,
  now: string,
): Promise<AyqMatches> {
  const store = ayqReadStore(dataDir);
  const record = occurrenceOf(store, recordId, dueDate);

  const taken = store.occurrences.find(
    one =>
      one.matchedTransactionId === transactionId &&
      !(one.recordId === recordId && one.dueDate === dueDate),
  );
  if (taken) {
    throw new Error(
      'that transaction is already matched to another expected payment',
    );
  }

  const decided = decide(store, record, dueDate);
  decided.matchedTransactionId = transactionId;
  decided.matchedAt = now;
  decided.matchProvenance = 'manual';
  // A refusal and a match of the same pair contradict each other; the newer
  // decision is the one that stands (00 §1).
  decided.rejected = decided.rejected.filter(id => id !== transactionId);

  if (record.counterpartyKey === null) {
    const learned = (await candidates(dataDir, store)).find(
      one => one.transactionId === transactionId,
    );
    if (learned?.counterpartyKey) {
      record.counterpartyKey = learned.counterpartyKey;
      record.updatedAt = now;
    }
    if (record.mandateId === null && learned?.mandateId) {
      record.mandateId = learned.mandateId;
      record.updatedAt = now;
    }
  }

  ayqWriteStore(dataDir, store);
  return { applied: 0, proposals: [], plan: ayqPlan(dataDir, today) };
}

/** A person saying they are not, remembered so it is not offered again. */
export function ayqRejectMatch(
  dataDir: string,
  recordId: string,
  dueDate: string,
  transactionId: string,
  today: string,
): AyqMatches {
  const store = ayqReadStore(dataDir);
  const record = occurrenceOf(store, recordId, dueDate);
  const decided = decide(store, record, dueDate);
  if (!decided.rejected.includes(transactionId)) {
    decided.rejected.push(transactionId);
  }
  if (decided.matchedTransactionId === transactionId) {
    decided.matchedTransactionId = null;
    decided.matchedAt = null;
    decided.matchProvenance = null;
  }
  ayqWriteStore(dataDir, store);
  return { applied: 0, proposals: [], plan: ayqPlan(dataDir, today) };
}

/** Undoing a match, whoever made it. The transaction is untouched. */
export function ayqUnmatch(
  dataDir: string,
  recordId: string,
  dueDate: string,
  today: string,
): AyqMatches {
  const store = ayqReadStore(dataDir);
  const record = occurrenceOf(store, recordId, dueDate);
  const decided = decide(store, record, dueDate);
  decided.matchedTransactionId = null;
  decided.matchedAt = null;
  decided.matchProvenance = null;
  ayqWriteStore(dataDir, store);
  return { applied: 0, proposals: [], plan: ayqPlan(dataDir, today) };
}

export async function ayqSuggest(
  dataDir: string,
  today: string,
  now: string,
): Promise<AyqPlanSuggested> {
  const added = await ayqSuggestFromRecurring(dataDir, now, today);
  return { plan: ayqPlan(dataDir, today), added };
}
