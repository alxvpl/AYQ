// Chart counterparty labels never look complete when they are not (037
// Observation A; directive 004 T2). A category-axis label longer than the
// chart-only width is shortened at its end with exactly one U+2026; a label
// that fits is drawn as it is. The table and the detail pane keep the full
// name. Truncation itself is ECharts' own: the tests below run its truncateText
// with the application's configuration (in Node its text widths are estimates;
// the drawn labels on the real application are in evidence/overnight-t1-t3).

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as echarts from 'echarts';
import { CATEGORY_AXIS_LABEL, categoryLabelGutter } from '../src/geometry.js';

const FONT = `12px "${CATEGORY_AXIS_LABEL.fontFamily}"`;
const shorten = (name: string): string =>
  echarts.format.truncateText(name, CATEGORY_AXIS_LABEL.width, FONT, CATEGORY_AXIS_LABEL.ellipsis, {});

test('a category label is shortened only at its end, only with one U+2026, never wrapped', () => {
  assert.equal(CATEGORY_AXIS_LABEL.overflow, 'truncate');
  assert.equal(CATEGORY_AXIS_LABEL.ellipsis, '…');
  assert.equal([...CATEGORY_AXIS_LABEL.ellipsis].length, 1);
  assert.equal(CATEGORY_AXIS_LABEL.width, 240);
  // ECharts' own defaults for an axis label, named so the gutter is measured in them.
  assert.equal(CATEGORY_AXIS_LABEL.fontSize, 12);
  assert.equal(CATEGORY_AXIS_LABEL.margin, 8);
});

test('the gutter holds the widest label as drawn, over every row, never more than the label width', () => {
  const measure = (text: string): number => text.length * 6;
  assert.equal(categoryLabelGutter(['Superstore', 'Harbour Café'], measure), 72 + 8);
  assert.equal(categoryLabelGutter(['Superstore', 'x'.repeat(100)], measure), 240 + 8);
  // Sixty rows with the widest at a row ECharts' containLabel would not sample
  // (it measures every second one above forty): the gutter still holds it.
  const names = Array.from({ length: 60 }, (_, i) => (i === 31 ? 'y'.repeat(30) : 'z'.repeat(10)));
  assert.equal(categoryLabelGutter(names, measure), 180 + 8);
  assert.equal(categoryLabelGutter([], measure), 8);
});

test('the label names the family ECharts draws with, so the gutter is measured in the font that is drawn', () => {
  // Otherwise ECharts measures the gutter in sans-serif and draws in its
  // Windows default, and the first letters of a long label fall off the canvas.
  const defaults = readFileSync(join(process.cwd(), 'node_modules', 'echarts', 'lib', 'model', 'globalDefault.js'), 'utf8');
  assert.match(defaults, /fontFamily: platform\.match\(\/\^Win\/\) \? 'Microsoft YaHei' : 'sans-serif'/);
  assert.equal(CATEGORY_AXIS_LABEL.fontFamily, 'Microsoft YaHei');
});

test('ordinary names are drawn whole; a long name keeps its beginning and ends in one ellipsis', () => {
  for (const name of ['Superstore', 'Northwind Energy', 'Harbour Café', 'Garage Northwind Florist 267']) {
    assert.equal(shorten(name), name);
  }
  const long = 'Insurance Studio Florist Books Cinema Harbour Energy Optician Cafe Pharmacy Telecom 275';
  const drawn = shorten(long);
  assert.ok(drawn.endsWith('…'), drawn);
  assert.equal([...drawn].filter(c => c === '…').length, 1);
  assert.ok(!drawn.includes('...'));
  assert.ok(long.startsWith(drawn.slice(0, -1)), drawn);
});

test('two names sharing a prefix longer than the label are both marked as shortened', () => {
  // The residual of end truncation (002 C3): both labels may read alike. The
  // bars stay separate by position and the table rows carry the full names.
  const prefix = 'Northwind Regional Energy Cooperative Association — ';
  const a = shorten(`${prefix}Amsterdam Noord`);
  const b = shorten(`${prefix}Rotterdam Zuid`);
  for (const [full, drawn] of [[`${prefix}Amsterdam Noord`, a], [`${prefix}Rotterdam Zuid`, b]]) {
    assert.ok(drawn.endsWith('…'), drawn);
    assert.ok(full.startsWith(drawn.slice(0, -1)), drawn);
  }
});

test('only the category axis is shortened: amounts, tooltip, table and detail keep what they printed', () => {
  const result = readFileSync(join(process.cwd(), 'src', 'ui', 'result.tsx'), 'utf8');
  assert.match(result, /yAxis: \{ type: 'category', data: ordered\.map\(row => row\.displayName\), axisLabel: CATEGORY_AXIS_LABEL \}/);
  assert.match(result, /grid: \{ left: 8 \+ categoryLabelGutter\(ordered\.map\(row => row\.displayName\), measureCategoryLabel\(\)\), right: 24, top: 8, bottom: 24 \}/);
  assert.match(result, /context\.font = `\$\{CATEGORY_AXIS_LABEL\.fontSize\}px "\$\{CATEGORY_AXIS_LABEL\.fontFamily\}"`/);
  assert.equal(/containLabel|overflow|ellipsis|truncate/.test(result.replace(/CATEGORY_AXIS_LABEL/g, '')), false);
  assert.match(result, /<td className="text">\{row\.displayName\}<\/td>/);
  const detail = readFileSync(join(process.cwd(), 'src', 'ui', 'detail.tsx'), 'utf8');
  assert.match(detail, /<h2>\{row\.displayName\}<\/h2>/);
});
