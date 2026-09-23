// Settings → About (12; 04 A35; 06 §3.6–§3.7, §9).
//
// Three things are being checked and they are different in kind. One is that
// the screen shows what this build is, in the words 06 §3.6 fixes, and keeps
// AYQ's own proprietary licence apart from Actual Budget's MIT one. Another is
// that **Copy technical information** copies exactly what the engine composed
// and nothing the renderer added — because the privacy contract in §12.4 is
// enforced by a test over one engine function, and a renderer that assembled
// its own text would be outside it. The third is that the copied text is not
// also printed on the screen as a permanent dump (06 §3.7).
//
// Every value below is invented except the shape.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { act } from 'react';

import type { AyqAbout } from '../src/ayq-ipc-contract.ts';
import { AyqAboutScreen } from '../src/ayq-screens/ayq-about.tsx';
import { AYQ_SETTINGS_TABS } from '../src/ayq-screens/ayq-settings.tsx';
import { ayqDate, ayqText } from '../src/ayq-strings.ts';
import { AyqGroundProvider } from '../src/ayq-ui/ayq-ground-provider.tsx';

import { ayqOpenWindow, ayqPress } from './ayq-react.ts';

const SHA = 'e93c77e546791439a85e0ef29fc2c7e9cfb1e2d9';
const BUILT = '2026-09-16T09:00:00Z';

const TECHNICAL = [
  'Product        : AYQ Personal Finances',
  'Version        : 0.2.0',
  'Build          : 005',
  `Build date     : ${BUILT}`,
  'Architecture   : Windows x64',
  `AYQ revision   : ${SHA}`,
  'Engine         : Actual Budget 26.9.0',
  'Actual baseline: db1b0ea9',
  'Electron       : 43.4.0',
  'Node           : 22.22.2',
].join('\n');

const ABOUT: AyqAbout = {
  productName: 'AYQ Personal Finances',
  tagline: 'Local-first personal finance application for Windows',
  author: 'Plamen Alexandrov',
  copyright: '© 2026 Plamen Alexandrov. All rights reserved.',
  productVersion: '0.2.0',
  buildNumber: '005',
  buildDate: BUILT,
  architecture: 'Windows x64',
  revision: SHA,
  engine: 'Actual Budget 26.9.0',
  actualBaseline: 'db1b0ea9',
  electronVersion: '43.4.0',
  nodeVersion: '22.22.2',
  development: false,
  links: [{ kind: 'repository', url: 'https://github.com/alxvpl/AYQ' }],
  technicalInformation: TECHNICAL,
};

function engine(about: AyqAbout = ABOUT) {
  return (request: Record<string, unknown>): unknown => {
    if (request.kind === 'about') return about;
    if (request.kind === 'settings.get') return { ground: 'light' };
    return undefined;
  };
}

const screen = (
  <AyqGroundProvider>
    <AyqAboutScreen
      onFailure={message => {
        throw new Error(message);
      }}
    />
  </AyqGroundProvider>
);

test('About is a Settings tab and is not a rail destination', () => {
  const tabs = AYQ_SETTINGS_TABS.map(one => one.id);
  assert.ok(tabs.includes('about'), 'Settings has no About tab');
  // Its label is a catalogue entry like every other word in the interface.
  assert.equal(ayqText('settings.tab.about'), 'About');
});

test('About says which build this is, in the words 06 §3.6 fixes', async () => {
  const window = await ayqOpenWindow(engine());
  await window.render(screen);

  // The mark is on About, drawn from the vector master, beside the name.
  const mark = window.container.querySelector('[data-ayq-mark]');
  assert.ok(mark, 'About carries no mark');
  assert.ok(mark.querySelector('svg'), 'the mark is not the vector master');
  assert.equal(mark.getAttribute('aria-hidden'), 'true');
  assert.equal(
    mark.getAttribute('data-ayq-mark'),
    '48',
    'the mark is not 48 px',
  );

  const said = (mark: string): string =>
    window.container.querySelector(`[data-ayq-about="${mark}"]`)?.textContent ??
    '';

  assert.equal(said('author'), 'Plamen Alexandrov');
  assert.equal(said('version'), '0.2.0');
  assert.equal(said('build'), '005');
  assert.equal(said('architecture'), 'Windows x64');
  assert.equal(said('engine'), 'Actual Budget 26.9.0');
  assert.equal(said('baseline'), 'db1b0ea9');
  assert.equal(
    said('copyright'),
    '© 2026 Plamen Alexandrov. All rights reserved.',
  );

  // Human-readable on the screen (04 A35): the date as the locale writes it,
  // the revision shortened. The exact forms are in the copied text only.
  assert.equal(said('build-date'), ayqDate(BUILT));
  assert.notEqual(
    said('build-date'),
    BUILT,
    'the build date is shown as a raw ISO stamp',
  );
  assert.equal(said('revision'), SHA.slice(0, 9));

  const whole = window.container.textContent ?? '';
  assert.ok(whole.includes('AYQ Personal Finances'));
  assert.ok(
    whole.includes('Local-first personal finance application for Windows'),
  );
  assert.equal(said('local-first'), ayqText('about.localFirst'));

  await window.close();
});

test('About keeps AYQ proprietary and Actual Budget under MIT apart (01 §6, 06 §9)', async () => {
  const window = await ayqOpenWindow(engine());
  await window.render(screen);

  const said = (mark: string): string =>
    window.container.querySelector(`[data-ayq-about="${mark}"]`)?.textContent ??
    '';

  const own = said('licence');
  assert.equal(own, ayqText('about.licence.ayq'));
  assert.match(own, /proprietary/, 'AYQ is not said to be proprietary');
  assert.match(
    own,
    /not released under the MIT/,
    'AYQ is not said to be outside MIT',
  );

  const upstream = said('upstream');
  assert.equal(upstream, ayqText('about.licence.actual'));
  assert.match(upstream, /Actual Budget/);
  assert.match(
    upstream,
    /MIT licence/,
    'Actual Budget is not said to be under MIT',
  );

  // 06 §9.4: a statement that AYQ itself is MIT is a defect, anywhere on About.
  const whole = window.container.textContent ?? '';
  assert.ok(
    !/AYQ is (released|licensed) under the MIT/i.test(whole),
    'About says AYQ is MIT-licensed',
  );

  await window.close();
});

test('only links the engine really declared are drawn', async () => {
  const window = await ayqOpenWindow(engine());
  await window.render(screen);
  const links = window.container.querySelectorAll('a[href]');
  assert.equal(links.length, 1);
  assert.equal(links[0].getAttribute('href'), 'https://github.com/alxvpl/AYQ');
  // What the link is called is a catalogue word, not something the engine said.
  assert.equal(links[0].textContent, ayqText('about.link.repository'));
  await window.close();

  const bare = await ayqOpenWindow(engine({ ...ABOUT, links: [] }));
  await bare.render(screen);
  assert.equal(
    bare.container.querySelectorAll('a[href]').length,
    0,
    'a link was invented where the engine offered none',
  );
  await bare.close();
});

test('a development build says so rather than looking like a release', async () => {
  const window = await ayqOpenWindow(
    engine({
      ...ABOUT,
      development: true,
      revision: null,
      buildDate: 'unbuilt',
      productVersion: '0.0.0-dev',
    }),
  );
  await window.render(screen);

  assert.ok(window.container.querySelector('[data-ayq-about="development"]'));
  assert.equal(
    window.container.querySelector('[data-ayq-about="revision"]')?.textContent,
    ayqText('about.revision.none'),
  );
  assert.equal(
    window.container.querySelector('[data-ayq-about="build-date"]')
      ?.textContent,
    ayqText('about.buildDate.none'),
  );

  await window.close();
});

test('the technical information is copied, not printed on the screen (06 §3.7)', async () => {
  const window = await ayqOpenWindow(engine());
  await window.render(screen);

  assert.equal(
    window.container.querySelectorAll('pre, [data-ayq-technical]').length,
    0,
    'the technical information is dumped on the screen',
  );
  const whole = window.container.textContent ?? '';
  // Neither the exact forms nor the lines that exist only in the copy.
  assert.ok(!whole.includes(SHA), 'the full revision is on the screen');
  assert.ok(!whole.includes(BUILT), 'the ISO build timestamp is on the screen');
  for (const line of TECHNICAL.split('\n')) {
    assert.ok(
      !whole.includes(line),
      `the screen prints the copied line "${line}"`,
    );
  }
  assert.ok(!whole.includes('43.4.0'), 'the Electron version is on the screen');

  await window.close();
});

test('Copy technical information copies exactly what the engine composed, and says so briefly', async () => {
  const copied: string[] = [];
  const window = await ayqOpenWindow(engine());
  // jsdom has no clipboard, which is the honest state of the platform here:
  // the button asks for one and does nothing when there is none. A stand-in is
  // installed so the test can read what was handed to it.
  Object.defineProperty(window.dom.window.navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText(text: string) {
        copied.push(text);
        return Promise.resolve();
      },
    },
  });
  await window.render(screen);

  const confirmation = () =>
    window.container.querySelector('[data-ayq-about-copied]')?.textContent ??
    '';
  assert.equal(confirmation(), '', 'it says Copied before anything was copied');

  const button = window.container.querySelector(
    '[data-ayq-action="about-copy"]',
  );
  assert.ok(button, 'there is no copy button');
  assert.equal(button.textContent, ayqText('about.copy'));
  await ayqPress(button as HTMLElement);

  assert.equal(copied.length, 1, 'the button copied nothing');
  assert.equal(
    copied[0],
    TECHNICAL,
    'the renderer composed its own text instead of copying the engine\'s',
  );
  // The copy carries the exact forms the screen shortens (06 §3.7).
  assert.ok(copied[0].includes(SHA), 'the copy leaves out the full revision');
  assert.ok(
    copied[0].includes(BUILT),
    'the copy leaves out the ISO build timestamp',
  );

  assert.equal(
    confirmation(),
    ayqText('about.copied'),
    'nothing says it was copied',
  );
  // Brief: it goes again by itself.
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 3000));
  });
  assert.equal(confirmation(), '', 'the confirmation stays on the screen');

  await window.close();
});
