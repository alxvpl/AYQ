// The rail's destinations (r002 §3.1, §3.2, §11.1): six analytical
// destinations in the accepted order, five of them navigable placeholders
// that answer exactly "Not in this version." and never a blank body, and
// Settings as utility navigation outside the analytical order.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ANALYTICAL_DESTINATIONS,
  DESTINATION_LABEL,
  isAnalytical,
  isImplemented,
  placeholderKey,
} from '../src/destinations.js';
import { translate } from '../src/strings.js';

const SOURCE = join(process.cwd(), 'src');
const renderer = readFileSync(join(SOURCE, 'renderer.tsx'), 'utf8');

test('the six analytical destinations keep the accepted order, and Settings is not among them', () => {
  assert.deepEqual(ANALYTICAL_DESTINATIONS, ['overview', 'explore', 'fixedCosts', 'projection', 'scenarios', 'savedAnalyses']);
  assert.equal(isAnalytical('settings'), false);
  assert.equal(translate(DESTINATION_LABEL.settings), 'Settings');
});

test('every one of the five unbuilt destinations resolves to exactly "Not in this version." and none to a blank body', () => {
  const unbuilt = ANALYTICAL_DESTINATIONS.filter(destination => !isImplemented(destination));
  assert.deepEqual(unbuilt, ['overview', 'fixedCosts', 'projection', 'scenarios', 'savedAnalyses']);
  for (const destination of unbuilt) {
    const key = placeholderKey(destination);
    assert.equal(key, 'rail.notInThisVersion', `${destination} answers with the placeholder sentence`);
    const sentence = translate(key!);
    assert.equal(sentence, 'Not in this version.');
    assert.notEqual(sentence.trim(), '', `${destination} must not open to a blank body`);
  }
  assert.equal(placeholderKey('explore'), null, 'the built destination shows its real surface');
});

test('the renderer routes every non-Explore analytical destination to the placeholder, and Settings to its own surface', () => {
  // The placeholder body is the catalogue sentence and nothing composed.
  assert.match(renderer, /function NotInThisVersion[\s\S]*?placeholderKey\(destination\)[\s\S]*?t\(key\)/);
  const routing = renderer.slice(renderer.indexOf('let body:'));
  assert.match(routing, /destination === 'settings'[\s\S]*?<SettingsView/);
  assert.match(routing, /destination !== 'explore'[\s\S]*?<NotInThisVersion destination=\{destination\}/);
});

test('an unbuilt destination is a navigable placeholder, not a disabled control', () => {
  assert.ok(!renderer.includes('aria-disabled'), 'no rail tile is marked disabled');
  assert.ok(!renderer.includes('disabled={'), 'no rail tile is disabled');
  // Settings sits in the footer, outside the analytical list, as its own Tab stop.
  assert.match(renderer, /<div className="rail-footer">[\s\S]*?destination="settings"[\s\S]*?tabStop\b/);
});
