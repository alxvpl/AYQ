// The resolver's identifiers on the detail pane (04 A24; 036 §3).
//
// `resolvedBy` and `kind` are identifiers — `description`, `card-terminal` —
// and until 0.4.0 the pane printed them as they stood. Every value the engine
// can produce now has the catalogue's words, and a value it does not know
// gets the catalogue's fallback, never itself.
//
// Every transaction below is invented.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import type { AyqTransactionDetail } from '../src/ayq-ipc-contract.ts';
import {
  AYQ_PAYMENT_KINDS,
  AYQ_RESOLVED_BY,
  ayqPaymentKindText,
  ayqResolvedByText,
} from '../src/ayq-reasons.ts';
import { AyqTransactionDetailPane } from '../src/ayq-screens/ayq-transaction-detail.tsx';
import { ayqText } from '../src/ayq-strings.ts';
import { AyqGroundProvider } from '../src/ayq-ui/ayq-ground-provider.tsx';

import { ayqOpenWindow } from './ayq-react.ts';

const here = dirname(fileURLToPath(import.meta.url));

/** The literals of one union type in the resolver's own source. */
async function camtUnion(name: string): Promise<string[]> {
  const source = await readFile(
    join(
      here,
      '..',
      '..',
      'ayq-camt',
      'src',
      'counterparty',
      'ayq-counterparty-types.ts',
    ),
    'utf8',
  );
  const start = source.indexOf(`export type ${name} =`);
  assert.ok(start >= 0, `ayq-camt has no ${name}`);
  const body = source.slice(start, source.indexOf(';', start));
  // Comments after a member may quote other text; only the member literals count.
  return [...body.matchAll(/^\s*\|\s*'([a-z-]+)'/gm)].map(one => one[1]);
}

test('every value the resolver can produce has words in the catalogue', async () => {
  assert.deepEqual(
    [...AYQ_RESOLVED_BY].sort(),
    (await camtUnion('AyqCounterpartyLayer')).sort(),
    'a resolver layer has no catalogue entry, or one is described that does not exist',
  );
  assert.deepEqual(
    [...AYQ_PAYMENT_KINDS].sort(),
    (await camtUnion('AyqPaymentKind')).sort(),
    'a payment kind has no catalogue entry, or one is described that does not exist',
  );
  for (const value of AYQ_RESOLVED_BY) {
    assert.notEqual(ayqResolvedByText(value), value);
    assert.notEqual(
      ayqResolvedByText(value),
      ayqText('reason.resolvedBy.other'),
    );
  }
  for (const value of AYQ_PAYMENT_KINDS) {
    assert.notEqual(ayqPaymentKindText(value), value);
    assert.notEqual(ayqPaymentKindText(value), ayqText('reason.kind.other'));
  }
});

function detail(resolvedBy: string, kind: string): AyqTransactionDetail {
  return {
    row: {
      id: 't-1',
      date: '2026-09-10',
      accountId: 'acc-1',
      accountName: 'Invented current account',
      payee: 'TESTSHOP',
      counterpartyKey: 'TESTSHOP',
      amountCents: -1_250,
      categoryId: null,
      category: null,
      categorySource: null,
      notes: null,
      importedId: 'INV-1',
    },
    importedPayee: 'TESTSHOP 12',
    notes: null,
    importedId: 'INV-1',
    provenance: {
      importId: 'imp-1',
      counterpartyKey: 'TESTSHOP',
      counterpartyName: 'TESTSHOP 12',
      resolvedBy,
      kind,
      counterpartyIban: null,
      intermediary: null,
      mandateId: null,
      endToEndId: null,
      bankTransactionCode: null,
      valueDate: null,
      description: null,
      file: null,
    },
    counterpartyKey: 'TESTSHOP',
    decisions: [],
    rule: null,
    match: null,
  } as unknown as AyqTransactionDetail;
}

async function drawn(
  resolvedBy: string,
  kind: string,
): Promise<{
  resolved: string;
  paymentKind: string;
  all: string;
}> {
  const window = await ayqOpenWindow(request =>
    request.kind === 'categories.list'
      ? []
      : request.kind === 'rules.list'
        ? []
        : undefined,
  );
  await window.render(
    <AyqGroundProvider>
      <AyqTransactionDetailPane
        detail={detail(resolvedBy, kind)}
        categories={[]}
        counterparties={[]}
        onCategory={() => undefined}
        onRuleChanged={() => undefined}
        onCorrectCounterparty={() => undefined}
        onNeedCounterparties={() => undefined}
        onShowTheRule={() => undefined}
        onFailure={message => {
          throw new Error(message);
        }}
      />
    </AyqGroundProvider>,
  );
  const read = (selector: string) =>
    window.container.querySelector(selector)?.textContent ?? '';
  const result = {
    resolved: read('[data-ayq-evidence-resolved-by]'),
    paymentKind: read('[data-ayq-evidence-kind]'),
    all: window.container.textContent ?? '',
  };
  await window.close();
  return result;
}

test('no raw resolver identifier or payment kind reaches the pane', async () => {
  for (const [resolvedBy, kind] of [
    ['description', 'card-terminal'],
    ['structured', 'direct-debit'],
    ['bank-transaction-code', 'bank-fee'],
    ['alias', 'credit-transfer'],
    ['intermediary', 'card-withdrawal'],
    ['unresolved', 'unknown'],
  ]) {
    const seen = await drawn(resolvedBy, kind);
    assert.equal(seen.resolved, ayqResolvedByText(resolvedBy));
    assert.equal(seen.paymentKind, ayqPaymentKindText(kind));
    // Each field is the catalogue's words and not the identifier itself.
    assert.notEqual(seen.resolved, resolvedBy);
    assert.notEqual(seen.paymentKind, kind);
    // And nowhere on the pane does an identifier appear as it stands. Only
    // the hyphenated ones can be told apart from ordinary words ('description'
    // is also an English word the catalogue may use), so those are looked for.
    for (const raw of [resolvedBy, kind].filter(one => one.includes('-'))) {
      assert.ok(!seen.all.includes(raw), `the pane shows ${raw}`);
    }
  }
});

test('a value this AYQ does not know is the catalogue fallback, never itself', async () => {
  const seen = await drawn('card descriptor', 'mystery-kind-9');
  assert.equal(seen.resolved, ayqText('reason.resolvedBy.other'));
  assert.equal(seen.paymentKind, ayqText('reason.kind.other'));
  assert.doesNotMatch(seen.all, /card descriptor|mystery-kind-9/);
});
