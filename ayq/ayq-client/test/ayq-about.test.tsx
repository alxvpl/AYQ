// Settings → About (12).
//
// Two things are being checked and they are different in kind. One is that the
// screen shows what this build is, in the words §12.1 fixes. The other is that
// **Copy technical information** copies exactly what the engine composed and
// nothing the renderer added — because the privacy contract in §12.4 is
// enforced by a test over one engine function, and a renderer that assembled
// its own text would be outside it.
//
// Every value below is invented except the shape.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { AyqAbout } from '../src/ayq-ipc-contract.ts';
import { AyqAboutScreen } from '../src/ayq-screens/ayq-about.tsx';
import { AYQ_SETTINGS_TABS } from '../src/ayq-screens/ayq-settings.tsx';
import { ayqText } from '../src/ayq-strings.ts';
import { AyqGroundProvider } from '../src/ayq-ui/ayq-ground-provider.tsx';
import { ayqOpenWindow, ayqPress } from './ayq-react.ts';

const TECHNICAL = [
  'Product        : AYQ Personal Finances',
  'Version        : 0.2.0',
  'Build          : 005',
  'Build date     : 2026-09-16T09:00:00Z',
  'Architecture   : Windows x64',
  'AYQ revision   : e93c77e546791439a85e0ef29fc2c7e9cfb1e2d9',
  'Engine         : Actual Budget 26.9.0',
  'Actual baseline: db1b0ea9',
  'Electron       : 43.4.0',
  'Node           : 22.22.2',
].join('\n');

const ABOUT: AyqAbout = {
  productName: 'AYQ Personal Finances',
  tagline: 'Local-first personal finance application for Windows',
  author: 'Plamen Alexandrov',
  copyright: '\u00a9 2026 Plamen Alexandrov.',
  productVersion: '0.2.0',
  buildNumber: '005',
  buildDate: '2026-09-16T09:00:00Z',
  architecture: 'Windows x64',
  revision: 'e93c77e546791439a85e0ef29fc2c7e9cfb1e2d9',
  engine: 'Actual Budget 26.9.0',
  actualBaseline: 'db1b0ea9',
  electronVersion: '43.4.0',
  nodeVersion: '22.22.2',
  development: false,
  licence: 'AYQ is released under the MIT licence.',
  localFirst: 'AYQ keeps everything on this computer.',
  links: [{ label: 'Repository', url: 'https://github.com/alxvpl/AYQ' }],
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

test('About says which build this is, in the words 12 §12.1 fixes', async () => {
  const window = await ayqOpenWindow(engine());
  await window.render(screen);

  // The mark is on About, drawn from the vector master, beside the name.
  const mark = window.container.querySelector('[data-ayq-mark]');
  assert.ok(mark, 'About carries no mark');
  assert.ok(mark.querySelector('svg'), 'the mark is not the vector master');
  assert.equal(mark.getAttribute('aria-hidden'), 'true');

  const said = (mark: string): string =>
    window.container
      .querySelector(`[data-ayq-about="${mark}"]`)
      ?.textContent ?? '';

  assert.equal(said('author'), 'Plamen Alexandrov');
  assert.equal(said('version'), '0.2.0');
  assert.equal(said('build'), '005');
  assert.equal(said('build-date'), '2026-09-16T09:00:00Z');
  assert.equal(said('architecture'), 'Windows x64');
  assert.equal(said('revision'), 'e93c77e546791439a85e0ef29fc2c7e9cfb1e2d9');
  assert.equal(said('engine'), 'Actual Budget 26.9.0');
  assert.equal(said('baseline'), 'db1b0ea9');
  assert.equal(said('copyright'), '\u00a9 2026 Plamen Alexandrov.');

  const whole = window.container.textContent ?? '';
  assert.ok(whole.includes('AYQ Personal Finances'));
  assert.ok(whole.includes('Local-first personal finance application for Windows'));
  // The local-first note and the licence, both stated.
  assert.ok(whole.includes('keeps everything on this computer'));
  assert.ok(whole.includes('MIT licence'));

  await window.close();
});

test('only links the engine really declared are drawn', async () => {
  const window = await ayqOpenWindow(engine());
  await window.render(screen);
  const links = window.container.querySelectorAll('a[href]');
  assert.equal(links.length, 1);
  assert.equal(links[0].getAttribute('href'), 'https://github.com/alxvpl/AYQ');
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

  await window.close();
});

test('Copy technical information copies exactly what the engine composed', async () => {
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

  const button = window.container.querySelector('[data-ayq-action="about-copy"]');
  assert.ok(button, 'there is no copy button');
  await ayqPress(button as HTMLElement);

  assert.equal(copied.length, 1, 'the button copied nothing');
  assert.equal(
    copied[0],
    TECHNICAL,
    'the renderer composed its own text instead of copying the engine\u2019s',
  );

  await window.close();
});

test('the copied text carries no budget, path, account or amount (12 §12.4)', async () => {
  const window = await ayqOpenWindow(engine());
  await window.render(screen);

  // The same text is on the screen, so this reads what a person would paste.
  const shown = window.container.querySelector('[data-ayq-technical]')?.textContent ?? '';
  assert.equal(shown, TECHNICAL);

  for (const forbidden of [
    'My Household Budget',
    'C:\\Users',
    'AppData',
    'NL91ABNA',
    'TESTMARKT',
    'Groceries',
    '1284.50',
  ]) {
    assert.ok(
      !shown.includes(forbidden),
      `the copied text carries ${forbidden}`,
    );
  }

  await window.close();
});
