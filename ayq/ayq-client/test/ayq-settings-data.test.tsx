// Settings › Data: the analytical snapshot export (03 §13).
//
// The renderer asks two things and touches no file: where (the host's save
// dialog) and then the export (the engine). What comes back is counts and a
// path, and that is all the screen says. Every value here is invented.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { AyqSnapshotExport } from '../src/ayq-ipc-contract.ts';
import { AyqSettingsData, ayqLocalDate } from '../src/ayq-screens/ayq-settings-data.tsx';
import { AYQ_SETTINGS_TABS } from '../src/ayq-screens/ayq-settings.tsx';
import { ayqText } from '../src/ayq-strings.ts';
import { AyqGroundProvider } from '../src/ayq-ui/ayq-ground-provider.tsx';
import { ayqOpenWindow, ayqPress } from './ayq-react.ts';

const SUMMARY: AyqSnapshotExport = {
  path: 'D:\\Invented\\ayq-analytical-snapshot-2026-09-20.json',
  generatedAt: '2026-09-20T10:00:00Z',
  accounts: 2,
  transactions: 1234,
  counterparties: 57,
  bytes: 654321,
};

function engine(path: string | null, summary: AyqSnapshotExport = SUMMARY) {
  return (request: Record<string, unknown>): unknown => {
    if (request.kind === 'snapshot.pickTarget') return { path };
    if (request.kind === 'snapshot.export') return summary;
    if (request.kind === 'settings.get') return { ground: 'light' };
    return undefined;
  };
}

function screen(onFailure: (message: string) => void = message => {
  throw new Error(message);
}) {
  return (
    <AyqGroundProvider>
      <AyqSettingsData onFailure={onFailure} />
    </AyqGroundProvider>
  );
}

test('Data is a Settings tab, and its words are catalogue entries', () => {
  const tabs = AYQ_SETTINGS_TABS.map(one => one.id);
  assert.ok(tabs.includes('data'), 'Settings has no Data tab');
  assert.equal(ayqText('settings.tab.data'), 'Data');
});

test('the export asks where, then asks the engine for exactly that path, and says what was written', async () => {
  const window = await ayqOpenWindow(engine(SUMMARY.path));
  await window.render(screen());

  // The screen says what the file is and that it stays here, before any click.
  const whole = window.container.textContent ?? '';
  assert.ok(whole.includes(ayqText('snapshot.blurb')));
  assert.ok(whole.includes(ayqText('snapshot.note')));

  await ayqPress(window.container.querySelector('[data-ayq-action="snapshot-export"]'));
  // Let the two answers land.
  await new Promise(resolve => setTimeout(resolve, 20));

  const kinds = window.asked.map(one => one.kind);
  assert.deepEqual(
    kinds.filter(kind => kind !== 'settings.get'),
    ['snapshot.pickTarget', 'snapshot.export'],
  );
  const exportRequest = window.asked.find(one => one.kind === 'snapshot.export');
  assert.equal(exportRequest?.path, SUMMARY.path, 'the path the owner chose, unchanged');
  const pick = window.asked.find(one => one.kind === 'snapshot.pickTarget');
  assert.match(String(pick?.suggestedName), /^ayq-analytical-snapshot-\d{4}-\d{2}-\d{2}\.json$/);

  const said = window.container.querySelector('[data-ayq-snapshot="said"]')?.textContent ?? '';
  assert.ok(said.includes('2 accounts'));
  assert.ok(said.includes('1,234 transactions'));
  assert.ok(said.includes('57 counterparties'));
  assert.ok(said.includes(SUMMARY.path));
  assert.equal(window.dom.window.document.body.dataset.ayqSnapshotState, 'done');

  await window.close();
});

test('a dismissed dialog writes nothing and says so', async () => {
  const window = await ayqOpenWindow(engine(null));
  await window.render(screen());

  await ayqPress(window.container.querySelector('[data-ayq-action="snapshot-export"]'));
  await new Promise(resolve => setTimeout(resolve, 20));

  assert.equal(window.asked.some(one => one.kind === 'snapshot.export'), false);
  const said = window.container.querySelector('[data-ayq-snapshot="said"]')?.textContent ?? '';
  assert.equal(said, ayqText('snapshot.cancelled'));
  assert.equal(window.dom.window.document.body.dataset.ayqSnapshotState, 'cancelled');

  await window.close();
});

test('a failed export is reported as a failure, in the catalogue’s words', async () => {
  const failures: string[] = [];
  const window = await ayqOpenWindow((request: Record<string, unknown>) => {
    if (request.kind === 'snapshot.pickTarget') return { path: SUMMARY.path };
    if (request.kind === 'snapshot.export') throw new Error('disk full (invented)');
    if (request.kind === 'settings.get') return { ground: 'light' };
    return undefined;
  });
  await window.render(screen(message => failures.push(message)));

  await ayqPress(window.container.querySelector('[data-ayq-action="snapshot-export"]'));
  await new Promise(resolve => setTimeout(resolve, 20));

  assert.equal(failures.length, 1);
  assert.ok(failures[0].startsWith(ayqText('snapshot.failed', { reason: '' }).trim()));
  assert.ok(failures[0].includes('disk full (invented)'));
  assert.equal(window.dom.window.document.body.dataset.ayqSnapshotState, 'error');
  // Said beside the button as well, where "Written:" would have stood: a
  // failure is never a blank.
  const said = window.container.querySelector('[data-ayq-snapshot="said"]')?.textContent ?? '';
  assert.equal(said, failures[0]);

  await window.close();
});

test('the suggested name carries the local calendar date, not the UTC one', () => {
  // 00:30 local on the 21st in a zone two hours ahead of UTC is still the 20th in UTC.
  const late = new Date(2026, 8, 21, 0, 30);
  assert.equal(ayqLocalDate(late), '2026-09-21');
  assert.equal(ayqLocalDate(new Date(2026, 0, 5, 12)), '2026-01-05');
});
