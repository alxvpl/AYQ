// Settings → Data & Backup → Analytical snapshot (02 §7.8–§7.16; 03 §13).
//
// The screen's part is small: ask for an export, name nothing but the kind,
// and say what came of it — written (and where), not written because the
// owner dismissed the dialog, or refused with the catalogue's words for the
// engine's code, which always say the previous snapshot is unchanged.
//
// Every path and count below is invented.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { AyqSnapshotExported } from '../src/ayq-ipc-contract.ts';
import { AyqSettingsSnapshot } from '../src/ayq-screens/ayq-settings-snapshot.tsx';
import { ayqText } from '../src/ayq-strings.ts';
import { AyqGroundProvider } from '../src/ayq-ui/ayq-ground-provider.tsx';

import { ayqOpenWindow, ayqPress } from './ayq-react.ts';

const WRITTEN: AyqSnapshotExported = {
  outcome: 'written',
  path: 'C:\\Invented\\exports\\ayq-analytical-snapshot-2026-09-23.json',
  generatedAt: '2026-09-23T08:00:00Z',
  accounts: 2,
  transactions: 41,
  counterparties: 9,
  bytes: 52_000,
};

async function pressed(answer: unknown) {
  const window = await ayqOpenWindow(request => {
    if (request.kind === 'settings.get') return { ground: 'light' };
    if (request.kind === 'snapshot.export') return answer;
    return undefined;
  });
  const tree = (
    <AyqGroundProvider>
      <AyqSettingsSnapshot />
    </AyqGroundProvider>
  );
  await window.render(tree);
  // Nothing is exported until the owner presses the button.
  assert.equal(
    window.asked.filter(one => one.kind === 'snapshot.export').length,
    0,
    'the screen exported on its own',
  );
  await ayqPress(
    window.container.querySelector('[data-ayq-action="snapshot-export"]'),
  );
  for (let i = 0; i < 3; i += 1) await window.render(tree);
  const said = window.container.querySelector('[data-ayq-snapshot-said]');
  return { window, said };
}

test('an export is asked for by kind alone, and says where the file was written', async () => {
  const { window, said } = await pressed(WRITTEN);
  const asked = window.asked.filter(one => one.kind === 'snapshot.export');
  assert.equal(asked.length, 1);
  // The window names no path, no file and no place: the host asks the owner.
  assert.deepEqual(
    Object.keys(asked[0])
      .filter(key => key !== 'id')
      .sort(),
    ['kind'],
  );
  assert.equal(said?.getAttribute('data-ayq-snapshot-said'), 'done');
  assert.equal(said?.getAttribute('data-ayq-snapshot-path'), WRITTEN.path);
  assert.equal(said?.getAttribute('data-ayq-snapshot-transactions'), '41');
  assert.equal(
    said?.textContent,
    ayqText('snapshot.done', { file: WRITTEN.path }),
  );
  await window.close();
});

test('a dismissed dialog writes nothing and says so', async () => {
  const { window, said } = await pressed({ outcome: 'cancelled' });
  assert.equal(said?.getAttribute('data-ayq-snapshot-said'), 'cancelled');
  assert.equal(said?.textContent, ayqText('snapshot.cancelled'));
  assert.equal(said?.hasAttribute('data-ayq-snapshot-path'), false);
  await window.close();
});

test('a refusal is worded from the catalogue and says the previous snapshot is unchanged', async () => {
  for (const code of [
    'snapshot-write-failed',
    'snapshot-invalid',
    'snapshot-unidentified-account',
  ] as const) {
    const { window, said } = await pressed({ ayqErrorCode: code });
    assert.equal(said?.getAttribute('data-ayq-snapshot-said'), 'failed');
    assert.equal(said?.textContent, ayqText(`error.${code}`));
    assert.match(said?.textContent ?? '', /previous snapshot is unchanged/);
    await window.close();
  }
});
