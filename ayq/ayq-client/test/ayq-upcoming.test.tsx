// Upcoming, against the rules 03 §7 states and 04 A3/A4 shape.
//
// What is checked here is the part a screen can get wrong: that the table is the
// forecast rather than a second arithmetic over the records; that a row which is
// the unaccounted part of a category's plan is not offered actions it has no
// record for; that every action says what it reaches; that a single payment is
// offered nothing that reaches beyond itself (§7.17); that an overdue occurrence
// says it still counts (§7.13); that a suggestion says it is one (§7.7, §7.12);
// and that a match AYQ is not sure of waits for a person and crosses the
// boundary as exactly that decision and nothing else (§7.16).
//
// Every record, counterparty, amount and date below is invented.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type {
  AyqForecast,
  AyqMatches,
  AyqPlan,
  AyqPlannedRecord,
} from '../src/ayq-ipc-contract.ts';
import { AyqUpcomingScreen } from '../src/ayq-screens/ayq-upcoming.tsx';
import { ayqText } from '../src/ayq-strings.ts';
import { AyqGroundProvider } from '../src/ayq-ui/ayq-ground-provider.tsx';
import { ayqOpenWindow, ayqPress, ayqType } from './ayq-react.ts';

const TODAY = '2026-09-12';

function record(over: Partial<AyqPlannedRecord> & { id: string }): AyqPlannedRecord {
  return {
    name: 'Invented rent',
    kind: 'expense',
    amountCents: 120_000,
    categoryName: 'Housing',
    counterpartyKey: null,
    accountId: null,
    startDate: '2026-09-01',
    recurrence: { frequency: 'monthly', interval: 1 },
    endDate: null,
    state: 'confirmed',
    provenance: 'manual',
    mandateId: null,
    confirmedAt: '2026-08-20',
    suggestedAt: null,
    createdAt: '2026-08-20T09:00:00Z',
    updatedAt: '2026-08-20T09:00:00Z',
    ...over,
  };
}

const RENT = record({ id: 'rec-rent' });
const ONCE = record({
  id: 'rec-once',
  name: 'Invented deposit',
  amountCents: 45_000,
  startDate: '2026-09-20',
  recurrence: { frequency: 'once', interval: 1 },
  categoryName: null,
});
const GYM = record({
  id: 'rec-gym',
  name: 'Invented gym',
  amountCents: 2_500,
  startDate: '2026-09-08',
  state: 'suggested',
  provenance: 'detected',
  confirmedAt: null,
  suggestedAt: '2026-09-12',
});

const PLAN: AyqPlan = {
  records: [RENT, ONCE, GYM],
  occurrences: [
    {
      recordId: 'rec-rent',
      name: RENT.name,
      kind: 'expense',
      amountCents: 120_000,
      categoryName: 'Housing',
      dueDate: '2026-09-01',
      effectiveDate: '2026-09-01',
      state: 'overdue',
      suggested: false,
      matchedTransactionId: null,
      matchProvenance: null,
    },
    {
      recordId: 'rec-once',
      name: ONCE.name,
      kind: 'expense',
      amountCents: 45_000,
      categoryName: null,
      dueDate: '2026-09-20',
      effectiveDate: '2026-09-20',
      state: 'expected',
      suggested: false,
      matchedTransactionId: null,
      matchProvenance: null,
    },
    {
      recordId: 'rec-gym',
      name: GYM.name,
      kind: 'expense',
      amountCents: 2_500,
      categoryName: 'Housing',
      dueDate: '2026-09-08',
      effectiveDate: '2026-09-08',
      state: 'expected',
      suggested: true,
      matchedTransactionId: null,
      matchProvenance: null,
    },
    // Put away by a person. It is not in the forecast — that is what dismissing
    // does — and the screen still has to show it, or the decision cannot be
    // undone.
    {
      recordId: 'rec-rent',
      name: RENT.name,
      kind: 'expense',
      amountCents: 120_000,
      categoryName: 'Housing',
      dueDate: '2026-10-01',
      effectiveDate: '2026-10-01',
      state: 'dismissed',
      suggested: false,
      matchedTransactionId: null,
      matchProvenance: null,
    },
  ],
  today: TODAY,
  horizon: '2027-09-12',
};

const FORECAST: AyqForecast = {
  today: TODAY,
  horizon: '2027-09-12',
  availableFundsCents: 300_000,
  events: [
    {
      date: TODAY,
      kind: 'expense',
      label: RENT.name,
      amountCents: 120_000,
      source: 'record',
      recordId: 'rec-rent',
      dueDate: '2026-09-01',
      categoryName: 'Housing',
      suggested: false,
      // 03 §7.13: past its date, unmatched, still counted, and flagged.
      flagged: true,
      balanceCents: 180_000,
    },
    {
      date: '2026-09-08',
      kind: 'expense',
      label: GYM.name,
      amountCents: 2_500,
      source: 'record',
      recordId: 'rec-gym',
      dueDate: '2026-09-08',
      categoryName: 'Housing',
      suggested: true,
      flagged: false,
      balanceCents: 177_500,
    },
    {
      date: '2026-09-20',
      kind: 'expense',
      label: ONCE.name,
      amountCents: 45_000,
      source: 'record',
      recordId: 'rec-once',
      dueDate: '2026-09-20',
      categoryName: null,
      suggested: false,
      flagged: false,
      balanceCents: 132_500,
    },
    // 03 §7.11: the part of a category's plan no record accounts for.
    {
      date: '2026-09-30',
      kind: 'expense',
      label: 'Groceries',
      amountCents: 30_000,
      source: 'plan',
      recordId: null,
      dueDate: null,
      categoryName: 'Groceries',
      suggested: false,
      flagged: false,
      balanceCents: 102_500,
    },
  ],
  months: [
    {
      month: '2026-09',
      expectedIncomeCents: 0,
      expectedExpenseCents: 197_500,
      closingCents: 102_500,
    },
  ],
  lowest: { date: '2026-09-30', balanceCents: 102_500 },
  closingCents: 102_500,
};

const OFFER: AyqMatches = {
  applied: 0,
  proposals: [
    {
      recordId: 'rec-rent',
      dueDate: '2026-09-01',
      recordName: RENT.name,
      expectedDate: '2026-09-01',
      expectedAmountCents: 120_000,
      transactionId: 'tx-1',
      transactionDate: '2026-09-04',
      transactionPayee: 'TESTVERHUUR B.V.',
      transactionAmountCents: -120_000,
      daysApart: 3,
      evidence: ['the amount is exact', 'the counterparty has not been decided'],
      confident: false,
    },
  ],
  plan: PLAN,
};

/** The engine, answering only what this screen asks. */
function engine(over: Partial<Record<string, unknown>> = {}) {
  return (request: Record<string, unknown>): unknown => {
    if (request.kind === 'forecast') return over.forecast ?? FORECAST;
    if (request.kind === 'plan.list') return over.plan ?? PLAN;
    if (request.kind === 'match.propose') return over.matches ?? OFFER;
    if (request.kind === 'categories.list') {
      return [
        { id: 'cat-1', name: 'Housing', groupId: 'g', groupName: 'Home', isIncome: false },
        { id: 'cat-2', name: 'Groceries', groupId: 'g', groupName: 'Home', isIncome: false },
      ];
    }
    // Every decision the screen sends comes back as a fresh plan, the way the
    // engine answers it.
    if (String(request.kind).startsWith('plan.')) return PLAN;
    if (String(request.kind).startsWith('match.')) return OFFER;
    return undefined;
  };
}

function screen() {
  return (
    <AyqGroundProvider>
      <AyqUpcomingScreen
        onFailure={message => {
          throw new Error(message);
        }}
        onNotice={() => {}}
      />
    </AyqGroundProvider>
  );
}

function rows(window: { container: HTMLElement }): HTMLElement[] {
  return [
    ...window.container.querySelectorAll('[data-ayq-table="upcoming"] tbody tr'),
  ] as HTMLElement[];
}

function rowFor(window: { container: HTMLElement }, key: string): HTMLElement {
  const found = rows(window).find(one => one.getAttribute('data-ayq-row') === key);
  assert.ok(found, `there is no row ${key}`);
  return found;
}

test('the table is the forecast, with the running position beside each row', async () => {
  const window = await ayqOpenWindow(engine());
  await window.render(screen());

  // Every event the engine projected, and nothing the screen worked out itself.
  const drawn = rows(window).map(one => one.getAttribute('data-ayq-row'));
  // In date order, and an overdue occurrence sits where the forecast counts it
  // — on today, not on the date it was due (03 §7.13).
  assert.deepEqual(drawn, [
    'record:rec-gym:2026-09-08',
    'record:rec-rent:2026-09-01',
    'record:rec-once:2026-09-20',
    'plan:2026-09-30:Groceries:30000',
    // The dismissed occurrence, which is not in the projection and is here so
    // that the decision can be seen and undone.
    'record:rec-rent:2026-10-01',
  ]);

  // The position after each row is the forecast's own figure.
  const rent = rowFor(window, 'record:rec-rent:2026-09-01');
  assert.equal(
    rent
      .querySelector('[data-ayq-cell="balance"] [data-ayq-figure]')
      ?.getAttribute('data-ayq-figure'),
    '180000',
  );
  // An expense is drawn as money leaving, not as a magnitude.
  assert.equal(
    rent
      .querySelector('[data-ayq-cell="amount"] [data-ayq-figure]')
      ?.getAttribute('data-ayq-figure'),
    '-120000',
  );

  // A dismissed occurrence has no position after it, and says so rather than
  // showing a figure that would imply it was counted.
  const put = rowFor(window, 'record:rec-rent:2026-10-01');
  assert.equal(
    put.querySelector('[data-ayq-cell="balance"] [data-ayq-figure]'),
    null,
  );
  assert.match(
    put.querySelector('[data-ayq-cell="balance"]')?.textContent ?? '',
    new RegExp(ayqText('upcoming.notCounted')),
  );

  await window.close();
});

test('each row carries the state the engine gave it, in its own tone', async () => {
  const window = await ayqOpenWindow(engine());
  await window.render(screen());

  const stateOf = (key: string): string | null =>
    rowFor(window, key)
      .querySelector('[data-ayq-cell="state"] [data-ayq-state]')
      ?.getAttribute('data-ayq-state') ?? null;

  // 03 §7.13 flagged, §7.12 suggested, §7.11 the plan's remainder.
  assert.equal(stateOf('record:rec-rent:2026-09-01'), 'overdue');
  assert.equal(stateOf('record:rec-gym:2026-09-08'), 'suggested');
  assert.equal(stateOf('record:rec-once:2026-09-20'), 'confirmed');
  assert.equal(stateOf('plan:2026-09-30:Groceries:30000'), 'neutral');

  await window.close();
});

test('the part of a plan no record accounts for is not offered actions', async () => {
  const window = await ayqOpenWindow(engine());
  await window.render(screen());

  await ayqPress(rowFor(window, 'plan:2026-09-30:Groceries:30000'));

  const said = window.container.querySelector('[data-ayq-plan-remainder]');
  assert.ok(said, 'the pane does not say what this row is');
  assert.match(said.textContent ?? '', /no record accounts for/);

  // Nothing to dismiss, move, end or remove: there is no record behind it.
  assert.equal(window.container.querySelector('[data-ayq-scope]'), null);

  await window.close();
});

test('every action says what it reaches, and the two scopes are separate', async () => {
  const window = await ayqOpenWindow(engine());
  await window.render(screen());

  await ayqPress(rowFor(window, 'record:rec-rent:2026-09-01'));

  const scoped = (where: string): string[] => {
    const block = window.container.querySelector(`[data-ayq-scope="${where}"]`);
    assert.ok(block, `the pane has no ${where}-scoped actions`);
    return [...block.querySelectorAll('[data-ayq-action]')].map(
      one => one.getAttribute('data-ayq-action') ?? '',
    );
  };

  // 03 §7.17: moving and dismissing reach this date and no other, and ending
  // the series is an action of its own rather than what dismissing does.
  const occurrence = scoped('occurrence');
  const whole = scoped('record');
  assert.ok(occurrence.includes('occurrence-reschedule'));
  assert.ok(occurrence.includes('occurrence-dismiss'));
  assert.ok(!occurrence.includes('record-end-series'));
  assert.ok(!whole.includes('occurrence-dismiss'));
  assert.ok(whole.includes('record-end-series'));
  assert.ok(whole.includes('record-edit'));

  // And each block says its scope in words, not only in an attribute.
  assert.match(
    window.container.querySelector('[data-ayq-scope="occurrence"]')?.textContent ?? '',
    new RegExp(ayqText('upcoming.do.scope.occurrence')),
  );
  assert.match(
    window.container.querySelector('[data-ayq-scope="record"]')?.textContent ?? '',
    new RegExp(ayqText('upcoming.do.scope.record')),
  );

  await window.close();
});

test('a single payment is offered nothing that reaches beyond itself (§7.17)', async () => {
  const window = await ayqOpenWindow(engine());
  await window.render(screen());

  await ayqPress(rowFor(window, 'record:rec-once:2026-09-20'));

  assert.ok(
    window.container.querySelector('[data-ayq-single]'),
    'the pane does not say this is a single payment',
  );
  const whole = [
    ...(window.container.querySelector('[data-ayq-scope="record"]')?.querySelectorAll(
      '[data-ayq-action]',
    ) ?? []),
  ].map(one => one.getAttribute('data-ayq-action'));
  assert.ok(
    !whole.includes('record-end-series'),
    'a payment with a date and no rhythm was offered an end to a series',
  );

  // It still has its own occurrence actions: what §7.17 forbids is reach, not
  // action.
  const occurrence = window.container.querySelector('[data-ayq-scope="occurrence"]');
  assert.ok(occurrence?.querySelector('[data-ayq-action="occurrence-dismiss"]'));

  await window.close();
});

test('an overdue occurrence says it still counts, and why (§7.13)', async () => {
  const window = await ayqOpenWindow(engine());
  await window.render(screen());

  await ayqPress(rowFor(window, 'record:rec-rent:2026-09-01'));

  const said = window.container.querySelector('[data-ayq-overdue]');
  assert.ok(said, 'the pane does not say the occurrence is overdue');
  assert.match(said.textContent ?? '', /still counts/);
  assert.match(said.textContent ?? '', /match, reschedule or dismiss/);

  await window.close();
});

test('a suggestion says it is an offer, not a decision (§7.7, §7.12)', async () => {
  const window = await ayqOpenWindow(engine());
  await window.render(screen());

  await ayqPress(rowFor(window, 'record:rec-gym:2026-09-08'));

  const said = window.container.querySelector('[data-ayq-suggested]');
  assert.ok(said, 'the pane does not say the record is only suggested');
  assert.match(said.textContent ?? '', /offer, not a decision/);

  // And accepting it is a record-scoped action a person takes, not a state the
  // screen assumes.
  assert.ok(
    window.container.querySelector('[data-ayq-action="record-accept"]'),
    'a suggestion cannot be accepted from here',
  );

  await window.close();
});

test('moving one occurrence sends that, and only that', async () => {
  const window = await ayqOpenWindow(engine());
  await window.render(screen());
  await ayqPress(rowFor(window, 'record:rec-rent:2026-09-01'));

  await ayqType(window.container.querySelector('[data-ayq-move-to]'), '2026-09-18');
  await ayqPress(
    window.container.querySelector('[data-ayq-action="occurrence-reschedule"]'),
  );

  const sent = window.asked.find(one => one.kind === 'plan.reschedule');
  assert.ok(sent, 'nothing was sent');
  assert.equal(sent.recordId, 'rec-rent');
  assert.equal(sent.dueDate, '2026-09-01', 'it moved an occurrence it was not asked to');
  assert.equal(sent.to, '2026-09-18');
  // The occurrence, the date it is on and the date it goes to. Nothing about
  // the series, and nothing that instructs the engine what else to change.
  assert.deepEqual(Object.keys(sent).sort(), ['dueDate', 'id', 'kind', 'recordId', 'to']);

  await window.close();
});

test('ending a series sets a last date and leaves the rhythm alone', async () => {
  const window = await ayqOpenWindow(engine());
  await window.render(screen());
  await ayqPress(rowFor(window, 'record:rec-rent:2026-09-01'));

  await ayqType(window.container.querySelector('[data-ayq-end-on]'), '2027-01-31');
  await ayqPress(
    window.container.querySelector('[data-ayq-action="record-end-series"]'),
  );

  const sent = window.asked.find(one => one.kind === 'plan.save');
  assert.ok(sent, 'nothing was sent');
  const saved = sent.record as Record<string, unknown>;
  assert.equal(saved.id, 'rec-rent');
  assert.equal(saved.endDate, '2027-01-31');
  // Everything else is the record as it was: ending a series is a last date and
  // not a rewrite of what the series is.
  assert.equal(saved.name, RENT.name);
  assert.equal(saved.amountCents, RENT.amountCents);
  assert.deepEqual(saved.recurrence, RENT.recurrence);
  assert.equal(saved.startDate, RENT.startDate);

  await window.close();
});

test('a match AYQ is unsure of waits, with the evidence for agreeing to it', async () => {
  const window = await ayqOpenWindow(engine());
  await window.render(screen());

  // 03 §7.16: offered, never applied. The screen says how many are waiting.
  assert.equal(
    window.container
      .querySelector('[data-ayq-matches]')
      ?.getAttribute('data-ayq-matches'),
    '1',
  );

  const offer = window.container.querySelector('[data-ayq-proposal="rec-rent:2026-09-01"]');
  assert.ok(offer, 'the offered match is not on the screen');
  const said = offer.textContent ?? '';
  assert.match(said, /Invented rent/);
  assert.match(said, /TESTVERHUUR B\.V\./);
  // The evidence, in words, so agreeing to it is informed rather than blind.
  const evidence = offer.querySelector('[data-ayq-evidence]')?.textContent ?? '';
  assert.match(evidence, /the amount is exact/);
  assert.match(evidence, /3 days apart/);

  await window.close();
});

test('agreeing to a match sends that decision and nothing else', async () => {
  const window = await ayqOpenWindow(engine());
  await window.render(screen());

  await ayqPress(window.container.querySelector('[data-ayq-action="match-apply"]'));

  const sent = window.asked.find(one => one.kind === 'match.apply');
  assert.ok(sent, 'nothing was sent');
  assert.deepEqual(Object.keys(sent).sort(), [
    'dueDate',
    'id',
    'kind',
    'recordId',
    'transactionId',
  ]);
  assert.equal(sent.recordId, 'rec-rent');
  assert.equal(sent.dueDate, '2026-09-01');
  assert.equal(sent.transactionId, 'tx-1');

  await window.close();
});

test('refusing a match is a decision too, and is the one that is sent', async () => {
  const window = await ayqOpenWindow(engine());
  await window.render(screen());

  await ayqPress(window.container.querySelector('[data-ayq-action="match-reject"]'));

  const sent = window.asked.find(one => one.kind === 'match.reject');
  assert.ok(sent, 'nothing was sent');
  assert.equal(sent.transactionId, 'tx-1');
  assert.equal(
    window.asked.filter(one => one.kind === 'match.apply').length,
    0,
    'refusing a match applied one',
  );

  await window.close();
});

test('a new record is written through one editor, and nothing is guessed', async () => {
  const window = await ayqOpenWindow(engine());
  await window.render(screen());

  await ayqPress(window.container.querySelector('[data-ayq-action="plan-new"]'));
  const form = window.container.querySelector('[data-ayq-record-form]');
  assert.ok(form, 'the editor did not open');

  await ayqType(window.container.querySelector('[data-ayq-field="name"]'), 'Invented water');
  await ayqType(window.container.querySelector('[data-ayq-field="amount"]'), '31.40');
  await ayqType(window.container.querySelector('[data-ayq-field="frequency"]'), 'quarterly');
  await ayqType(window.container.querySelector('[data-ayq-field="start"]'), '2026-10-01');
  await ayqPress(window.container.querySelector('[data-ayq-action="record-save"]'));

  const sent = window.asked.find(one => one.kind === 'plan.save');
  assert.ok(sent, 'nothing was saved');
  const saved = sent.record as Record<string, unknown>;
  assert.equal(saved.name, 'Invented water');
  // Cents, from what was typed, and positive: the direction is the kind's.
  assert.equal(saved.amountCents, 3_140);
  assert.equal(saved.kind, 'expense');
  assert.equal(saved.startDate, '2026-10-01');
  assert.deepEqual(saved.recurrence, { frequency: 'quarterly', interval: 1 });
  assert.equal(saved.id, undefined, 'a new record was saved over an existing one');

  await window.close();
});

test('editing a record opens the same editor on the record that is there', async () => {
  const window = await ayqOpenWindow(engine());
  await window.render(screen());
  await ayqPress(rowFor(window, 'record:rec-gym:2026-09-08'));
  await ayqPress(window.container.querySelector('[data-ayq-action="record-edit"]'));

  const field = window.container.querySelector('[data-ayq-field="name"]');
  assert.ok(field, 'the editor did not open');
  assert.equal((field as HTMLInputElement).value, GYM.name);
  assert.equal(
    (window.container.querySelector('[data-ayq-field="start"]') as HTMLInputElement)
      .value,
    GYM.startDate,
  );

  await window.close();
});

test('a record with no name or no amount is refused before it is sent', async () => {
  const refusals: string[] = [];
  const window = await ayqOpenWindow(engine());
  await window.render(
    <AyqGroundProvider>
      <AyqUpcomingScreen
        onFailure={message => refusals.push(message)}
        onNotice={() => {}}
      />
    </AyqGroundProvider>,
  );

  await ayqPress(window.container.querySelector('[data-ayq-action="plan-new"]'));
  await ayqPress(window.container.querySelector('[data-ayq-action="record-save"]'));
  assert.deepEqual(refusals, [ayqText('upcoming.form.needsName')]);

  await ayqType(window.container.querySelector('[data-ayq-field="name"]'), 'Invented');
  await ayqPress(window.container.querySelector('[data-ayq-action="record-save"]'));
  assert.deepEqual(refusals.at(-1), ayqText('upcoming.form.needsAmount'));

  assert.equal(
    window.asked.filter(one => one.kind === 'plan.save').length,
    0,
    'an incomplete record reached the engine',
  );

  await window.close();
});

test('nothing expected says so, rather than drawing an empty table', async () => {
  const window = await ayqOpenWindow(
    engine({
      forecast: { ...FORECAST, events: [] },
      plan: { ...PLAN, occurrences: [] },
      matches: { ...OFFER, proposals: [] },
    }),
  );
  await window.render(screen());

  assert.match(
    window.container.querySelector('[data-ayq-table="upcoming"][data-ayq-empty]')
      ?.textContent ?? '',
    new RegExp(ayqText('upcoming.empty')),
  );
  // And no queue of matches where there are none.
  assert.equal(
    window.container
      .querySelector('[data-ayq-matches]')
      ?.getAttribute('data-ayq-matches'),
    '0',
  );
  assert.equal(window.container.querySelector('[data-ayq-proposal]'), null);

  await window.close();
});
