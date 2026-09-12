// The first screen AYQ draws of its own, exercised in a real window.
//
// What is being checked is 04 A23 and A24 as behaviour rather than as values:
// that the ground a person chooses is applied at once and sent to the engine
// to be kept, that "follow the system" is a question put to the system rather
// than a third palette, and that the words on the screen are the catalogue's.
//
// Every value in it is invented. Nothing here is anybody's money.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { AyqAppearanceScreen } from '../src/ayq-screens/ayq-appearance.tsx';
import { AyqGroundProvider } from '../src/ayq-ui/ayq-ground-provider.tsx';
import { ayqText } from '../src/ayq-strings.ts';
import { AYQ_TOKENS, ayqCssVariables } from '../src/ayq-tokens.ts';
import type { AyqSettings } from '../src/ayq-ipc-contract.ts';
import { ayqOpenWindow, ayqPress } from './ayq-react.ts';

/** A stand-in engine that keeps the setting, the way the real one does. */
function engine(start: AyqSettings['ground'] = 'system') {
  const kept: AyqSettings = { ground: start };
  return {
    kept,
    answer(request: Record<string, unknown>): unknown {
      if (request.kind === 'settings.get') return { ...kept };
      if (request.kind === 'settings.set') {
        kept.ground = (request.settings as AyqSettings).ground;
        return { ...kept };
      }
      return undefined;
    },
  };
}

const screen = (
  <AyqGroundProvider>
    <AyqAppearanceScreen />
  </AyqGroundProvider>
);

test('the screen draws, and says what the catalogue says', async () => {
  const stub = engine('light');
  const window = await ayqOpenWindow(stub.answer);
  await window.render(screen);

  const drawn = window.container.querySelector('[data-ayq-screen="appearance"]');
  assert.ok(drawn, 'the appearance screen did not draw');
  assert.ok(
    window.container.textContent?.includes(ayqText('appearance.title')),
    'the screen does not carry its own title',
  );
  assert.ok(
    window.container.textContent?.includes(ayqText('state.uncategorised')),
    'the state scale is not shown',
  );

  // Every state of A17 is on the screen, as its own chip.
  for (const state of [
    'confirmed',
    'suggested',
    'overdue',
    'neutral',
    'uncategorised',
  ]) {
    assert.ok(
      window.container.querySelector(`[data-ayq-state="${state}"]`),
      `the ${state} state is not shown`,
    );
  }

  await window.close();
});

test('each of the three grounds can be chosen, and is applied at once', async () => {
  const stub = engine('light');
  const window = await ayqOpenWindow(stub.answer);
  await window.render(screen);

  for (const ground of ['dark', 'system', 'light'] as const) {
    await ayqPress(
      window.container.querySelector(`[data-ayq-ground-option="${ground}"]`),
    );
    const provider = window.dom.window.document.querySelector(
      '[data-ayq-ground]',
    );
    assert.equal(
      provider?.getAttribute('data-ayq-ground'),
      ground,
      `choosing ${ground} did not apply it`,
    );
    assert.equal(
      stub.kept.ground,
      ground,
      `choosing ${ground} was not sent to the engine to be kept`,
    );
  }

  await window.close();
});

test('the ground the engine kept is the one the window opens in', async () => {
  const stub = engine('dark');
  const window = await ayqOpenWindow(stub.answer);
  await window.render(screen);

  const provider = window.dom.window.document.querySelector('[data-ayq-ground]');
  assert.equal(provider?.getAttribute('data-ayq-ground'), 'dark');
  assert.equal(provider?.getAttribute('data-ayq-ground-resolved'), 'dark');
  assert.ok(
    window.asked.some(request => request.kind === 'settings.get'),
    'the window never asked what the owner had chosen',
  );

  await window.close();
});

test('following the system means asking it, and following it when it changes', async () => {
  const stub = engine('system');
  const window = await ayqOpenWindow(stub.answer);
  await window.render(screen);

  const resolved = (): string | null | undefined =>
    window.dom.window.document
      .querySelector('[data-ayq-ground]')
      ?.getAttribute('data-ayq-ground-resolved');

  assert.equal(resolved(), 'light', 'a system that wants light did not get it');

  window.setSystemDark(true);
  await window.render(screen);
  assert.equal(resolved(), 'dark', 'the window did not follow the system');
  assert.equal(
    stub.kept.ground,
    'system',
    'following the system was turned into a choice of dark',
  );

  await window.close();
});

test('the tokens on the screen are the ground’s own', async () => {
  const stub = engine('light');
  const window = await ayqOpenWindow(stub.answer);
  await window.render(screen);

  const provider = window.dom.window.document.querySelector(
    '[data-ayq-ground]',
  ) as HTMLElement | null;
  assert.ok(provider);

  // Read off the element, not out of the module: what is asserted is that the
  // ground reached the document, which is the thing a person sees.
  for (const [name, value] of Object.entries(ayqCssVariables('light'))) {
    assert.equal(
      provider.style.getPropertyValue(name),
      value,
      `${name} did not reach the window`,
    );
  }

  await ayqPress(
    window.container.querySelector('[data-ayq-ground-option="dark"]'),
  );
  assert.equal(
    provider.style.getPropertyValue('--ayq-pane'),
    AYQ_TOKENS.dark.surface.pane,
    'switching the ground did not switch the tokens',
  );

  await window.close();
});

test('a filled button is the one treatment of A18', async () => {
  const stub = engine('light');
  const window = await ayqOpenWindow(stub.answer);
  await window.render(screen);

  const filled = window.container.querySelector('[data-ayq-filled="yes"]');
  assert.ok(filled, 'there is no filled button to check');
  // Fluent's own filled appearance would be the accent as a background with
  // white on it, which A18 forbids. AYQ's filled button is not that one.
  assert.ok(
    !filled.className.includes('primary'),
    'the filled button is Fluent’s primary appearance',
  );

  await window.close();
});
