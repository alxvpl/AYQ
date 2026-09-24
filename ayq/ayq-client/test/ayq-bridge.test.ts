// The one door (04 A24): what the engine says went wrong reaches a screen as
// the catalogue's sentence for its code, and the engine's own English does not
// reach it at all.
//
// Every value below is invented.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ayqAsk } from '../src/ayq-bridge.ts';
import { ayqText } from '../src/ayq-strings.ts';

function answering(response: Record<string, unknown>): void {
  (globalThis as unknown as { window: unknown }).window = {
    ayq: {
      request: async (request: { id: string }) => ({
        ...response,
        id: request.id,
      }),
    },
  };
}

const DETAIL = 'ENGINE ENGLISH THAT MUST NOT BE SHOWN';

test("a failure reaches the screen in the catalogue's words, with its parameters", async () => {
  answering({
    ok: false,
    kind: 'error',
    code: 'category-exists',
    params: { name: 'Water' },
    detail: DETAIL,
  });
  const answer = await ayqAsk({ kind: 'categories.list' });
  assert.equal(answer.ok, false);
  assert.ok(!answer.ok);
  assert.equal(answer.code, 'category-exists');
  assert.equal(
    answer.message,
    ayqText('error.category-exists', { name: 'Water' }),
  );
  assert.doesNotMatch(answer.message, /ENGINE ENGLISH/);
  // The detail is not passed on at all.
  assert.equal('detail' in answer, false);
});

test("a failure without a code of its own is the catalogue's fallback", async () => {
  answering({ ok: false, kind: 'error', code: 'unexpected', detail: DETAIL });
  const answer = await ayqAsk({ kind: 'summary' });
  assert.ok(!answer.ok);
  assert.equal(answer.message, ayqText('error.unexpected'));
});

test("an import that read nothing names each file and why, in the catalogue's words", async () => {
  answering({
    ok: false,
    kind: 'error',
    code: 'import-nothing-readable',
    params: { files: 2 },
    problems: [
      { name: 'not-camt.xml', code: 'no-entries' },
      { name: 'gone.xml', code: 'gone' },
    ],
    detail: DETAIL,
  });
  const answer = await ayqAsk({ kind: 'import.camt', paths: ['x'] });
  assert.ok(!answer.ok);
  assert.match(answer.message, /not-camt\.xml/);
  assert.ok(answer.message.includes(ayqText('reason.import.no-entries')));
  assert.ok(answer.message.includes(ayqText('reason.import.gone')));
  assert.doesNotMatch(answer.message, /ENGINE ENGLISH/);
});

test('a month is written as the locale writes it', async () => {
  answering({
    ok: false,
    kind: 'error',
    code: 'month-not-kept',
    params: { month: '2099-01' },
    detail: DETAIL,
  });
  const answer = await ayqAsk({ kind: 'summary' });
  assert.ok(!answer.ok);
  assert.match(answer.message, /January 2099/);
});
