// 04 A24 at the boundary, through the real engine (033 §6).
//
// What the engine says to the window — why a request failed, why a file could
// not be imported, why AYQ filed a transaction — crosses the IPC boundary as a
// code with bounded parameters. The English the engine still writes stays in
// `detail`, for a developer, and nothing the window reads is a sentence.
//
// The statements are the invented fixtures every engine test uses.

import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';

import type { AyqResponse } from '../../ayq-client/src/ayq-ipc-contract.ts';

import { ask, budget, fixture, here, send } from './ayq-engine-harness.ts';

/** Every code the contract declares, read from the contract itself. */
async function declaredCodes(union: string): Promise<Set<string>> {
  const source = await readFile(
    join(here, '..', '..', 'ayq-client', 'src', 'ayq-ipc-contract.ts'),
    'utf8',
  );
  const start = source.indexOf(`export type ${union} =`);
  assert.ok(start >= 0, `the contract has no ${union}`);
  const body = source.slice(start, source.indexOf(';', start));
  return new Set([...body.matchAll(/'([a-z-]+)'/g)].map(one => one[1]));
}

/** An error answer carries a declared code and developer detail, and no sentence for the window. */
async function assertCoded(
  answer: AyqResponse,
  expected: string,
): Promise<void> {
  assert.equal(answer.ok, false, JSON.stringify(answer));
  if (answer.ok) return;
  assert.equal(answer.code, expected, JSON.stringify(answer));
  assert.ok((await declaredCodes('AyqErrorCode')).has(answer.code));
  assert.equal(typeof answer.detail, 'string');
  for (const key of Object.keys(answer)) {
    assert.ok(
      ['id', 'ok', 'kind', 'code', 'params', 'problems', 'detail'].includes(
        key,
      ),
      `an error answer carries ${key}`,
    );
  }
  assert.equal(
    'message' in answer,
    false,
    'an error answer carries display English',
  );
}

let counter = 0;
function request<T extends object>(body: T): T & { id: string } {
  counter += 1;
  return { ...body, id: `a24-${counter}` };
}

test('a refused request crosses the boundary as a code, not a sentence', async () => {
  const dataDir = await budget();
  const categories = await ask(dataDir, { kind: 'categories.list' });
  const groupId = categories[0]?.groupId;
  assert.ok(groupId);

  await assertCoded(
    await send(
      request({ kind: 'categories.create', name: '  ', groupId }),
      dataDir,
    ),
    'category-needs-name',
  );
  const taken = categories[0].name;
  const exists = await send(
    request({ kind: 'categories.create', name: taken, groupId }),
    dataDir,
  );
  await assertCoded(exists, 'category-exists');
  assert.ok(!exists.ok);
  // The parameter is data — the name — not a sentence around it.
  assert.deepEqual(exists.params, { name: taken });

  await assertCoded(
    await send(
      request({
        kind: 'plan.save',
        today: '2026-06-15',
        record: {
          name: '',
          kind: 'expense',
          amountCents: 1_000,
          categoryName: null,
          startDate: '2026-07-01',
          recurrence: { frequency: 'monthly', interval: 1 },
        },
      }),
      dataDir,
    ),
    'plan-needs-name',
  );
  await assertCoded(
    await send(
      request({ kind: 'transaction.detail', transactionId: 'no-such-row' }),
      dataDir,
    ),
    'transaction-not-found',
  );
  await assertCoded(
    await send(request({ kind: 'import.camt', paths: [] }), dataDir),
    'import-no-file',
  );
  const month = await send(
    request({
      kind: 'budget.setPlan',
      month: '2099-01',
      categoryId: categories[0].id,
      cents: 100,
    }),
    dataDir,
  );
  await assertCoded(month, 'month-not-kept');
  assert.ok(!month.ok);
  assert.deepEqual(month.params, { month: '2099-01' });
  // A request the renderer should never send is `unexpected`, not a sentence.
  await assertCoded(
    await send({ id: 'a24-unknown', kind: 'no.such.kind' } as never, dataDir),
    'unexpected',
  );
});

test('why a file could not be imported is a code, in the answer and in the history', async () => {
  const dataDir = await budget();
  const notCamt = join(dataDir, 'shopping-list.xml');
  await writeFile(notCamt, '<list><item>bread</item></list>', 'utf8');
  const missing = join(dataDir, 'not-here.xml');

  const summary = await ask(dataDir, {
    kind: 'import.camt',
    paths: [fixture, notCamt, missing],
  });
  const codes = await declaredCodes('AyqImportProblemCode');
  assert.deepEqual(summary.problems.map(one => [one.name, one.code]).sort(), [
    ['not-here.xml', 'gone'],
    ['shopping-list.xml', 'no-entries'],
  ]);
  for (const problem of summary.problems) {
    assert.ok(codes.has(problem.code));
    assert.deepEqual(Object.keys(problem).sort(), ['code', 'name']);
  }

  // Kept that way in the store, so the history never shows a stored sentence.
  const history = await ask(dataDir, { kind: 'imports.list' });
  assert.deepEqual(history[0]?.problems, summary.problems);
  const store = JSON.parse(
    await readFile(join(dataDir, 'ayq-store.json'), 'utf8'),
  ) as {
    version: number;
    imports: Array<{ problems: Array<Record<string, unknown>> }>;
  };
  assert.ok(store.version >= 10);
  assert.doesNotMatch(JSON.stringify(store.imports), /"reason"/);
});

test("AYQ's own filing records its reason as a code", async () => {
  const dataDir = await budget();
  // The invented statement the build-006 filing tests use: a supermarket, a
  // network operator and the bank's own charge, all filed without asking.
  const filing = join(
    here,
    '..',
    '..',
    'ayq-camt',
    'test',
    'fixtures',
    'ayq-filing.xml',
  );
  await ask(dataDir, { kind: 'import.camt', paths: [filing] });
  const store = JSON.parse(
    await readFile(join(dataDir, 'ayq-store.json'), 'utf8'),
  ) as {
    decisions: Record<
      string,
      Array<{ source: string; reason?: { code: string }; because?: unknown }>
    >;
  };
  const automatic = Object.values(store.decisions)
    .flat()
    .filter(one => one.source === 'auto');
  assert.ok(automatic.length > 0, 'the fixture filed nothing automatically');
  for (const decision of automatic) {
    assert.equal(
      decision.because,
      undefined,
      'a filing reason was stored as a sentence',
    );
    assert.ok(
      ['bank-charge', 'bank-interest', 'counterparty'].includes(
        decision.reason?.code ?? '',
      ),
      `an automatic filing recorded ${JSON.stringify(decision.reason)}`,
    );
  }
});
