// The screen, end to end: CAMT in, one Actual budget, the contract out.
//
// Runs the real API, so it is slower than the pure tests and runs with
// --test-concurrency=1 because the API is a singleton.

import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { ayqParseCamt } from '../../ayq-camt/src/ayq-camt053.ts';
import { ayqImportToActual } from '../../ayq-actual-bridge/src/ayq-import.ts';
import { ayqOpenEngine } from '../src/ayq-engine.ts';
import { ayqServeScreen } from '../src/ayq-host.ts';
import type {
  AyqEngine,
  AyqOverview,
  AyqResponse,
} from '../src/ayq-contract.ts';

const ALL = { from: '1900-01-01', to: '2999-12-31' } as const;

const month = fileURLToPath(
  new URL('../../ayq-camt/test/fixtures/ayq-abn-month.xml', import.meta.url),
);
const entries = await ayqParseCamt(await readFile(month, 'utf8'), {
  file: 'ayq-abn-month.xml',
});

async function openScreen(): Promise<{ engine: AyqEngine; overview: AyqOverview }> {
  const dataDir = await mkdtemp(join(tmpdir(), 'ayq-screen-test-'));
  const imported = await ayqImportToActual({
    dataDir,
    budgetName: 'AYQ screen test',
    accountName: 'ABN AMRO private',
    entries,
  });
  assert.equal(imported.errors.length, 0);

  const engine = await ayqOpenEngine({
    dataDir,
    budgetId: imported.budgetId,
    accountId: imported.accountId,
    accountName: 'ABN AMRO private',
    provenanceFile: imported.provenanceFile as string,
  });

  const answer = await engine.ask({ kind: 'overview', ...ALL });
  assert.equal(answer.kind, 'overview');
  return { engine, overview: (answer as { overview: AyqOverview }).overview };
}

test('fourteen raw descriptions collapse into five counterparties', async () => {
  const { engine, overview } = await openScreen();
  try {
    assert.equal(overview.totals.transactions, 14);
    assert.equal(overview.totals.counterparties, 5);
    assert.equal(
      overview.totals.rawVariants,
      14,
      'the bank wrote a different string every time',
    );

    const keys = overview.groups.map(group => group.key).sort();
    assert.deepEqual(keys, [
      'ALBERT HEIJN',
      'KOFFIEHUIS DE TEST',
      'TESTENERGIE NEDERLAND B V',
      'TESTFUEL',
      'TESTWERKGEVER B V',
    ]);

    const supermarket = overview.groups.find(g => g.key === 'ALBERT HEIJN');
    assert.equal(supermarket?.transactions, 6);
    assert.equal(supermarket?.rawVariants, 6);
    assert.deepEqual(supermarket?.resolvedBy, ['description']);
    assert.equal(supermarket?.totalCents, -(1872 + 715 + 4230 + 1108 + 6390 + 944));

    // The acquirer is recorded but never becomes the counterparty.
    const coffee = overview.groups.find(g => g.key === 'KOFFIEHUIS DE TEST');
    assert.equal(coffee?.intermediary, 'CCV');
    assert.equal(coffee?.transactions, 2);

    // A structured counterparty keeps its IBAN and its mandate.
    const energy = overview.groups.find(
      g => g.key === 'TESTENERGIE NEDERLAND B V',
    );
    assert.equal(energy?.iban, 'NL00TEST0987654321');
    assert.equal(energy?.mandateId, 'MANDAAT-4471902');
    assert.deepEqual(energy?.resolvedBy, ['structured']);
  } finally {
    await engine.close();
  }
});

test('the totals of the groups equal the totals of the period', async () => {
  const { engine, overview } = await openScreen();
  try {
    const sum = overview.groups.reduce((total, g) => total + g.totalCents, 0);
    assert.equal(
      sum,
      overview.totals.inflowCents + overview.totals.outflowCents,
      'nothing falls between the groups',
    );
    const counted = overview.groups.reduce((n, g) => n + g.transactions, 0);
    assert.equal(counted, overview.totals.transactions);
  } finally {
    await engine.close();
  }
});

test('opening a counterparty lists its transactions with their evidence', async () => {
  const { engine } = await openScreen();
  try {
    const answer = await engine.ask({
      kind: 'transactions',
      ...ALL,
      counterpartyKey: 'ALBERT HEIJN',
    });
    assert.equal(answer.kind, 'transactions');
    if (answer.kind !== 'transactions') return;

    assert.equal(answer.rows.length, 6);
    // Newest first.
    assert.equal(answer.rows[0].date, '2026-06-27');
    assert.equal(answer.rows.at(-1)?.date, '2026-06-02');

    for (const row of answer.rows) {
      assert.equal(row.counterpartyKey, 'ALBERT HEIJN');
      assert.equal(row.bankTransactionCode, 'PMNT/CCRD/POSD');
      assert.equal(row.resolvedBy, 'description');
      assert.equal(row.paymentKind, 'card-terminal');
      assert.match(row.raw ?? '', /^BEA, /, 'the raw string is still there');
    }

    // Six visits, six different raw strings, one counterparty.
    assert.equal(new Set(answer.rows.map(row => row.raw)).size, 6);
  } finally {
    await engine.close();
  }
});

test('the host carries the contract and serves the screen', async () => {
  const { engine } = await openScreen();
  const host = await ayqServeScreen(engine, 0);
  try {
    assert.match(host.url, /^http:\/\/127\.0\.0\.1:\d+\/$/);

    const page = await fetch(host.url);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /AYQ — counterparties/);
    assert.match(html, /POST \/ask/, 'the page states its only channel');

    const answer = (await fetch(`${host.url}ask`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'overview', ...ALL }),
    }).then(response => response.json())) as AyqResponse;

    assert.equal(answer.kind, 'overview');
    if (answer.kind !== 'overview') return;
    assert.equal(answer.overview.totals.counterparties, 5);

    const missing = await fetch(`${host.url}nope`);
    assert.equal(missing.status, 404);
  } finally {
    await host.close();
    await engine.close();
  }
});
