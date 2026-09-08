// The AYQ Electron host.
//
// Three processes, which is the shape Actual's shipped desktop app already
// uses and the reason the base evaluation called the boundary production-proven
// rather than theoretical:
//
//   main (this file)  owns the window and relays one IPC channel
//   renderer          ayq-client, with no Node and no engine access at all
//   engine            a forked process, the only one that loads the Actual API
//
// The host never interprets a request. It correlates it, forwards it, and hands
// the answer back. That is what keeps the contract the single place where the
// two halves meet.

import { fork } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { app, BrowserWindow, ipcMain, utilityProcess } from 'electron';

import {
  AYQ_IPC_CHANNEL,
  type AyqRequest,
  type AyqResponse,
} from '../../ayq-client/src/ayq-ipc-contract.ts';

const here = dirname(fileURLToPath(import.meta.url));

/** Where the budget lives. Nothing is written outside it. */
const dataDir = process.env.AYQ_DATA_DIR ?? join(app.getPath('userData'), 'budget');

/** Requests waiting on the engine, by correlation id. */
const pending = new Map<string, (response: AyqResponse) => void>();

type EngineHandle = { send(request: AyqRequest): void; stop(): void };

/**
 * Forks the engine.
 *
 * Two hosts, one engine, chosen by AYQ_ENGINE_HOST:
 *
 *   utility (default)  Electron's own `utilityProcess`, which is what Actual's
 *                      shipped app uses. It runs on Electron's Node ABI, so
 *                      the engine's native SQLite must be built for Electron
 *                      first — `npm run rebuild:engine`, the same step Actual
 *                      has for the same reason.
 *   node               A plain Node fork of the system Node binary. The engine
 *                      then runs on the ABI its npm build already targets, so
 *                      no rebuild is needed. Same window, same preload, same
 *                      contract, same engine, same real budget.
 *
 * The engine reports which one answered, so the interface never has to be
 * taken on trust about where its numbers came from.
 */
function startEngine(): EngineHandle {
  const enginePath = join(here, 'ayq-engine.js');
  const env = { ...process.env, AYQ_DATA_DIR: dataDir };

  const deliver = (message: unknown) => {
    const response = message as AyqResponse;
    const resolve = pending.get(response?.id);
    if (resolve) {
      pending.delete(response.id);
      resolve(response);
    }
  };

  if ((process.env.AYQ_ENGINE_HOST ?? 'utility') !== 'node') {
    const child = utilityProcess.fork(enginePath, [], {
      env,
      stdio: 'inherit',
      serviceName: 'ayq-engine',
    });
    child.on('message', deliver);
    return {
      send: request => child.postMessage(request),
      stop: () => void child.kill(),
    };
  }

  // `process.execPath` is the Electron binary here, and a fork of it runs on
  // Electron's ABI too — which is the very thing this host exists to avoid.
  // So the Node binary is named explicitly.
  const child = fork(enginePath, [], {
    env,
    stdio: 'inherit',
    execPath: process.env.AYQ_NODE ?? 'node',
  });
  child.on('message', deliver);
  return {
    send: request => void child.send(request),
    stop: () => void child.kill(),
  };
}

let engine: EngineHandle | null = null;

function ask(request: AyqRequest): Promise<AyqResponse> {
  if (!engine) {
    return Promise.resolve({
      id: request.id,
      ok: false,
      kind: 'error',
      message: 'the AYQ engine is not running',
    });
  }

  return new Promise<AyqResponse>(resolve => {
    const timer = setTimeout(() => {
      if (pending.delete(request.id)) {
        resolve({
          id: request.id,
          ok: false,
          kind: 'error',
          message: 'the AYQ engine did not answer within 60s',
        });
      }
    }, 60_000);

    pending.set(request.id, response => {
      clearTimeout(timer);
      resolve(response);
    });

    engine?.send(request);
  });
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 900,
    height: 700,
    title: 'AYQ',
    backgroundColor: '#fbfbfa',
    show: false,
    webPreferences: {
      // The renderer gets the bridge and nothing else.
      preload: join(here, 'ayq-preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.once('ready-to-show', () => window.show());
  void window.loadFile(join(here, 'client', 'ayq-client.html'));
  return window;
}

/**
 * A launch that verifies itself.
 *
 * With AYQ_SMOKE=1 the host waits for the renderer to report the outcome of its
 * own request, captures the window, and exits non-zero if the slice did not
 * complete. It reads the renderer's reported state rather than assuming it.
 */
async function runSmoke(window: BrowserWindow): Promise<void> {
  const shot = process.env.AYQ_SMOKE_SCREENSHOT;
  // The acceptance test names the host it demands; anything else is a failure
  // even when the screen is otherwise perfectly happy.
  const requiredHost = process.env.AYQ_SMOKE_REQUIRE_HOST ?? '';
  const deadline = Date.now() + 180_000;

  let state = '';
  while (Date.now() < deadline) {
    state = String(
      await window.webContents.executeJavaScript(
        'document.body.dataset.ayqState || ""',
      ),
    );
    if (state !== '') break;
    await new Promise(resolve => setTimeout(resolve, 250));
  }

  const engineHost = String(
    await window.webContents.executeJavaScript(
      'document.body.dataset.ayqEngineHost || ""',
    ),
  );
  const body = String(
    await window.webContents.executeJavaScript(
      'document.getElementById("ayq-body").innerText',
    ),
  );

  if (shot) {
    const image = await window.webContents.capturePage();
    mkdirSync(dirname(shot), { recursive: true });
    const { writeFileSync } = await import('node:fs');
    writeFileSync(shot, image.toPNG());
  }

  const hostOk = requiredHost === '' || engineHost === requiredHost;

  process.stdout.write(`\n[ayq-smoke] renderer state: ${state || 'timeout'}\n`);
  process.stdout.write(`[ayq-smoke] engine host: ${engineHost || 'unreported'}\n`);
  if (requiredHost !== '') {
    process.stdout.write(
      `[ayq-smoke] required host: ${requiredHost} -> ${hostOk ? 'MATCH' : 'MISMATCH'}\n`,
    );
  }
  process.stdout.write(`[ayq-smoke] rendered:\n${body}\n`);

  engine?.stop();
  app.exit(state === 'ready' && hostOk ? 0 : 1);
}

void app.whenReady().then(() => {
  mkdirSync(dataDir, { recursive: true });
  engine = startEngine();

  ipcMain.handle(AYQ_IPC_CHANNEL, (_event, request: AyqRequest) => ask(request));

  const window = createWindow();
  process.stdout.write(`[ayq] window created, budget data dir: ${dataDir}\n`);

  if (process.env.AYQ_SMOKE === '1') {
    window.webContents.once('did-finish-load', () => void runSmoke(window));
  }
});

app.on('window-all-closed', () => {
  engine?.stop();
  app.quit();
});
