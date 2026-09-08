#!/usr/bin/env node
// Runs the whole chain end to end and serves the screen.
//
//   node src/ayq-demo.ts                          the invented fixtures
//   node src/ayq-demo.ts ~/Downloads/export.zip   your own export, locally
//
// Parses CAMT into intermediate records, resolves the counterparty, imports
// into a fresh Actual budget, then opens the engine and serves one screen on
// 127.0.0.1. Nothing leaves the machine and nothing is written outside the
// data directory.
//
//   --data-dir <path>   where the budget goes (default: a temporary directory)
//   --port <n>          fixed port (default: any free port)
//   --account <name>    account name in the ledger

import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ayqParseCamt } from '../../ayq-camt/src/ayq-camt053.ts';
import { ayqLoadTargets } from '../../ayq-camt/src/ayq-files.ts';
import { ayqImportToActual } from '../../ayq-actual-bridge/src/ayq-import.ts';
import { ayqOpenEngine } from './ayq-engine.ts';
import { ayqServeScreen } from './ayq-host.ts';

function flag(argv: string[], name: string): string | null {
  const inline = argv.find(item => item.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? (argv[index + 1] ?? null) : null;
}

function paths(argv: string[]): string[] {
  const out: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item.startsWith('--')) {
      if (!item.includes('=')) index += 1;
      continue;
    }
    out.push(item);
  }
  return out;
}

const argv = process.argv.slice(2);
const targets = paths(argv);
const sources =
  targets.length > 0
    ? targets
    : [
        fileURLToPath(
          new URL('../../ayq-camt/test/fixtures/', import.meta.url),
        ),
      ];

const dataDir =
  flag(argv, 'data-dir') ?? (await mkdtemp(join(tmpdir(), 'ayq-screen-')));
const accountName = flag(argv, 'account') ?? 'ABN AMRO private';
const port = Number(flag(argv, 'port') ?? 0);

const files = await ayqLoadTargets(sources);
const entries = [];
for (const file of files) {
  entries.push(...(await ayqParseCamt(file.content, { file: file.name })));
}

process.stderr.write(
  `${files.length} file(s), ${entries.length} intermediate records\n`,
);

const imported = await ayqImportToActual({
  dataDir,
  budgetName: 'AYQ screen',
  accountName,
  entries,
});

process.stderr.write(
  `imported ${imported.added}, skipped ${imported.skipped}, errors ${imported.errors.length}\n`,
);

const engine = await ayqOpenEngine({
  dataDir,
  budgetId: imported.budgetId,
  accountId: imported.accountId,
  accountName,
  provenanceFile: imported.provenanceFile ?? '',
});

const host = await ayqServeScreen(engine, port);
process.stderr.write(`\nAYQ screen: ${host.url}\n(ctrl-c to stop)\n`);

const stop = async () => {
  await host.close();
  await engine.close();
  process.exit(0);
};
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());
