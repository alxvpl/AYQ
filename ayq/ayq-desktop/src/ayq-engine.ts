// The AYQ engine process.
//
// The only file in the whole product that loads `@actual-app/api`. It runs in
// its own process, forked by the host, exactly as Actual's shipped desktop app
// forks its core into a `utilityProcess` and talks to it over one channel.
//
// It answers the contract `ayq-client` declares, and it answers from the real
// budget: accounts come from the engine, balances are computed by the engine's
// spreadsheet, and the transaction count comes from the engine's own query
// language. Nothing here is fabricated for the benefit of the interface.

import { mkdirSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';

import api from '@actual-app/api';

import type {
  AyqAccountSummary,
  AyqEngineStatus,
  AyqImportSummary,
  AyqRequest,
  AyqResponse,
} from '../../ayq-client/src/ayq-ipc-contract.ts';
import { ayqParseCamt } from '../../ayq-camt/src/ayq-camt053.ts';
import { ayqLoadTargets } from '../../ayq-camt/src/ayq-files.ts';
import type { AyqBankEntry } from '../../ayq-camt/src/ayq-types.ts';
import {
  ayqPrepare,
  ayqWithAccount,
} from '../../ayq-actual-bridge/src/ayq-prepare.ts';

const BUDGET_NAME = 'AYQ';

/**
 * The transport, chosen by what the parent gave us.
 *
 * Electron's `utilityProcess` hands the child a `parentPort`; `child_process`
 * hands it `process.send`. The engine works under either, so the host can pick
 * without the engine caring — which is what makes it testable outside Electron.
 */
type Transport = {
  name: string;
  send(message: unknown): void;
  onMessage(handler: (message: unknown) => void): void;
};

function transport(): Transport {
  const parentPort = (
    process as unknown as {
      parentPort?: {
        postMessage(message: unknown): void;
        on(event: 'message', handler: (event: { data: unknown }) => void): void;
      };
    }
  ).parentPort;

  if (parentPort) {
    return {
      name: 'electron utilityProcess',
      send: message => parentPort.postMessage(message),
      onMessage: handler =>
        parentPort.on('message', event => handler(event.data)),
    };
  }

  if (typeof process.send === 'function') {
    const send = process.send.bind(process);
    return {
      name: 'node child_process fork',
      send: message => send(message),
      onMessage: handler => process.on('message', handler),
    };
  }

  throw new Error('the AYQ engine was started without a parent to answer');
}

const channel = transport();

type AyqOpenBudget = { budgetId: string; created: boolean };

/** Set once the budget is open, so a second request does not reopen it. */
let opened: AyqOpenBudget | null = null;

/** The budget's id, or null when it does not exist yet. */
async function findBudgetId(): Promise<string | null> {
  const match = (await api.getBudgets()).find(
    budget => budget.name === BUDGET_NAME,
  );
  return match?.id ?? null;
}

async function openBudget(dataDir: string): Promise<AyqOpenBudget> {
  if (opened) return opened;

  // On a first launch the directory does not exist yet, and the API expects to
  // be handed one that does.
  mkdirSync(dataDir, { recursive: true });
  await api.init({ dataDir });

  const existing = await findBudgetId();
  if (existing !== null) {
    await api.loadBudget(existing);
    opened = { budgetId: existing, created: false };
    return opened;
  }

  // First launch: there is nothing to open yet. A budget with one account and
  // two entries is created so the engine has something real to compute from.
  // These are invented values, and the interface is told they were created.
  await api.runImport(BUDGET_NAME, async () => {
    const accountId = await api.createAccount(
      { name: 'AYQ demo account', offbudget: false },
      0,
    );
    await api.addTransactions(accountId, [
      { date: '2026-06-24', amount: 125000, payee_name: 'Testwerkgever B.V.' },
      { date: '2026-06-30', amount: -6190, payee_name: 'Testenergie Nederland' },
    ]);
  });

  const created = await findBudgetId();
  if (created === null) throw new Error('the engine created no budget');

  await api.loadBudget(created);
  opened = { budgetId: created, created: true };
  return opened;
}

async function status(dataDir: string): Promise<AyqEngineStatus> {
  const budget = await openBudget(dataDir);

  const accounts: AyqAccountSummary[] = [];
  for (const account of await api.getAccounts()) {
    accounts.push({
      id: account.id,
      name: account.name,
      // Computed by the engine's spreadsheet, not summed by the renderer.
      balanceCents: (await api.getAccountBalance(account.id)) ?? 0,
    });
  }

  return {
    apiVersion: apiVersion(),
    engineHost: channel.name,
    budgetCreated: budget.created,
    budgetId: budget.budgetId,
    budgetName: BUDGET_NAME,
    accounts,
    // Counted through the engine's own query language, so the number is the
    // engine's answer rather than the length of a list we happened to fetch.
    transactionCount: await transactionCount(),
    answeredAt: new Date().toISOString(),
  };
}

/** Counts transactions through the engine's own query language. */
async function transactionCount(): Promise<number> {
  const counted = (await api.aqlQuery(
    api.q('transactions').calculate({ $count: 'id' }),
  )) as { data?: number };
  return Number(counted.data ?? 0);
}

/**
 * The name the imported account gets, masked.
 *
 * An IBAN identifies a person's account, and this name travels into the
 * interface, into screenshots and into CI logs. A country code and the last
 * four are enough to tell two accounts apart and to recognise your own; the
 * rest never leaves the record. The masking is deterministic, which is what
 * makes a second import land in the same account rather than a new one.
 */
function ayqMaskAccount(entries: AyqBankEntry[]): string {
  for (const entry of entries) {
    const iban = entry.statement.accountIban;
    if (iban !== null && iban.length >= 6) {
      return `AYQ ${iban.slice(0, 2)}…${iban.slice(-4)}`;
    }
  }
  return 'AYQ imported account';
}

/** The account by that name, created if the budget has not seen it before. */
async function accountFor(name: string): Promise<string> {
  const existing = (await api.getAccounts()).find(
    account => account.name === name,
  );
  if (existing) return existing.id;
  return api.createAccount({ name, offbudget: false }, 0);
}

/**
 * Imports a CAMT.053 file or ZIP into the open budget.
 *
 * The whole pipeline, and every step of it already existed: `ayq-camt` reads
 * the file (a ZIP in memory, never extracted) and parses it into lossless
 * records, the bridge resolves the counterparty and maps each record onto an
 * Actual transaction, and `@actual-app/api` takes them. Nothing here parses
 * CAMT itself.
 *
 * Deduplication is not done here either. Every mapped transaction carries an
 * `imported_id` — the bank's AcctSvcrRef when it gave one, the record's own
 * stable key otherwise — and Actual matches on it, so importing the same
 * export twice adds nothing the second time. The count says so out loud.
 */
async function importCamt(
  dataDir: string,
  path: string,
): Promise<AyqImportSummary> {
  const budget = await openBudget(dataDir);

  const files = await ayqLoadTargets([path]);
  if (files.length === 0) {
    throw new Error('that file holds no CAMT document');
  }

  const records: AyqBankEntry[] = [];
  let failed = 0;
  for (const file of files) {
    try {
      records.push(...(await ayqParseCamt(file.content, { file: file.name })));
    } catch {
      // The reason would quote the document. The count is what travels.
      failed += 1;
    }
  }

  const { transactions, skipped } = ayqPrepare(records);
  const accountName = ayqMaskAccount(records);
  const accountId = await accountFor(accountName);

  const result = await api.importTransactions(
    accountId,
    ayqWithAccount(transactions, accountId),
  );
  const added = result.added?.length ?? 0;
  const errors = result.errors?.length ?? 0;

  return {
    file: basename(path),
    files: files.length,
    records: records.length,
    prepared: transactions.length,
    skipped,
    imported: added,
    // Everything the file held that did not become a new transaction: rows the
    // budget already had, and repeats within the file itself. Both are the
    // same thing to the person importing.
    duplicates: records.length - skipped - added,
    failed: failed + errors,
    budgetId: budget.budgetId,
    budgetName: BUDGET_NAME,
    accountId,
    accountName,
    transactionCountAfter: await transactionCount(),
  };
}

/** Read from the installed package rather than hard-coded, so it cannot drift. */
function apiVersion(): string {
  for (const candidate of [
    '../node_modules/@actual-app/api/package.json',
    '../../node_modules/@actual-app/api/package.json',
  ]) {
    try {
      const path = fileURLToPath(new URL(candidate, import.meta.url));
      const manifest = JSON.parse(readFileSync(path, 'utf8')) as {
        version?: string;
      };
      if (manifest.version) return manifest.version;
    } catch {
      // Try the next location.
    }
  }
  return 'unknown';
}

/**
 * Turns the one failure this engine has a specific cure for into a sentence
 * that names the cure.
 *
 * `@actual-app/api` carries a native SQLite binding built for the Node ABI it
 * was installed against. Loaded inside Electron's `utilityProcess` it meets a
 * different ABI, and the symptom that surfaces is an unrelated-looking null
 * dereference several layers up.
 */
function explain(message: string): string {
  const abi =
    /NODE_MODULE_VERSION|ERR_DLOPEN_FAILED|reading 'prepare'|better_sqlite3\.node/;
  if (!abi.test(message)) return message;
  return (
    `${message}\n\n` +
    'The engine could not load its native SQLite binding. It was built for ' +
    "Node's ABI, and this process is running on Electron's. Run `npm run " +
    'setup` once: it rebuilds the binding for this exact Electron and refuses ' +
    'to finish unless the result loads. `npm run start:debug-node-engine` ' +
    'sidesteps it by forking the engine on the system Node, but that is a ' +
    'development shortcut, not the shipped path.'
  );
}

const dataDir = process.env.AYQ_DATA_DIR ?? '';

channel.onMessage(message => {
  void (async () => {
    const request = message as AyqRequest;
    let response: AyqResponse;
    try {
      if (dataDir === '') {
        throw new Error('AYQ_DATA_DIR was not set by the host');
      }
      if (request?.kind === 'engine.status') {
        response = {
          id: request.id,
          ok: true,
          kind: 'engine.status',
          result: await status(dataDir),
        };
      } else if (request?.kind === 'import.camt') {
        response = {
          id: request.id,
          ok: true,
          kind: 'import.camt',
          result: await importCamt(dataDir, request.path),
        };
      } else {
        throw new Error(`unknown request kind: ${String(request?.kind)}`);
      }
    } catch (error) {
      response = {
        id: request?.id ?? 'unknown',
        ok: false,
        kind: 'error',
        message: explain(
          error instanceof Error ? error.message : String(error),
        ),
      };
    }
    channel.send(response);
  })();
});
