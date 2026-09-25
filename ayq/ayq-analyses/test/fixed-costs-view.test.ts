// Fixed costs › Expected now as it is drawn (DS r006 §16; A2 specification
// r001 §9–§12): the real components rendered to markup with no DOM, on
// validated synthetic snapshots. What this proves is what the markup says;
// what the installed application shows is the installed evidence's.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { baselineJson } from '../../ayq-analytical-contract/fixtures/synthetic.ts';
import { transactionEvidence } from '../src/fixed-costs.js';
import { translate } from '../src/strings.js';
import type { AyqAnalyticalSnapshot } from '../src/types.js';
import { DetailPane } from '../src/ui/detail.js';
import { FixedCosts } from '../src/ui/fixed-costs.js';
import { validateSnapshot } from '../src/validate.js';
import { AS_OF, build } from './a2-builder.js';

function markup(snapshot: AyqAnalyticalSnapshot): string {
  return renderToStaticMarkup(createElement(FixedCosts, { snapshot, onShowTransaction: () => {} }));
}

/** The text the markup shows, tags removed and entities decoded. */
function text(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Each element with a class, as [className, its text]. */
function spans(html: string, className: string): string[] {
  const found: string[] = [];
  const pattern = new RegExp(`<(\\w+)[^>]*class="[^"]*\\b${className}\\b[^"]*"[^>]*>([\\s\\S]*?)</\\1>`, 'g');
  for (const match of html.matchAll(pattern)) found.push(text(match[2]));
  return found;
}

function row(html: string, occurrenceKey: string): string {
  const at = html.indexOf(`data-occurrence="${occurrenceKey}"`);
  assert.ok(at >= 0, `row ${occurrenceKey} is drawn`);
  const end = html.indexOf('</li>', at);
  return html.slice(html.lastIndexOf('<li', at), end + 5);
}

/** Every reading at least once, as the view meets it. */
const ALL = build(
  [
    { key: 'rec-insurance', name: 'Home insurance', account: 'acc-everyday', amount: 4200 },
    { key: 'rec-gym', name: 'Gym', account: 'acc-everyday', amount: 11000 },
    { key: 'rec-phone', name: 'Phone plan', account: 'acc-card', amount: 2500 },
    { key: 'rec-water', name: 'Water', account: 'acc-everyday', amount: 3100 },
    { key: 'rec-paper', name: 'Newspaper', amount: 1500 },
    { key: 'rec-lessons', name: 'Music lessons', amount: 6000 },
    { key: 'rec-stream', name: 'Streaming', account: 'acc-everyday', amount: 1299 },
    { key: 'rec-rent', name: 'Rent', account: 'acc-everyday', amount: 95000 },
    { key: 'rec-power', name: 'Electricity', account: 'acc-everyday', amount: 8000 },
    { key: 'rec-energy', name: 'Energy advance', account: 'acc-everyday', amount: 12000 },
    { key: 'rec-shop', name: 'Groceries box', account: 'acc-everyday', amount: 5000 },
    { key: 'rec-salary', name: 'Salary', kind: 'income', account: 'acc-everyday', amount: 300000 },
  ],
  [
    { key: 'insurance', record: 'rec-insurance', expected: '2026-02-15', through: '2026-02-22', covered: true },
    { key: 'gym', record: 'rec-gym', expected: '2026-02-10', through: '2026-02-17', covered: true },
    { key: 'phone', record: 'rec-phone', expected: '2026-02-25', through: '2026-03-04', covered: false },
    { key: 'water', record: 'rec-water', expected: '2026-02-20', through: '2026-02-27', covered: false },
    { key: 'paper', record: 'rec-paper', expected: '2026-02-20', through: '2026-02-27' },
    { key: 'lessons', record: 'rec-lessons', expected: '2026-02-22', through: '2026-03-01' },
    { key: 'stream', record: 'rec-stream', expected: '2026-03-20', through: '2026-03-27' },
    { key: 'rent', record: 'rec-rent', expected: AS_OF, through: '2026-03-12' },
    { key: 'power', record: 'rec-power', expected: '2026-03-01', through: '2026-03-08' },
    // Matched to tx-02, -120.00 on 2026-02-10: equal to what was expected.
    { key: 'energy', record: 'rec-energy', expected: '2026-02-10', through: '2026-02-17', covered: true, matchedTo: 'tx-02' },
    // Matched to tx-01, -45.50 on 2026-02-03: different from the 50.00 expected.
    { key: 'shop', record: 'rec-shop', expected: '2026-02-03', through: '2026-02-10', covered: true, matchedTo: 'tx-01' },
    { key: 'salary', record: 'rec-salary', expected: '2026-02-25', through: '2026-03-04', covered: true },
  ],
);

test('the title, then exactly one date: the basis date, never the production day (r006 §16.3; H1)', () => {
  const html = markup(ALL);
  assert.equal(spans(html, 'fc-as-of').length, 1);
  assert.equal(text(html).match(/As of /g)?.length, 1);
  assert.match(text(html), /^Fixed costs As of Mar 5, 2026 /);
  // generatedAt is 2026-03-05T06:00Z — the same day here, so test with a basis date a day earlier.
  const earlier = build([{ key: 'r', name: 'Rent', account: 'acc-everyday' }], [{ key: 'o', record: 'r', expected: '2026-03-01', through: '2026-03-08' }], '2026-03-04');
  const shown = text(markup(earlier));
  assert.match(shown, /As of Mar 4, 2026/);
  assert.doesNotMatch(shown, /Mar 5, 2026/);
});

test('the explainer is the r006 sentence, and hangs from the basis-date line (H1b)', () => {
  assert.equal(
    translate('fixedCosts.asOf.explainer'),
    'Every status on this page is judged as of this date. It is the date AYQ used when it made this snapshot. It does not change when you open the app later. For newer statuses, export a new snapshot from AYQ.',
  );
  // The explainer is the surface of the popover whose trigger is the basis-date line itself.
  const source = readFileSync(join(process.cwd(), 'src', 'ui', 'fixed-costs.tsx'), 'utf8');
  const asOf = source.slice(source.indexOf('function AsOf('), source.indexOf('function Summary('));
  assert.match(asOf, /<PopoverTrigger[\s\S]*t\('fixedCosts\.asOf', \{ date[\s\S]*<PopoverSurface[\s\S]*t\('fixedCosts\.asOf\.explainer'\)/);
});

test('the summary shows all five counts in the fixed order, zeros included, each equal to its group (H2)', () => {
  const html = markup(ALL);
  const [summary] = spans(html, 'fc-summary');
  assert.equal(summary, 'Missing 2 · Not imported yet 2 · Can\'t tell 2 · Pending 3 · Arrived 2');
  assert.deepEqual(
    [...html.matchAll(/data-reading-group="(\w+)"/g)].map(match => match[1]),
    ['missing', 'notImported', 'cantTell', 'pending', 'arrived'],
  );
  for (const [reading, count] of [['missing', 2], ['notImported', 2], ['cantTell', 2], ['pending', 3], ['arrived', 2]] as const) {
    assert.equal([...html.matchAll(new RegExp(`data-reading="${reading}"`, 'g'))].length, count, reading);
  }
});

test('only Pending and Arrived rows: three zeros stay in the summary, their groups are absent (H2, H3)', () => {
  const html = markup(
    build(
      [
        { key: 'r', name: 'Rent', account: 'acc-everyday', amount: 12000 },
        { key: 's', name: 'Streaming', account: 'acc-everyday' },
      ],
      [
        { key: 'r1', record: 'r', expected: '2026-02-10', through: '2026-02-17', covered: true, matchedTo: 'tx-02' },
        { key: 's1', record: 's', expected: '2026-03-20', through: '2026-03-27' },
      ],
    ),
  );
  assert.equal(spans(html, 'fc-summary')[0], 'Missing 0 · Not imported yet 0 · Can\'t tell 0 · Pending 1 · Arrived 1');
  assert.deepEqual([...html.matchAll(/data-reading-group="(\w+)"/g)].map(match => match[1]), ['pending', 'arrived']);
});

test('the attention tone is on the names of Missing, Not imported yet and Can\'t tell — summary, heading, row — and nowhere else (r006 §16.2; H16)', () => {
  const html = markup(ALL);
  const toned = spans(html, 'attention-text');
  assert.deepEqual([...new Set(toned)].sort(), ['Can\'t tell', 'Missing', 'Not imported yet']);
  // Once in the summary, once per group heading, once per row: 3 + 3 + 6.
  assert.equal(toned.length, 12);
  // Pending and Arrived are text with no state colour.
  for (const name of ['Pending', 'Arrived']) assert.ok(!toned.includes(name));
  assert.ok(spans(html, 'fc-reading').includes('Pending') && spans(html, 'fc-reading').includes('Arrived'));
});

test('every row carries its record name, expected amount, expected date and account; Can\'t tell carries no account field (r006 §16.5; H8)', () => {
  const html = markup(ALL);
  const insurance = row(html, 'insurance');
  assert.match(text(insurance), /^Home insurance €42\.00 Feb 15, 2026 Everyday account Missing /);
  for (const key of ['paper', 'lessons']) {
    const cantTell = row(html, key);
    assert.ok(!cantTell.includes('fc-account'), `${key} has no account field`);
    assert.doesNotMatch(text(cantTell), /No account|Everyday account|Card account/);
    assert.match(
      text(cantTell),
      /Can't tell This snapshot does not say which account this payment is expected on\. In AYQ, check that the expected payment has an account and that the account is included in the export\.$/,
    );
  }
  // The two causes look the same, names, amounts and dates apart.
  const shape = (key: string) => text(row(html, key)).replace(/^.*?(?=Can't tell)/, '');
  assert.equal(shape('paper'), shape('lessons'));
});

test('the Pending sentences: Expected {date}, Due today, and the open window — never "missing" or "late" (H4, H5; r006 §16.6)', () => {
  const html = markup(ALL);
  assert.match(text(row(html, 'stream')), /Pending Expected Mar 20, 2026$/);
  assert.match(text(row(html, 'rent')), /Pending Due today$/);
  assert.match(text(row(html, 'power')), /Pending No matched payment yet · automatic matching date window runs through Mar 8, 2026$/);
  for (const key of ['stream', 'rent', 'power']) {
    assert.doesNotMatch(text(row(html, key)), /missing|late|will be matched/i);
  }
});

test('Missing names the account and the window end, says statements cover the whole period, and never "not found" or "not paid" (H6; T21)', () => {
  const html = markup(ALL);
  const gym = text(row(html, 'gym'));
  assert.match(
    gym,
    /Missing No matched payment in Everyday account\. The automatic matching date window ended Feb 17, 2026, and imported statements cover that whole period\. A payment with a different amount, or one paid late or another way, is not matched automatically\. You can match it by hand in AYQ\./,
  );
  assert.doesNotMatch(text(html), /not found|not paid/i);
});

test('Not imported yet: presentation A names the last statement date and the import-through date; B names no gap dates (H7a, H7b)', () => {
  const html = markup(ALL);
  assert.match(text(row(html, 'phone')), /Not imported yet Card account data runs to Feb 28, 2026\. Import statements through Mar 4, 2026 to know\./);
  const water = text(row(html, 'water'));
  assert.match(
    water,
    /Not imported yet Everyday account has data through Mar 4, 2026, but this payment's matching period is not fully covered by imported statements\. Import the missing statements for this period to know\./,
  );
  // The only dates in a B row are its own expected date, the last statement
  // date and the coverage button's; no gap interval is invented.
  const dates = water.match(/[A-Z][a-z]{2} \d{1,2}, \d{4}/g) ?? [];
  assert.deepEqual([...new Set(dates)], ['Feb 20, 2026', 'Mar 4, 2026']);
});

test('the row\'s own account coverage is reachable from Missing and Not imported yet rows only (r006 §16.11)', () => {
  const html = markup(ALL);
  for (const key of ['insurance', 'gym', 'phone', 'water']) assert.match(row(html, key), /data-action="row-coverage"/, key);
  for (const key of ['paper', 'stream', 'rent', 'power', 'energy', 'shop']) assert.doesNotMatch(row(html, key), /data-action="row-coverage"/, key);
});

test('Arrived: paid date, paid amount and account, then Show transaction — no second expected-amount line (H9; DS r007 §16.5, P-2)', () => {
  const html = markup(ALL);
  const equal = text(row(html, 'energy'));
  assert.match(equal, /Arrived Paid Feb 10, 2026 · €120\.00 · Everyday account Show transaction$/);
  // A paid amount different from the expected one is still shown as paid; the
  // expected amount stays only in the row's own figure column.
  const different = row(html, 'shop');
  assert.match(text(different), /^Groceries box €50\.00 Feb 3, 2026 Everyday account Arrived Paid Feb 3, 2026 · €45\.50 · Everyday account Show transaction$/);
  for (const key of ['energy', 'shop']) {
    assert.doesNotMatch(text(row(html, key)), /Expected/);
    assert.equal(spans(row(html, key), 'fc-secondary').length, 0, key);
    assert.match(row(html, key), /data-action="show-transaction"/);
  }
  assert.ok(!Object.hasOwn(JSON.parse(readFileSync(join(process.cwd(), 'src', 'strings', 'en.json'), 'utf8')), 'fixedCosts.arrived.expected'));
});

test('the row coverage trigger is supporting detail: a plain button in secondary text weight (DS r007 §16.11, P-1)', () => {
  const html = markup(ALL);
  for (const key of ['insurance', 'gym', 'phone', 'water']) {
    const trigger = row(html, key).match(/<(\w+)([^>]*data-action="row-coverage"[^>]*)>([\s\S]*?)<\/\1>/);
    assert.ok(trigger, key);
    assert.equal(trigger[1], 'button', `${key}: a plain button, not a Fluent control`);
    assert.match(trigger[2], /class="fc-coverage-trigger"/);
    assert.match(trigger[2], /type="button"/);
    assert.match(text(trigger[3]), /^Data through [A-Z][a-z]{2} \d{1,2}, \d{4}$/);
  }
  // A Windows checkout gives the stylesheet CRLF line ends.
  const css = readFileSync(join(process.cwd(), 'src', 'styles.css'), 'utf8').replace(/\r\n/g, '\n');
  const rule = css.match(/\n\n\.fc-coverage-trigger \{([^}]*)\}/);
  assert.ok(rule);
  assert.match(rule[1], /font-size: var\(--size-secondary\);/);
  assert.match(rule[1], /color: var\(--secondary\);/);
});

test('"As of" is a plain button with no control padding, so it starts where the title starts (DS r007 §16.3, P-3)', () => {
  const html = markup(ALL);
  const trigger = html.match(/<(\w+)([^>]*data-fixed-costs-as-of=""[^>]*)>/);
  assert.ok(trigger);
  assert.equal(trigger[1], 'button');
  assert.equal(trigger[2].trim().split(/\s+/).filter(a => a.startsWith('class=')).join(), 'class="fc-as-of"');
  const css = readFileSync(join(process.cwd(), 'src', 'styles.css'), 'utf8').replace(/\r\n/g, '\n');
  const rule = css.match(/\n\.fc-as-of,\n\.fc-coverage-trigger \{([^}]*)\}/);
  assert.ok(rule);
  for (const declaration of ['margin: 0;', 'padding: 0;', 'border: 0;', 'font-weight: 400;', 'text-align: start;']) {
    assert.ok(rule[1].includes(declaration), declaration);
  }
});

test('Show transaction opens the existing detail pane on the matched transaction, with its A1 evidence (H9; r006 §16.11)', () => {
  const evidence = transactionEvidence(ALL, 'tx-01');
  assert.ok(evidence);
  const html = renderToStaticMarkup(
    createElement(DetailPane, {
      result: evidence.result,
      selection: { kind: 'transaction', title: 'Groceries box', contribution: evidence.contribution },
      onClose: () => {},
    }),
  );
  const shown = text(html);
  assert.match(shown, /^Groceries box Close Date Amount Account Category Class Feb 3, 2026 €45\.50 Everyday account Groceries Card payment/);
  assert.match(shown, /Superstore, Amsterdam/);
  assert.match(shown, /Category set by a rule/);
});

test('a matched transaction that is not A1 money-out still opens, with its own amount (an internal transfer)', () => {
  const evidence = transactionEvidence(ALL, 'tx-06');
  assert.ok(evidence);
  assert.equal(evidence.contribution.amountMinor, 50000n);
  assert.equal(evidence.contribution.original, null);
});

test('a 1.0 snapshot: only the older-snapshot sentence and the income line — no date, no counts, no rows (H10)', () => {
  const shown = text(markup(validateSnapshot(baselineJson())));
  assert.equal(
    shown,
    'Fixed costs This snapshot was made by an older version of AYQ. It does not contain what Fixed costs needs. Export a new snapshot from AYQ. Expected income is not shown here.',
  );
  assert.doesNotMatch(shown, /cannot be read/);
});

test('no confirmed expected expense: the empty sentence, the basis date and the income line (H11)', () => {
  const shown = text(
    markup(
      build(
        [
          { key: 'rec-maybe', name: 'Possible subscription', state: 'suggested', account: 'acc-everyday' },
          { key: 'rec-salary', name: 'Salary', kind: 'income', account: 'acc-everyday' },
        ],
        [
          { key: 'm', record: 'rec-maybe', expected: '2026-02-20', through: '2026-02-27', covered: true },
          { key: 's', record: 'rec-salary', expected: '2026-02-25', through: '2026-03-04', covered: true },
        ],
      ),
    ),
  );
  assert.equal(
    shown,
    'Fixed costs As of Mar 5, 2026 This snapshot has no confirmed expected payments. Expected payments appear here after you confirm them in AYQ. Suggestions are not counted. Expected income is not shown here.',
  );
});

test('expected income never appears as a row, and its line is present in every state (H12; V2)', () => {
  const html = markup(ALL);
  assert.doesNotMatch(text(html), /Salary/);
  assert.ok(text(html).endsWith('Expected income is not shown here.'));
});

test('no internal reading name, no Paid history, and no state colour but attention (r006 §8.1, §16.1; H13, K1)', () => {
  const shown = text(markup(ALL));
  for (const internal of ['MISSING', 'NOT_YET_IMPORTED', 'CANNOT_BE_TOLD', 'PENDING', 'ARRIVED', 'notImported', 'cantTell', 'openWindow', 'dataEnds']) {
    assert.ok(!shown.includes(internal), internal);
  }
  assert.doesNotMatch(shown, /Paid history/i);
});
