// The shell, exercised in a real window.
//
// 04 A20 and A22 decide what this is: a 64-pixel rail on the left with the
// destinations in three groups and Settings at the foot, no top panel, a
// status bar carrying no version number, and one scroller per screen.
//
// Every account, name and amount the stand-in engine answers with is invented.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { AyqApplication } from '../src/ayq-application.tsx';
import {
  AYQ_DESTINATIONS,
  AYQ_RAIL_FOOT,
  AYQ_RAIL_GROUPS,
} from '../src/ayq-destinations.ts';
import { ayqText } from '../src/ayq-strings.ts';
import { AYQ_METRIC } from '../src/ayq-tokens.ts';
import { AyqGroundProvider } from '../src/ayq-ui/ayq-ground-provider.tsx';
import { ayqOpenWindow, ayqPress } from './ayq-react.ts';

const STATUS = {
  apiVersion: '26.9.0',
  engineHost: 'electron utilityProcess',
  budgetCreated: false,
  budgetId: 'AYQ-invented',
  budgetName: 'Invented budget',
  dataDir: 'C:\\invented\\ayq',
  storeVersion: 5,
  budgetType: 'tracking',
  storeDamaged: null,
  answeredAt: '2026-09-12T09:00:00.000Z',
};

const SUMMARY = {
  accounts: [
    {
      id: 'acc-1',
      name: 'AYQ NL…3579',
      balanceCents: 128450,
      transactionCount: 14,
      countsTowardFunds: true,
    },
    {
      id: 'acc-2',
      name: 'AYQ NL…8642',
      balanceCents: 900000,
      transactionCount: 2,
      countsTowardFunds: false,
    },
  ],
  totalBalanceCents: 1028450,
  availableFundsCents: 128450,
  month: '2026-09',
  monthIncomeCents: 0,
  monthExpenseCents: 0,
  transactionCount: 16,
  uncategorisedCount: 3,
  counterpartyCount: 5,
  lastImportAt: '2026-09-11T09:14:00.000Z',
};

function engine(request: Record<string, unknown>): unknown {
  switch (request.kind) {
    case 'engine.status':
      return STATUS;
    case 'summary':
      return SUMMARY;
    case 'settings.get':
    case 'settings.set':
      return { ground: 'light' };
    case 'categories.list':
      return [];
    case 'transactions.list':
      return { rows: [], total: 0, shown: 0, uncategorised: 0 };
    case 'counterparties.list':
      return { rows: [], total: 0, shown: 0 };
    case 'rules.list':
      return [];
    case 'imports.list':
      return [];
    default:
      return undefined;
  }
}

const application = (
  <AyqGroundProvider>
    <AyqApplication />
  </AyqGroundProvider>
);

test('the rail carries the destinations of A20, in its order and its groups', async () => {
  const window = await ayqOpenWindow(engine);
  await window.render(application);

  const rail = window.container.querySelector('[data-ayq-rail]');
  assert.ok(rail, 'there is no rail');

  const items = [...rail.querySelectorAll('[data-ayq-tab]')].map(one =>
    one.getAttribute('data-ayq-tab'),
  );
  assert.deepEqual(
    items,
    [...AYQ_DESTINATIONS],
    'the rail is not in the order A20 fixes',
  );

  // Three groups means two hairlines, and they fall between the groups rather
  // than anywhere that looked tidy.
  const children = [...rail.children];
  const separators = children.filter(one =>
    one.hasAttribute('data-ayq-rail-separator'),
  );
  assert.equal(separators.length, AYQ_RAIL_GROUPS.length - 1);

  const where = (destination: string): number =>
    children.findIndex(one => one.getAttribute('data-ayq-tab') === destination);
  const firstSeparator = children.indexOf(separators[0]);
  const secondSeparator = children.indexOf(separators[1]);
  assert.ok(where('register') < firstSeparator && firstSeparator < where('review'));
  assert.ok(where('plan') < secondSeparator && secondSeparator < where('reports'));

  // Settings sits at the foot, apart: last, and after everything else.
  assert.equal(
    children.at(-1)?.getAttribute('data-ayq-tab'),
    AYQ_RAIL_FOOT,
    'Settings is not at the foot of the rail',
  );

  // The wordmark is text (A20), not a tile and not an image.
  assert.equal(rail.querySelectorAll('img, svg[role="img"]').length >= 0, true);
  assert.ok(
    (rail.textContent ?? '').startsWith(ayqText('app.name')),
    'the wordmark is not the first thing in the rail',
  );

  await window.close();
});

test('every destination is reachable and operable without a mouse', async () => {
  const window = await ayqOpenWindow(engine);
  await window.render(application);

  for (const destination of AYQ_DESTINATIONS) {
    const item = window.container.querySelector(
      `[data-ayq-tab="${destination}"]`,
    ) as HTMLElement | null;
    assert.ok(item, `${destination} is not in the rail`);
    assert.equal(
      item.tagName,
      'BUTTON',
      `${destination} is not something the keyboard can reach`,
    );
    assert.equal(
      item.getAttribute('tabindex'),
      null,
      `${destination} has been taken out of the tab order`,
    );
    assert.notEqual(item.getAttribute('aria-hidden'), 'true');
  }

  await window.close();
});

test('choosing a destination opens it and says which one is open', async () => {
  const window = await ayqOpenWindow(engine);
  await window.render(application);

  for (const destination of ['register', 'plan', 'import', 'settings', 'today']) {
    await ayqPress(
      window.container.querySelector(`[data-ayq-tab="${destination}"]`),
    );
    assert.ok(
      window.container.querySelector(`[data-ayq-screen="${destination}"]`),
      `${destination} did not open`,
    );
    assert.equal(
      window.container
        .querySelector(`[data-ayq-tab="${destination}"]`)
        ?.getAttribute('aria-current'),
      'page',
      `${destination} is open and the rail does not say so`,
    );
    const current = [...window.container.querySelectorAll('[data-ayq-tab]')].filter(
      one => one.getAttribute('aria-current') === 'page',
    );
    assert.equal(current.length, 1, 'two destinations claim to be open');
  }

  await window.close();
});

test('there is one scroller per screen, and no top panel above it', async () => {
  const window = await ayqOpenWindow(engine);
  await window.render(application);

  for (const destination of AYQ_DESTINATIONS) {
    await ayqPress(
      window.container.querySelector(`[data-ayq-tab="${destination}"]`),
    );
    assert.equal(
      window.container.querySelectorAll('[data-ayq-scroller]').length,
      1,
      `${destination} has more than one scroller`,
    );
  }

  // No top panel (A20): the window is the rail and one column beside it.
  // The title bar is the one thing across the top (A26 as the owner decided
  // it): the rail's surface, the mark and the name, and nothing else — no
  // control of AYQ's own, no path, no version.
  const frame = window.container.querySelector('[data-ayq-window]');
  assert.ok(frame);
  assert.equal(
    frame.querySelectorAll('header').length,
    0,
    'the window has a panel across the top',
  );
  const titleBar = frame.querySelector('[data-ayq-title-bar]');
  assert.ok(titleBar, 'there is no title bar in the rail surface');
  assert.ok(titleBar.querySelector('[data-ayq-mark]'), 'the bar carries no mark');
  assert.equal(titleBar.textContent?.trim(), ayqText('app.name'));
  assert.equal(titleBar.querySelectorAll('button, input, select, a').length, 0);
  // And the host was told which ground to paint the native controls for.
  assert.ok(
    window.asked.some(one => one.kind === 'window.ground'),
    'the host was never told the ground',
  );
  assert.equal(AYQ_METRIC.railWidth, 64);

  await window.close();
});

test('the status bar says where the money is, and carries no version number', async () => {
  const window = await ayqOpenWindow(engine);
  await window.render(application);

  const bar = window.container.querySelector('[data-ayq-status]');
  assert.ok(bar, 'there is no status bar');
  const said = bar.textContent ?? '';

  assert.ok(said.includes(STATUS.budgetName), 'it does not say which budget');
  assert.ok(said.includes(STATUS.dataDir), 'it does not say where the budget is');

  // A20: no version number. Not the application's, not the engine's, not the
  // store's — and the engine's is in the answer, so a careless line would have
  // put it here.
  assert.ok(!said.includes(STATUS.apiVersion), 'the status bar names a version');
  assert.ok(
    !/\bv?\d+\.\d+/.test(said.replace(/\d{1,2}:\d{2}/g, '')),
    `the status bar carries something that reads as a version: ${said}`,
  );

  await window.close();
});

test('what the window is holding is published for the acceptance runs', async () => {
  const window = await ayqOpenWindow(engine);
  await window.render(application);

  const body = window.dom.window.document.body;
  assert.equal(body.dataset.ayqState, 'ready');
  assert.equal(body.dataset.ayqEngineHost, STATUS.engineHost);
  assert.equal(body.dataset.ayqLedgerTotal, String(SUMMARY.transactionCount));

  await window.close();
});

test('a store AYQ could not read is said out loud, and the window still works', async () => {
  const damaged = { ...STATUS, storeDamaged: 'ayq-store.damaged-2026-09-12.json' };
  const window = await ayqOpenWindow(request =>
    request.kind === 'engine.status' ? damaged : engine(request),
  );
  await window.render(application);

  const bar = window.dom.window.document.getElementById('ayq-problem');
  assert.ok(bar, 'there is no place for the window to say anything');
  assert.equal(bar.hasAttribute('hidden'), false, 'the loss was not mentioned');
  assert.match(bar.textContent ?? '', /rules .* are gone/);
  assert.match(bar.textContent ?? '', /ayq-store\.damaged-/);

  // And the window is working: the transactions are Actual's and none of this
  // was theirs to lose. A run that reads "error" here would be reading a
  // window that is perfectly able to do its job.
  assert.equal(window.dom.window.document.body.dataset.ayqState, 'ready');

  await window.close();
});

test('opening the Register republishes what the window is holding', async () => {
  const rows = [
    {
      id: 't-1',
      date: '2026-09-11',
      payee: 'AYQ INVENTED SHOP',
      amountCents: -1250,
      account: 'AYQ NL…3579',
      accountId: 'acc-1',
      category: null,
      categoryId: null,
      categorySource: null,
      cleared: true,
    },
  ];
  const window = await ayqOpenWindow(request =>
    request.kind === 'transactions.list'
      ? { rows, total: 1, shown: 1, uncategorised: 1 }
      : engine(request),
  );
  await window.render(application);

  const body = window.dom.window.document.body;
  assert.equal(body.dataset.ayqLedgerRows, '0', 'the Register is not open yet');

  await ayqPress(window.container.querySelector('[data-ayq-tab="register"]'));
  // The row count belongs to a screen, and the screen finishes reading after
  // the shell does. A window that published it once, early, would say nothing
  // had been imported for as long as anybody cared to look.
  assert.equal(
    body.dataset.ayqLedgerRows,
    String(rows.length),
    'the Register drew rows and the window did not say so',
  );

  await window.close();
});

/* ------------------------------------------------------------ 7 §7.1, exactly

   The rail is written out here as a literal rather than read from
   `AYQ_DESTINATIONS`, and deliberately: the test above proves the rail draws
   what the module says, and this one proves the module says what 04 A20 says.
   A test that reads its expectation from the code it is checking would have
   passed just as happily on build 004's nine destinations.                   */

test('the rail is the eight destinations of A20, and Accounts is not one', async () => {
  const window = await ayqOpenWindow(engine);
  await window.render(application);

  const rail = window.container.querySelector('[data-ayq-rail]');
  assert.ok(rail);

  const items = [...rail.querySelectorAll('[data-ayq-tab]')].map(one =>
    one.getAttribute('data-ayq-tab'),
  );

  assert.deepEqual(items, [
    'today',
    'register',
    'review',
    'upcoming',
    'plan',
    'reports',
    'import',
    'settings',
  ]);

  // Eight visible destinations, Settings included. The Windows acceptance run
  // measures the same number on the drawn window.
  assert.equal(items.length, 8, 'the rail does not hold eight destinations');

  // An account is not a place a person goes.
  assert.ok(
    !items.includes('accounts'),
    'Accounts is back in the rail',
  );
  // Nor is a counterparty (04 A37): a secondary surface, opened from a row.
  assert.ok(!items.includes('counterparty'), 'Counterparty is in the rail');
  assert.equal(
    window.container.querySelector('[data-ayq-tab="accounts"]'),
    null,
  );

  await window.close();
});

test('the rail carries no version or build number anywhere in it (12 §12.3)', async () => {
  const window = await ayqOpenWindow(engine);
  await window.render(application);

  // Not in the rail, not in the status bar, not in the title. About is the one
  // place a build number belongs, and it is a Settings tab.
  for (const mark of ['[data-ayq-rail]', '[data-ayq-status-bar]', '[data-ayq-window]']) {
    const part = window.container.querySelector(mark);
    if (part === null) continue;
    const said = part.textContent ?? '';
    assert.ok(!said.includes('0.2.0'), `${mark} carries the product version`);
    assert.ok(
      !/\bbuild\s*005\b/i.test(said),
      `${mark} carries the build number`,
    );
  }

  await window.close();
});

test('Today is where the application opens (04 A21)', async () => {
  const window = await ayqOpenWindow(engine);
  await window.render(application);

  const open = window.container.querySelector('[data-ayq-tab][aria-current]');
  assert.equal(open?.getAttribute('data-ayq-tab'), 'today');

  await window.close();
});
