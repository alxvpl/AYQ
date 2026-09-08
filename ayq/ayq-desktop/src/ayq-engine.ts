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
import { fileURLToPath } from 'node:url';

import api from '@actual-app/api';

import type {
  AyqAccountSummary,
  AyqEngineStatus,
  AyqRequest,
  AyqResponse,
} from '../../ayq-client/src/ayq-ipc-contract.ts';

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

  // Counted through the engine's own query language, so the number is the
  // engine's answer rather than the length of a list we happened to fetch.
  const counted = (await api.aqlQuery(
    api.q('transactions').calculate({ $count: 'id' }),
  )) as { data?: number };

  return {
    apiVersion: apiVersion(),
    engineHost: channel.name,
    budgetCreated: budget.created,
    budgetId: budget.budgetId,
    budgetName: BUDGET_NAME,
    accounts,
    transactionCount: Number(counted.data ?? 0),
    answeredAt: new Date().toISOString(),
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
      if (request?.kind !== 'engine.status') {
        throw new Error(`unknown request kind: ${String(request?.kind)}`);
      }
      if (dataDir === '') {
        throw new Error('AYQ_DATA_DIR was not set by the host');
      }
      response = {
        id: request.id,
        ok: true,
        kind: 'engine.status',
        result: await status(dataDir),
      };
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
