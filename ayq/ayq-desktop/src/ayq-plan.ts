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

import type {
  AyqPlan,
  AyqPlanDraft,
  AyqPlanFrequency,
  AyqPlanState,
  AyqPlanSuggested,
  AyqPlannedRecord,
} from '../../ayq-client/src/ayq-ipc-contract.ts';

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
  ayqWriteStore,
  type AyqPlanOccurrenceRecord,
  type AyqStore,
} from './ayq-store.ts';

export function ayqPlan(dataDir: string, today: string): AyqPlan {
  const store = ayqReadStore(dataDir);
  const { from, to } = ayqPlanWindow(today);
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
): void {
  const store = ayqReadStore(dataDir);
  const record = store.planned.find(one => one.id === recordId);
  if (!record) throw new Error('no such planned payment');
  record.state = state;
  record.updatedAt = now;
  // Accepting an offer makes it a person's decision, and the record has to say
  // so — otherwise a later detection pass could not tell what AYQ suggested
  // from what somebody agreed to (03 §4.3).
  if (state === 'confirmed') record.provenance = 'manual';
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
      createdAt: now,
      updatedAt: now,
    });
    known.add(rhythm.key);
    added += 1;
  }

  if (added > 0) ayqWriteStore(dataDir, store);
  return added;
}

export async function ayqSuggest(
  dataDir: string,
  today: string,
  now: string,
): Promise<AyqPlanSuggested> {
  const added = await ayqSuggestFromRecurring(dataDir, now);
  return { plan: ayqPlan(dataDir, today), added };
}
