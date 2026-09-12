// Reports (04 A2, A20): not built, and the screen says only that.
//
// Two things are asserted that a screen cannot be talked into. It asks the
// engine nothing — an empty screen that has queried a budget looks like a budget
// with nothing in it, and an empty screen that has asked nothing can only be
// read as a screen that has not been written. And it draws no figure, no table
// and no chart, so there is nothing on it that could be mistaken for an answer.
//
// Then what it says: that it is not built, that nothing about the person's data
// is the reason, and that the Spending screen the accepted design removed had
// this screen's question.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { AyqReportsScreen } from '../src/ayq-screens/ayq-reports.tsx';
import { ayqText } from '../src/ayq-strings.ts';
import { AyqGroundProvider } from '../src/ayq-ui/ayq-ground-provider.tsx';
import { ayqOpenWindow, ayqPress } from './ayq-react.ts';

function screen(opened: string[] = []) {
  return (
    <AyqGroundProvider>
      <AyqReportsScreen onOpenRegister={() => opened.push('register')} />
    </AyqGroundProvider>
  );
}

test('Reports asks the engine nothing at all', async () => {
  const window = await ayqOpenWindow(request =>
    request.kind === 'settings.get' ? { ground: 'system' } : undefined,
  );
  await window.render(screen());

  // `settings.get` is the window asking which ground to draw in, and it is the
  // provider around this screen that asks it — every screen is drawn inside one.
  // What matters is that Reports itself adds nothing: an empty screen that has
  // queried a budget looks like a budget with nothing in it.
  assert.deepEqual(
    window.asked.map(one => one.kind),
    ['settings.get'],
    'an unbuilt screen queried the budget',
  );

  await window.close();
});

test('Reports draws nothing that could be read as an answer', async () => {
  const window = await ayqOpenWindow(() => undefined);
  await window.render(screen());

  // No figure, no table, no state chip: every one of those would be a claim.
  assert.equal(window.container.querySelector('[data-ayq-figure]'), null);
  assert.equal(window.container.querySelector('[data-ayq-table]'), null);
  assert.equal(window.container.querySelector('[data-ayq-state]'), null);
  assert.equal(window.container.querySelector('canvas, svg'), null);

  await window.close();
});

test('Reports says it is not built, and invents no reason', async () => {
  const window = await ayqOpenWindow(() => undefined);
  await window.render(screen());

  const said = window.container.textContent ?? '';
  assert.match(said, new RegExp(ayqText('notBuilt.title')));
  assert.match(said, /Reports is not built/);
  assert.match(said, /for no other reason/);
  assert.match(said, /nothing here is waiting on you/);

  // Nothing that makes a person's history the reason, and no threshold.
  for (const invented of [
    'not enough',
    'insufficient',
    'at least',
    'more data',
    'come back',
    'once you have',
  ]) {
    assert.ok(
      !said.toLowerCase().includes(invented),
      `Reports blames the budget: "${invented}"`,
    );
  }

  await window.close();
});

test('Reports records the Spending screen the accepted design removed', async () => {
  const window = await ayqOpenWindow(() => undefined);
  await window.render(screen());

  // The owner's to overrule, so it is readable where the question now lives
  // rather than only in a progress file.
  const said =
    window.container.querySelector('[data-ayq-reports-spending]')?.textContent ?? '';
  assert.match(said, /had a Spending screen/);
  assert.match(said, /rail has no such destination/);
  assert.match(said, /engine still answers it/);

  await window.close();
});

test('Reports points at the screen that can answer the question today', async () => {
  const opened: string[] = [];
  const window = await ayqOpenWindow(() => undefined);
  await window.render(screen(opened));

  await ayqPress(
    window.container.querySelector('[data-ayq-action="reports-register"]'),
  );
  assert.deepEqual(opened, ['register']);

  await window.close();
});
