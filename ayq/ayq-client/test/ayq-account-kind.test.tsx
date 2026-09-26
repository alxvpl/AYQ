// PF-006 in the renderer: the one question about a new account, where its kind
// is changed, the term deposit's own line on Today, reconciliation withheld
// over mixed statements, and an internal transfer named as one.
//
// Every account, amount and date below is invented.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type {
  AyqAccountKind,
  AyqAccountSummary,
  AyqLedgerRow,
  AyqToday,
} from '../src/ayq-ipc-contract.ts';
import { AyqImportScreen } from '../src/ayq-screens/ayq-import.tsx';
import { AyqSettingsAccounts } from '../src/ayq-screens/ayq-settings-accounts.tsx';
import { AyqTodayScreen } from '../src/ayq-screens/ayq-today.tsx';
import { ayqDate, ayqText } from '../src/ayq-strings.ts';
import { AyqGroundProvider } from '../src/ayq-ui/ayq-ground-provider.tsx';
import { ayqOpenWindow, ayqPress, ayqType } from './ayq-react.ts';

const DEPOSIT_KIND: AyqAccountKind = {
  template: 'term-deposit',
  ownership: 'own',
  nature: 'money',
  access: 'locked',
  lockedUntil: '2027-10-01',
  value: 'exact',
  currency: 'EUR',
};

function account(
  id: string,
  name: string,
  balanceCents: number,
  extra: Partial<AyqAccountSummary> = {},
): AyqAccountSummary {
  return {
    id,
    name,
    balanceCents,
    transactionCount: 3,
    countsTowardFunds: true,
    anchor: {
      amountCents: balanceCents,
      coverageDate: '2026-08-31',
      source: 'bank',
      createdAt: '2026-09-01T08:00:00.000Z',
    },
    anchorHistory: [],
    lastImportAt: '2026-09-01T08:00:00.000Z',
    bankDataThrough: '2026-08-31',
    reconciliation: {
      asOf: '2026-08-31',
      statementBalanceCents: balanceCents,
      ledgerBalanceCents: balanceCents,
      differenceCents: 0,
      agrees: true,
      file: 'invented.xml',
      readAt: '2026-09-01T08:00:00.000Z',
    },
    kind: null,
    kindWanted: false,
    mixedStatements: false,
    ...extra,
  };
}

const PAYMENT = account('acc-pay', 'AYQ NL…1111', 250000, {
  kind: { ...DEPOSIT_KIND, template: 'payment', access: 'now', lockedUntil: null },
});
const DEPOSIT = account('acc-dep', 'AYQ NL…3333', 0, {
  countsTowardFunds: false,
  kind: DEPOSIT_KIND,
});
const MIXED = account('acc-mix', 'AYQ NL…5555', 1000, { mixedStatements: true, reconciliation: null });

const TRANSFER_ROW: AyqLedgerRow = {
  id: 't-1',
  date: '2026-08-20',
  payee: 'J. TESTPERSOON',
  amountCents: -9000000,
  account: 'AYQ NL…1111',
  accountId: 'acc-pay',
  category: null,
  categoryId: null,
  categorySource: null,
  cleared: true,
  transferWith: 'AYQ NL…3333',
};

function today(accounts: AyqAccountSummary[]): AyqToday {
  return {
    today: '2026-09-12',
    accounts: {
      accounts,
      coverage: [],
      availableFundsCents: 250000,
      totalBalanceCents: 251000,
      locked: accounts
        .filter(one => one.kind?.access === 'locked')
        .map(one => ({
          accountId: one.id,
          accountName: one.name,
          balanceCents: one.balanceCents,
          lockedUntil: one.kind?.lockedUntil ?? null,
        })),
      reliableTo: '2026-08-31',
      countedWithoutCoverage: 0,
      countedWithoutAnchor: 0,
    },
    lowest: null,
    monthEnd: null,
    waiting: {
      overdue: 0,
      overdueCents: 0,
      matches: 0,
      uncategorised: 0,
      suggestions: 0,
      counterparties: 0,
      total: 0,
    },
  };
}

function engine(accounts: AyqAccountSummary[]) {
  return (request: Record<string, unknown>): unknown => {
    if (request.kind === 'today') return today(accounts);
    if (request.kind === 'attention') return { groups: [] };
    if (request.kind === 'accounts.list') return accounts;
    if (request.kind === 'accounts.setKind') return accounts;
    if (request.kind === 'imports.list') return [];
    if (request.kind === 'transactions.list') {
      return {
        rows: [TRANSFER_ROW],
        total: 1,
        shown: 1,
        incomeCents: 0,
        expenseCents: 0,
        netCents: 0,
        uncategorised: 0,
      };
    }
    if (request.kind === 'categories.list') return [];
    if (request.kind === 'settings.get' || request.kind === 'settings.set') {
      return { ground: 'light' };
    }
    return undefined;
  };
}

const fail = (message: string): never => {
  throw new Error(message);
};

test('Today gives a term deposit its own line, with the date it unlocks (F5)', async () => {
  const window = await ayqOpenWindow(engine([PAYMENT, DEPOSIT]));
  await window.render(
    <AyqGroundProvider>
      <AyqTodayScreen onFailure={fail} onOpen={() => {}} onOpenAccount={() => {}} round={0} />
    </AyqGroundProvider>,
  );

  const line = window.container.querySelector('[data-ayq-locked="acc-dep"]');
  assert.ok(line, 'the term deposit has no line of its own');
  assert.equal(line.getAttribute('data-ayq-locked-until'), '2027-10-01');
  assert.ok(
    (line.textContent ?? '').includes(ayqText('today.locked.until', { date: ayqDate('2027-10-01') })),
    'the line does not say when the deposit unlocks',
  );
  assert.equal(
    window.container.querySelector('[data-ayq-locked="acc-pay"]'),
    null,
    'a payment account is not locked money',
  );
  await window.close();
});

test('a deposit with no known end is shown as locked, without a date (F2)', async () => {
  const undated = { ...DEPOSIT, kind: { ...DEPOSIT_KIND, lockedUntil: null } };
  const window = await ayqOpenWindow(engine([PAYMENT, undated]));
  await window.render(
    <AyqGroundProvider>
      <AyqTodayScreen onFailure={fail} onOpen={() => {}} onOpenAccount={() => {}} round={0} />
    </AyqGroundProvider>,
  );
  const line = window.container.querySelector('[data-ayq-locked="acc-dep"]');
  assert.ok(line);
  assert.equal(line.getAttribute('data-ayq-locked-until'), '');
  assert.ok((line.textContent ?? '').includes(ayqText('today.locked.noDate')));
  await window.close();
});

test('statements of several accounts are never shown as agreeing with the bank (F6)', async () => {
  const window = await ayqOpenWindow(engine([PAYMENT, MIXED]));
  await window.render(
    <AyqGroundProvider>
      <AyqTodayScreen onFailure={fail} onOpen={() => {}} onOpenAccount={() => {}} round={0} />
    </AyqGroundProvider>,
  );
  const row = window.container.querySelector('[data-ayq-today-account="acc-mix"]');
  assert.ok(row);
  assert.equal(row.querySelector('[data-ayq-agrees="true"]'), null);
  assert.ok(row.querySelector('[data-ayq-agrees="mixed"]'), 'the mix is not said');
  assert.ok(!(row.textContent ?? '').includes(ayqText('today.account.agrees')));
  await window.close();
});

test('an internal transfer is named as one, not left uncategorised (F4)', async () => {
  const window = await ayqOpenWindow(engine([PAYMENT, DEPOSIT]));
  await window.render(
    <AyqGroundProvider>
      <AyqTodayScreen onFailure={fail} onOpen={() => {}} onOpenAccount={() => {}} round={0} />
    </AyqGroundProvider>,
  );
  const text = window.container.textContent ?? '';
  assert.ok(
    text.includes(ayqText('register.category.transfer', { account: 'AYQ NL…3333' })),
    'the transfer does not name the other account',
  );
  await window.close();
});

test('an account an import created is asked about once, in one plain question (F2, D3)', async () => {
  const fresh = account('acc-new', 'AYQ NL…7777', 0, {
    kindWanted: true,
    kind: { ...DEPOSIT_KIND, template: null, access: null, lockedUntil: null },
  });
  const window = await ayqOpenWindow(engine([PAYMENT, fresh]));
  await window.render(
    <AyqGroundProvider>
      <AyqImportScreen onImported={() => {}} onFailure={fail} />
    </AyqGroundProvider>,
  );

  const question = window.container.querySelector('[data-ayq-kind-question="acc-new"]');
  assert.ok(question, 'the new account is not asked about');
  assert.equal(
    window.container.querySelector('[data-ayq-kind-question="acc-pay"]'),
    null,
    'an account whose kind is known is asked again',
  );
  // Four choices, "decide later" among them.
  for (const template of ['payment', 'savings', 'term-deposit', 'other']) {
    assert.ok(
      question.querySelector(`[data-ayq-action="kind-${template}-acc-new"]`),
      `the ${template} choice is missing`,
    );
  }

  await ayqPress(question.querySelector('[data-ayq-action="kind-term-deposit-acc-new"]'));
  const sent = window.asked.filter(one => one.kind === 'accounts.setKind');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].accountId, 'acc-new');
  assert.equal(sent[0].template, 'term-deposit');
  await window.close();
});

test('Settings → Accounts changes the kind and the end of the term (F2, A34)', async () => {
  const window = await ayqOpenWindow(engine([PAYMENT, DEPOSIT]));
  await window.render(
    <AyqGroundProvider>
      <AyqSettingsAccounts
        onFailure={fail}
        onChanged={() => {}}
        onOpenAccounts={() => {}}
        onOpenAccount={() => {}}
      />
    </AyqGroundProvider>,
  );

  const select = window.container.querySelector('[data-ayq-kind-select="acc-pay"]');
  assert.ok(select, 'there is no way to change the kind');
  await ayqType(select, 'savings');
  const sent = window.asked.filter(one => one.kind === 'accounts.setKind');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].accountId, 'acc-pay');
  assert.equal(sent[0].template, 'savings');

  // The date field belongs to a term deposit only.
  assert.ok(window.container.querySelector('[data-ayq-kind-locked="acc-dep"]'));
  assert.equal(window.container.querySelector('[data-ayq-kind-locked="acc-pay"]'), null);
  await window.close();
});
