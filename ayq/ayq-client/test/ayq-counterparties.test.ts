// The counterparties workspace, drawn against a real document.
//
// What is being checked is that the screen shows what the engine sent, that a
// person can find one counterparty among many, that opening one asks the engine
// for it, that the imported name variants are visible as evidence, and that
// saying "this variant is that counterparty" sends exactly that decision across
// the boundary and nothing else.
//
// Every counterparty, variant and amount below is invented.

import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import {
  ayqEmptyCounterpartiesState,
  ayqRenderCounterparties,
  type AyqCounterpartiesState,
} from '../src/ayq-counterparties.ts';
import { ayqEuro } from '../src/ayq-format.ts';
import type {
  AyqCounterparty,
  AyqCounterpartyDetail,
  AyqCounterpartyList,
} from '../src/ayq-ipc-contract.ts';
import { AYQ_VIEWS } from '../src/ayq-shell.ts';
import {
  ayqClick,
  ayqOpenShell,
  ayqSettled,
  ayqStubBridge,
  type AyqShellElements,
} from './ayq-jsdom.ts';

const FUEL: AyqCounterparty = {
  key: 'TESTFUEL',
  name: 'TESTFUEL',
  transactions: 2,
  outgoingCents: 8100,
  firstDate: '2026-01-05',
  lastDate: '2026-03-05',
  categoryName: 'Transport',
  recurring: false,
  aliases: 0,
};

const STATION: AyqCounterparty = {
  key: 'TEST FUEL STATION',
  name: 'TEST FUEL STATION',
  transactions: 2,
  outgoingCents: 8500,
  firstDate: '2026-02-05',
  lastDate: '2026-04-05',
  categoryName: null,
  recurring: false,
  aliases: 0,
};

const BOOKSHOP: AyqCounterparty = {
  key: 'TESTBOEKHANDEL',
  name: 'TESTBOEKHANDEL',
  transactions: 3,
  outgoingCents: 3900,
  firstDate: '2026-01-09',
  lastDate: '2026-03-09',
  categoryName: null,
  recurring: true,
  aliases: 0,
};

function listOf(rows: AyqCounterparty[]): AyqCounterpartyList {
  return { rows, total: rows.length, shown: rows.length };
}

const STATION_DETAIL: AyqCounterpartyDetail = {
  counterparty: STATION,
  variants: [
    {
      key: 'TEST FUEL STATION',
      names: ['TEST FUEL STATION'],
      transactions: 2,
      firstDate: '2026-02-05',
      lastDate: '2026-04-05',
      aliased: false,
    },
  ],
  recurring: null,
  recent: [
    {
      id: 't-1',
      date: '2026-04-05',
      payee: 'TEST FUEL STATION',
      amountCents: -4300,
      account: 'AYQ NL…3579',
      accountId: 'acc-1',
      category: null,
      categoryId: null,
      categorySource: null,
      cleared: true,
    },
  ],
};

let shell: AyqShellElements;
let state: AyqCounterpartiesState;

beforeEach(async () => {
  shell = await ayqOpenShell();
  state = ayqEmptyCounterpartiesState();
});

function draw(redraw: (reload: boolean) => void = () => {}): void {
  ayqRenderCounterparties(state, shell.body, redraw, () => {});
}

test('Counterparties is one of the workspaces the shell offers', () => {
  const view = AYQ_VIEWS.find(one => one.id === 'counterparties');
  assert.ok(view, 'the navigation has no Counterparties section');
  assert.equal(view.label, 'Counterparties');
});

test('the counterparties the engine sent are the ones drawn', () => {
  state.list = listOf([STATION, FUEL, BOOKSHOP]);
  draw();

  const rows = [...shell.body.querySelectorAll('.grid tbody tr')];
  assert.equal(rows.length, 3, 'one row per counterparty, no more');

  const first = rows[0];
  assert.equal(
    (first as HTMLElement).dataset.ayqCounterparty,
    'TEST FUEL STATION',
  );
  const text = first.textContent ?? '';
  assert.match(text, /TEST FUEL STATION/);
  assert.match(text, /2/, 'the transaction count the engine sent');
  // The engine's total, formatted. Nothing here adds anything up.
  assert.ok(
    text.includes(ayqEuro(STATION.outgoingCents)),
    `the row does not show ${ayqEuro(STATION.outgoingCents)}`,
  );

  // A rule and a rhythm are facts about a counterparty, and are stated.
  assert.match(rows[1].textContent ?? '', /Transport/);
  assert.match(rows[2].textContent ?? '', /Yes/);
  assert.match(shell.body.querySelector('.count')?.textContent ?? '', /3 count/);
});

test('searching narrows the list, through the engine', () => {
  state.list = listOf([STATION, FUEL, BOOKSHOP]);
  const reloads: boolean[] = [];
  draw(reload => reloads.push(reload));

  const search = shell.body.querySelector(
    '.filters input.search',
  ) as HTMLInputElement | null;
  assert.ok(search, 'the workspace has no search control');

  search.value = 'fuel';
  search.dispatchEvent(new Event('input', { bubbles: true }));

  // The renderer does not filter the list itself: it says what is wanted and
  // the engine answers, which is what keeps it usable at thousands of rows.
  assert.equal(state.filter.search, 'fuel');
  assert.deepEqual(reloads, [true]);

  state.list = listOf([STATION, FUEL]);
  draw();
  assert.equal(shell.body.querySelectorAll('.grid tbody tr').length, 2);

  ayqClick(
    [...shell.body.querySelectorAll('.filters button')].find(
      button => button.textContent === 'Clear',
    ) ?? null,
    'Clear',
  );
  assert.equal(state.filter.search, undefined);
});

test('choosing a counterparty asks the engine for it and opens the panel', async () => {
  state.list = listOf([STATION, FUEL, BOOKSHOP]);
  const log = ayqStubBridge(request =>
    request.kind === 'counterparty.detail' ? STATION_DETAIL : undefined,
  );
  draw(() => draw());

  ayqClick(
    shell.body.querySelector('[data-ayq-counterparty="TEST FUEL STATION"]'),
    'the TEST FUEL STATION row',
  );

  assert.equal(state.openKey, 'TEST FUEL STATION');
  assert.deepEqual(
    log.requests.map(request => [request.kind, request.key]),
    [['counterparty.detail', 'TEST FUEL STATION']],
    'the panel asked the engine for exactly the counterparty that was clicked',
  );

  await ayqSettled();
  draw();

  const panel = shell.body.querySelector('.detail');
  assert.ok(panel, 'no detail panel opened');
  const said = panel.textContent ?? '';
  assert.match(said, /TEST FUEL STATION/);
  assert.ok(
    said.includes(ayqEuro(STATION.outgoingCents)),
    'the panel does not show what the counterparty came to',
  );
  assert.match(said, /First seen/);
  assert.match(said, /Recent transactions/);
});

test('the imported name variants are shown as the evidence they are', async () => {
  state.list = listOf([STATION, FUEL]);
  state.openKey = 'TEST FUEL STATION';
  state.detail = {
    ...STATION_DETAIL,
    variants: [
      STATION_DETAIL.variants[0],
      {
        key: 'TESTFUEL',
        names: ['TESTFUEL 22', 'TESTFUEL 108'],
        transactions: 2,
        firstDate: '2026-01-05',
        lastDate: '2026-03-05',
        aliased: true,
      },
    ],
  };
  draw();

  const keys = [...shell.body.querySelectorAll('.variant-key')].map(
    one => one.textContent,
  );
  assert.deepEqual(keys, ['TEST FUEL STATION', 'TESTFUEL']);

  const names = [...shell.body.querySelectorAll('.variant-names')].map(
    one => one.textContent,
  );
  assert.ok(
    names.some(one => one?.includes('TESTFUEL 22')),
    'the raw names the bank printed are not shown',
  );

  // One was decided by a person and one by the statement, and the screen says
  // which is which rather than presenting them as the same kind of fact.
  const said = shell.body.querySelector('.detail')?.textContent ?? '';
  assert.match(said, /By hand/);
  assert.match(said, /By the statement/);
});

test('assigning a variant sends that decision, and only that', async () => {
  state.list = listOf([STATION, FUEL]);
  state.openKey = 'TEST FUEL STATION';
  state.detail = STATION_DETAIL;

  const log = ayqStubBridge(request =>
    request.kind === 'alias.create'
      ? {
          aliases: [],
          moved: 2,
          counterpartyKey: 'TESTFUEL',
          counterpartyName: 'TESTFUEL',
        }
      : undefined,
  );
  draw();

  const control = shell.body.querySelector(
    '[data-ayq-variant="TEST FUEL STATION"]',
  ) as HTMLSelectElement | null;
  assert.ok(control, 'no control offers to move the variant');

  // The counterparty being looked at is not one of its own targets.
  assert.deepEqual(
    [...control.options].map(one => one.value),
    ['', 'TESTFUEL'],
  );

  control.value = 'TESTFUEL';
  control.dispatchEvent(new Event('change', { bubbles: true }));
  await ayqSettled();

  // The decision, and then a read of the counterparty it went to. Nothing that
  // instructs the engine what to change.
  assert.deepEqual(log.requests.map(request => request.kind), [
    'alias.create',
    'counterparty.detail',
  ]);
  assert.equal(log.requests[1].key, 'TESTFUEL');
  const sent = log.requests[0];
  assert.equal(sent.variantKey, 'TEST FUEL STATION');
  assert.equal(sent.variant, 'TEST FUEL STATION');
  assert.equal(sent.counterpartyKey, 'TESTFUEL');
  // Nothing else crosses: the renderer sends a decision, not an instruction
  // about which transactions to change or what to call them.
  assert.deepEqual(
    Object.keys(sent).sort(),
    ['counterpartyKey', 'id', 'kind', 'variant', 'variantKey'],
  );

  // And the panel follows the transactions to where they went.
  assert.equal(state.openKey, 'TESTFUEL');
  assert.match(state.outcome ?? '', /2 transactions now belong to TESTFUEL/);
});

test('an empty budget says so where the counterparties would be', () => {
  state.list = listOf([]);
  draw();
  assert.match(
    shell.body.querySelector('.empty-title')?.textContent ?? '',
    /No counterparties yet/,
  );

  state.filter = { search: 'nothing like this' };
  draw();
  assert.match(
    shell.body.querySelector('.empty-title')?.textContent ?? '',
    /No counterparty matches/,
  );
});
