// Governance-to-code conformance (directive 039 W1): this suite fails when the
// implementation drifts from AYQ_ANALYSES_DESIGN_SYSTEM r004 (r003 plus the
// chart guard of §8.2 and the attention tone of §4).
//
// Three things are enforced. (1) Every sentence r003 states as normative is
// in the catalogue character for character, and is referenced from the
// module that owns it — the component that renders it, or the mapping module
// that component imports — rather than merely present in the file. This is
// a static reachability check: the suite runs without a DOM, so "rendered"
// is not asserted here; the installed-application evidence carries that.
// (2) The absences r003 and 02_ARCHITECTURE r007 §7.16 decided on are
// absent. (3) The contrast thresholds of r003 §4 hold as rules: every
// accent- or state-coloured text or icon is measured on the surface it is
// actually drawn on, after every overlay and wash, in every state it can sit
// in, and the lowest governs.
//
// What this suite cannot honestly enforce is stated at the end of the file.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import catalogue from '../src/strings/en.json' with { type: 'json' };
import { hasString, translate } from '../src/strings.js';
import { ACCENT, DARK, RAIL_CURRENT, RAIL_OVERLAY, STATE, SURFACE, contrastRatio } from '../src/ui/tokens.js';
import { analysesTheme } from '../src/ui/theme.js';

const SOURCE = join(process.cwd(), 'src');

function source(relative: string): string {
  return readFileSync(join(SOURCE, relative), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
}

const entries = catalogue as unknown as Record<string, unknown>;

// ---- (1) the normative sentences of r003 ------------------------------------

type Sentence = {
  section: string;
  key: string;
  /** The exact text, or the exact forms of a plural entry. */
  text: string | Record<string, string>;
  /** The module that owns the sentence: it must reference the key. */
  owner: string;
  /** For a mapping module: the component that must import it to reach the screen. */
  reachedThrough?: string;
};

const RENDERER = 'renderer.tsx';
const RESULT = 'ui/result.tsx';
const COVERAGE = 'ui/coverage.tsx';
const DETAIL = 'ui/detail.tsx';
const SETTINGS = 'ui/settings.tsx';
const EVIDENCE = 'evidence.ts';
const DESTINATIONS = 'destinations.ts';
const LOAD_STATE = 'load-state.ts';
const FIXED_COSTS = 'ui/fixed-costs.tsx';

const NORMATIVE: Sentence[] = [
  // §3.1 — an unbuilt destination answers with exactly this.
  { section: '3.1', key: 'rail.notInThisVersion', text: 'Not in this version.', owner: DESTINATIONS, reachedThrough: RENDERER },

  // §6.2 — the launch state with no active snapshot.
  { section: '6.2', key: 'snapshot.empty.title', text: 'No data loaded', owner: RENDERER },
  {
    section: '6.2',
    key: 'snapshot.empty.body',
    text: 'AYQ Analyses reads a snapshot that AYQ produces. It never opens your budget directly.',
    owner: RENDERER,
  },

  // §6.3 — the refused family.
  { section: '6.3', key: 'snapshot.invalid.title', text: 'This snapshot cannot be read', owner: RENDERER },
  {
    section: '6.3',
    key: 'snapshot.invalid.reason.contractMajor',
    text: 'This snapshot was produced for a newer version of the data contract than this application understands.',
    owner: RENDERER,
  },
  { section: '6.3', key: 'snapshot.invalid.reason.malformed', text: 'The file is not a snapshot, or parts of it are missing.', owner: RENDERER },
  {
    section: '6.3',
    key: 'snapshot.invalid.reason.invariant',
    text: 'The snapshot is internally inconsistent, so no figure from it can be trusted.',
    owner: RENDERER,
  },
  {
    section: '6.3',
    key: 'snapshot.invalid.reason.unknown',
    text: 'This file does not match the snapshot format this application can read.',
    owner: RENDERER,
  },

  // §6.5 — normative state wording.
  { section: '6.5', key: 'explore.result.scope', text: 'Money out · {from} – {to} · {accounts}', owner: RESULT },
  {
    section: '6.5',
    key: 'explore.coverage.endLimit',
    text: 'This snapshot holds {accounts} through {date}. Nothing after that date is in it.',
    owner: RESULT,
  },
  {
    section: '6.5',
    key: 'explore.coverage.startLimit',
    text: 'This snapshot holds {accounts} from {date}. The period you asked for begins before that.',
    owner: RESULT,
  },
  { section: '6.5', key: 'explore.empty', text: 'No matching transactions.', owner: RESULT },
  { section: '6.5', key: 'explore.insufficient', text: 'No data for this period.', owner: RESULT },
  { section: '6.5', key: 'explore.insufficient.detail', text: '{account} covers {openingDate} – {lastStatementDate}', owner: RESULT },
  {
    section: '6.5',
    key: 'context.comparison.clamped',
    text: '29 February does not exist in {year}; compared against {date}.',
    owner: 'ui/context-bar.tsx',
  },
  { section: '6.5', key: 'explore.comparison.unavailable', text: 'Comparison unavailable — {reason}', owner: RESULT },
  { section: '6.5', key: 'explore.comparison.reason.coverage', text: 'this snapshot does not hold {accounts} for {from} – {to}', owner: RESULT },
  { section: '6.5', key: 'explore.comparison.reason.noData', text: 'this snapshot holds no data for {from} – {to}', owner: RESULT },
  { section: '6.5', key: 'explore.comparison.reason.currency', text: 'the comparison period is in {currency}', owner: RESULT },
  {
    section: '6.5',
    key: 'explore.unsupported',
    text: 'This selection spans more than one currency ({currencies}). Narrow the accounts or the period to a single currency.',
    owner: RESULT,
  },

  // §6.6 — unknown start, in both grammatical numbers (§10.3).
  { section: '6.6', key: 'coverage.button.unknownStart', text: 'Data through {date} · start unknown', owner: COVERAGE },
  {
    section: '6.6',
    key: 'explore.coverage.unknownStart',
    text: {
      one: 'This snapshot does not establish how far back {accounts} reaches, so earlier transactions may be missing.',
      other: 'This snapshot does not establish how far back {accounts} reach, so earlier transactions may be missing.',
    },
    owner: RESULT,
  },
  {
    section: '6.6',
    key: 'explore.empty.unknownStart',
    text: {
      one: 'No matching transactions in what this snapshot holds. It does not establish how far back {accounts} reaches, so there may be more.',
      other: 'No matching transactions in what this snapshot holds. It does not establish how far back {accounts} reach, so there may be more.',
    },
    owner: RESULT,
  },
  {
    section: '6.6',
    key: 'coverage.flyout.account.unknownStart',
    text: '{account}: through {lastStatementDate}. How far back it reaches is not established.',
    owner: COVERAGE,
  },
  {
    section: '6.6',
    key: 'explore.comparison.reason.unknownStart',
    text: {
      one: 'this snapshot does not establish how far back {accounts} reaches',
      other: 'this snapshot does not establish how far back {accounts} reach',
    },
    owner: RESULT,
  },

  // §7 — coverage and reconciliation wording.
  { section: '7', key: 'coverage.button.full', text: 'Data through {date}', owner: COVERAGE },
  { section: '7', key: 'coverage.button.limited', text: 'Data through {date} · limited', owner: COVERAGE },
  { section: '7', key: 'coverage.button.none', text: 'No data for this period', owner: COVERAGE },
  { section: '7', key: 'coverage.flyout.generated', text: 'Snapshot taken {datetime} ({relative})', owner: COVERAGE },
  { section: '7', key: 'coverage.flyout.account', text: '{account}: {openingDate} – {lastStatementDate}', owner: COVERAGE },
  { section: '7', key: 'coverage.flyout.limitStart', text: 'Starts {date}, set by {accounts}', owner: COVERAGE },
  { section: '7', key: 'coverage.flyout.limitEnd', text: 'Ends {date}, set by {accounts}', owner: COVERAGE },
  { section: '7', key: 'coverage.flyout.reconciliation.line', text: '{account} — {text}', owner: COVERAGE },
  { section: '7', key: 'coverage.flyout.reconciliation.agrees', text: 'Matches the statement', owner: COVERAGE },
  { section: '7', key: 'coverage.flyout.reconciliation.differs', text: 'Differs from the statement by {amount}', owner: COVERAGE },
  { section: '7', key: 'coverage.flyout.reconciliation.unavailable', text: 'No statement balance to compare with', owner: COVERAGE },
  {
    section: '7',
    key: 'coverage.flyout.reconcileNote',
    text: 'This is a comparison, not a correction. The figures above are unchanged by it.',
    owner: COVERAGE,
  },

  // §8.1 — provenance, reversal and out-of-selection wording.
  { section: '8.1', key: 'evidence.provenance.manual', text: 'Category set by you', owner: DETAIL },
  { section: '8.1', key: 'evidence.provenance.learned_rule', text: 'Category set by a rule', owner: DETAIL },
  { section: '8.1', key: 'evidence.provenance.automatic', text: 'Category set automatically by AYQ', owner: DETAIL },
  { section: '8.1', key: 'evidence.provenance.none', text: 'No category set', owner: DETAIL },
  { section: '8.1', key: 'evidence.reverses', text: 'Reverses {date}, {amount}, {counterparty}', owner: EVIDENCE, reachedThrough: DETAIL },
  { section: '8.1', key: 'evidence.reversesNoCounterparty', text: 'Reverses {date}, {amount}', owner: EVIDENCE, reachedThrough: DETAIL },
  { section: '8.1', key: 'evidence.reversesOutsidePeriod', text: 'The original falls outside {from} – {to}.', owner: EVIDENCE, reachedThrough: DETAIL },
  {
    section: '8.1',
    key: 'evidence.reversesOutsideAccounts',
    text: 'The original is in an account you have not selected.',
    owner: EVIDENCE,
    reachedThrough: DETAIL,
  },
  { section: '8.1', key: 'evidence.reversesOutsideFilter', text: 'The original is excluded by the category filter.', owner: EVIDENCE, reachedThrough: DETAIL },
  {
    section: '8.1',
    key: 'evidence.reversesOutsideSelection',
    text: 'The original is outside the current selection.',
    owner: EVIDENCE,
    reachedThrough: DETAIL,
  },

  // §8.2 — a presentation that cannot show the result says so (r004).
  {
    section: '8.2',
    key: 'chart.tooLarge',
    text: 'This result is too large to show as a chart. The table still shows the complete result.',
    owner: RESULT,
  },

  // §9 — the exclusion lines; r003 gives the plural form, §10.1 requires the singular.
  {
    section: '9',
    key: 'exclusion.notApplicable',
    text: { one: 'No counterparty by nature: {n} transaction · {amount}', other: 'No counterparty by nature: {n} transactions · {amount}' },
    owner: DETAIL,
  },
  {
    section: '9',
    key: 'exclusion.notIdentified',
    text: { one: 'Counterparty not identified: {n} transaction · {amount}', other: 'Counterparty not identified: {n} transactions · {amount}' },
    owner: DETAIL,
  },
  {
    section: '9',
    key: 'exclusion.notApplicable.countOnly',
    text: { one: 'No counterparty by nature: {n} transaction', other: 'No counterparty by nature: {n} transactions' },
    owner: DETAIL,
  },
  {
    section: '9',
    key: 'exclusion.notIdentified.countOnly',
    text: { one: 'Counterparty not identified: {n} transaction', other: 'Counterparty not identified: {n} transactions' },
    owner: DETAIL,
  },

  // §11.4 — Settings wording; the counts take plural-selected forms (§10.1).
  { section: '11.4', key: 'settings.snapshot.heading', text: 'Snapshot', owner: SETTINGS },
  { section: '11.4', key: 'settings.snapshot.taken', text: 'Taken {datetime} ({relative})', owner: SETTINGS },
  {
    section: '11.4',
    key: 'settings.snapshot.holds',
    text: {
      'one|one': '{accounts} account · {transactions} transaction',
      'one|other': '{accounts} account · {transactions} transactions',
      'other|one': '{accounts} accounts · {transactions} transaction',
      'other|other': '{accounts} accounts · {transactions} transactions',
    },
    owner: SETTINGS,
  },
  { section: '11.4', key: 'settings.snapshot.none', text: 'No snapshot loaded.', owner: SETTINGS },
  { section: '11.4', key: 'settings.snapshot.refused', text: 'This file cannot be read.', owner: SETTINGS },

  // §11.5 — the load action reuses the status-bar label; the failure sentence.
  { section: '11.5', key: 'status.loadAnother', text: 'Load another snapshot…', owner: SETTINGS },
  {
    section: '11.5',
    key: 'snapshot.load.failed',
    text: 'This snapshot could not be loaded. AYQ Analyses did not change what it holds.',
    owner: LOAD_STATE,
    reachedThrough: RENDERER,
  },

  // §11.6 — removal, its confirmation, and the failure sentence.
  { section: '11.6', key: 'settings.snapshot.remove', text: 'Remove this snapshot', owner: SETTINGS },
  {
    section: '11.6',
    key: 'settings.snapshot.remove.confirm',
    text: 'AYQ Analyses will delete its copy of this snapshot. If you no longer have the original file, this snapshot cannot be loaded again.',
    owner: SETTINGS,
  },
  {
    section: '11.6',
    key: 'snapshot.remove.failed',
    text: 'This snapshot could not be removed. AYQ Analyses still holds it.',
    owner: LOAD_STATE,
    reachedThrough: RENDERER,
  },

  // r006 §16 — Fixed costs › Expected now, every sentence word for word, each
  // referenced by the view that draws it (A2 P2).
  { section: '16.3', key: 'fixedCosts.title', text: "Fixed costs", owner: FIXED_COSTS, reachedThrough: RENDERER },
  { section: '16.3', key: 'fixedCosts.asOf', text: "As of {date}", owner: FIXED_COSTS, reachedThrough: RENDERER },
  { section: '16.3', key: 'fixedCosts.asOf.explainer', text: "Every status on this page is judged as of this date. It is the date AYQ used when it made this snapshot. It does not change when you open the app later. For newer statuses, export a new snapshot from AYQ.", owner: FIXED_COSTS, reachedThrough: RENDERER },
  { section: '16.4', key: 'fixedCosts.summary', text: "Missing {missing} · Not imported yet {notImported} · Can't tell {cantTell} · Pending {pending} · Arrived {arrived}", owner: FIXED_COSTS, reachedThrough: RENDERER },
  { section: '16.1', key: 'fixedCosts.reading.missing', text: "Missing", owner: FIXED_COSTS, reachedThrough: RENDERER },
  { section: '16.1', key: 'fixedCosts.reading.notImported', text: "Not imported yet", owner: FIXED_COSTS, reachedThrough: RENDERER },
  { section: '16.1', key: 'fixedCosts.reading.cantTell', text: "Can't tell", owner: FIXED_COSTS, reachedThrough: RENDERER },
  { section: '16.1', key: 'fixedCosts.reading.pending', text: "Pending", owner: FIXED_COSTS, reachedThrough: RENDERER },
  { section: '16.1', key: 'fixedCosts.reading.arrived', text: "Arrived", owner: FIXED_COSTS, reachedThrough: RENDERER },
  { section: '16.5', key: 'fixedCosts.arrived.line', text: "Paid {date} · {amount} · {account}", owner: FIXED_COSTS, reachedThrough: RENDERER },
  { section: '16.5', key: 'fixedCosts.arrived.expected', text: "Expected {amount}", owner: FIXED_COSTS, reachedThrough: RENDERER },
  { section: '16.5', key: 'fixedCosts.arrived.show', text: "Show transaction", owner: FIXED_COSTS, reachedThrough: RENDERER },
  { section: '16.5', key: 'fixedCosts.pending.future', text: "Expected {date}", owner: FIXED_COSTS, reachedThrough: RENDERER },
  { section: '16.5', key: 'fixedCosts.pending.today', text: "Due today", owner: FIXED_COSTS, reachedThrough: RENDERER },
  { section: '16.5', key: 'fixedCosts.pending.openWindow', text: "No matched payment yet · automatic matching date window runs through {date}", owner: FIXED_COSTS, reachedThrough: RENDERER },
  { section: '16.5', key: 'fixedCosts.missing.line', text: "No matched payment in {account}. The automatic matching date window ended {date}, and imported statements cover that whole period.", owner: FIXED_COSTS, reachedThrough: RENDERER },
  { section: '16.5', key: 'fixedCosts.missing.secondary', text: "A payment with a different amount, or one paid late or another way, is not matched automatically. You can match it by hand in AYQ.", owner: FIXED_COSTS, reachedThrough: RENDERER },
  { section: '16.5', key: 'fixedCosts.notImported.dataEnds', text: "{account} data runs to {lastStatementDate}. Import statements through {date} to know.", owner: FIXED_COSTS, reachedThrough: RENDERER },
  { section: '16.5', key: 'fixedCosts.notImported.gap', text: "{account} has data through {lastStatementDate}, but this payment's matching period is not fully covered by imported statements.", owner: FIXED_COSTS, reachedThrough: RENDERER },
  { section: '16.5', key: 'fixedCosts.notImported.gap.secondary', text: "Import the missing statements for this period to know.", owner: FIXED_COSTS, reachedThrough: RENDERER },
  { section: '16.5', key: 'fixedCosts.cantTell.line', text: "This snapshot does not say which account this payment is expected on.", owner: FIXED_COSTS, reachedThrough: RENDERER },
  { section: '16.5', key: 'fixedCosts.cantTell.secondary', text: "In AYQ, check that the expected payment has an account and that the account is included in the export.", owner: FIXED_COSTS, reachedThrough: RENDERER },
  { section: '16.8', key: 'fixedCosts.unavailable.olderSnapshot', text: "This snapshot was made by an older version of AYQ. It does not contain what Fixed costs needs. Export a new snapshot from AYQ.", owner: FIXED_COSTS, reachedThrough: RENDERER },
  { section: '16.9', key: 'fixedCosts.empty', text: "This snapshot has no confirmed expected payments. Expected payments appear here after you confirm them in AYQ. Suggestions are not counted.", owner: FIXED_COSTS, reachedThrough: RENDERER },
  { section: '16.10', key: 'fixedCosts.notShown.income', text: "Expected income is not shown here.", owner: FIXED_COSTS, reachedThrough: RENDERER },
];

function formsOf(entry: unknown): Record<string, string> | string {
  if (typeof entry === 'string') return entry;
  const value = entry as { one?: string; other?: string; forms?: Record<string, string> };
  if (value.forms !== undefined) return value.forms;
  return { one: value.one!, other: value.other! };
}

test('r003 — every normative sentence is in the catalogue character for character', () => {
  for (const sentence of NORMATIVE) {
    assert.ok(hasString(sentence.key), `§${sentence.section}: ${sentence.key} is not in the catalogue`);
    assert.deepEqual(formsOf(entries[sentence.key]), sentence.text, `§${sentence.section}: ${sentence.key} differs from r003`);
  }
  // The suite covers every sentence r003 §§3, 6, 7, 8.1, 9 and 11 enumerate:
  // a count, so a sentence dropped from this table is noticed.
  // r006 §16 adds the 25 Fixed costs sentences to the 62 of §§3–11.
  assert.equal(NORMATIVE.length, 87);
});

test('r003 — every normative sentence is referenced from the module that owns it, and that module reaches the screen', () => {
  const imports = (component: string, module: string): boolean => {
    const stem = module.replace(/\.tsx?$/, '').replace(/^ui\//, '');
    return new RegExp(`from '\\.{1,2}/(?:ui/)?${stem}\\.js'`).test(source(component));
  };
  for (const sentence of NORMATIVE) {
    const owner = source(sentence.owner);
    assert.ok(owner.includes(`'${sentence.key}'`), `§${sentence.section}: ${sentence.key} is not referenced by ${sentence.owner}`);
    if (sentence.reachedThrough !== undefined) {
      assert.ok(
        imports(sentence.reachedThrough, sentence.owner),
        `§${sentence.section}: ${sentence.reachedThrough} does not import ${sentence.owner}, so ${sentence.key} cannot reach the screen`,
      );
    }
  }
  // The mapping modules are used, not only imported.
  assert.match(source(RENDERER), /placeholderKey\(destination\)/);
  assert.match(source(RENDERER), /t\(notice\.key\)/);
  assert.match(source(DETAIL), /reversalEvidence\(/);
});

test('r003 §10.3 / §6.6 — the unknown-start sentences are selected by the number of accounts named', () => {
  const result = source(RESULT);
  for (const key of ['explore.coverage.unknownStart', 'explore.empty.unknownStart', 'explore.comparison.reason.unknownStart']) {
    const call = result.slice(result.indexOf(`'${key}'`), result.indexOf('})', result.indexOf(`'${key}'`)));
    assert.match(call, /\bn: [\w.]+\.length/, `${key} is not selected by a count of accounts`);
  }
  assert.equal(translate('explore.coverage.unknownStart', { accounts: 'A', n: 1 }).includes('reaches,'), true);
  assert.equal(translate('explore.coverage.unknownStart', { accounts: 'A and B', n: 2 }).includes('reach,'), true);
});

// ---- (2) the absences decided on ----------------------------------------------

test('02_ARCHITECTURE r007 §7.16 / r003 §15 — nothing accompanies a second launch', () => {
  const main = source('main.ts');
  assert.ok(!/showMessageBox|showErrorBox|Notification|already running|second instance/i.test(main), 'the main process says nothing on a second launch');
  // Nothing in the catalogue is about a second launch or another instance.
  for (const [key, value] of Object.entries(entries)) {
    const text = JSON.stringify(value);
    assert.ok(!/already running|another instance|second (launch|instance)|already open/i.test(text), `${key} carries a second-launch message`);
    assert.ok(!/instance|launch/i.test(key), `${key} names a second-launch message`);
  }
});

test('r003 §3 — the status bar shows no path and no identifier of any kind', () => {
  const renderer = source(RENDERER);
  const bar = renderer.slice(renderer.indexOf('<footer className="status-bar">'), renderer.indexOf('</footer>'));
  const keys = [...bar.matchAll(/t\('([\w.]+)'/g)].map(match => match[1]);
  assert.deepEqual(keys, ['status.snapshot', 'status.loadAnother']);
  assert.ok(!/fileName|identity|snapshotId|budgetKey|accountKey|producer|commit|path/i.test(bar), 'the status bar names no file, path or identifier');
  assert.equal(translate('status.snapshot', { datetime: 'x' }), 'Snapshot taken x');
});

test('r003 §11.3 — Settings identifies the snapshot by name, time and counts only', () => {
  const settings = source(SETTINGS);
  const facts = [...settings.matchAll(/active\.(?:snapshot|identity)\.[\w.]+/g)].map(match => match[0]);
  assert.deepEqual(
    [...new Set(facts)].sort(),
    ['active.identity.fileName', 'active.snapshot.accounts.length', 'active.snapshot.meta.generatedAt', 'active.snapshot.transactions.length'],
  );
  assert.ok(!/\b(snapshotId|budgetKey|accountKey|producerCommit|filePath)\b/.test(settings), 'Settings shows no identifier');
  assert.ok(!/\bpath\b/i.test(settings), 'Settings shows no path');
});

test('r003 §8.1 — no internal identifier, state name, reason code or registry token is user-facing text', () => {
  const identifiers = ['transactionKey', 'counterpartyKey', 'accountKey', 'ruleKey', 'snapshotId', 'budgetKey'];
  // "limited" is r003's own word in the coverage button and is not a token here.
  const states = ['insufficient', 'unsupported', 'unknownStart', 'UNKNOWN_START', 'candidateRefused', 'activeRefused'];
  const reasons = ['contractMajor', 'malformed', 'invariant', 'major_too_new', 'iban_leak', 'forbidden_key'];
  const registry = ['not_applicable', 'not_identified', 'learned_rule', 'credit_transfer', 'direct_debit', 'card_payment', 'bank_fee', 'cash_withdrawal'];
  for (const [key, value] of Object.entries(entries)) {
    const texts = typeof value === 'string' ? [value] : Object.values(formsOf(value));
    for (const text of texts) {
      const prose = text.replace(/\{\w+\}/g, '');
      for (const token of [...identifiers, ...states, ...reasons, ...registry]) {
        assert.ok(!prose.includes(token), `${key} renders the token ${token}`);
      }
      // No snake_case or camelCase word survives into prose.
      assert.doesNotMatch(prose, /\b[a-z]+_[a-z]+\b/, `${key} renders a snake_case token`);
      assert.doesNotMatch(prose, /\b[a-z]+[A-Z][A-Za-z]*\b/, `${key} renders a camelCase token`);
    }
  }
  // A reason code reaches the screen only through the catalogue mapping.
  const renderer = source(RENDERER);
  assert.match(renderer, /INVALID_REASON_KEYS\[reason\] \?\? 'snapshot\.invalid\.reason\.unknown'/);
  // A reason is passed to a component or a mapping, never placed in JSX text.
  assert.ok(!/>\s*\{(?:load\.|notice\.)?reason\}\s*</.test(renderer), 'a raw reason is never rendered as text');
});

// ---- (3) the contrast rules of r003 §4, as rules --------------------------------

/** A translucent overlay composited over an opaque ground, in sRGB. */
function composite(ground: string, overlay: string): string {
  const match = /^rgba\((\d+), (\d+), (\d+), ([\d.]+)\)$/.exec(overlay);
  assert.ok(match, `overlay ${overlay}`);
  const alpha = Number(match![4]);
  const value = Number.parseInt(ground.slice(1), 16);
  const channels = [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff].map(c => Math.round(c + (255 - c) * alpha));
  return `#${channels.map(c => c.toString(16).padStart(2, '0')).join('')}`;
}

type Rule = {
  element: string;
  foreground: string;
  /** Every surface the element can be drawn on, by state, after every overlay and wash. */
  surfaces: Record<string, string>;
  gate: number;
};

const railHover = composite(DARK.ground, RAIL_OVERLAY.hover);
const railActive = composite(DARK.ground, RAIL_OVERLAY.active);
const fluent = analysesTheme as unknown as Record<string, string>;

const RULES: Rule[] = [
  // §4 — small, load-bearing current-location text: at least 5:1. Current
  // beats unavailable, and the active wash beats the hover wash, so every
  // current state composites to the active wash (§3.2).
  {
    element: 'current rail label and icon',
    foreground: RAIL_CURRENT,
    surfaces: {
      current: railActive,
      'current + hover': railActive,
      'current + focused': railActive,
      'current + unavailable': railActive,
      'current + unavailable + hover': railActive,
    },
    gate: 5,
  },
  // §3.2 / §4 — unavailable non-current labels and icons: at least 4.5:1.
  {
    element: 'unavailable non-current rail label and icon',
    foreground: DARK.ink,
    surfaces: { rest: DARK.ground, hover: railHover, focused: DARK.ground, 'focused + hover': railHover },
    gate: 4.5,
  },
  {
    element: 'available non-current rail label and icon',
    foreground: DARK.ink,
    surfaces: { rest: DARK.ground, hover: railHover, focused: DARK.ground },
    gate: 4.5,
  },
  // §4 — essential non-text geometry: at least 3:1. The placeholder outline
  // is the carrier of unavailability (§3.2).
  {
    element: 'placeholder outline (unavailable destination)',
    foreground: DARK.inkMuted,
    surfaces: { rest: DARK.ground, hover: railHover, current: railActive },
    gate: 3,
  },
  // Accent text on the light surfaces it can sit on.
  {
    element: 'accent text',
    foreground: ACCENT.onLight,
    surfaces: { pane: SURFACE.pane, ground: SURFACE.ground, 'selected row': SURFACE.selection, 'hovered row': SURFACE.rowHover },
    gate: 4.5,
  },
  // The primary button's label, in every state Fluent gives the button.
  {
    element: 'primary button label',
    foreground: ACCENT.onDark,
    surfaces: { rest: fluent.colorBrandBackground, hover: fluent.colorBrandBackgroundHover, pressed: fluent.colorBrandBackgroundPressed },
    gate: 4.5,
  },
  // The attention tone: the coverage sentences on the ground, and the
  // "· limited" / "· start unknown" marker inside the outline coverage button
  // in the button's own rest, hover and pressed surfaces.
  {
    element: 'attention text (coverage sentences, coverage-button marker)',
    foreground: STATE.attention,
    surfaces: {
      ground: SURFACE.ground,
      pane: SURFACE.pane,
      'outline button rest': fluent.colorNeutralBackground1,
      'outline button hover': fluent.colorNeutralBackground1Hover,
      'outline button pressed': fluent.colorNeutralBackground1Pressed,
      'outline button selected': fluent.colorNeutralBackground1Selected,
    },
    gate: 4.5,
  },
  // r006 §4 / §16.2 (C1): the attention tone on the names of Missing, Not
  // imported yet and Can't tell — the summary line, the group headings and the
  // row status names. In the installed window all three sit on the Fluent
  // provider's white surface (measured, OUTPUT 038); the body ground beneath
  // it is measured too, the lower of the two governing. The rows are plain
  // list items with no hover, pressed or selected surface, and the tone is
  // never inside a button (the as-of line, Show transaction and the row's
  // coverage trigger carry no state colour).
  {
    element: 'attention text (Fixed costs summary names, group headings, row status names)',
    foreground: STATE.attention,
    surfaces: {
      'summary line': SURFACE.pane,
      'group heading': SURFACE.pane,
      'row status name': SURFACE.pane,
      'body ground beneath': SURFACE.ground,
    },
    gate: 4.5,
  },
  // The error tone: the refused title on the ground, the refused line in
  // Settings on the ground, and the refused title inside a dialog surface.
  {
    element: 'error text (refused title, Settings refused line, dialog title)',
    foreground: STATE.error,
    surfaces: { ground: SURFACE.ground, pane: SURFACE.pane, 'dialog surface': fluent.colorNeutralBackground1 },
    gate: 4.5,
  },
  // Accent geometry: the selected row's bar, the current tile's bar (reinforcement, §3.2), the focus ring.
  {
    element: 'accent geometry (selected-row bar, focus ring)',
    foreground: ACCENT.fill,
    surfaces: { pane: SURFACE.pane, ground: SURFACE.ground, 'selected row': SURFACE.selection, 'beside the rail': DARK.ground },
    gate: 3,
  },
  // Ordinary and secondary text, for completeness of the light surfaces.
  { element: 'body text', foreground: SURFACE.ink, surfaces: { pane: SURFACE.pane, ground: SURFACE.ground }, gate: 4.5 },
  { element: 'secondary text', foreground: SURFACE.inkSecondary, surfaces: { pane: SURFACE.pane, ground: SURFACE.ground }, gate: 4.5 },
];

test('r003 §4 — every accent- or state-coloured text or icon clears its threshold on every surface it is drawn on, the lowest governing', () => {
  for (const rule of RULES) {
    const measured = Object.entries(rule.surfaces).map(([state, surface]) => ({
      state,
      surface,
      ratio: contrastRatio(rule.foreground, surface),
    }));
    const lowest = measured.reduce((a, b) => (a.ratio <= b.ratio ? a : b));
    assert.ok(
      lowest.ratio >= rule.gate,
      `${rule.element}: lowest state "${lowest.state}" measures ${lowest.ratio.toFixed(2)}:1 on ${lowest.surface}, gate ${rule.gate}:1`,
    );
  }
});

// r004 §4.1: the attention tone is #925500 because the marker inside the
// coverage button sits on Fluent's pressed surface; the rule above measures it
// there and everywhere else the role is drawn, the lowest governing. The
// token's value is pinned so that a drift back is noticed.
test('r004 §4 — the attention tone is the accepted value and clears 4.5:1 on every surface it is drawn on, the pressed button included', () => {
  assert.equal(STATE.attention, '#925500');
  const rule = RULES.find(entry => entry.foreground === STATE.attention)!;
  const measured = Object.entries(rule.surfaces).map(([state, surface]) => [state, contrastRatio(STATE.attention, surface)] as const);
  for (const [state, ratio] of measured) assert.ok(ratio >= 4.5, `attention on ${state}: ${ratio.toFixed(2)}:1`);
  // The computed figures r004 §4.1 records, to two decimals.
  assert.equal(contrastRatio(STATE.attention, '#ffffff').toFixed(2), '5.96');
  assert.equal(contrastRatio(STATE.attention, fluent.colorNeutralBackground1Hover).toFixed(2), '5.47');
  assert.equal(contrastRatio(STATE.attention, fluent.colorNeutralBackground1Pressed).toFixed(2), '4.52');
});

test('r003 §4 — the rules above name every colour role the interface draws text or icons in', () => {
  // Each foreground the token module exports for text or icons appears in
  // at least one rule, so a new role cannot arrive unmeasured.
  const measured = new Set(RULES.map(rule => rule.foreground));
  for (const [name, value] of Object.entries({
    'ACCENT.onLight': ACCENT.onLight,
    'ACCENT.onDark': ACCENT.onDark,
    'ACCENT.fill': ACCENT.fill,
    RAIL_CURRENT,
    'DARK.ink': DARK.ink,
    'DARK.inkMuted': DARK.inkMuted,
    'STATE.attention': STATE.attention,
    'STATE.error': STATE.error,
    'SURFACE.ink': SURFACE.ink,
    'SURFACE.inkSecondary': SURFACE.inkSecondary,
  })) {
    assert.ok(measured.has(value), `${name} is drawn but no rule measures it`);
  }
  // And the stylesheet draws no text or icon in the muted token any more (§3.2).
  const css = readFileSync(join(SOURCE, 'styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/color:\s*var\(--dark-ink-muted\)/.test(css), 'the muted token colours no text');
});

// ---- what this suite cannot honestly enforce ----------------------------------
//
// - "Rendered" reachability: the suite has no DOM. It proves a key is
//   referenced by the module that owns it and that the module reaches the
//   renderer; the installed-application evidence proves the sentence on the
//   screen.
// - Rendered pixels: contrast is measured from the token values and the
//   composited surfaces the stylesheet and the Fluent theme define, not from
//   sampled pixels of a running window.
// - Chart labels and tooltips: outside r003 (§13) and drawn by ECharts; not
//   measured here.
