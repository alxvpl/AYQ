// Settings → About (DS r007 §11.2, §11.4; 06_RELEASE r004 §3.11): the real
// Settings view rendered to markup with no DOM.

import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { baselineV11Json } from '../../ayq-analytical-contract/fixtures/synthetic.ts';
import { RELEASE, releaseIdentity } from '../src/release.js';
import { SettingsView, type SettingsSnapshot } from '../src/ui/settings.js';
import { validateSnapshot } from '../src/validate.js';

function text(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

function render(active: SettingsSnapshot, release = RELEASE): string {
  return renderToStaticMarkup(
    createElement(SettingsView, { active, onLoad: () => {}, onRemove: () => {}, onOpenNotices: () => {}, release }),
  );
}

const snapshot = validateSnapshot(baselineV11Json());
const loaded: SettingsSnapshot = { kind: 'loaded', snapshot, identity: { fileName: 'invented-snapshot.json' } };

test('About follows Snapshot and carries every line the owner standard requires, word for word', () => {
  const html = render(loaded);
  const shown = text(html);
  const about = shown.slice(shown.indexOf('About Product'));
  assert.ok(shown.indexOf('Snapshot') < shown.indexOf('About Product'), 'Snapshot comes first, then About');
  assert.equal(
    about,
    [
      'About',
      'Product: AYQ Analyses',
      'Version: 0.2.0',
      'Build: 001',
      'Identification: AYQ Analyses 0.2.0 (Build 001)',
      'Author: Plamen Alexandrov',
      '© 2026 Plamen Alexandrov. All rights reserved.',
      'Licence: Proprietary / closed-source',
      'AYQ Analyses includes open-source components. Each is used under its own licence.',
      'Third-party licenses / Notices',
    ].join(' '),
  );
  assert.match(html, /data-action="open-notices"/);
});

test('About is complete in every Snapshot state: none, refused and loaded', () => {
  for (const active of [{ kind: 'none' }, { kind: 'refused', identity: { fileName: 'x.json' } }, loaded] as SettingsSnapshot[]) {
    const shown = text(render(active));
    assert.match(shown, /About Product: AYQ Analyses Version: 0\.2\.0 Build: 001 Identification: AYQ Analyses 0\.2\.0 \(Build 001\)/);
    assert.match(shown, /Third-party licenses \/ Notices$/);
  }
});

test('Version and Build are the release source\'s, not text written into the view', () => {
  const other = releaseIdentity({ productName: 'AYQ Analyses', version: '0.3.1', author: 'Plamen Alexandrov', license: 'UNLICENSED', ayq: { build: '017' } });
  const shown = text(render(loaded, other));
  assert.match(shown, /Version: 0\.3\.1 Build: 017 Identification: AYQ Analyses 0\.3\.1 \(Build 017\)/);
  assert.doesNotMatch(shown, /0\.2\.0|Build: 001/);
});

test('About shows no financial data, snapshot identifier, path, machine or user identifier', () => {
  const html = render(loaded);
  const about = text(html).slice(text(html).indexOf('About Product'));
  for (const forbidden of [snapshot.meta.snapshotId, snapshot.meta.budgetKey, 'invented-snapshot.json', 'acc-', 'tx-', '\\', 'C:', 'Users', 'AppData', 'MIT']) {
    assert.ok(!about.includes(forbidden), `About must not show ${forbidden}`);
  }
});
