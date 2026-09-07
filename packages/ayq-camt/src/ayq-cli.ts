#!/usr/bin/env node
// Инструмент за командния ред около междинния запис.
//
//   node src/ayq-cli.ts verify  <път…>   parse + measure + audit + критериите
//   node src/ayq-cli.ts measure <път…>   структурни броения, само числа
//   node src/ayq-cli.ts audit   <път…>   какво в XML-а записът не чете
//   node src/ayq-cli.ts parse   <файл>   един файл като JSON, на изхода
//   node src/ayq-cli.ts trail   <файл>   веригата от доказателства, запис по запис
//
// Пътят може да е папка (обхожда се рекурсивно), единичен XML файл или ZIP
// архив — архивът се чете в паметта и нищо не се разархивира на диска.
//
// „verify“, „measure“ и „audit“ не печатат нито име, нито сума, нито IBAN, нито
// референция, нито име на файл — само броения и имена на XML елементи. Отчетът
// им е безопасен за споделяне. „parse“ и „trail“ печатат съдържание и остават
// на своята машина.
//
// Флагове за verify:
//   --out <файл>          записва текстовия отчет
//   --json <файл>         записва същото като JSON, само агрегирани стойности
//   --expect-files=N      по подразбиране 212  (измереното в r001)
//   --expect-entries=N    по подразбиране 567
//   --expect-txdtls=N     по подразбиране 350

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

/** Чете и разпарсва всичко, без да спира на първия проблемен файл. */
async function load(targets: string[]): Promise<Loaded> {
  const files = await ayqLoadTargets(targets);
  const parsed: AyqLoadedFile[] = [];
  const failed: AyqFailedFile[] = [];
  const entries: AyqBankEntry[] = [];
  const encodings: Record<string, number> = {};

  for (const [index, file] of files.entries()) {
    const encoding = file.declaredEncoding ?? 'без декларация';
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
  heading(out, 'Обхват');
  table(out, {
    'намерени файла': loaded.found,
    'прочетени без грешка': loaded.parsed.length,
    'файлове с грешка': loaded.failed.length,
    извлечения: measurement.statements,
    'записи (Ntry)': measurement.entries,
    'междинни записа': measurement.records,
    'с TxDtls': measurement.withTxDtls,
    'без TxDtls': measurement.withoutTxDtls,
    'batch (>1 TxDtls)': measurement.batched,
  });

  heading(out, 'Обявена кодировка');
  table(out, loaded.encodings);

  heading(out, 'Наличност на полетата, които оригиналният парсър изхвърля');
  table(out, measurement.present);

  heading(out, 'BkTxCd');
  table(out, measurement.bankTransactionCodes);

  heading(out, 'Записи без TxDtls, по BkTxCd');
  table(out, measurement.withoutTxDtlsByCode);

  heading(out, 'Вид плащане');
  table(out, measurement.paymentKinds);

  heading(out, 'Слой, взел решението за контрагента');
  table(out, measurement.resolvedBy);

  heading(out, 'Нормализация');
  table(out, {
    'различни имена (петте полета на Actual)': measurement.distinctLegacyPayees,
    'различни ключа (AYQ)': measurement.distinctCounterpartyKeys,
    'картови и банкоматни записи': measurement.cardRecords,
    '  от тях различни имена (Actual)': measurement.distinctLegacyPayeesOnCards,
    '  от тях различни ключа (AYQ)': measurement.distinctCounterpartyKeysOnCards,
  });

  if (loaded.failed.length > 0) {
    heading(out, 'Файлове с грешка');
    // Пореден номер, не име: имената на експортите носят номер на сметка.
    for (const item of loaded.failed) {
      out.line(`файл №${item.index}: ${item.reason}`);
    }
  }
}

function reportCoverage(out: Output, coverage: AyqCoverageReport): void {
  heading(out, `Одит на беззагубността — ${coverage.entries} записа`);
  const uncovered = Object.entries(coverage.uncovered);
  if (uncovered.length === 0) {
    out.line('Няма непрочетен път. Всичко, което банката дава, влиза в записа.');
  } else {
    out.line('Пътища в XML-а, които записът НЕ чете — всеки иска решение:');
    table(out, Object.fromEntries(uncovered));
  }
}

function reportVerdict(out: Output, verdict: AyqSpikeVerdict): void {
  heading(out, 'Критерии');
  for (const item of verdict.checks) {
    const mark = item.passed ? 'ДА ' : item.advisory ? '?  ' : 'НЕ ';
    out.line(
      `${mark} ${item.name}: очаквано ${item.expected}, намерено ${item.actual}` +
        (item.advisory && !item.passed ? '  (не проваля — иска решение)' : ''),
    );
  }
  out.line();
  out.line(verdict.passed ? 'CAMT спайк: PASS' : 'CAMT спайк: FAIL');
}

/**
 * Отчетът като JSON.
 *
 * Съдържа само агрегирани стойности и имена на XML елементи — нито IBAN, нито
 * име, нито сума, нито описание, нито референция, нито име на файл.
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
      withTxDtls: measurement.withTxDtls,
      withoutTxDtls: measurement.withoutTxDtls,
      batched: measurement.batched,
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
      distinctCounterpartyKeysOnCards: measurement.distinctCounterpartyKeysOnCards,
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
      if (!item.includes('=')) index += 1; // стойността на флага
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
    process.stderr.write(`\nТекстовият отчет е записан в ${textTarget}\n`);
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
    process.stderr.write(`JSON отчетът е записан в ${jsonTarget}\n`);
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
        `${entry.bankTransactionCode.code ?? '—'}\n`,
    );
    process.stdout.write(`  Actual : ${legacy.payee_name ?? '—'}\n`);
    process.stdout.write(
      `  AYQ    : ${counterparty.name ?? '—'}  [${counterparty.key ?? '—'}]  ` +
        `← ${counterparty.resolvedBy}\n`,
    );
    for (const step of counterparty.trail) {
      process.stdout.write(
        `    ${step.accepted ? '✓' : '·'} ${step.layer} (${step.source}): ${step.note}\n`,
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
    'употреба: node src/ayq-cli.ts <verify|measure|audit|parse|trail> ' +
      '<папка, XML файл или ZIP архив…>\n',
  );
  process.exit(1);
}

await commands[command](argv);
