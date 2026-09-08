#!/usr/bin/env node
// The command-line tool around the intermediate record.
//
//   node src/ayq-cli.ts verify  <path…>   parse + measure + audit + criteria
//   node src/ayq-cli.ts measure <path…>   structural counts, numbers only
//   node src/ayq-cli.ts audit   <path…>   what in the XML the record misses
//   node src/ayq-cli.ts parse   <file>    one file as JSON, on stdout
//   node src/ayq-cli.ts trail   <file>    the evidence chain, record by record
//
// A path may be a directory (walked recursively), a single XML file, or a ZIP
// archive — the archive is read in memory and nothing is extracted to disk.
//
// `verify`, `measure` and `audit` print no name, amount, IBAN, reference or
// file name — only counts and XML element names. Their report is safe to
// share. `parse` and `trail` print content and stay on their own machine.
//
// Flags for verify:
//   --out <file>          write the text report
//   --json <file>         write the same as JSON, aggregate values only
//   --expect-files=N      default 212  (as measured in r001)
//   --expect-entries=N    default 567
//   --expect-txdtls=N     default 350

import { writeFile } from 'node:fs/promises';

import { ayqParseCamt } from './ayq-camt053.ts';
import { ayqAuditCoverage, type AyqCoverageReport } from './ayq-coverage.ts';
import {
  ayqLoadTargets,
  type AyqFailedFile,
  type AyqLoadedFile,
} from './ayq-files.ts';
import { ayqMeasure, type AyqMeasurement } from './ayq-measure.ts';
import { ayqToLegacyTransaction } from './ayq-legacy.ts';
import { ayqResolveCounterparty } from './counterparty/ayq-resolve.ts';
import type { AyqBankEntry } from './ayq-types.ts';
import {
  AYQ_R001_EXPECTATIONS,
  ayqEvaluateSpike,
  type AyqExpectations,
  type AyqSpikeVerdict,
} from './ayq-verify.ts';

type Output = { line: (text?: string) => void; text: () => string };

function createOutput(): Output {
  const buffer: string[] = [];
  return {
    line: (text = '') => {
      buffer.push(text);
      process.stdout.write(`${text}\n`);
    },
    text: () => `${buffer.join('\n')}\n`,
  };
}

function heading(out: Output, text: string): void {
  out.line();
  out.line(text);
  out.line('-'.repeat([...text].length));
}

function table(out: Output, rows: Record<string, number | string>): void {
  const keys = Object.keys(rows);
  const width = Math.max(0, ...keys.map(key => [...key].length));
  for (const key of keys) {
    const padding = ' '.repeat(width - [...key].length);
    out.line(`${key}${padding}  ${String(rows[key]).padStart(8)}`);
  }
}

type Loaded = {
  found: number;
  parsed: AyqLoadedFile[];
  failed: AyqFailedFile[];
  entries: AyqBankEntry[];
  encodings: Record<string, number>;
};

/** Reads and parses everything, without stopping at the first bad file. */
async function load(targets: string[]): Promise<Loaded> {
  const files = await ayqLoadTargets(targets);
  const parsed: AyqLoadedFile[] = [];
  const failed: AyqFailedFile[] = [];
  const entries: AyqBankEntry[] = [];
  const encodings: Record<string, number> = {};

  for (const [index, file] of files.entries()) {
    const encoding = file.declaredEncoding ?? 'not declared';
    encodings[encoding] = (encodings[encoding] ?? 0) + 1;
    try {
      entries.push(...(await ayqParseCamt(file.content, { file: file.name })));
      parsed.push(file);
    } catch (error) {
      failed.push({ index: index + 1, reason: String(error) });
    }
  }

  return { found: files.length, parsed, failed, entries, encodings };
}

function reportMeasurement(
  out: Output,
  measurement: AyqMeasurement,
  loaded: Loaded,
): void {
  heading(out, 'Scope');
  table(out, {
    'files found': loaded.found,
    'read without error': loaded.parsed.length,
    'files with an error': loaded.failed.length,
    statements: measurement.statements,
    'entries (Ntry)': measurement.entries,
    '  with TxDtls': measurement.withTxDtls,
    '  without TxDtls': measurement.withoutTxDtls,
    '  batched (>1 TxDtls)': measurement.batched,
    'intermediate records': measurement.records,
    '  from TxDtls': measurement.recordsWithTxDtls,
  });

  heading(out, 'Declared encoding');
  table(out, loaded.encodings);

  heading(out, 'Presence of the fields the original parser discards');
  table(out, measurement.present);

  heading(out, 'BkTxCd, per intermediate record');
  table(out, measurement.bankTransactionCodes);

  heading(out, 'Entries without TxDtls, by BkTxCd');
  table(out, measurement.withoutTxDtlsByCode);

  heading(out, 'Payment kind');
  table(out, measurement.paymentKinds);

  heading(out, 'Layer that resolved the counterparty');
  table(out, measurement.resolvedBy);

  heading(out, 'Normalisation');
  table(out, {
    "distinct names (Actual's five fields)": measurement.distinctLegacyPayees,
    'distinct keys (AYQ)': measurement.distinctCounterpartyKeys,
    'card and ATM records': measurement.cardRecords,
    '  of those, distinct names (Actual)':
      measurement.distinctLegacyPayeesOnCards,
    '  of those, distinct keys (AYQ)':
      measurement.distinctCounterpartyKeysOnCards,
  });

  if (loaded.failed.length > 0) {
    heading(out, 'Files with an error');
    // An ordinal, not a name: export file names carry an account number.
    for (const item of loaded.failed) {
      out.line(`file #${item.index}: ${item.reason}`);
    }
  }
}

function reportCoverage(out: Output, coverage: AyqCoverageReport): void {
  heading(out, `Losslessness audit — ${coverage.entries} entries`);
  const uncovered = Object.entries(coverage.uncovered);
  if (uncovered.length === 0) {
    out.line('No unread path. Everything the bank gives enters the record.');
  } else {
    out.line('Paths present in the XML that the record does NOT read:');
    table(out, Object.fromEntries(uncovered));
  }
}

function reportVerdict(out: Output, verdict: AyqSpikeVerdict): void {
  heading(out, 'Criteria');
  for (const item of verdict.checks) {
    const mark = item.passed ? 'OK  ' : item.advisory ? '?   ' : 'FAIL';
    out.line(
      `${mark} ${item.name}: expected ${item.expected}, found ${item.actual}` +
        (item.advisory && !item.passed
          ? '  (does not fail — calls for a decision)'
          : ''),
    );
  }
  out.line();
  out.line(verdict.passed ? 'CAMT spike: PASS' : 'CAMT spike: FAIL');
}

/**
 * The report as JSON.
 *
 * Holds aggregate values and XML element names only — no IBAN, no name, no
 * amount, no description, no reference, no file name.
 */
function buildJsonReport(
  measurement: AyqMeasurement,
  coverage: AyqCoverageReport,
  loaded: Loaded,
  verdict: AyqSpikeVerdict,
  expectations: AyqExpectations,
): unknown {
  return {
    tool: 'ayq-camt verify',
    generatedAt: new Date().toISOString(),
    verdict: verdict.passed ? 'PASS' : 'FAIL',
    expectations,
    checks: verdict.checks,
    scope: {
      filesFound: loaded.found,
      filesParsed: loaded.parsed.length,
      filesFailed: loaded.failed.length,
      statements: measurement.statements,
      entries: measurement.entries,
      records: measurement.records,
      entriesWithTxDtls: measurement.withTxDtls,
      entriesWithoutTxDtls: measurement.withoutTxDtls,
      recordsFromTxDtls: measurement.recordsWithTxDtls,
      batchedEntries: measurement.batched,
    },
    declaredEncodings: loaded.encodings,
    fieldPresence: measurement.present,
    bankTransactionCodes: measurement.bankTransactionCodes,
    withoutTxDtlsByCode: measurement.withoutTxDtlsByCode,
    paymentKinds: measurement.paymentKinds,
    resolvedBy: measurement.resolvedBy,
    normalisation: {
      distinctLegacyPayees: measurement.distinctLegacyPayees,
      distinctCounterpartyKeys: measurement.distinctCounterpartyKeys,
      cardRecords: measurement.cardRecords,
      distinctLegacyPayeesOnCards: measurement.distinctLegacyPayeesOnCards,
      distinctCounterpartyKeysOnCards:
        measurement.distinctCounterpartyKeysOnCards,
    },
    coverage: {
      entriesAudited: coverage.entries,
      uncoveredPaths: coverage.uncovered,
      coveredPaths: coverage.covered,
      declaredButUnused: coverage.unusedDeclarations,
    },
    parseErrors: loaded.failed,
  };
}

function readFlag(argv: string[], name: string): string | null {
  const inline = argv.find(item => item.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? (argv[index + 1] ?? null) : null;
}

function withoutFlags(argv: string[]): string[] {
  const paths: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item.startsWith('--')) {
      if (!item.includes('=')) index += 1; // the flag's value
      continue;
    }
    paths.push(item);
  }
  return paths;
}

async function commandMeasure(argv: string[]): Promise<void> {
  const out = createOutput();
  const loaded = await load(withoutFlags(argv));
  reportMeasurement(out, ayqMeasure(loaded.entries, loaded.found), loaded);
}

async function commandAudit(argv: string[]): Promise<void> {
  const out = createOutput();
  const loaded = await load(withoutFlags(argv));
  reportCoverage(
    out,
    await ayqAuditCoverage(loaded.parsed.map(file => file.content)),
  );
}

async function commandVerify(argv: string[]): Promise<void> {
  const out = createOutput();

  const expectedEntries = Number(
    readFlag(argv, 'expect-entries') ?? AYQ_R001_EXPECTATIONS.entries,
  );
  const expectedWithDetails = Number(
    readFlag(argv, 'expect-txdtls') ?? AYQ_R001_EXPECTATIONS.withTxDtls,
  );
  const expectations: AyqExpectations = {
    files: Number(readFlag(argv, 'expect-files') ?? AYQ_R001_EXPECTATIONS.files),
    entries: expectedEntries,
    withTxDtls: expectedWithDetails,
    withoutTxDtls: expectedEntries - expectedWithDetails,
  };

  const loaded = await load(withoutFlags(argv));
  const measurement = ayqMeasure(loaded.entries, loaded.found);
  const coverage = await ayqAuditCoverage(
    loaded.parsed.map(file => file.content),
  );
  const verdict = ayqEvaluateSpike(
    measurement,
    coverage,
    loaded.failed.length,
    expectations,
  );

  reportMeasurement(out, measurement, loaded);
  reportCoverage(out, coverage);
  reportVerdict(out, verdict);

  const textTarget = readFlag(argv, 'out');
  if (textTarget !== null) {
    await writeFile(textTarget, out.text(), 'utf8');
    process.stderr.write(`\nText report written to ${textTarget}\n`);
  }

  const jsonTarget = readFlag(argv, 'json');
  if (jsonTarget !== null) {
    const report = buildJsonReport(
      measurement,
      coverage,
      loaded,
      verdict,
      expectations,
    );
    await writeFile(jsonTarget, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    process.stderr.write(`JSON report written to ${jsonTarget}\n`);
  }

  if (!verdict.passed) process.exitCode = 1;
}

async function commandParse(argv: string[]): Promise<void> {
  const loaded = await load(withoutFlags(argv));
  process.stdout.write(`${JSON.stringify(loaded.entries, null, 2)}\n`);
}

async function commandTrail(argv: string[]): Promise<void> {
  const loaded = await load(withoutFlags(argv));
  for (const entry of loaded.entries) {
    const counterparty = ayqResolveCounterparty(entry);
    const legacy = ayqToLegacyTransaction(entry);
    process.stdout.write(
      `\n${entry.bookingDate.date ?? '?'}  ${String(entry.amount.value).padStart(10)}  ` +
        `${entry.bankTransactionCode.code ?? '-'}\n`,
    );
    process.stdout.write(`  Actual : ${legacy.payee_name ?? '-'}\n`);
    process.stdout.write(
      `  AYQ    : ${counterparty.name ?? '-'}  [${counterparty.key ?? '-'}]  ` +
        `<- ${counterparty.resolvedBy}\n`,
    );
    for (const step of counterparty.trail) {
      process.stdout.write(
        `    ${step.accepted ? '+' : '.'} ${step.layer} (${step.source}): ${step.note}\n`,
      );
    }
  }
}

const [command, ...argv] = process.argv.slice(2);

const commands: Record<string, (argv: string[]) => Promise<void>> = {
  verify: commandVerify,
  measure: commandMeasure,
  audit: commandAudit,
  parse: commandParse,
  trail: commandTrail,
};

if (!command || !(command in commands) || withoutFlags(argv).length === 0) {
  process.stderr.write(
    'usage: node src/ayq-cli.ts <verify|measure|audit|parse|trail> ' +
      '<directory, XML file or ZIP archive…>\n',
  );
  process.exit(1);
}

await commands[command](argv);
