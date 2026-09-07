#!/usr/bin/env node
// Инструмент за командния ред около междинния запис.
//
//   node src/ayq-cli.ts measure <път…>   структурни броения, само числа
//   node src/ayq-cli.ts audit   <път…>   какво в XML-а записът не чете
//   node src/ayq-cli.ts parse   <файл>   един файл като JSON, на изхода
//   node src/ayq-cli.ts trail   <файл>   веригата от доказателства, запис по запис
//
// „measure“ и „audit“ не печатат нито име, нито сума, нито IBAN. „parse“ и
// „trail“ печатат съдържание и се пускат само върху собствената машина.

import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';

import { ayqParseCamt } from './ayq-camt053.ts';
import { ayqAuditCoverage } from './ayq-coverage.ts';
import { ayqMeasure } from './ayq-measure.ts';
import { ayqToLegacyTransaction } from './ayq-legacy.ts';
import { ayqResolveCounterparty } from './counterparty/ayq-resolve.ts';

async function collectFiles(targets: string[]): Promise<string[]> {
  const files: string[] = [];
  for (const target of targets) {
    const info = await stat(target);
    if (info.isDirectory()) {
      for (const name of (await readdir(target)).sort()) {
        if (extname(name).toLowerCase() === '.xml') files.push(join(target, name));
      }
    } else {
      files.push(target);
    }
  }
  return files;
}

function heading(text: string): void {
  process.stdout.write(`\n${text}\n${'-'.repeat(text.length)}\n`);
}

function table(rows: Record<string, number>): void {
  const width = Math.max(0, ...Object.keys(rows).map(key => key.length));
  for (const [key, value] of Object.entries(rows)) {
    process.stdout.write(`${key.padEnd(width)}  ${String(value).padStart(6)}\n`);
  }
}

async function commandMeasure(targets: string[]): Promise<void> {
  const files = await collectFiles(targets);
  const entries = [];
  let failed = 0;
  for (const file of files) {
    try {
      const content = await readFile(file, 'utf8');
      entries.push(...(await ayqParseCamt(content, { file: basename(file) })));
    } catch (error) {
      failed += 1;
      process.stderr.write(`не се разпарсва: ${basename(file)} — ${String(error)}\n`);
    }
  }

  const report = ayqMeasure(entries, files.length);

  heading('Обхват');
  table({
    файлове: report.files,
    'файлове с грешка': failed,
    извлечения: report.statements,
    'записи (Ntry)': report.entries,
    'междинни записа': report.records,
    'с TxDtls': report.withTxDtls,
    'без TxDtls': report.withoutTxDtls,
    'batch (>1 TxDtls)': report.batched,
  });

  heading('Наличност на полетата, които оригиналният парсър изхвърля');
  table(report.present);

  heading('BkTxCd');
  table(report.bankTransactionCodes);

  heading('Записи без TxDtls, по BkTxCd');
  table(report.withoutTxDtlsByCode);

  heading('Вид плащане');
  table(report.paymentKinds);

  heading('Слой, взел решението за контрагента');
  table(report.resolvedBy);

  heading('Нормализация');
  table({
    'различни имена (петте полета на Actual)': report.distinctLegacyPayees,
    'различни ключа (AYQ)': report.distinctCounterpartyKeys,
    'картови и банкоматни записи': report.cardRecords,
    '  от тях различни имена (Actual)': report.distinctLegacyPayeesOnCards,
    '  от тях различни ключа (AYQ)': report.distinctCounterpartyKeysOnCards,
  });
}

async function commandAudit(targets: string[]): Promise<void> {
  const files = await collectFiles(targets);
  const contents = await Promise.all(files.map(file => readFile(file, 'utf8')));
  const report = await ayqAuditCoverage(contents);

  heading(`Одит на беззагубността — ${files.length} файла, ${report.entries} записа`);
  const uncovered = Object.entries(report.uncovered);
  if (uncovered.length === 0) {
    process.stdout.write(
      'Няма непрочетен път. Всичко, което банката дава, влиза в записа.\n',
    );
  } else {
    process.stdout.write('Пътища в XML-а, които записът НЕ чете:\n');
    table(Object.fromEntries(uncovered));
  }

  if (report.unusedDeclarations.length > 0) {
    heading('Декларирани пътища без попадение в тези данни');
    process.stdout.write(`${report.unusedDeclarations.join('\n')}\n`);
  }
}

async function commandParse(targets: string[]): Promise<void> {
  const files = await collectFiles(targets);
  const entries = [];
  for (const file of files) {
    const content = await readFile(file, 'utf8');
    entries.push(...(await ayqParseCamt(content, { file: basename(file) })));
  }
  process.stdout.write(`${JSON.stringify(entries, null, 2)}\n`);
}

async function commandTrail(targets: string[]): Promise<void> {
  const files = await collectFiles(targets);
  for (const file of files) {
    const content = await readFile(file, 'utf8');
    for (const entry of await ayqParseCamt(content, { file: basename(file) })) {
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
}

const [command, ...targets] = process.argv.slice(2);

const commands: Record<string, (targets: string[]) => Promise<void>> = {
  measure: commandMeasure,
  audit: commandAudit,
  parse: commandParse,
  trail: commandTrail,
};

if (!command || !(command in commands) || targets.length === 0) {
  process.stderr.write(
    'употреба: node src/ayq-cli.ts <measure|audit|parse|trail> <файл или папка…>\n',
  );
  process.exit(1);
}

await commands[command](targets);
