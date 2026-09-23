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
import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { release } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  screen,
  utilityProcess,
} from 'electron';

import type { AyqRect } from './ayq-window-bounds.ts';
import {
  AYQ_WINDOW_MIN_HEIGHT,
  AYQ_WINDOW_MIN_WIDTH,
  ayqOpeningBounds,
  ayqReadWindowBounds,
  ayqWriteWindowBounds,
} from './ayq-window-bounds.ts';
import {
  AYQ_IPC_CHANNEL,
  type AyqImportSummary,
  type AyqPickedFile,
  type AyqRequest,
  type AyqRequestBody,
  type AyqResponse,
  type AyqResults,
} from '../../ayq-client/src/ayq-ipc-contract.ts';
// The token module itself, so that the acceptance run compares the screen
// against the product's own declared values rather than against a second copy
// of them written into a test. It is data and arithmetic: no DOM, no engine.
import {
  AYQ_DESTINATIONS,
  AYQ_RAIL_FOOT,
  AYQ_RAIL_GROUPS,
} from '../../ayq-client/src/ayq-destinations.ts';
import {
  AYQ_GROUNDS,
  AYQ_METRIC,
  AYQ_TOKENS,
  type AyqGroundResolved,
} from '../../ayq-client/src/ayq-tokens.ts';
// What the build was compiled with, for the same reason as the token module
// above: the acceptance run compares the screen against the product's own
// declared values rather than against a second copy written into a check.
import { ayqCompiledIdentity } from './ayq-about.ts';
import { ayqBackupsDir, ayqManifestDigest } from './ayq-backup.ts';
import type { AyqBackupManifest } from './ayq-backup.ts';

const here = dirname(fileURLToPath(import.meta.url));

// Pinned before anything asks for a path. Electron derives the user data
// directory from the application's name, and that name would otherwise be the
// package name in development and the product name once packaged — two
// different directories for the same person's budget. Stating it once means an
// upgrade, and a switch between a checkout and an installed build, find the
// data that is already there.
app.setName('AYQ');

/** Where the budget lives. Nothing is written outside it. */
const dataDir =
  process.env.AYQ_DATA_DIR ?? join(app.getPath('userData'), 'budget');

/**
 * The file the automated acceptance run imports.
 *
 * A native dialog cannot be answered by CI, so in smoke mode the host answers
 * its own picker with this. It is read only when AYQ_SMOKE=1, so it is not a
 * way into a shipped app — and everything after the picker is the real path:
 * the renderer asks, the engine reads the file, the Actual API takes the rows.
 */
const smokeImport = process.env.AYQ_SMOKE_IMPORT ?? '';

/**
 * One AYQ at a time.
 *
 * The budget is an SQLite file that this application opens for writing. A
 * second AYQ over the same directory is not a second window on one budget —
 * it is two processes with their own connection, their own cache and their own
 * idea of what is in there, and the loser of that race is the person's data.
 * Electron's lock is taken before anything is opened, so the second launch
 * never reaches the engine at all: it brings the running window to the front,
 * which is what a person double-clicking the icon again actually wants.
 */
const isPrimary = app.requestSingleInstanceLock();

/** The window, kept so a second launch can raise it rather than open another. */
let mainWindow: BrowserWindow | null = null;

if (!isPrimary) {
  process.stdout.write('[ayq] AYQ is already running; raising that window\n');
  // The acceptance run has no console to read, so the outcome is left where
  // the run that launched it can find it — the same report the smoke writes.
  reportSecondInstance();
  app.exit(0);
}

/** Says, where an automated run can read it, that this launch stood aside. */
function reportSecondInstance(): void {
  const report = process.env.AYQ_SMOKE_REPORT;
  if (process.env.AYQ_SMOKE !== '1' || !report) return;
  mkdirSync(dirname(report), { recursive: true });
  writeFileSync(
    report,
    `${JSON.stringify({ passed: true, secondInstance: true, dataDir }, null, 2)}\n`,
    'utf8',
  );
}

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
/**
 * How long the host waits for an answer before calling the engine wedged.
 *
 * This is not a patience budget for slow work: it is the last resort for an
 * engine that is neither answering nor dead, and an engine that has died is
 * noticed the moment it does. It used to be sixty seconds, which is a perfectly
 * ordinary length of time for importing fifty thousand records — so the one
 * operation in this product that legitimately takes minutes was reported to the
 * owner as a failure, twice, while the import itself carried on and succeeded.
 */
const AYQ_ENGINE_PATIENCE = 15 * 60_000;

/**
 * Whether to say how long each answer took.
 *
 * Off by default. It exists because "the Register took seven seconds" is not a
 * fault anybody can act on: what is actionable is which request those seconds
 * were in.
 */
const timing = process.env.AYQ_ENGINE_TIMING === '1';

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

  /**
   * An engine that is gone answers every question at once, and says so.
   *
   * Without this, a crashed engine left every request waiting for the timeout —
   * so the window sat saying nothing for as long as that timeout was, and the
   * only way to keep the wait short was to keep the timeout short, which is why
   * an import of fifty thousand records used to be reported as a failure.
   */
  const died = (why: string) => {
    const waiting = [...pending.entries()];
    pending.clear();
    for (const [id, resolve] of waiting) {
      resolve({
        id,
        ok: false,
        kind: 'error',
        code: 'engine-stopped',
        detail: `the AYQ engine stopped (${why})`,
      });
    }
  };

  if ((process.env.AYQ_ENGINE_HOST ?? 'utility') !== 'node') {
    const child = utilityProcess.fork(enginePath, [], {
      env,
      stdio: 'inherit',
      serviceName: 'ayq-engine',
    });
    child.on('message', deliver);
    child.on('exit', code => died(`exit code ${code}`));
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
  child.on('exit', code => died(`exit code ${code ?? 'unknown'}`));
  child.on('error', error => died(error.message));
  return {
    send: request => void child.send(request),
    stop: () => void child.kill(),
  };
}

let engine: EngineHandle | null = null;

/**
 * Opens the native picker.
 *
 * This is the host's job. The renderer has no filesystem — giving it one would
 * be the first hole in the boundary — and the engine has no window. So the
 * host asks the person, and hands back a path for the engine to open.
 */
async function pickCamtFile(): Promise<AyqPickedFile> {
  if (process.env.AYQ_SMOKE === '1' && smokeImport !== '') {
    return { paths: [smokeImport] };
  }

  const chosen = await dialog.showOpenDialog({
    title: 'Import CAMT.053',
    // Several at once: a bank exports a statement per day, and importing two
    // hundred of them one at a time is not a workflow.
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'CAMT.053 statements', extensions: ['xml', 'zip'] },
      { name: 'All files', extensions: ['*'] },
    ],
  });

  return { paths: chosen.canceled ? [] : chosen.filePaths };
}

/** The native controls' colours for a ground: the rail's surface and ink. */
function titleBarOverlay(resolved: 'light' | 'dark'): {
  color: string;
  symbolColor: string;
  height: number;
} {
  const surface = AYQ_TOKENS[resolved].surface;
  return {
    color: surface.rail,
    symbolColor: surface.railInkOn,
    height: AYQ_METRIC.titleBarHeight,
  };
}

/** What the controls were last painted for; read by the acceptance run. */
let titleBarPainted: 'light' | 'dark' | null = null;

async function ask(request: AyqRequest): Promise<AyqResponse> {
  // The two requests the host answers itself, because they are about this
  // window and not about the budget. Everything else is relayed untouched.
  if (request?.kind === 'window.ground') {
    const resolved = request.resolved === 'dark' ? 'dark' : 'light';
    let applied = false;
    if (process.platform === 'win32' && mainWindow !== null) {
      const { color, symbolColor } = titleBarOverlay(resolved);
      mainWindow.setTitleBarOverlay({ color, symbolColor });
      titleBarPainted = resolved;
      applied = true;
    }
    return { id: request.id, ok: true, kind: 'window.ground', result: { applied } };
  }
  if (request?.kind === 'import.pick') {
    try {
      return {
        id: request.id,
        ok: true,
        kind: 'import.pick',
        result: await pickCamtFile(),
      };
    } catch (error) {
      return {
        id: request.id,
        ok: false,
        kind: 'error',
        code: 'picker-failed',
        detail: error instanceof Error ? error.message : String(error),
      };
    }
  }

  if (!engine) {
    return Promise.resolve({
      id: request.id,
      ok: false,
      kind: 'error',
      code: 'engine-not-running',
      detail: 'the AYQ engine is not running',
    });
  }

  const began = Date.now();
  return new Promise<AyqResponse>(resolve => {
    const timer = setTimeout(() => {
      if (pending.delete(request.id)) {
        resolve({
          id: request.id,
          ok: false,
          kind: 'error',
          code: 'engine-timeout',
          params: { minutes: AYQ_ENGINE_PATIENCE / 60_000 },
          detail: `the AYQ engine did not answer within ${
            AYQ_ENGINE_PATIENCE / 60_000
          } minutes`,
        });
      }
    }, AYQ_ENGINE_PATIENCE);

    pending.set(request.id, response => {
      clearTimeout(timer);
      // Measured here rather than in the engine, for two reasons. This is the
      // wait the renderer actually had — which is the number a slow screen is
      // made of — and the engine's own stderr does not reach a log under the
      // `utilityProcess` host that ships, so a measurement taken there would be
      // invisible in exactly the runs that want it.
      if (timing) {
        process.stdout.write(
          `[ayq-engine] ${request.kind} ${Date.now() - began}ms\n`,
        );
      }
      resolve(response);
    });

    engine?.send(request);
  });
}

/**
 * Whether this Windows can show Mica at all, and what was done about it.
 *
 * 04 A14 allows Mica for the window background and navigation and Acrylic for
 * transient surfaces, and the task that built this required the claim to be
 * verified rather than made. The verification is a build number: the backdrop
 * materials arrived in Windows 11, build 22000. Below that Electron accepts
 * `backgroundMaterial` and silently does nothing, which is the worst of the
 * three outcomes — a product that says it uses Mica and does not.
 *
 * So it is asked, recorded, and where it is unavailable the window keeps a
 * solid surface: the ground the token module already defines, which is the
 * nearest thing to it.
 */
function windowMaterial(): { material: 'mica' | 'none'; why: string } {
  if (process.platform !== 'win32') {
    return { material: 'none', why: `${process.platform} has no Mica` };
  }
  // `10.0.22000` and upwards. `release()` is the kernel version, which is what
  // the build number lives in.
  const build = Number(release().split('.')[2] ?? '0');
  if (Number.isFinite(build) && build >= 22_000) {
    return { material: 'mica', why: `Windows build ${build}` };
  }
  return {
    material: 'none',
    why: `Windows build ${build} is older than 22000, which is where Mica begins`,
  };
}

function createWindow(): BrowserWindow {
  // Electron gives every application a File/Edit/View/Window menu whether or
  // not it has anything to put in one. AYQ does not: every action it offers is
  // on the page. An empty menu bar is a row of the window's height spent on
  // four words that lead nowhere, and on Windows it sits above the content.
  Menu.setApplicationMenu(null);

  // Where it opens (04 A25): 1600 px wide the first time, fitted to the work
  // area; after that, where the person last left it — unless that is no longer
  // on any screen this machine has.
  const opening = ayqOpeningBounds(
    ayqReadWindowBounds(dataDir),
    screen.getAllDisplays().map(display => display.workArea),
    screen.getPrimaryDisplay().workArea,
  );
  windowOpenedFrom = opening.restored ? 'restored' : 'default';
  process.stdout.write(
    `[ayq] window opens at ${opening.bounds.width}x${opening.bounds.height}` +
      `+${opening.bounds.x}+${opening.bounds.y} (${windowOpenedFrom})\n`,
  );

  const material = windowMaterial();
  process.stdout.write(
    `[ayq] window material: ${material.material} (${material.why})\n`,
  );
  const window = new BrowserWindow({
    ...opening.bounds,
    minWidth: AYQ_WINDOW_MIN_WIDTH,
    minHeight: AYQ_WINDOW_MIN_HEIGHT,
    title: 'AYQ',
    // The ground the token module defines, so that the frame a person sees
    // before the first paint is the one the application then paints.
    backgroundColor: AYQ_TOKENS.light.surface.ground,
    // The title bar is drawn by the renderer in the rail's surface, and the
    // window controls stay Windows' own, painted over it in the rail's ink
    // (04 A20 as the owner decided it). Repainted whenever the ground changes.
    ...(process.platform === 'win32'
      ? {
          titleBarStyle: 'hidden' as const,
          titleBarOverlay: titleBarOverlay('light'),
        }
      : {}),
    // Mica where Windows has it (04 A14), and nothing pretending to be it
    // where it does not. Never behind figures: it is the window's background
    // and the rail's, and every pane the figures sit on is solid.
    ...(material.material === 'mica'
      ? { backgroundMaterial: 'mica' as const }
      : {}),
    show: false,
    webPreferences: {
      // The renderer gets the bridge and nothing else.
      preload: join(here, 'ayq-preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // What Windows reports back is not always what was asked for: with the
  // title bar hidden and the display scaled, the frame reads a few pixels
  // larger than the size it was created at (measured: 1600x820 reads back as
  // 1607x827 at 175 %). Saved as read, the window would grow by that much on
  // every launch. So the difference is measured once, here, and taken off
  // again when the size is saved — as long as it is a frame's worth and not a
  // window the system resized for its own reasons.
  const created = window.getBounds();
  const frame = (asked: number, got: number): number =>
    Math.abs(got - asked) <= FRAME_SLACK ? got - asked : 0;
  windowFrame = {
    width: frame(opening.bounds.width, created.width),
    height: frame(opening.bounds.height, created.height),
  };

  window.once('ready-to-show', () => window.show());
  // The normal bounds, whatever state it is closed in: a window closed while
  // maximised or minimised reopens at the size it had before that.
  window.on('close', () => rememberWindow(window));
  void window.loadFile(join(here, 'client', 'ayq-client.html'));
  return window;
}

/** Whether the window opened at the default or where it was left (A25). */
let windowOpenedFrom: 'default' | 'restored' = 'default';

/** How much larger the system reports the window than it was created (A25). */
let windowFrame = { width: 0, height: 0 };

/** The most a frame is allowed to account for; more is a real resize. */
const FRAME_SLACK = 16;

/** Writes the window's normal bounds for the next launch (04 A25). */
function rememberWindow(window: BrowserWindow): void {
  if (window.isDestroyed()) return;
  try {
    const normal: AyqRect = window.getNormalBounds();
    ayqWriteWindowBounds(dataDir, {
      ...normal,
      width: normal.width - windowFrame.width,
      height: normal.height - windowFrame.height,
    });
  } catch (error) {
    // Losing a window position is not worth failing a close over.
    process.stdout.write(
      `[ayq] could not remember the window: ${error instanceof Error ? error.message : String(error)}\n`,
    );
  }
}

/**
 * Opens a destination from the rail, the way a person does, and waits for its
 * screen to be the one on the page.
 *
 * Clicking and carrying on was fine while the shell redrew synchronously. It
 * is not now: the screen is React's, and the element the next step looks for
 * may not exist for another frame.
 */
async function openDestination(
  window: BrowserWindow,
  name: string,
): Promise<boolean> {
  await window.webContents.executeJavaScript(
    `document.querySelector('[data-ayq-tab="${name}"]')?.click(); true`,
  );
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const there = await window.webContents.executeJavaScript(
      `!!document.querySelector('[data-ayq-screen="${name}"]')`,
    );
    if (there === true) return true;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  return false;
}

/**
 * Opens the account detail the way Today opens it (7 §7.1, §7.3).
 *
 * There is no rail tab for it any more. Today's own control is the route, and
 * using it here means the acceptance run exercises the route a person has
 * rather than one kept alive for the test.
 */
async function openAccountDetail(window: BrowserWindow): Promise<boolean> {
  if (!(await openDestination(window, 'today'))) return false;

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const pressed = await window.webContents.executeJavaScript(
      `(() => {
        const open = document.querySelector('[data-ayq-action="today-accounts"]');
        if (!open) return false;
        open.click();
        return true;
      })()`,
    );
    if (pressed === true) break;
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  while (Date.now() < deadline) {
    const there = await window.webContents.executeJavaScript(
      "!!document.querySelector('[data-ayq-screen=\"accounts\"]')",
    );
    if (there === true) return true;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  return false;
}

/**
 * Opens the Register and waits for it to have drawn.
 *
 * Every read of the ledger below goes through here: the ledger is one screen
 * among nine now, and a test that reads rows from whichever screen happened to
 * be open reads nothing at all.
 */
async function openRegister(window: BrowserWindow): Promise<void> {
  await openDestination(window, 'register');
  // The table exists only once the engine has answered — before that the pane
  // says it is reading. That is what makes this wait mean "the Register has an
  // answer" rather than "the Register has drawn something", which is what a run
  // reading the ledger is actually waiting for.
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const drawn = await window.webContents.executeJavaScript(
      "!!document.querySelector('[data-ayq-table=\"register\"]')",
    );
    if (drawn === true) return;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
}

/** One published attribute from the page, as a string. */
async function dataset(window: BrowserWindow, name: string): Promise<string> {
  return String(
    await window.webContents.executeJavaScript(
      `document.body.dataset.${name} || ""`,
    ),
  );
}

/**
 * Runs one import the way a person would: by clicking the button.
 *
 * The click is the only thing the smoke does — the picker, the IPC, the
 * parsing and the API call are the product's own. It then reads the counts the
 * renderer published, which are the engine's, not the screen's.
 */
async function importOnce(window: BrowserWindow): Promise<AyqImportSummary> {
  if (!(await openDestination(window, 'import'))) {
    throw new Error('the Import destination did not open');
  }
  await window.webContents.executeJavaScript(
    'document.body.dataset.ayqImportState = ""; ' +
      'document.querySelector(\'[data-ayq-action="import"]\').click(); true',
  );

  // As long as the host is prepared to wait for the engine. Importing fifty
  // thousand records takes minutes, and a driver that gave up first would report
  // the product as broken while it was working.
  const deadline = Date.now() + AYQ_ENGINE_PATIENCE;
  let state = '';
  while (Date.now() < deadline) {
    state = await dataset(window, 'ayqImportState');
    if (state !== '' && state !== 'working') break;
    await new Promise(resolve => setTimeout(resolve, 250));
  }

  if (state !== 'done') {
    // Carrying the screen's own words, because "ended as error" names the
    // outcome and not the cause, and the cause is the whole point of a log.
    const said = await problemShown(window);
    throw new Error(
      `the import ended as ${state || 'timeout'}` +
        (said === '' ? '' : ` — the screen said: ${said}`),
    );
  }

  return JSON.parse(
    await dataset(window, 'ayqImportSummary'),
  ) as AyqImportSummary;
}

/**
 * Files the newest transaction from the ledger itself.
 *
 * Through the control in the row, the way a person would: the option is chosen
 * and a change event dispatched. What is read back afterwards must come from a
 * control the renderer rebuilt after the engine answered — the one the harness
 * typed into still holds whatever was typed into it, so reading that would only
 * ever confirm the harness's own input. The control is marked before the change
 * and the mark is what the wait is on; a redraw drops it, so a value seen
 * without it is a value the engine stored and the ledger read back.
 */
async function categoriseNewest(
  window: BrowserWindow,
  name: string,
): Promise<string> {
  await openRegister(window);

  // Through the detail pane, which is where a category is changed now
  // (04 A4): the row is chosen, the pane opens, and the category is set on
  // the control a person uses. The row's own cell shows the category and does
  // not offer to change it — a table of five hundred editable cells is a table
  // of five hundred chances to change the wrong one.
  const opened = await window.webContents.executeJavaScript(`(() => {
    const row = document.querySelector('[data-ayq-table="register"] tbody tr');
    if (!row) return false;
    row.click();
    return true;
  })()`);
  if (opened !== true) return 'no rows';

  let deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const there = await window.webContents.executeJavaScript(
      "!!document.querySelector('select[data-ayq-category-choice]')",
    );
    if (there === true) break;
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  const chose = String(
    await window.webContents.executeJavaScript(`(() => {
      const select = document.querySelector('select[data-ayq-category-choice]');
      if (!select) return 'no control';
      const option = [...select.options].find(
        candidate => candidate.textContent === ${JSON.stringify(name)},
      );
      if (!option) return 'no such category';
      select.value = option.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return 'chosen';
    })()`),
  );
  if (chose !== 'chosen') return chose;

  deadline = Date.now() + 60_000;
  let shown = '';
  while (Date.now() < deadline) {
    shown = await shownCategory(window);
    if (shown === name) break;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (shown !== name) {
    const said = await problemShown(window);
    if (said !== '') return `${shown || '(nothing)'}; the screen said: ${said}`;
  }
  return shown;
}

/**
 * What the ledger's first row actually displays as its category.
 *
 * A control the harness typed into is not an answer, so it reports nothing
 * until the renderer has replaced it.
 */
async function shownCategory(window: BrowserWindow): Promise<string> {
  await openRegister(window);
  // The row's own cell, which the renderer drew from what the engine answered
  // — never the control the harness typed into, which would only ever confirm
  // the harness's own input.
  return String(
    await window.webContents.executeJavaScript(`(() => {
      const cell = document.querySelector(
        '[data-ayq-table="register"] tbody tr [data-ayq-cell="category"]');
      return cell ? cell.innerText.trim() : '';
    })()`),
  );
}

/** Whatever the screen is complaining about, so a refusal is not silent. */
async function problemShown(window: BrowserWindow): Promise<string> {
  return String(
    await window.webContents.executeJavaScript(`(() => {
      const bar = document.getElementById('ayq-problem');
      return bar && !bar.hidden ? bar.innerText.trim() : '';
    })()`),
  );
}

/**
 * Opens Upcoming and, if asked, adds a planned payment through the form.
 *
 * Through the screen a person uses: the tab, the button, the fields, the save.
 * What is read back afterwards is the *table*, which the renderer rebuilds from
 * the engine's answer — never the controls the harness typed into, which would
 * only ever confirm the harness's own input. That defect has been paid for once
 * already and is not repeated here.
 *
 * The spec is `name|amount|frequency|startDate`, and every part of it is
 * invented: this runs on a fixture, not on anybody's statement.
 */
/**
 * What 03 r004 changed, read back from the screen the person actually sees.
 *
 * The three rules the revision turned on, each proved from the rendered table
 * rather than from what the harness put in: arrears that no longer expire
 * (§7.13), a suggestion that brings no arrears with it (§7.14), and a match
 * that is offered rather than made because two candidates qualify (§7.16).
 */
/**
 * Opens Upcoming and waits for the forecast table to have drawn.
 *
 * The table is the forecast, so a screen that has opened but not answered has no
 * rows — and reading it then would report what it looked like before the engine
 * replied rather than what it says.
 */
async function openUpcoming(window: BrowserWindow): Promise<boolean> {
  if (!(await openDestination(window, 'upcoming'))) return false;
  const drawn = async (): Promise<boolean> =>
    (await window.webContents.executeJavaScript(
      "!!document.querySelector('[data-ayq-table=\"upcoming\"]')",
    )) === true;
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline && !(await drawn())) {
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  return drawn();
}

/** How many matches the screen is offering. -1 when it is not saying. */
async function matchesOffered(window: BrowserWindow): Promise<number> {
  const said = await window.webContents.executeJavaScript(
    "document.querySelector('[data-ayq-matches]')?.getAttribute('data-ayq-matches') ?? ''",
  );
  return said === '' ? -1 : Number(said);
}

/**
 * What 03 r004 changed, on the screen rather than in the engine's own tests.
 *
 * Three rules that are easy to state and easy to get wrong, each read off the
 * rows of one seeded budget: six months of arrears that do not expire by the
 * passage of time (§7.13), two years of detected history that owes nothing
 * because a suggestion counts only from the day it was suggested (§7.14), and a
 * match with two candidates that AYQ will not decide for a person (§7.16).
 *
 * The states are read from the state chip's own attribute rather than from the
 * words in the row: the chip carries the state the screen believes, and the
 * words are the catalogue's, which a translation may change.
 */
async function conformanceShown(window: BrowserWindow): Promise<string> {
  if (!(await openUpcoming(window))) return 'the forecast never appeared';

  const seen = JSON.parse(
    String(
      await window.webContents.executeJavaScript(`(() => {
        const rows = [...document.querySelectorAll('[data-ayq-table="upcoming"] tbody tr')];
        const forRecord = id =>
          rows.filter(row =>
            (row.getAttribute('data-ayq-row') || '').indexOf('record:' + id + ':') === 0);
        const inState = (list, state) =>
          list.filter(row =>
            !!row.querySelector('[data-ayq-state="' + state + '"]')).length;
        const arrears = forRecord('plan-conf-overdue');
        const detected = forRecord('plan-conf-detected');
        const twin = forRecord('plan-conf-twin');
        const offered = document.querySelector('[data-ayq-matches]');
        return JSON.stringify({
          arrears: arrears.length,
          arrearsOverdue: inState(arrears, 'overdue'),
          detected: detected.length,
          detectedOverdue: inState(detected, 'overdue'),
          detectedSuggested: inState(detected, 'suggested'),
          twin: twin.length,
          offered: offered
            ? Number(offered.getAttribute('data-ayq-matches'))
            : -1,
        });
      })()`),
    ),
  ) as Record<string, number>;

  process.stdout.write(
    `[ayq-smoke] 03 r004: arrears ${seen.arrears} (${seen.arrearsOverdue} flagged overdue), ` +
      `detected ${seen.detected} (${seen.detectedOverdue} overdue, ${seen.detectedSuggested} tagged suggested), ` +
      `subscription rows ${seen.twin}, matches offered ${seen.offered}\n`,
  );

  // 03 §7.13: six months of arrears, all of them, none expired by time alone.
  if (seen.arrearsOverdue < 6) {
    return `only ${seen.arrearsOverdue} arrears are counted; 03 §7.13 says none expire`;
  }
  // 03 §7.14: two years of detected history is history, and owes nothing.
  if (seen.detected < 1) return 'the suggested record expects nothing at all';
  if (seen.detectedOverdue !== 0) {
    return `a record suggested today shows ${seen.detectedOverdue} overdue; 03 §7.14 says none`;
  }
  if (seen.detectedSuggested !== seen.detected) {
    return 'a suggestion is not labelled as one on every row (03 §7.12)';
  }
  // 03 §7.16: two candidates qualify, so the match waits for a person, and the
  // payment it might have settled is still expected.
  if (seen.offered < 0) return 'the screen does not say whether anything is offered';
  if (seen.offered < 1) return 'no match was offered; 03 §7.16 says one should be';
  if (seen.twin < 1) {
    return 'the subscription was matched away; 03 §7.16 says nobody chose yet';
  }
  return '';
}

/**
 * Upcoming: a planned payment added the way a person adds one, and the scopes.
 *
 * The record is written through the fields and the button, and read back from
 * the *table*, which the renderer rebuilt from the engine's answer — never from
 * the controls the harness typed into, which would only ever agree with the
 * harness.
 *
 * Then the thing 03 §7.17 turns on, checked on the screen: a single payment is
 * offered no action that reaches beyond itself, and a series offers ending the
 * series as an action of its own rather than as what dismissing does.
 */
/**
 * What the Upcoming check found: what is wrong, and what the screen showed.
 *
 * Two fields rather than one string, because the caller used to decide whether a
 * returned string was a failure by testing it against a list of prefixes — so a
 * failure whose wording was not on the list passed as a screen dump. Every
 * reason this function can give is a reason it has to name.
 */
type AyqUpcomingVerdict = { wrong: string; dump: string };

function upcomingWrong(wrong: string): AyqUpcomingVerdict {
  return { wrong, dump: '' };
}

async function upcomingShown(
  window: BrowserWindow,
  addSpec: string,
  acceptMatch: boolean,
): Promise<AyqUpcomingVerdict> {
  if (!(await openUpcoming(window))) {
    return upcomingWrong('the Upcoming screen never drew its table');
  }

  if (addSpec !== '') {
    const [name, amount, frequency, startDate] = addSpec.split('|');
    const filled = String(
      await window.webContents.executeJavaScript(`(() => {
        const add = document.querySelector('[data-ayq-action="plan-new"]');
        if (!add) return 'no button';
        add.click();
        return 'opened';
      })()`),
    );
    if (filled !== 'opened') return upcomingWrong(`could not add the payment: ${filled}`);

    // The form is a React render away from the click, so it is waited for
    // rather than assumed to be there in the same breath.
    let formBy = Date.now() + 30_000;
    while (
      Date.now() < formBy &&
      (await window.webContents.executeJavaScript(
        "!!document.querySelector('[data-ayq-record-form]')",
      )) !== true
    ) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    const typed = String(
      await window.webContents.executeJavaScript(`(() => {
        // The attribute is on the native control: a Fluent Input passes the
        // data-* props to its input, which is the element a person types into.
        //
        // Through the prototype's own value setter, and that is not a detail.
        // React keeps the last value it saw on the element itself and ignores an
        // event whose value matches it — so assigning the value property updates
        // that cache as well and the change is swallowed, in a real browser as
        // much as in a test. The setter on the prototype writes the value
        // without touching the cache, which is what a person typing does.
        const set = (which, value) => {
          const control = document.querySelector('[data-ayq-field="' + which + '"]');
          if (!control) return false;
          const prototype = Object.getPrototypeOf(control);
          const setter = Object.getOwnPropertyDescriptor(prototype, 'value');
          if (setter && setter.set) setter.set.call(control, value);
          else control.value = value;
          control.dispatchEvent(new Event('input', { bubbles: true }));
          control.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        };
        if (!set('name', ${JSON.stringify(name)})) return 'no name field';
        if (!set('amount', ${JSON.stringify(amount)})) return 'no amount field';
        if (!set('frequency', ${JSON.stringify(frequency)})) return 'no frequency field';
        if (!set('start', ${JSON.stringify(startDate)})) return 'no date field';
        return 'typed';
      })()`),
    );
    if (typed !== 'typed') return upcomingWrong(`could not fill the form: ${typed}`);

    const saved = await window.webContents.executeJavaScript(`(() => {
      const save = document.querySelector('[data-ayq-action="record-save"]');
      if (!save) return false;
      save.click();
      return true;
    })()`);
    if (saved !== true) return upcomingWrong('the form had no save button');

    // Waited for in the table, which is drawn from what the engine answered.
    formBy = Date.now() + 60_000;
    let listed = false;
    while (Date.now() < formBy && !listed) {
      listed =
        (await window.webContents.executeJavaScript(`(() => {
          const rows = [...document.querySelectorAll('[data-ayq-table="upcoming"] tbody tr')];
          return rows.some(row => {
            const cell = row.querySelector('[data-ayq-cell="name"]');
            return cell && cell.innerText.indexOf(${JSON.stringify(name)}) >= 0;
          });
        })()`)) === true;
      if (!listed) await new Promise(resolve => setTimeout(resolve, 250));
    }
    if (!listed) {
      const said = await problemShown(window);
      return upcomingWrong(
        `the payment was not listed after saving${
          said === '' ? '' : ` — the screen said: ${said}`
        }`,
      );
    }

    // 03 §7.17, on the screen. The record just added is a series or a single
    // payment, and which it is decides what may be offered over it.
    const scopes = JSON.parse(
      String(
        await window.webContents.executeJavaScript(`(() => {
          const rows = [...document.querySelectorAll('[data-ayq-table="upcoming"] tbody tr')];
          const row = rows.find(one => {
            const cell = one.querySelector('[data-ayq-cell="name"]');
            return cell && cell.innerText.indexOf(${JSON.stringify(name)}) >= 0;
          });
          if (!row) return JSON.stringify({ why: 'the row went away' });
          row.click();
          return JSON.stringify({ clicked: true });
        })()`),
      ),
    ) as { why?: string; clicked?: boolean };
    if (scopes.why !== undefined) return upcomingWrong(scopes.why);

    let paneBy = Date.now() + 30_000;
    while (
      Date.now() < paneBy &&
      (await window.webContents.executeJavaScript(
        "!!document.querySelector('[data-ayq-scope=\"occurrence\"]')",
      )) !== true
    ) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    const offered = JSON.parse(
      String(
        await window.webContents.executeJavaScript(`(() => {
          const scoped = where => {
            const block = document.querySelector('[data-ayq-scope="' + where + '"]');
            return block
              ? [...block.querySelectorAll('[data-ayq-action]')].map(one =>
                  one.getAttribute('data-ayq-action'))
              : null;
          };
          return JSON.stringify({
            occurrence: scoped('occurrence'),
            record: scoped('record'),
            single: !!document.querySelector('[data-ayq-single]'),
            rhythm: (document.querySelector('[data-ayq-rhythm]') || {}).innerText || '',
          });
        })()`),
      ),
    ) as {
      occurrence: string[] | null;
      record: string[] | null;
      single: boolean;
      rhythm: string;
    };

    if (offered.occurrence === null || offered.record === null) {
      return upcomingWrong('the pane does not say what any of its actions reaches');
    }
    process.stdout.write(
      `[ayq-smoke] scopes: this occurrence ${offered.occurrence.join(', ')}; ` +
        `the record ${offered.record.join(', ')}; ${offered.rhythm}\n`,
    );

    // Moving and dismissing reach one occurrence, and are in that block.
    for (const wanted of ['occurrence-reschedule', 'occurrence-dismiss']) {
      if (!offered.occurrence.includes(wanted)) {
        return upcomingWrong(`${wanted} is not offered as reaching one occurrence`);
      }
      if (offered.record.includes(wanted)) {
        return upcomingWrong(`${wanted} is offered as reaching the whole record`);
      }
    }
    // Ending a series is its own action, and never what dismissing does.
    if (offered.occurrence.includes('record-end-series')) {
      return upcomingWrong('ending the series is offered as an action over one occurrence');
    }
    if (offered.single) {
      if (offered.record.includes('record-end-series')) {
        return upcomingWrong('a single payment is offered an end to a series it does not have');
      }
    } else if (!offered.record.includes('record-end-series')) {
      return upcomingWrong('a series offers no way to end it');
    }
  }

  if (acceptMatch) {
    // The match AYQ found and would not make on its own. It has to be offered,
    // and accepting it has to take the payment out of what is still expected.
    const offered = await matchesOffered(window);
    if (offered < 1) return upcomingWrong('no match was offered to accept');

    const clicked = await window.webContents.executeJavaScript(`(() => {
      const yes = document.querySelector('[data-ayq-action="match-apply"]');
      if (!yes) return false;
      yes.click();
      return true;
    })()`);
    if (clicked !== true) return upcomingWrong('the offered match had nothing to accept');

    const deadline = Date.now() + 60_000;
    let left = offered;
    while (Date.now() < deadline && left >= offered) {
      left = await matchesOffered(window);
      if (left < 0) left = offered;
      if (left >= offered) await new Promise(resolve => setTimeout(resolve, 250));
    }
    if (left >= offered) return upcomingWrong('accepting the match changed nothing');
    process.stdout.write(
      `[ayq-smoke] matches offered: ${offered}, left after accepting one: ${left}\n`,
    );
  }

  const dump = String(
    await window.webContents.executeJavaScript(`(() => {
      const lowest = document.querySelector('[data-ayq-lowest]');
      const rows = [...document.querySelectorAll('[data-ayq-table="upcoming"] tbody tr')]
        .slice(0, 12)
        .map(row =>
          [...row.querySelectorAll('[data-ayq-cell]')]
            .map(cell => cell.innerText.replace(/\\s+/g, ' ').trim())
            .join(' | '));
      return (lowest ? lowest.innerText.replace(/\\s+/g, ' ').trim() : '') +
        '\\n' + rows.join('\\n');
    })()`),
  );
  return { wrong: '', dump };
}

/**
 * Opens Plan and, if asked, sets one category's monthly plan through the sheet.
 *
 * The spec is `Category:amount`. What is read back is the row's *Left* cell,
 * which the engine computed from what it stored — never the input the harness
 * typed into, which would only ever agree with itself.
 */
async function planShown(
  window: BrowserWindow,
  spec: string,
): Promise<string> {
  if (!(await openDestination(window, 'plan'))) return '';

  const ready = async (): Promise<boolean> =>
    (await window.webContents.executeJavaScript(
      "!!document.querySelector('[data-ayq-table=\"plan\"] tbody tr')",
    )) === true;

  let deadline = Date.now() + 60_000;
  while (Date.now() < deadline && !(await ready())) {
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (!(await ready())) return '';

  if (spec !== '') {
    const [category, amount] = spec.split(':');
    const typed = String(
      await window.webContents.executeJavaScript(`(() => {
        const rows = [...document.querySelectorAll('[data-ayq-table="plan"] tbody tr')];
        const row = rows.find(one => {
          const cell = one.querySelector('[data-ayq-category-name]') || one.querySelector('[data-ayq-cell="category"]');
          return cell && cell.innerText.split('\\n')[0].trim() === ${JSON.stringify(category)};
        });
        if (!row) return 'no such category on the sheet';
        const field = row.querySelector('[data-ayq-plan-cell]');
        if (!field) return 'this month cannot be planned in';
        // Through the prototype's setter: see the note in the record form above.
        const setter = Object.getOwnPropertyDescriptor(
          Object.getPrototypeOf(field), 'value');
        if (setter && setter.set) setter.set.call(field, ${JSON.stringify(amount)});
        else field.value = ${JSON.stringify(amount)};
        field.dispatchEvent(new Event('input', { bubbles: true }));
        field.dispatchEvent(new Event('change', { bubbles: true }));
        // As focusout, not blur: blur does not bubble, so React listens for
        // focusout and maps it to onBlur. A dispatched blur reaches the element
        // and nothing else.
        field.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
        return 'typed';
      })()`),
    );
    if (typed !== 'typed') return `could not set the plan: ${typed}`;

    // Read from the Left column, which is the engine's arithmetic over what it
    // stored. A plan that did not store leaves it at zero. Compared as cents
    // rather than as words, so a locale's spacing cannot decide the outcome.
    const want = Math.round(Number(amount) * 100);
    deadline = Date.now() + 60_000;
    let shown = -1;
    while (Date.now() < deadline) {
      shown = Number(
        await window.webContents.executeJavaScript(`(() => {
          const rows = [...document.querySelectorAll('[data-ayq-table="plan"] tbody tr')];
          const row = rows.find(one => {
            const cell = one.querySelector('[data-ayq-category-name]') || one.querySelector('[data-ayq-cell="category"]');
            return cell && cell.innerText.split('\\n')[0].trim() === ${JSON.stringify(category)};
          });
          if (!row) return -1;
          const cell = row.querySelector('[data-ayq-cell="remaining"] [data-ayq-figure]');
          return cell ? Number(cell.getAttribute('data-ayq-figure')) : -1;
        })()`),
      );
      if (shown === want) break;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    if (shown !== want) {
      const said = await problemShown(window);
      return `the plan read back as ${shown} cents rather than ${want}${
        said === '' ? '' : ` — the screen said: ${said}`
      }`;
    }
    process.stdout.write(
      `[ayq-smoke] the plan for ${category} read back as ${shown} cents\n`,
    );
  }

  return String(
    await window.webContents.executeJavaScript(`(() => {
      const month = document.querySelector('[data-ayq-plan-month]');
      const totals = document.querySelector('[data-ayq-plan-totals]');
      const rule = document.querySelector('[data-ayq-plan-rule]');
      const rows = [...document.querySelectorAll('[data-ayq-table="plan"] tbody tr')]
        .slice(0, 12)
        .map(row =>
          [...row.querySelectorAll('[data-ayq-cell]')]
            .map(cell => {
              const field = cell.querySelector('input');
              return field ? field.value : cell.innerText.replace(/\\s+/g, ' ').trim();
            })
            .join(' | '));
      return (month ? month.value : '') + '\\n' +
        (totals ? totals.innerText.replace(/\\s+/g, ' ').trim() : '') + '\\n' +
        (rule ? rule.innerText.replace(/\\s+/g, ' ').trim() : '') + '\\n' +
        rows.join('\\n');
    })()`),
  );
}

/**
 * Presses "Show more" and reports how many rows the ledger holds afterwards.
 *
 * Counted from the rendered table, before and after, because the defect worth
 * catching here is a button that looks right and reloads nothing — which is
 * indistinguishable from a working one unless something counts the rows.
 */
async function showMore(window: BrowserWindow): Promise<string> {
  await openRegister(window);
  const rows = async (): Promise<number> =>
    Number(
      await window.webContents.executeJavaScript(
        "document.querySelectorAll('[data-ayq-table=\"register\"] tbody tr').length",
      ),
    );

  const before = await rows();
  const pressed = await window.webContents.executeJavaScript(`(() => {
    const more = document.querySelector('[data-ayq-action="show-more"]');
    if (!more) return false;
    more.click();
    return true;
  })()`);
  if (pressed !== true) return `${before} rows, and nothing offers more`;

  const deadline = Date.now() + 120_000;
  let after = before;
  while (Date.now() < deadline) {
    after = await rows();
    if (after > before) break;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  return `${before} rows, then ${after}`;
}

/**
 * The ledger as a log can carry it: one line per row, the category being the
 * one the row shows rather than every option it offers.
 *
 * A select prints its whole option list in `innerText`, which buried the one
 * value a failing run needs in a hundred lines that are the same for every row.
 */
async function ledgerDump(window: BrowserWindow): Promise<string> {
  await openRegister(window);
  return String(
    await window.webContents.executeJavaScript(`(() => {
      const rows = [...document.querySelectorAll(
        '[data-ayq-table="register"] tbody tr')].map(row =>
        ['date', 'payee', 'category', 'account', 'amount']
          .map(name => {
            const cell = row.querySelector('[data-ayq-cell="' + name + '"]');
            return cell ? cell.innerText.trim() : '';
          })
          .join(' | '),
      );
      const totals = document.querySelector('[data-ayq-totals]');
      if (totals) rows.push(totals.innerText.replace(/\\s+/g, ' ').trim());
      const empty = document.querySelector(
        '[data-ayq-table="register"][data-ayq-empty]');
      if (empty) rows.push(empty.innerText.replace(/\\s+/g, ' ').trim());
      return rows.join('\\n');
    })()`),
  );
}

/**
 * The import acceptance run: import once, import the same file again, and
 * require the second to add nothing.
 *
 * Only counts are printed. The fixture is invented, but the rule holds
 * whatever the file is: a statement's contents do not belong in a CI log.
 */
/** What the import rounds reported, for the run that launched this. */
const importRounds: AyqImportSummary[] = [];

/** What the ledger displayed as the newest transaction's category. */
let categoryShown = '';

async function checkImport(window: BrowserWindow): Promise<boolean> {
  // Once, when the run only wants a budget to work in. Importing the same
  // statement twice is the duplicate-protection check, and that rule is proved
  // on a small fixture by a step of its own — doing it again on fifty thousand
  // records proves the same thing and doubles the slowest step in the workflow.
  const once = process.env.AYQ_SMOKE_IMPORT_ONCE === '1';
  try {
    const first = await importOnce(window);
    const second = once ? first : await importOnce(window);
    importRounds.push(first, ...(once ? [] : [second]));
    // The ledger is read below, and it is a destination of its own now. The
    // count it publishes is the Register's, so it is waited for rather than
    // read off the frame the screen opened on — and waited for until it is the
    // number the import said it would be, rather than merely non-zero. A
    // Register that draws its rows before the count arrives is a Register that
    // reads as an empty budget for as long as that takes.
    await openRegister(window);
    const rowsBy = Date.now() + 120_000;
    while (Date.now() < rowsBy) {
      const rows = Number(await dataset(window, 'ayqLedgerRows'));
      const total = Number(await dataset(window, 'ayqLedgerTotal'));
      if (rows > 0 && total === first.transactionCountAfter) break;
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    const report = (round: string, summary: AyqImportSummary): void => {
      process.stdout.write(
        `[ayq-smoke] import ${round}: ${summary.files} document(s), ` +
          `${summary.records} records, ${summary.imported} imported, ` +
          `${summary.duplicates} duplicates, ${summary.skipped} skipped, ` +
          `${summary.failed} failed, ` +
          `${summary.transactionCountAfter} transactions in the budget\n`,
      );
    };
    report('1', first);
    if (!once) report('2', second);

    // The screen's own ledger, not the import's word for it: the rows on the
    // page have to be the engine's rows, or the import proved nothing a person
    // can see.
    const ledgerTotal = Number(await dataset(window, 'ayqLedgerTotal'));
    const ledgerRows = Number(await dataset(window, 'ayqLedgerRows'));
    process.stdout.write(
      `[ayq-smoke] ledger: ${ledgerRows} rows shown, ` +
        `${ledgerTotal} transactions in the budget\n`,
    );

    const held =
      first.imported > 0 &&
      first.failed === 0 &&
      (once ||
        (second.imported === 0 &&
          second.duplicates === first.prepared &&
          second.transactionCountAfter === first.transactionCountAfter)) &&
      ledgerTotal === second.transactionCountAfter &&
      // The rows drawn, not the rows there are: the ledger shows a page at a
      // time, so demanding it draw all of them was an assumption that held only
      // while every fixture was smaller than a page.
      ledgerRows > 0 &&
      ledgerRows <= ledgerTotal;

    process.stdout.write(
      once
        ? `[ayq-smoke] one import, no duplicate check asked for: ${
            held ? 'HOLDS' : 'FAILED'
          }\n`
        : `[ayq-smoke] duplicate protection: ${held ? 'HOLDS' : 'FAILED'}\n`,
    );
    return held;
  } catch (error) {
    process.stdout.write(
      `[ayq-smoke] import failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return false;
  }
}

/**
 * What counts as responsive, for the Register.
 *
 * Deliberately generous: this runs on a shared CI runner against a budget of
 * fifty thousand invented transactions, and the number worth reading is the
 * measured one, which the run prints. The gate is here to catch the day the
 * screen stops being usable at all rather than to police a hundred
 * milliseconds either way.
 */
const AYQ_REGISTER_BUDGET_MS = 5_000;

/**
 * Accounts, coverage and reconciliation on the screen (03 §8).
 *
 * `agrees` and `differs` are the two cases the rule turns on, and they are
 * asked for by name rather than inferred: a run that read whatever the screen
 * happened to say would pass on both.
 */
async function accountsShown(
  window: BrowserWindow,
  expect: string,
): Promise<string> {
  // 7 §7.1 takes Accounts off the rail, so this goes the way a person now
  // goes: Today, and the control beside the coverage line. A check that still
  // clicked a rail tab would fail for the right reason and say the wrong thing.
  if (!(await openAccountDetail(window))) {
    return 'the account detail never opened from Today';
  }

  const drawn = async (): Promise<boolean> =>
    (await window.webContents.executeJavaScript(
      "!!document.querySelector('[data-ayq-table=\"accounts\"] tbody tr')",
    )) === true;
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline && !(await drawn())) {
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  if (!(await drawn())) return 'the Accounts screen drew no accounts';

  await window.webContents.executeJavaScript(
    "document.querySelector('[data-ayq-table=\"accounts\"] tbody tr').click(); true",
  );
  await new Promise(resolve => setTimeout(resolve, 400));

  const seen = JSON.parse(
    String(
      await window.webContents.executeJavaScript(`(() => {
        const row = document.querySelector('[data-ayq-table="accounts"] tbody tr');
        const cell = name => {
          const found = row.querySelector('[data-ayq-cell="' + name + '"]');
          return found ? found.innerText.replace(/\\s+/g, ' ').trim() : '';
        };
        const pane = document.querySelector('[data-ayq-account-detail]');
        const boundary = document.querySelector('[data-ayq-reliable-to]');
        const difference = pane
          ? pane.querySelector('[data-ayq-difference]')
          : null;
        const actions = pane
          ? [...pane.querySelectorAll('button')].map(one =>
              (one.innerText || '').toLowerCase().trim())
          : [];
        return JSON.stringify({
          statements: cell('statements'),
          agrees: cell('agrees'),
          balance: cell('balance'),
          boundary: boundary ? boundary.dataset.ayqReliableTo : null,
          pane: pane ? pane.innerText.replace(/\\s+/g, ' ').trim() : '',
          difference: difference
            ? difference.getAttribute('data-ayq-difference')
            : null,
          actions,
          totals: (document.querySelector('[data-ayq-account-totals]') || {})
            .innerText || '',
        });
      })()`),
    ),
  ) as {
    statements: string;
    agrees: string;
    balance: string;
    boundary: string | null;
    pane: string;
    difference: string | null;
    actions: string[];
    totals: string;
  };

  process.stdout.write(
    `[ayq-smoke] accounts: statements to ${seen.statements}, ${seen.agrees}, ` +
      `balance ${seen.balance}, boundary ${seen.boundary || '(none)'}\n`,
  );

  if (seen.boundary === null) return 'the screen states no reliability boundary';

  // 03 §8.3 and §8.5: nothing here may offer to close a difference by writing
  // into the ledger, and nothing may be accepted or dismissed, because
  // reconciliation is derived and is not a decision.
  for (const forbidden of ['adjust', 'reconcile', 'accept', 'dismiss']) {
    if (seen.actions.some(label => label.includes(forbidden))) {
      return `the screen offers to ${forbidden} a difference`;
    }
  }

  if (expect === 'agrees') {
    if (!/Agrees/.test(seen.agrees)) {
      return `the ledger matches the statement and the screen says ${seen.agrees}`;
    }
    if (seen.difference !== null) {
      return 'a difference is shown where there is none';
    }
    return '';
  }

  if (expect === 'differs') {
    if (!/Differs by/.test(seen.agrees)) {
      return `the ledger does not match and the screen says ${seen.agrees}`;
    }
    if (seen.difference === null || seen.difference === '0') {
      return 'the screen does not state the difference';
    }
    if (!/does not say which statement is missing/.test(seen.pane)) {
      return 'the screen does not say what it is not claiming';
    }
    process.stdout.write(
      `[ayq-smoke] accounts: the difference is ${seen.difference} cents, stated\n`,
    );
    return '';
  }

  return `--accounts was given ${expect}, which is not a case`;
}


/**
 * Unknown is a state, and a balance the owner states is exact (§4.1, §4.4, §5).
 *
 * The whole of the highest-priority change in build 005, driven on the drawn
 * window rather than through the engine: a statement with no bank balance in it
 * leaves Today saying Unknown where the biggest figure on the screen goes, the
 * account offers the way out of it, and the balance typed into that form is the
 * balance the account has afterwards — to the cent, on the day it was stated
 * for, with nothing added to the ledger to make it so.
 */
async function balanceShown(window: BrowserWindow): Promise<string> {
  if (!(await openDestination(window, 'today'))) {
    return 'Today never opened';
  }

  const read = async (): Promise<{
    funds: string | null;
    account: string | null;
    accountId: string | null;
    offered: boolean;
    position: boolean;
  }> =>
    JSON.parse(
      String(
        await window.webContents.executeJavaScript(`(() => {
          const funds = document.querySelector('[data-ayq-available-funds]');
          const account = document.querySelector('[data-ayq-today-account]');
          return JSON.stringify({
            funds: funds ? funds.dataset.ayqAvailableFunds : null,
            account: account ? account.dataset.ayqAccountBalance : null,
            accountId: account ? account.dataset.ayqTodayAccount : null,
            offered: !!(account && /Set account balance/i.test(account.innerText)),
            position: !!document.querySelector('[data-ayq-no-position]'),
          });
        })()`),
      ),
    );

  const deadline = Date.now() + 60_000;
  let seen = await read();
  while (Date.now() < deadline && seen.account === null) {
    await new Promise(resolve => setTimeout(resolve, 200));
    seen = await read();
  }

  if (seen.account === null) return 'Today drew no account at all';
  if (seen.account !== 'unknown') {
    return `the account with no bank balance reads ${seen.account} rather than Unknown`;
  }
  if (seen.funds !== 'unknown') {
    return `available funds read ${seen.funds} where no balance is known`;
  }
  if (!seen.offered) return 'no way to set the balance is offered';
  if (!seen.position) return 'the screen projects a position it cannot have';

  // §6: the two freshness facts, separately. A file with no closing balance in
  // it still proved a month of movements, so "bank data through" has to have
  // advanced — which is the whole of what version 7 could not do — and it is a
  // different date from when the import happened.
  const freshness = JSON.parse(
    String(
      await window.webContents.executeJavaScript(`(() => {
        const account = document.querySelector('[data-ayq-today-account]');
        const imported = account.querySelector('[data-ayq-last-import]');
        const through = account.querySelector('[data-ayq-bank-through]');
        return JSON.stringify({
          imported: imported ? imported.dataset.ayqLastImport : null,
          through: through ? through.dataset.ayqBankThrough : null,
          importedSaid: imported ? imported.innerText.trim() : '',
          throughSaid: through ? through.innerText.trim() : '',
        });
      })()`),
    ),
  ) as {
    imported: string | null;
    through: string | null;
    importedSaid: string;
    throughSaid: string;
  };

  if (!freshness.through) {
    return 'a statement with no closing balance advanced no coverage at all';
  }
  if (!freshness.imported) return 'the account says nothing about its last import';
  if (freshness.importedSaid === freshness.throughSaid) {
    return 'the two freshness facts are drawn as one';
  }
  process.stdout.write(
    `[ayq-smoke] coverage without a closing balance: bank data through ` +
      `${freshness.through}, last import ${freshness.imported}\n`,
  );

  process.stdout.write(
    '[ayq-smoke] balance: Unknown, said out loud, and the way out offered\n',
  );

  // And now the owner says what the account holds. Through the form on the
  // account's own detail, which is where §4.5 puts it.
  if (!(await openAccountDetail(window))) {
    return 'the account detail never opened from Today';
  }
  await new Promise(resolve => setTimeout(resolve, 400));

  const opened = await window.webContents.executeJavaScript(
    `(() => {
      const row = document.querySelector('[data-ayq-table="accounts"] tbody tr');
      if (row) row.click();
      return true;
    })()`,
  );
  if (opened !== true) return 'the account list drew no row to open';
  await new Promise(resolve => setTimeout(resolve, 400));

  const anchoring = await window.webContents.executeJavaScript(
    `(() => {
      const button = document.querySelector('[data-ayq-action="account-anchor"]');
      if (!button) return false;
      button.click();
      return true;
    })()`,
  );
  if (anchoring !== true) return 'the account detail offers no way to set a balance';
  await new Promise(resolve => setTimeout(resolve, 300));

  // Typed the way a person types, through the controls themselves, so that
  // what is being proved is the form and not a call this file made.
  const typed = await window.webContents.executeJavaScript(`(() => {
    const set = (selector, value) => {
      const field = document.querySelector(selector);
      if (!field) return false;
      const native = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value').set;
      native.call(field, value);
      field.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    };
    if (!set('[data-ayq-balance-amount]', '1240.55')) return 'no amount field';
    if (!set('[data-ayq-balance-date]', '2026-06-30')) return 'no date field';
    const told = document.querySelector('[data-ayq-balance-form]');
    if (!/must already include/i.test(told.innerText)) {
      return 'the form does not say the balance has to include what is imported';
    }
    const save = document.querySelector('[data-ayq-action="balance-save"]');
    if (!save) return 'no way to save it';
    save.click();
    return 'ok';
  })()`);
  if (typed !== 'ok') return String(typed);

  const settled = Date.now() + 60_000;
  let after = '';
  while (Date.now() < settled) {
    after = String(
      await window.webContents.executeJavaScript(
        `(() => {
          const pane = document.querySelector('[data-ayq-detail-balance]');
          return pane ? pane.dataset.ayqDetailBalance : '';
        })()`,
      ),
    );
    if (after !== '' && after !== 'unknown') break;
    await new Promise(resolve => setTimeout(resolve, 250));
  }

  if (after !== '124055') {
    return `the balance came back as ${after || '(nothing)'} rather than 124055`;
  }

  // §4.2: no ordinary transaction was written to make that true.
  await openRegister(window);
  const invented = await window.webContents.executeJavaScript(
    `(() => {
      const rows = [...document.querySelectorAll('[data-ayq-table="register"] tbody tr')];
      return rows.filter(one => /starting balance/i.test(one.innerText)).length;
    })()`,
  );
  if (Number(invented) > 0) {
    return 'a balancing transaction was written into the ledger';
  }

  process.stdout.write(
    '[ayq-smoke] balance: set to 124055 cents on 2026-06-30, exactly, ' +
      'and nothing was added to the ledger\n',
  );
  return '';
}

/**
 * Settings → About, and the privacy contract on the copy button (12).
 *
 * The packaged build is the only place the build stamp is real, so this is the
 * only place it can be checked. What is read is the drawn screen: the version,
 * the build number, the author, the copyright, a shortened revision and a
 * human-readable date on the screen (04 A35), no technical-information dump on
 * the screen (06 §3.7), and — through the real button and the real clipboard —
 * copied text that carries the full revision, the ISO timestamp and the safe
 * fields and none of the forbidden ones (§12.4).
 */
async function aboutShown(window: BrowserWindow): Promise<string> {
  if (!(await openDestination(window, 'settings'))) {
    return 'Settings never opened';
  }

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const pressed = await window.webContents.executeJavaScript(
      `(() => {
        const tab = document.querySelector('[data-ayq-screen-tab="about"]');
        if (!tab) return false;
        tab.click();
        return true;
      })()`,
    );
    if (pressed === true) break;
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  let seen: Record<string, string> = {};
  while (Date.now() < deadline) {
    seen = JSON.parse(
      String(
        await window.webContents.executeJavaScript(`(() => {
          const said = {};
          for (const one of document.querySelectorAll('[data-ayq-about]')) {
            said[one.dataset.ayqAbout] = one.innerText.trim();
          }
          said.dumps = String(
            document.querySelectorAll(
              '[data-ayq-about-screen] pre, [data-ayq-technical]',
            ).length,
          );
          said.screen = (
            document.querySelector('[data-ayq-about-screen]') || { innerText: '' }
          ).innerText;
          return JSON.stringify(said);
        })()`),
      ),
    ) as Record<string, string>;
    if (seen.version !== undefined) break;
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  if (seen.version === undefined) return 'the About tab drew nothing';

  // 06 §3.6, checked against what the manifest says rather than against a
  // number written here. A check that carries its own expectation stops being a
  // gate the moment the version moves: it goes red on a correct build and green
  // on whatever it was last edited to. CI passes the expectation in; without
  // one, the drawn value is compared with the constant the build baked in,
  // which still proves About is wired to it.
  const compiled = ayqCompiledIdentity();
  const expectedVersion =
    process.env.AYQ_EXPECT_VERSION ?? compiled.productVersion;
  const expectedBuild = process.env.AYQ_EXPECT_BUILD ?? compiled.buildNumber;
  if (seen.version !== expectedVersion) {
    return `About says version ${seen.version}, expected ${expectedVersion}`;
  }
  if (seen.build !== expectedBuild) {
    return `About says build ${seen.build}, expected ${expectedBuild}`;
  }
  if (seen.author !== 'Plamen Alexandrov') return `About says author ${seen.author}`;
  if (seen.copyright !== '\u00a9 2026 Plamen Alexandrov. All rights reserved.') {
    return `About says copyright ${seen.copyright}`;
  }
  if (seen.engine !== 'Actual Budget 26.9.0') return `About says engine ${seen.engine}`;
  if (seen.baseline !== 'db1b0ea9') return `About says baseline ${seen.baseline}`;
  if (!/^Windows x64$/.test(seen.architecture ?? '')) {
    return `About says architecture ${seen.architecture}`;
  }
  // A real revision, from git, in a packaged build (§12.2), shortened on the
  // screen (04 A35).
  if (!/^[0-9a-f]{7,12}$/.test(seen.revision ?? '')) {
    return `About says revision ${seen.revision || '(nothing)'}`;
  }
  // And a real date, not a placeholder, in the form a person reads.
  if (!/\d{4}/.test(seen['build-date'] ?? '') || /T\d{2}:\d{2}/.test(seen['build-date'] ?? '')) {
    return `About says build date ${seen['build-date'] || '(nothing)'}`;
  }
  if (seen.development !== undefined) {
    return 'a packaged build reports itself as a development build';
  }
  // AYQ proprietary, Actual Budget under MIT, and never AYQ under MIT (06 §9).
  if (!/proprietary/.test(seen.licence ?? '')) return `About says licence ${seen.licence}`;
  if (!/Actual Budget.*MIT/.test(seen.upstream ?? '')) {
    return `About says of Actual Budget ${seen.upstream}`;
  }
  if (/AYQ is (released|licensed) under the MIT/i.test(seen.screen ?? '')) {
    return 'About says AYQ is MIT-licensed';
  }
  // 06 §3.7: the copied text is not also a permanent block on the screen.
  if (seen.dumps !== '0') return 'About prints the technical information on the screen';

  // The copy, through the button a person presses and the clipboard they paste
  // from. What is read back is what they would paste.
  clipboard.writeText('');
  const copiedAt = await window.webContents.executeJavaScript(
    `(() => {
      const button = document.querySelector('[data-ayq-action="about-copy"]');
      if (!button) return false;
      button.click();
      return true;
    })()`,
  );
  if (copiedAt !== true) return 'About has no Copy technical information';
  let technical = '';
  let confirmed = '';
  const copyDeadline = Date.now() + 10_000;
  while (Date.now() < copyDeadline) {
    technical = clipboard.readText();
    confirmed = String(
      await window.webContents.executeJavaScript(
        `(document.querySelector('[data-ayq-about-copied]') || { innerText: '' }).innerText`,
      ),
    ).trim();
    if (technical !== '' && confirmed !== '') break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (technical === '') return 'Copy technical information put nothing on the clipboard';
  if (confirmed === '') return 'copying said nothing';
  if ((seen.screen ?? '').includes(technical.split('\n')[0])) {
    return 'the copied text is also on the screen';
  }
  const fullRevision = /^AYQ revision\s*: ([0-9a-f]{40})$/m.exec(technical)?.[1] ?? '';
  if (!fullRevision.startsWith(seen.revision ?? '-')) {
    return `the copy carries revision ${fullRevision || '(none)'} for ${seen.revision}`;
  }
  if (!/^Build date\s*: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/m.test(technical)) {
    return 'the copy leaves out the ISO build timestamp';
  }
  for (const wanted of [
    expectedVersion,
    expectedBuild,
    'db1b0ea9',
    'Actual Budget 26.9.0',
    fullRevision,
  ]) {
    if (!technical.includes(wanted)) {
      return `the technical information leaves out ${wanted}`;
    }
  }
  // §12.4: nothing about the money, and nothing about the machine.
  for (const forbidden of [
    dataDir,
    'AppData',
    'C:\\\\Users',
    'ayq-budget',
    'ayq-store',
    'Groceries',
    'NL00TEST',
    'TESTMARKT',
  ]) {
    if (technical.includes(forbidden)) {
      return `the technical information carries ${forbidden}`;
    }
  }

  process.stdout.write(
    `[ayq-smoke] about: ${seen.version} build ${seen.build}, ${seen.revision}, ` +
      `${seen['build-date']}, ${seen.architecture}; copied ${fullRevision}\n`,
  );
  return '';
}

/**
 * Settings → Data & Backup, end to end (04 A38; 03 §12; 030 §5).
 *
 * Both halves of the state are given a value a person could see — a
 * counterparty's name in the AYQ store, a category's plan in the Actual budget
 * — and a backup is made through the window's own button. Both are changed.
 * Then two sets that must never be restored are offered through the same
 * request the window sends: one mixing a store from another backup, and one
 * sealed correctly but written by a newer AYQ. Each has to be refused with the
 * state exactly as it was. Last, the real backup is restored through the
 * window, confirmation and all, and both halves have to be back.
 *
 * The two refused sets are built here, in the host, beside the real ones. That
 * is the acceptance run standing in for somebody who copied files around by
 * hand; the application itself never writes a set anywhere but through the
 * engine.
 */
async function backupShown(window: BrowserWindow): Promise<string> {
  let counter = 0;
  const engineAsk = async <K extends keyof AyqResults>(
    body: AyqRequestBody & { kind: K },
  ): Promise<AyqResults[K]> => {
    counter += 1;
    const answer = await ask({ ...body, id: `smoke-backup-${counter}` } as AyqRequest);
    if (!answer.ok) {
      throw new Error(`${body.kind}: ${answer.code} (${answer.detail})`);
    }
    return answer.result as AyqResults[K];
  };
  const storeHash = (): string =>
    createHash('sha256')
      .update(readFileSync(join(dataDir, 'ayq-store.json')))
      .digest('hex');

  const listed = await engineAsk({ kind: 'counterparties.list' });
  const key = listed.rows[0]?.key;
  if (key === undefined) return 'the budget has no counterparty to name';
  const category = (await engineAsk({ kind: 'categories.list' })).find(
    one => !one.isIncome,
  );
  if (category === undefined) return 'the budget has no expense category';
  const month = new Date().toISOString().slice(0, 7);

  const facts = async (): Promise<string> => {
    const summary = await engineAsk({ kind: 'summary' });
    const names = await engineAsk({ kind: 'counterparties.list' });
    const plan = await engineAsk({ kind: 'budget.month', month });
    return JSON.stringify({
      transactions: summary.transactionCount,
      name: names.rows.find(one => one.key === key)?.name,
      plan: plan.categories.find(one => one.categoryId === category.id)?.planCents,
    });
  };

  await engineAsk({
    kind: 'counterparty.setName',
    counterpartyKey: key,
    displayName: 'Backed-up name',
  });
  await engineAsk({
    kind: 'budget.setPlan',
    month,
    categoryId: category.id,
    cents: 12_300,
  });
  const before = await facts();

  // Create backup now, pressed on the screen.
  if (!(await openDestination(window, 'settings'))) return 'Settings never opened';
  const openTab = async (): Promise<boolean> => {
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      const there = await window.webContents.executeJavaScript(`(() => {
        const tab = document.querySelector('[data-ayq-screen-tab="backup"]');
        if (tab) tab.click();
        return !!document.querySelector('[data-ayq-backup-screen]');
      })()`);
      if (there === true) return true;
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    return false;
  };
  if (!(await openTab())) return 'the Data & Backup tab never drew';

  const waitFor = async (selector: string): Promise<string | null> => {
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      const said = await window.webContents.executeJavaScript(
        `(document.querySelector('${selector}') || {}).textContent ?? null`,
      );
      if (typeof said === 'string') return said;
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    return null;
  };

  await window.webContents.executeJavaScript(
    `document.querySelector('[data-ayq-action="backup-now"]')?.click(); true`,
  );
  if ((await waitFor('[data-ayq-backup-said="done"]')) === null) {
    return 'Create backup now said nothing, or said it failed';
  }
  const made = await engineAsk({ kind: 'backup.overview' });
  const backupId = made.latestBackupId;
  const first = made.backups.find(one => one.backupId === backupId);
  if (backupId === null || first?.trigger !== 'manual') {
    return 'the button made no backup of its own';
  }
  if (made.lastAttempt?.outcome !== 'succeeded') return 'the last attempt is not recorded';

  // Both halves change.
  await engineAsk({
    kind: 'counterparty.setName',
    counterpartyKey: key,
    displayName: 'Changed name',
  });
  await engineAsk({
    kind: 'budget.setPlan',
    month,
    categoryId: category.id,
    cents: 45_600,
  });
  const after = await facts();
  if (after === before) return 'changing the state changed nothing';

  // A second backup, of the changed state, to take parts from.
  const second = await engineAsk({ kind: 'backup.create' });
  if (second.outcome !== 'created') return 'a second backup could not be made';
  const backups = ayqBackupsDir(dataDir);
  const manifestOf = (id: string): AyqBackupManifest =>
    JSON.parse(readFileSync(join(backups, id, 'manifest.json'), 'utf8')) as AyqBackupManifest;
  const hash = (file: string): { bytes: number; sha256: string } => {
    const bytes = readFileSync(file);
    return { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  };

  // Mixed: the second backup, carrying the first backup's store.
  const mixedId = second.backupId.replace(/-[a-z0-9]{6}$/, '-mixed1');
  cpSync(join(backups, second.backupId), join(backups, mixedId), { recursive: true });
  cpSync(join(backups, backupId, 'ayq-store.json'), join(backups, mixedId, 'ayq-store.json'));
  const mixed = manifestOf(second.backupId);
  mixed.backupId = mixedId;
  mixed.digest = ayqManifestDigest(mixedId, mixed.createdAt, mixed.files);
  writeFileSync(join(backups, mixedId, 'manifest.json'), JSON.stringify(mixed, null, 2));

  // Newer: sealed correctly in every respect except that a newer AYQ wrote it.
  const newerId = second.backupId.replace(/-[a-z0-9]{6}$/, '-newer1');
  cpSync(join(backups, second.backupId), join(backups, newerId), { recursive: true });
  const newerStore = JSON.parse(
    readFileSync(join(backups, newerId, 'ayq-store.json'), 'utf8'),
  ) as { version: number };
  newerStore.version += 1;
  writeFileSync(join(backups, newerId, 'ayq-store.json'), JSON.stringify(newerStore, null, 2));
  const newer = manifestOf(second.backupId);
  newer.backupId = newerId;
  newer.storeVersion = newerStore.version;
  newer.files = newer.files.map(one => ({
    path: one.path,
    ...hash(join(backups, newerId, ...one.path.split('/'))),
  }));
  newer.digest = ayqManifestDigest(newerId, newer.createdAt, newer.files);
  writeFileSync(join(backups, newerId, 'manifest.json'), JSON.stringify(newer, null, 2));

  for (const [id, expected] of [
    [mixedId, 'mismatch'],
    [newerId, 'newer-store'],
  ] as const) {
    const storeBefore = storeHash();
    const refused = await engineAsk({ kind: 'backup.restore', backupId: id });
    if (refused.outcome !== 'refused' || refused.refusal !== expected) {
      return `the ${expected} set was not refused as ${expected}: ${JSON.stringify(refused.outcome === 'refused' ? refused.refusal : refused.outcome)}`;
    }
    if ((await facts()) !== after) return `refusing the ${expected} set changed the state`;
    if (storeHash() !== storeBefore) return `refusing the ${expected} set rewrote the store`;
    if (existsSync(join(dataDir, '.ayq-restore'))) return `refusing the ${expected} set began a restore`;
  }

  // Restore the first backup through the window, confirmed.
  await openDestination(window, 'today');
  await openDestination(window, 'settings');
  if (!(await openTab())) return 'the Data & Backup tab never drew again';
  const pressed = await window.webContents.executeJavaScript(`(() => {
    const row = document.querySelector('[data-ayq-row="${backupId}"]');
    const restore = row && row.querySelector('[data-ayq-action="backup-restore"]');
    if (!restore) return false;
    restore.click();
    return true;
  })()`);
  if (pressed !== true) return 'the first backup offers no restore';
  if ((await waitFor('[data-ayq-backup-confirm]')) === null) {
    return 'restoring did not ask first';
  }
  await window.webContents.executeJavaScript(
    `document.querySelector('[data-ayq-action="backup-restore-go"]')?.click(); true`,
  );
  if ((await waitFor('[data-ayq-backup-said="done"]')) === null) {
    return 'the restore said nothing, or said it did not happen';
  }
  const restored = await facts();
  if (restored !== before) {
    return `the restore brought back ${restored}, expected ${before}`;
  }
  const kept = (await engineAsk({ kind: 'backup.overview' })).backups.some(
    one => one.trigger === 'before-restore',
  );
  if (!kept) return 'what the restore replaced was not kept';

  process.stdout.write(
    `[ayq-smoke] backup: made ${backupId}; refused mixed and newer with the state ` +
      `intact; restored ${before}\n`,
  );
  return '';
}

/**
 * The strict detector and the Plan's historical suggestions, on the window
 * (9 §9.1, 10 §10.3).
 *
 * Upcoming is asked to suggest, and only the series that qualify may appear.
 * Then Plan is asked what history suggests, and the suggestion has to state the
 * basis it rests on and has to stay out of the Planned column until somebody
 * presses the control that puts it there.
 */
async function suggestionsShown(window: BrowserWindow): Promise<string> {
  if (!(await openUpcoming(window))) return 'Upcoming never opened';

  await window.webContents.executeJavaScript(
    `document.querySelector('[data-ayq-action="plan-suggest"]')?.click(); true`,
  );

  const deadline = Date.now() + 60_000;
  let offered: string[] = [];
  while (Date.now() < deadline) {
    offered = JSON.parse(
      String(
        await window.webContents.executeJavaScript(`(() => {
          const rows = [...document.querySelectorAll(
            '[data-ayq-table="upcoming"] tbody tr')];
          return JSON.stringify(rows.map(
            one => one.innerText.replace(/\\s+/g, ' ').trim()));
        })()`),
      ),
    ) as string[];
    if (offered.length > 0) break;
    await new Promise(resolve => setTimeout(resolve, 250));
  }

  const said = offered.join(' | ');
  process.stdout.write(`[ayq-smoke] upcoming: ${offered.length} rows\n`);

  // The two that qualify, and none of the four that must not.
  for (const wanted of ['9.99', '4.99']) {
    if (!said.includes(wanted)) {
      return `the exact monthly series of ${wanted} was not offered`;
    }
  }
  for (const [what, figure] of [
    ['the supermarket', '47.31'],
    ['the fuel on no rhythm', '60.00'],
    ['the bill a cent apart', '61.90'],
    ['the irregular mandate', '42.00'],
    ['the one-off purchase', '89.00'],
  ] as Array<[string, string]>) {
    if (said.includes(figure)) return `${what} was offered as an expectation`;
  }

  process.stdout.write(
    '[ayq-smoke] upcoming: only the exact, regular series were offered\n',
  );

  // And the Plan's own suggestions.
  if (!(await openDestination(window, 'plan'))) return 'Plan never opened';

  let plan: { suggested: string | null; months: string | null; basis: string } = {
    suggested: null,
    months: null,
    basis: '',
  };
  while (Date.now() < deadline) {
    plan = JSON.parse(
      String(
        await window.webContents.executeJavaScript(`(() => {
          const cell = document.querySelector('[data-ayq-suggestion]:not([data-ayq-suggestion="none"])');
          const basis = document.querySelector('[data-ayq-plan-basis]');
          return JSON.stringify({
            suggested: cell ? cell.dataset.ayqSuggestion : null,
            months: cell ? cell.dataset.ayqSuggestionMonths : null,
            basis: basis ? basis.innerText.replace(/\\s+/g, ' ').trim() : '',
          });
        })()`),
      ),
    ) as typeof plan;
    if (plan.basis !== '') break;
    await new Promise(resolve => setTimeout(resolve, 250));
  }

  if (plan.basis === '') return 'the Plan says nothing about what it suggests from';
  process.stdout.write(
    `[ayq-smoke] plan: suggestion ${plan.suggested ?? '(none)'} from ` +
      `${plan.months ?? '0'} months; basis: ${plan.basis.slice(0, 120)}\n`,
  );

  // Whatever the basis is, it has to be stated rather than implied — a figure
  // a person cannot check is a figure they cannot use.
  if (!/complete/.test(plan.basis)) {
    return 'the Plan does not say how many complete months it averaged';
  }

  return '';
}

/**
 * Reports, and the route from it (04 A32; 03 §7.26).
 *
 * Two things are checked on the packaged window. Reports draws the engine's
 * spending answer as a table with one row per category, Uncategorised among
 * them. And choosing a row opens the Register with the same filter actually
 * applied: the chip is on the screen and the Register's own count is the count
 * Reports stated for that row — the real filter, not a claim of one.
 */
async function reportsShown(window: BrowserWindow): Promise<string> {
  if (!(await openDestination(window, 'reports'))) {
    return 'the Reports destination never opened';
  }

  // The period opens on the last three months; the fixture's statement may
  // be older than that, so the whole budget is asked for, the way a person
  // would by choosing it.
  const periodSet = async (): Promise<boolean> =>
    (await window.webContents.executeJavaScript(`(() => {
      const period = document.querySelector('[data-ayq-reports-period]');
      if (!period) return false;
      if (period.value !== 'allTime') {
        period.value = 'allTime';
        period.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return true;
    })()`)) === true;
  const periodBy = Date.now() + 30_000;
  while (Date.now() < periodBy && !(await periodSet())) {
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  const drawn = async (): Promise<boolean> =>
    (await window.webContents.executeJavaScript(
      'document.querySelectorAll(\'[data-ayq-table="reports"] tbody tr\').length > 0',
    )) === true;
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline && !(await drawn())) {
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  if (!(await drawn()))
    {return 'Reports drew no category rows on a budget that holds transactions';}

  const seen = JSON.parse(
    String(
      await window.webContents.executeJavaScript(`(() => {
        const screen = document.querySelector('[data-ayq-screen="reports"]');
        const rows = [...screen.querySelectorAll('[data-ayq-table="reports"] tbody tr')];
        const first = rows[0];
        return JSON.stringify({
          figures: screen.querySelectorAll('[data-ayq-figure]').length,
          tables: screen.querySelectorAll('[data-ayq-table]').length,
          chips: screen.querySelectorAll('[data-ayq-state]').length,
          charts: screen.querySelectorAll('canvas, svg').length,
          rows: rows.length,
          totals: !!screen.querySelector('[data-ayq-reports-totals]'),
          firstCategory: first.querySelector('[data-ayq-report-category]')?.getAttribute('data-ayq-report-category') ?? null,
          firstUncategorised: !!first.querySelector('[data-ayq-state="uncategorised"]'),
          firstCount: Number(first.querySelector('[data-ayq-report-transactions]')?.getAttribute('data-ayq-report-transactions') ?? -1),
        });
      })()`),
    ),
  ) as {
    figures: number;
    tables: number;
    chips: number;
    charts: number;
    rows: number;
    totals: boolean;
    firstCategory: string | null;
    firstUncategorised: boolean;
    firstCount: number;
  };

  process.stdout.write(
    `[ayq-smoke] reports: ${seen.figures} figures, ${seen.tables} tables, ` +
      `${seen.chips} chips, ${seen.charts} charts, ${seen.rows} category rows\n`,
  );
  if (!seen.totals) return 'Reports does not state income, expenses and net';
  if (seen.firstCount < 0)
    {return 'a Reports row does not state how many transactions it counts';}

  // The route: the first row opens the Register with that filter applied.
  await window.webContents.executeJavaScript(
    'document.querySelector(\'[data-ayq-table="reports"] tbody tr\').click(); true',
  );
  const chip = seen.firstUncategorised ? 'uncategorised' : 'category';
  const arrived = async (): Promise<boolean> =>
    (await window.webContents.executeJavaScript(
      `!!document.querySelector('[data-ayq-screen="register"] [data-ayq-filter="${chip}"]')` +
        ' && document.body.dataset.ayqLedgerRows !== undefined',
    )) === true;
  const until = Date.now() + 30_000;
  while (Date.now() < until && !(await arrived())) {
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  if (!(await arrived())) {
    return `choosing a category did not open the Register with a ${chip} filter shown`;
  }
  const settled = async (): Promise<number> =>
    Number(
      await window.webContents.executeJavaScript(
        'Number(document.body.dataset.ayqLedgerTotal ?? -1)',
      ),
    );
  let total = await settled();
  const wait = Date.now() + 30_000;
  while (Date.now() < wait && total < seen.firstCount) {
    await new Promise(resolve => setTimeout(resolve, 200));
    total = await settled();
  }
  process.stdout.write(
    `[ayq-smoke] reports: the Register opened on ${chip} with ${total} rows; Reports said ${seen.firstCount}\n`,
  );
  // Reports counts the expense transactions behind a category (its figures
  // are magnitudes); the Register's category filter holds every transaction in
  // it, whichever way the money went. So the Register may hold more, never
  // fewer: fewer would mean the filter that opened is not the one Reports named.
  if (total < seen.firstCount) {
    return 'the Register filter reached from Reports is not the filter Reports stated';
  }
  // Leave the Register as it was found: what runs after this reads it whole.
  await window.webContents.executeJavaScript(
    "document.querySelector('[data-ayq-action=\"clear-filters\"]')?.click(); true",
  );
  const cleared = async (): Promise<boolean> =>
    (await window.webContents.executeJavaScript(
      "!document.querySelector('[data-ayq-screen=\"register\"] [data-ayq-filter]')",
    )) === true;
  const clearBy = Date.now() + 30_000;
  while (Date.now() < clearBy && !(await cleared())) {
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  return '';
}

/**
 * Review and the two decisions of 03 §4.1, proved end to end on the window.
 *
 * The one thing a screen here must never do is make one decision look like the
 * other. So this does both, in order, and checks the *consequence* rather than
 * the button: filing a counterparty is followed by opening Settings → Rules and
 * requiring it to hold nothing, and learning a rule for the next one is followed
 * by requiring that rule to be there, keyed on that counterparty.
 *
 * Nothing about the wording decides any of it. A screen that had one control
 * doing both would pass a check that read labels and fail this one.
 */
/**
 * Gathering rows in the Register, and what the bar over them says (04 A36).
 *
 * Two rows are ticked and the bar is required to state that count, to say
 * that it is a count of rows shown, and — with no filter on — to offer no
 * "whole filter" scope at all, which is 03 §4.8 on the window. A category is
 * then chosen and applied, and what is read back is the *table*, redrawn from
 * the engine's answer: the two rows carry the category, the bar is gone, and
 * the outcome names the count that changed. Nothing here presses a control
 * that could learn a rule, because the bar has none.
 */
async function bulkShown(window: BrowserWindow): Promise<string> {
  await openRegister(window);

  const rows = JSON.parse(
    String(
      await window.webContents.executeJavaScript(`(() => {
        const rows = [...document.querySelectorAll('[data-ayq-table="register"] tbody tr')];
        return JSON.stringify(rows.slice(0, 3).map(row => row.getAttribute('data-ayq-row') || ''));
      })()`),
    ),
  ) as string[];
  if (rows.length < 3) return `the Register shows ${rows.length} rows, and this check needs three`;

  const [first, second] = rows;
  const tick = async (id: string): Promise<boolean> =>
    (await window.webContents.executeJavaScript(`(() => {
      const box = document.querySelector('[data-ayq-select-row="${id}"]');
      if (!box) return false;
      box.click();
      return true;
    })()`)) === true;
  if (!(await tick(first)) || !(await tick(second))) {
    return 'the rows offer nothing to tick';
  }

  const bar = async (): Promise<{
    there: boolean;
    count: string;
    basis: string;
    scopeOffered: boolean;
    detailOpened: boolean;
  }> =>
    JSON.parse(
      String(
        await window.webContents.executeJavaScript(`(() => {
          const bar = document.querySelector('[data-ayq-bulk]');
          return JSON.stringify({
            there: !!bar,
            count: bar ? (bar.querySelector('[data-ayq-bulk-count]') || {}).innerText || '' : '',
            basis: bar ? (bar.querySelector('[data-ayq-bulk-basis]') || {}).getAttribute('data-ayq-bulk-basis') || '' : '',
            scopeOffered: !!document.querySelector('[data-ayq-action="bulk-scope"]'),
            detailOpened: !!document.querySelector('[data-ayq-detail]'),
          });
        })()`),
      ),
    );
  const stated = await bar();
  if (!stated.there) return 'two rows are ticked and there is no bar over them';
  if (!/^2 /.test(stated.count)) return `the bar says "${stated.count}" for two ticked rows`;
  if (stated.basis !== 'shown') return `the bar claims a "${stated.basis}" scope for a tick`;
  if (stated.scopeOffered) return 'with no filter on, the bar still offers the whole filter as a scope (03 §4.8)';
  if (stated.detailOpened) return 'ticking a row opened it';

  // Set category: the scope is stated by the engine first, then applied.
  const opened = await window.webContents.executeJavaScript(`(() => {
    const button = document.querySelector('[data-ayq-action="bulk-category"]');
    if (!button) return false;
    button.click();
    return true;
  })()`);
  if (opened !== true) return 'the bar offers no category action';

  let by = Date.now() + 60_000;
  let ready = false;
  while (Date.now() < by && !ready) {
    ready =
      (await window.webContents.executeJavaScript(`(() => {
        const apply = document.querySelector('[data-ayq-action="bulk-category-apply"]');
        return !!apply && !apply.disabled;
      })()`)) === true;
    if (!ready) await new Promise(resolve => setTimeout(resolve, 200));
  }
  if (!ready) return 'the scope was never stated, so the decision could not be made';

  const chosen = String(
    await window.webContents.executeJavaScript(`(() => {
      const select = document.querySelector('[data-ayq-bulk-category-choice]');
      if (!select) return '';
      const option = [...select.options].find(one => one.value !== '');
      if (!option) return '';
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(select), 'value');
      if (setter && setter.set) setter.set.call(select, option.value);
      else select.value = option.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return option.textContent || '';
    })()`),
  );
  if (chosen === '') return 'no category to file into';

  const pressed = await window.webContents.executeJavaScript(`(() => {
    const apply = document.querySelector('[data-ayq-action="bulk-category-apply"]');
    if (!apply) return false;
    apply.click();
    return true;
  })()`);
  if (pressed !== true) return 'the apply button went away before it was pressed';

  by = Date.now() + 60_000;
  let said = '';
  while (Date.now() < by && said === '') {
    said = String(
      await window.webContents.executeJavaScript(
        "(document.querySelector('[data-ayq-bulk-outcome]') || {}).innerText || ''",
      ),
    );
    if (said === '') await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (said === '') {
    const problem = await problemShown(window);
    return `nothing came back${problem === '' ? '' : ` — the screen said: ${problem}`}`;
  }
  process.stdout.write(`[ayq-smoke] bulk filed as ${chosen}: ${said}\n`);
  if (!/^2 filed/.test(said)) return `the outcome says "${said}" for two rows`;

  // The table, redrawn from the engine's answer, and not the control.
  by = Date.now() + 60_000;
  let shown: string[] = [];
  while (Date.now() < by) {
    shown = JSON.parse(
      String(
        await window.webContents.executeJavaScript(`(() => {
          return JSON.stringify([${JSON.stringify(first)}, ${JSON.stringify(second)}].map(id => {
            const cell = document.querySelector(
              '[data-ayq-table="register"] tbody tr[data-ayq-row="' + id + '"] [data-ayq-cell="category"]');
            return cell ? cell.innerText.trim() : '';
          }));
        })()`),
      ),
    ) as string[];
    if (shown.every(one => one === chosen)) break;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (!shown.every(one => one === chosen)) {
    return `the two rows read ${JSON.stringify(shown)} after filing as ${chosen}`;
  }
  const after = await bar();
  if (after.there) return 'the decision was made and the bar is still claiming a selection';

  // Left ticked on the way out, so the capture at the end shows the bar.
  await tick(rows[2]);
  return '';
}

async function reviewShown(window: BrowserWindow): Promise<string> {
  if (!(await openDestination(window, 'review'))) {
    return 'the Review destination never opened';
  }

  const drawn = async (): Promise<boolean> =>
    (await window.webContents.executeJavaScript(
      "!!document.querySelector('[data-ayq-table=\"review\"] tbody tr')",
    )) === true;
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline && !(await drawn())) {
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (!(await drawn())) return 'Review drew no backlog to work through';

  const backlog = Number(
    await window.webContents.executeJavaScript(
      "Number(document.querySelector('[data-ayq-backlog]')?.getAttribute('data-ayq-backlog') ?? -1)",
    ),
  );
  if (backlog < 2) {
    return `Review lists ${backlog} counterparties, and this check needs two`;
  }

  /** Back to Review, drawn. Reading the rules takes the window to Settings. */
  const toReview = async (): Promise<boolean> => {
    if (!(await openDestination(window, 'review'))) return false;
    const by = Date.now() + 60_000;
    while (Date.now() < by && !(await drawn())) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    return drawn();
  };

  /** Opens the nth row of the backlog and waits for its pane. */
  const open = async (nth: number): Promise<string> => {
    if (!(await toReview())) return '';
    const key = String(
      await window.webContents.executeJavaScript(`(() => {
        const rows = [...document.querySelectorAll('[data-ayq-table="review"] tbody tr')];
        const row = rows[${nth}];
        if (!row) return '';
        row.click();
        return row.getAttribute('data-ayq-row') || '';
      })()`),
    );
    if (key === '') return '';
    const by = Date.now() + 30_000;
    while (
      Date.now() < by &&
      (await window.webContents.executeJavaScript(
        "!!document.querySelector('[data-ayq-file]')",
      )) !== true
    ) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    return key;
  };

  /** Chooses a category and presses one of the two, then waits for the answer. */
  const decide = async (action: string): Promise<string> => {
    const chose = String(
      await window.webContents.executeJavaScript(`(() => {
        const select = document.querySelector('[data-ayq-review-category]');
        if (!select) return 'no category picker';
        const option = [...select.options].find(one => one.value !== '');
        if (!option) return 'no category to file into';
        const setter = Object.getOwnPropertyDescriptor(
          Object.getPrototypeOf(select), 'value');
        if (setter && setter.set) setter.set.call(select, option.value);
        else select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        return option.textContent || 'chosen';
      })()`),
    );
    if (chose === 'no category picker' || chose === 'no category to file into') {
      return chose;
    }

    const pressed = await window.webContents.executeJavaScript(`(() => {
      const button = document.querySelector('[data-ayq-action="${action}"]');
      if (!button) return false;
      button.click();
      return true;
    })()`);
    if (pressed !== true) return `the pane has no ${action}`;

    const by = Date.now() + 60_000;
    let said = '';
    while (Date.now() < by && said === '') {
      said = String(
        await window.webContents.executeJavaScript(
          "(document.querySelector('[data-ayq-outcome]') || {}).innerText || ''",
        ),
      );
      if (said === '') await new Promise(resolve => setTimeout(resolve, 250));
    }
    if (said === '') {
      const problem = await problemShown(window);
      return `nothing came back${problem === '' ? '' : ` — the screen said: ${problem}`}`;
    }
    return said;
  };

  /** The rules Settings holds, by the counterparty each is keyed on. */
  const rulesHeld = async (): Promise<string[]> => {
    await window.webContents.executeJavaScript(
      'document.querySelector(\'[data-ayq-tab="settings"]\').click(); true',
    );
    const by = Date.now() + 30_000;
    while (
      Date.now() < by &&
      (await window.webContents.executeJavaScript(
        "!!document.querySelector('[data-ayq-screen-tab=\"rules\"]')",
      )) !== true
    ) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    await window.webContents.executeJavaScript(
      'document.querySelector(\'[data-ayq-screen-tab="rules"]\').click(); true',
    );
    const listed = Date.now() + 30_000;
    while (
      Date.now() < listed &&
      (await window.webContents.executeJavaScript(
        "!!document.querySelector('[data-ayq-rules]')",
      )) !== true
    ) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    return JSON.parse(
      String(
        await window.webContents.executeJavaScript(`(() => {
          const rows = [...document.querySelectorAll('[data-ayq-table="rules"] tbody tr')];
          return JSON.stringify(rows.map(row => {
            const cell = row.querySelector('[data-ayq-cell="counterparty"]');
            return cell ? cell.innerText.trim() : '';
          }));
        })()`),
      ),
    ) as string[];
  };

  const before = await rulesHeld();
  if (before.length !== 0) {
    return `Review starts with ${before.length} rules already learned, so this proves nothing`;
  }

  // Filing, which is a statement about the transactions in front of a person.
  const firstKey = await open(0);
  if (firstKey === '') return 'the backlog had no row to open';
  const scopes = JSON.parse(
    String(
      await window.webContents.executeJavaScript(`(() => {
        const block = document.querySelector('[data-ayq-file]');
        return JSON.stringify({
          actions: block
            ? [...block.querySelectorAll('[data-ayq-action]')].map(one =>
                one.getAttribute('data-ayq-action'))
            : [],
          said: block ? block.innerText.replace(/\\s+/g, ' ').trim() : '',
        });
      })()`),
    ),
  ) as { actions: string[]; said: string };

  if (!scopes.actions.includes('review-file')) {
    return 'Review offers no way to file a counterparty without learning a rule';
  }
  if (!scopes.actions.includes('review-learn')) {
    return 'Review offers no way to learn a rule';
  }
  if (!/from now on/.test(scopes.said)) {
    return 'the screen does not say what learning a rule reaches (03 §4.1)';
  }

  const filed = await decide('review-file');
  process.stdout.write(`[ayq-smoke] review filed ${firstKey}: ${filed}\n`);
  if (/^no |^the pane has no|^nothing came back/.test(filed)) return filed;

  // The assertion that the two are different decisions: nothing was learned.
  const afterFiling = await rulesHeld();
  if (afterFiling.length !== 0) {
    return `filing a counterparty learned ${afterFiling.length} rules as well (03 §4.1)`;
  }

  // Learning, which is a statement about every one that arrives from now on.
  const secondKey = await open(0);
  if (secondKey === '') return 'nothing was left in the backlog to learn from';
  const learned = await decide('review-learn');
  process.stdout.write(`[ayq-smoke] review learned ${secondKey}: ${learned}\n`);
  if (/^no |^the pane has no|^nothing came back/.test(learned)) return learned;

  const afterLearning = await rulesHeld();
  if (!afterLearning.includes(secondKey)) {
    return `learning a rule for ${secondKey} left the rules holding ${
      afterLearning.join(', ') || 'nothing'
    }`;
  }
  process.stdout.write(
    `[ayq-smoke] Settings holds the rule for ${afterLearning.join(', ')}\n`,
  );

  // 04 A7: visible, and reversible. Taking it away is offered and works —
  // through the card the rule is inspected on, which states what removal
  // does and does not do before the button that does it.
  const opened = await window.webContents.executeJavaScript(`(() => {
    const button = document.querySelector('[data-ayq-table="rules"] tbody tr [data-ayq-action^="rule-inspect-"]');
    if (!button) return false;
    button.click();
    return true;
  })()`);
  if (opened !== true) return 'a rule cannot be inspected where it is listed (04 A7)';
  const press = async (action: string): Promise<boolean> => {
    const by = Date.now() + 30_000;
    while (Date.now() < by) {
      const pressed = await window.webContents.executeJavaScript(`(() => {
        const button = document.querySelector('[data-ayq-rule-card] [data-ayq-action="${action}"]');
        if (!button || button.disabled) return false;
        button.click();
        return true;
      })()`);
      if (pressed === true) return true;
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    return false;
  };
  if (!(await press('rule-remove'))) return 'the rule card offers no removal (04 A7)';
  const consequence = await window.webContents.executeJavaScript(
    "document.querySelector('[data-ayq-rule-remove-consequence]')?.textContent ?? ''",
  );
  if (!/nothing is re-filed/.test(String(consequence))) {
    return 'removal does not say first that what the rule filed stays where it is';
  }
  if (!(await press('rule-remove-confirm'))) return 'a rule cannot be taken away (04 A7)';
  const gone = Date.now() + 30_000;
  let left = afterLearning.length;
  while (Date.now() < gone && left >= afterLearning.length) {
    left = Number(
      await window.webContents.executeJavaScript(
        "document.querySelectorAll('[data-ayq-table=\"rules\"] tbody tr').length",
      ),
    );
    if (left >= afterLearning.length) {
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }
  if (left >= afterLearning.length) return 'forgetting a rule changed nothing';

  // Settings → Categories: the only surface, and it says what it will not do.
  await window.webContents.executeJavaScript(
    'document.querySelector(\'[data-ayq-screen-tab="categories"]\').click(); true',
  );
  const cats = Date.now() + 30_000;
  while (
    Date.now() < cats &&
    (await window.webContents.executeJavaScript(
      "!!document.querySelector('[data-ayq-no-archive]')",
    )) !== true
  ) {
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  const categories = JSON.parse(
    String(
      await window.webContents.executeJavaScript(`(() => {
        const rows = document.querySelectorAll('[data-ayq-table="categories"] tbody tr');
        const consequence = document.querySelector('[data-ayq-category-consequence]');
        const archive = document.querySelector('[data-ayq-no-archive]');
        return JSON.stringify({
          rows: rows.length,
          consequence: consequence
            ? consequence.innerText.replace(/\\s+/g, ' ').trim()
            : '',
          archive: archive ? archive.innerText.replace(/\\s+/g, ' ').trim() : '',
        });
      })()`),
    ),
  ) as { rows: number; consequence: string; archive: string };

  if (categories.rows < 1) return 'Settings shows no categories at all';
  if (!/Renaming a category moves its rules/.test(categories.consequence)) {
    return 'Settings does not say what renaming a category does to the rules';
  }
  // 04 A35: removal is counted first and never silent, and the screen says so.
  if (!/never destroys or refiles anything in silence/.test(categories.archive)) {
    return 'Settings does not say what removing a category does and does not do';
  }
  process.stdout.write(
    `[ayq-smoke] Settings lists ${categories.rows} categories, and states both consequences\n`,
  );

  return '';
}

/**
 * Today, on the packaged application (04 A21).
 *
 * What is proved here: that available funds are first and are the largest
 * figure on the screen — measured, not asserted from the stylesheet; that the
 * reliability boundary is stated beside them rather than left to be inferred;
 * that every queue drawn has something in it and the total is the lines; and
 * that Import is reachable from here, where a person looks for it (A20).
 */
async function todayShown(window: BrowserWindow): Promise<string> {
  if (!(await openDestination(window, 'today'))) {
    return 'the Today destination never opened';
  }

  const drawn = async (): Promise<boolean> =>
    (await window.webContents.executeJavaScript(
      "!!document.querySelector('[data-ayq-available-funds]')",
    )) === true;
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline && !(await drawn())) {
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  if (!(await drawn())) return 'Today drew no available funds';

  const seen = JSON.parse(
    String(
      await window.webContents.executeJavaScript(`(() => {
        const screen = document.querySelector('[data-ayq-screen="today"]');
        const funds = screen.querySelector('[data-ayq-available-funds]');
        const figure = funds.querySelector('[data-ayq-figure]');
        const size = one => parseFloat(getComputedStyle(one).fontSize) || 0;
        const others = [...screen.querySelectorAll('[data-ayq-figure]')]
          .filter(one => one !== figure)
          .map(one => size(one));
        const coverage = screen.querySelector('[data-ayq-today-coverage]');
        const waiting = screen.querySelector('[data-ayq-waiting]');
        const lines = waiting
          ? [...waiting.querySelectorAll('li')].map(one =>
              (one.innerText || '').replace(/\\s+/g, ' ').trim())
          : [];
        const box = figure.getBoundingClientRect();
        const later = [...screen.querySelectorAll('[data-ayq-lowest], [data-ayq-month-end], [data-ayq-waiting]')]
          .map(one => one.getBoundingClientRect().top);
        return JSON.stringify({
          cents: funds.getAttribute('data-ayq-available-funds'),
          fundsSize: size(figure),
          largestOther: others.length === 0 ? 0 : Math.max(...others),
          fundsTop: box.top,
          laterTop: later.length === 0 ? null : Math.min(...later),
          coverage: coverage
            ? coverage.innerText.replace(/\\s+/g, ' ').trim()
            : null,
          imports: !!screen.querySelector('[data-ayq-action="today-import"]'),
          order: [...screen.querySelectorAll('[data-ayq-pane]')]
            .map(one => one.getAttribute('data-ayq-pane'))
            .filter(one => one && one.indexOf('today-') === 0),
          total: waiting ? waiting.dataset.ayqWaiting : null,
          lines,
        });
      })()`),
    ),
  ) as {
    cents: string;
    fundsSize: number;
    largestOther: number;
    fundsTop: number;
    laterTop: number | null;
    coverage: string | null;
    imports: boolean;
    order: string[];
    total: string | null;
    lines: string[];
  };

  process.stdout.write(
    `[ayq-smoke] today: funds ${seen.cents} cents at ${seen.fundsSize}px ` +
      `(next largest ${seen.largestOther}px), waiting ${seen.total ?? '(none)'}, ` +
      `boundary: ${seen.coverage ?? '(none)'}\n`,
  );

  // A21: available funds first, as the largest figure. Both halves are
  // measured on the drawn screen, because a rule about what a person sees
  // first is not proved by reading the stylesheet that was meant to do it.
  if (!(seen.fundsSize > seen.largestOther)) {
    return `available funds are ${seen.fundsSize}px and something else is ${seen.largestOther}px`;
  }
  if (seen.laterTop !== null && seen.fundsTop >= seen.laterTop) {
    return 'available funds are not the first thing on the screen';
  }

  // 03 §8.4: the boundary is stated here, in words, beside the money it
  // qualifies — not left for a person to go and find on another screen.
  if (seen.coverage === null || seen.coverage === '') {
    return 'Today states no reliability boundary';
  }
  if (!/Reliable to|has no statement|Nothing has been imported/i.test(seen.coverage)) {
    return `the line beside the money does not state coverage: ${seen.coverage}`;
  }

  // A20: Import is reachable from here.
  if (!seen.imports) return 'Import cannot be reached from Today';

  // A21 in its own words: available funds first, "the transaction list
  // follows", "queues come last". Prototype r009 put the queues above the list;
  // Canon governs, so the order is measured on the window rather than trusted
  // to the file that draws it.
  const wanted = [
    'today-funds',
    'today-lasts',
    'today-movements',
    'today-waiting',
  ];
  if (seen.order.join(',') !== wanted.join(',')) {
    return `Today is in the order ${seen.order.join(', ')}, and A21 asks for ${
      wanted.join(', ')
    }`;
  }

  // A5: a queue with nothing in it is not drawn as a line saying zero.
  if (seen.total === null) return 'Today draws no waiting list at all';
  if (seen.lines.some(line => /^0\b/.test(line))) {
    return `a queue with nothing in it was drawn anyway: ${seen.lines.join(' | ')}`;
  }
  const counts = seen.lines
    .map(line => Number(/^(\d+)\b/.exec(line)?.[1] ?? NaN))
    .filter(one => Number.isFinite(one));
  if (Number(seen.total) > 0) {
    const summed = counts.reduce((sum, one) => sum + one, 0);
    if (summed !== Number(seen.total)) {
      return `the waiting total says ${seen.total} and the lines come to ${summed}`;
    }
  } else if (!seen.lines.some(line => /Nothing is waiting/i.test(line))) {
    return 'an empty queue did not say that nothing is waiting';
  }

  return '';
}

/**
 * The Register, on a budget big enough for the question to be real.
 *
 * What is proved here: that the table draws, that what is being filtered is
 * visible and can be taken off in one action, that the totals say which set
 * they describe, that uncategorised is a state rather than a gap, that the
 * detail pane carries the evidence behind a row — and how long any of it
 * takes, measured by the screen itself rather than by a poll from outside.
 */
async function registerShown(window: BrowserWindow): Promise<string> {
  // Somewhere else first, and somewhere that asks the engine nothing. What is
  // measured is opening the Register, and the Register measures its own draw —
  // so arriving at a screen that is already open measures nothing and waits for
  // a figure that will never be published. Reports is the right elsewhere: it
  // is a destination in the rail, it is not this one, and it makes no request,
  // so what is measured next is the Register's own cost and not a queue behind
  // another screen's reading.
  await openDestination(window, 'reports');
  await window.webContents.executeJavaScript(
    'document.body.dataset.ayqRegisterMs = ""; true',
  );
  if (!(await openDestination(window, 'register'))) {
    return 'the Register never opened';
  }

  const drawn = async (): Promise<boolean> =>
    (await window.webContents.executeJavaScript(
      "document.body.dataset.ayqRegisterMs !== ''",
    )) === true;

  let deadline = Date.now() + 120_000;
  while (Date.now() < deadline && !(await drawn())) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!(await drawn())) return 'the Register never drew';

  // The count the Register's own answer carried. It arrives with the rows now,
  // but a run that read it in the same breath as the measurement could still
  // catch the frame before it.
  const heldBy = Date.now() + 60_000;
  while (
    Date.now() < heldBy &&
    Number(await dataset(window, 'ayqLedgerTotal')) === 0
  ) {
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  const opening = Number(await dataset(window, 'ayqRegisterMs'));
  const seen = JSON.parse(
    String(
      await window.webContents.executeJavaScript(`(() => {
        const rows = document.querySelectorAll('[data-ayq-table="register"] tbody tr');
        const totals = document.querySelector('[data-ayq-totals]');
        return JSON.stringify({
          rows: rows.length,
          totals: totals ? totals.innerText.replace(/\\s+/g, ' ').trim() : null,
          uncategorised: document.querySelectorAll(
            '[data-ayq-table="register"] [data-ayq-state="uncategorised"]').length,
          held: Number(document.body.dataset.ayqLedgerTotal || 0),
        });
      })()`),
    ),
  ) as {
    rows: number;
    totals: string | null;
    uncategorised: number;
    held: number;
  };

  if (seen.rows === 0) return 'the Register drew no rows';
  if (seen.totals === null) return 'the Register states no totals';
  // 04 D2.1: a total that silently describes a filtered set misleads, so it
  // says which set it is describing.
  if (!/totals describe/.test(seen.totals)) {
    return `the totals do not say what they describe: ${seen.totals}`;
  }
  process.stdout.write(
    `[ayq-smoke] register: ${seen.rows} rows of ${seen.held} drawn in ${opening}ms\n`,
  );
  process.stdout.write(`[ayq-smoke] register totals: ${seen.totals}\n`);

  // A filter, put on through the control a person uses, and the chip that says
  // it is on. Uncategorised, because 03 §4.5 makes it a state and a state is
  // the one thing a filter must be able to name.
  await window.webContents.executeJavaScript(
    'document.body.dataset.ayqRegisterMs = ""; ' +
      "document.querySelector('[data-ayq-filter-uncategorised]').click(); true",
  );
  deadline = Date.now() + 120_000;
  while (Date.now() < deadline && !(await drawn())) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!(await drawn())) return 'filtering the Register never came back';
  const filtering = Number(await dataset(window, 'ayqRegisterMs'));

  const filtered = JSON.parse(
    String(
      await window.webContents.executeJavaScript(`(() => {
        const chip = document.querySelector('[data-ayq-filter="uncategorised"]');
        const totals = document.querySelector('[data-ayq-totals]');
        return JSON.stringify({
          chip: chip ? chip.innerText.replace(/\\s+/g, ' ').trim() : null,
          clearAll: !!document.querySelector('[data-ayq-action="clear-filters"]'),
          totals: totals ? totals.innerText.replace(/\\s+/g, ' ').trim() : null,
          rows: document.querySelectorAll('[data-ayq-table="register"] tbody tr').length,
          empty: !!document.querySelector('[data-ayq-table="register"][data-ayq-empty]'),
        });
      })()`),
    ),
  ) as {
    chip: string | null;
    clearAll: boolean;
    totals: string | null;
    rows: number;
    empty: boolean;
  };

  if (filtered.chip === null) return 'the filter that is on is not shown';
  if (!filtered.clearAll) return 'there is no way to clear the filters at once';
  if (filtered.totals !== null && !/this filter matched/.test(filtered.totals)) {
    return `the filtered totals do not say so: ${filtered.totals}`;
  }
  process.stdout.write(
    `[ayq-smoke] register filtered in ${filtering}ms: ${filtered.chip} -> ` +
      `${filtered.rows} rows${filtered.empty ? ' (none matched)' : ''}\n`,
  );

  // Taken off again, in one action.
  await window.webContents.executeJavaScript(
    'document.body.dataset.ayqRegisterMs = ""; ' +
      "document.querySelector('[data-ayq-action=\"clear-filters\"]').click(); true",
  );
  deadline = Date.now() + 120_000;
  while (Date.now() < deadline && !(await drawn())) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const cleared = await window.webContents.executeJavaScript(
    "!document.querySelector('[data-ayq-filter=\"uncategorised\"]')",
  );
  if (cleared !== true) return 'clearing the filters left one on';

  // And the pane beside the table (04 A4): the evidence behind the row.
  await window.webContents.executeJavaScript(
    "document.querySelector('[data-ayq-table=\"register\"] tbody tr').click(); true",
  );
  deadline = Date.now() + 30_000;
  let pane = '';
  while (Date.now() < deadline) {
    pane = String(
      await window.webContents.executeJavaScript(`(() => {
        const node = document.querySelector('[data-ayq-detail]');
        return node ? node.innerText.replace(/\\s+/g, ' ').trim() : '';
      })()`),
    );
    if (pane !== '') break;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  if (pane === '') return 'choosing a row opened no detail pane';
  if (!/How AYQ decided who this is/.test(pane)) {
    return 'the detail pane carries no evidence';
  }
  if (!/Decisions/.test(pane)) return 'the detail pane carries no decisions';
  process.stdout.write(`[ayq-smoke] register detail: ${pane.slice(0, 320)}\n`);

  // The number the task asked to be measured and recorded, said once, plainly.
  process.stdout.write(
    `[ayq-smoke] register performance: ${seen.held} transactions held, ` +
      `first draw ${opening}ms, filtered ${filtering}ms\n`,
  );

  const slowest = Math.max(opening, filtering);
  if (slowest > AYQ_REGISTER_BUDGET_MS) {
    return `the Register took ${slowest}ms, and ${AYQ_REGISTER_BUDGET_MS}ms is the gate`;
  }
  return '';
}

/**
 * The shell, measured on the real window (04 A20, A22).
 *
 * Not a screenshot and not a list of classes: the rail's width, the order of
 * its destinations, the number of hairlines between them, where the scrollbar
 * is, and whether the table header and the detail pane stay put while the rows
 * move. Everything is compared against the modules that decide it, so the two
 * cannot drift.
 */
async function shellShown(window: BrowserWindow): Promise<string> {
  const seen = JSON.parse(
    String(
      await window.webContents.executeJavaScript(`(() => {
        const rail = document.querySelector('[data-ayq-rail]');
        if (!rail) return JSON.stringify({ rail: null });
        const items = [...rail.querySelectorAll('[data-ayq-tab]')]
          .map(one => one.dataset.ayqTab);
        const children = [
          ...rail.querySelectorAll('[data-ayq-tab], [data-ayq-rail-separator]'),
        ];
        const separators = children
          .map((one, index) => (one.hasAttribute('data-ayq-rail-separator') ? index : -1))
          .filter(index => index >= 0);
        const at = name => children.findIndex(one => one.dataset.ayqTab === name);
        const box = rail.getBoundingClientRect();
        const keyboard = [...rail.querySelectorAll('[data-ayq-tab]')].every(
          one => one.tagName === 'BUTTON' && one.getAttribute('tabindex') === null,
        );
        const scrollers = document.querySelectorAll('[data-ayq-scroller]');
        const scroller = scrollers[0];
        const scrollerBox = scroller ? scroller.getBoundingClientRect() : null;
        const status = document.querySelector('[data-ayq-status]');
        return JSON.stringify({
          rail: { width: Math.round(box.width), left: Math.round(box.left) },
          items,
          separators,
          register: at('register'),
          review: at('review'),
          plan: at('plan'),
          reports: at('reports'),
          last: items.length > 0 ? items[items.length - 1] : '',
          wordmark: (rail.textContent || '').slice(0, 3),
          keyboard,
          scrollers: scrollers.length,
          scrollerRight: scrollerBox ? Math.round(scrollerBox.right) : -1,
          windowWidth: Math.round(document.documentElement.clientWidth),
          status: status ? status.innerText.replace(/\\s+/g, ' ').trim() : null,
          panels: document.querySelectorAll('[data-ayq-window] header').length,
        });
      })()`),
    ),
  ) as {
    rail: { width: number; left: number } | null;
    items?: string[];
    separators?: number[];
    register?: number;
    review?: number;
    plan?: number;
    reports?: number;
    last?: string;
    wordmark?: string;
    keyboard?: boolean;
    scrollers?: number;
    scrollerRight?: number;
    windowWidth?: number;
    status?: string | null;
    panels?: number;
  };

  if (seen.rail === null) return 'there is no rail';
  if (seen.rail.width !== AYQ_METRIC.railWidth) {
    return `the rail is ${seen.rail.width}px rather than ${AYQ_METRIC.railWidth}px`;
  }
  if (seen.rail.left !== 0) return `the rail is ${seen.rail.left}px from the left`;
  if ((seen.items ?? []).join(',') !== AYQ_DESTINATIONS.join(',')) {
    return `the rail reads ${(seen.items ?? []).join(', ')}`;
  }
  if ((seen.separators ?? []).length !== AYQ_RAIL_GROUPS.length - 1) {
    return `${(seen.separators ?? []).length} hairlines for ${AYQ_RAIL_GROUPS.length} groups`;
  }
  const [first, second] = seen.separators ?? [];
  if (
    !(
      (seen.register ?? -1) < first &&
      first < (seen.review ?? -1) &&
      (seen.plan ?? -1) < second &&
      second < (seen.reports ?? -1)
    )
  ) {
    return 'the hairlines do not fall between the groups';
  }
  if (seen.last !== AYQ_RAIL_FOOT) {
    return `${seen.last} is at the foot of the rail, not ${AYQ_RAIL_FOOT}`;
  }
  if (seen.wordmark !== 'AYQ') return `the wordmark reads ${seen.wordmark}`;
  if (seen.keyboard !== true) return 'a destination is not reachable by keyboard';
  if (seen.panels !== 0) return 'the window has a panel across the top';
  if (seen.scrollers !== 1) return `${seen.scrollers} scrollers on one screen`;
  // A22: the scrollbar is at the window's right edge. Allowing two pixels of
  // rounding, and nothing more: a pane's own scrollbar would be hundreds away.
  if (Math.abs((seen.scrollerRight ?? 0) - (seen.windowWidth ?? 0)) > 2) {
    return `the scroller ends at ${seen.scrollerRight} and the window at ${seen.windowWidth}`;
  }
  if (seen.status === null) return 'there is no status bar';
  if (/\bv?\d+\.\d+/.test((seen.status ?? '').replace(/\d{1,2}:\d{2}/g, ''))) {
    return `the status bar carries a version number: ${seen.status}`;
  }
  process.stdout.write(
    `[ayq-smoke] rail ${seen.rail.width}px, ${(seen.items ?? []).length} destinations, ` +
      `${(seen.separators ?? []).length} hairlines, one scroller at ${seen.scrollerRight}px\n`,
  );
  // A26: ordinary chrome carries nothing technical. The data directory this
  // very run writes to, or any word about the engine, would be a diagnostic
  // back in the status bar.
  if ((seen.status ?? '').includes(dataDir)) {
    return `the status bar shows the data directory: ${seen.status}`;
  }
  if (/engine/i.test(seen.status ?? '')) {
    return `the status bar reports on the engine: ${seen.status}`;
  }
  process.stdout.write(`[ayq-smoke] status bar: ${seen.status}\n`);

  // And the two things A22 asks for that only a scroll can answer: the table
  // header staying while the rows move, and the detail pane staying with the
  // row it describes.
  //
  // The row is chosen first and the pane waited for, because choosing one asks
  // the engine and redraws — measuring in the same breath as the click measures
  // the screen as it was before it.
  await openRegister(window);
  const chosen = await window.webContents.executeJavaScript(`(() => {
    const row = document.querySelector('[data-ayq-scroller] table tbody tr');
    if (!row) return false;
    row.click();
    return true;
  })()`);
  if (chosen !== true) return 'there are no rows to scroll';

  // A22's pane is a property of a screen, not of the frame: it is checked on
  // whichever screen is open, and a screen that puts its table and its pane
  // side by side says so with `data-ayq-split`. A screen that has not been
  // brought over yet has no such pane to stay anywhere, and the run says that
  // rather than failing the frame for it.
  const splitThere = async (): Promise<boolean> =>
    (await window.webContents.executeJavaScript(
      "!!document.querySelector('[data-ayq-split]')",
    )) === true;

  if (await splitThere()) {
    const paneThere = async (): Promise<boolean> =>
      (await window.webContents.executeJavaScript(
        "!!document.querySelector('[data-ayq-split] > div:nth-child(2)')",
      )) === true;
    const paneBy = Date.now() + 60_000;
    while (Date.now() < paneBy && !(await paneThere())) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    if (!(await paneThere())) return 'choosing a row opened no detail pane';
  } else {
    process.stdout.write(
      '[ayq-smoke] the open screen puts no pane beside its table, so A22 has ' +
        'nothing to hold in place here\n',
    );
  }

  const held = JSON.parse(
    String(
      await window.webContents.executeJavaScript(`(() => {
        const scroller = document.querySelector('[data-ayq-scroller]');
        const row = document.querySelector('[data-ayq-scroller] table tbody tr');
        if (!scroller) return JSON.stringify({ why: 'no scroller' });
        if (!row) return JSON.stringify({ why: 'no rows to scroll' });
        const head = document.querySelector('[data-ayq-scroller] table thead th');
        const pane = document.querySelector('[data-ayq-split] > div:nth-child(2)');
        const split = document.querySelector('[data-ayq-split]');
        const before = row.getBoundingClientRect().top;
        scroller.scrollTop = scroller.scrollHeight;
        const box = scroller.getBoundingClientRect();
        const at = one =>
          one ? Math.round(one.getBoundingClientRect().top - box.top) : null;
        const to = one =>
          one ? Math.round(one.getBoundingClientRect().bottom - box.top) : null;
        return JSON.stringify({
          scrolled: scroller.scrollTop,
          moved: Math.round(before - row.getBoundingClientRect().top),
          headerTop: at(head),
          paneTop: at(pane),
          paneBottom: to(pane),
          splitBottom: to(split),
          rowsBottom: to(row.parentElement),
          scrollerHeight: Math.round(box.height),
          // A22 allows one scroller per screen. A pane with a scrollbar of its
          // own is the thing that rule exists to forbid, so it is measured
          // rather than assumed absent.
          paneScrolls: pane
            ? pane.scrollHeight > pane.clientHeight + 1 ||
              [...pane.querySelectorAll('*')].some(one => {
                const how = getComputedStyle(one).overflowY;
                return (
                  (how === 'auto' || how === 'scroll') &&
                  one.scrollHeight > one.clientHeight + 1
                );
              })
            : false,
          rowTabIndex: row.tabIndex,
        });
      })()`),
    ),
  ) as {
    why?: string;
    scrolled?: number;
    moved?: number;
    headerTop?: number | null;
    paneTop?: number | null;
    paneBottom?: number | null;
    splitBottom?: number | null;
    rowsBottom?: number | null;
    scrollerHeight?: number;
    paneScrolls?: boolean;
    rowTabIndex?: number;
  };

  if (held.why !== undefined) return held.why;
  if ((held.scrolled ?? 0) <= 0) {
    // Nothing to scroll is not a failure of A22, and it is not evidence of it
    // either. Said rather than passed over.
    process.stdout.write(
      '[ayq-smoke] the screen fitted the window, so nothing scrolled\n',
    );
    return '';
  }
  if ((held.moved ?? 0) <= 0) return 'scrolling the screen moved no rows';
  const headerTop = held.headerTop ?? null;
  if (headerTop === null) return 'the table has no header';
  if (Math.abs(headerTop) > 2) {
    return `the header moved to ${headerTop}px from the top of the scroller`;
  }
  const paneTop = held.paneTop ?? null;
  process.stdout.write(
    `[ayq-smoke] after scrolling ${held.scrolled}px: header at ${headerTop}px, ` +
      `pane ${paneTop}px to ${held.paneBottom}px, rows end ${held.rowsBottom}px, ` +
      `the split ends ${held.splitBottom}px, scroller ${held.scrollerHeight}px\n`,
  );
  // A22 allows the screen one scroller, and this is the half of that rule a
  // scroll can actually answer: whatever the pane's height turns out to be, it
  // must not have grown a scrollbar of its own.
  if (held.paneScrolls === true) {
    return 'the detail pane has a scrollbar of its own';
  }

  // The pane sticks to the top of the scroller — while there is anywhere for it
  // to stick. A sticky element taller than the scrollport has nowhere: it is
  // held by the bottom of its own column instead, and its top is then above the
  // scroller by exactly the difference. That is the browser behaving correctly
  // and it is what one scroller per screen costs, so it is reported rather than
  // failed. What is never allowed is the pane drifting further than that.
  const paneHeight =
    paneTop === null || held.paneBottom === undefined || held.paneBottom === null
      ? null
      : held.paneBottom - paneTop;
  const scrollport = held.scrollerHeight ?? 0;
  if (paneTop !== null && paneTop < -2) {
    if (paneHeight !== null && paneHeight > scrollport) {
      // Where the foot of its own column leaves it, and not one pixel higher:
      // the pane is pinned to the bottom of the split, which is the browser
      // clamping a too-tall sticky element rather than the pane drifting.
      const owed = (held.splitBottom ?? 0) - paneHeight;
      if (paneTop < owed - 2) {
        return `the pane is ${paneHeight}px in a ${scrollport}px scroller, so the ` +
          `foot of its column leaves it at ${owed}px, and it reached ${paneTop}px`;
      }
      process.stdout.write(
        `[ayq-smoke] the detail pane is ${paneHeight}px in a ${scrollport}px ` +
          'scroller, so it is held by the foot of its own column rather than ' +
          `by the top of the screen: ${paneTop}px\n`,
      );
    } else {
      return `the detail pane scrolled away, to ${paneTop}px`;
    }
  }
  if ((held.rowTabIndex ?? -1) !== 0) return 'a table row is not in the tab order';
  process.stdout.write(
    `[ayq-smoke] scrolled ${held.scrolled}px: rows moved ${held.moved}px, ` +
      `the header stayed at ${headerTop}px and the pane at ${
        paneTop === null ? 'no pane' : `${paneTop}px`
      }\n`,
  );
  return '';
}

/**
 * The three grounds of 04 A23, on the screen rather than in the module.
 *
 * Opens AYQ's own Fluent screen, chooses each ground in turn through the
 * control a person uses, and requires the window to come back drawn in that
 * ground's own tokens. "Follow the system" is not asserted to be light or
 * dark — it is asserted to be whichever the machine asked for, which is the
 * only thing that makes it the third ground rather than a second copy of one
 * of the other two.
 *
 * Finishes on dark, deliberately: the launch after this one asks what was
 * kept, and a value equal to the default would prove nothing.
 */
async function groundsShown(window: BrowserWindow): Promise<string> {
  if (!(await openDestination(window, 'settings'))) {
    return 'Settings never opened';
  }
  await window.webContents.executeJavaScript(
    'document.querySelector(\'[data-ayq-screen-tab="appearance"]\').click(); true',
  );

  const ready = async (): Promise<boolean> =>
    (await window.webContents.executeJavaScript(
      "!!document.querySelector('[data-ayq-screen=\"appearance\"]')",
    )) === true;

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline && !(await ready())) {
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (!(await ready())) return 'the Appearance screen never drew';

  // Fluent actually rendered, rather than a div that says it did: the ground
  // control is a Fluent radio group, so its inputs are on the page.
  const controls = Number(
    await window.webContents.executeJavaScript(
      "document.querySelectorAll('[data-ayq-screen=\"appearance\"] input[type=radio]').length",
    ),
  );
  if (controls < 3) {
    return `the Fluent controls did not render (${controls} of 3)`;
  }

  for (const ground of [...AYQ_GROUNDS].sort()) {
    await window.webContents.executeJavaScript(
      `document.querySelector('[data-ayq-ground-option="${ground}"]').click(); true`,
    );
    await new Promise(resolve => setTimeout(resolve, 400));

    const seen = JSON.parse(
      String(
        await window.webContents.executeJavaScript(`(() => {
          const node = document.querySelector('[data-ayq-ground]');
          if (!node) return JSON.stringify({ chosen: '', resolved: '' });
          const style = getComputedStyle(node);
          const bar = document.querySelector('[data-ayq-title-bar]');
          const rgb = bar ? getComputedStyle(bar).backgroundColor : '';
          const hex = rgb.startsWith('rgb(')
            ? '#' + rgb.slice(4, -1).split(',').map(one => Number(one).toString(16).padStart(2, '0')).join('')
            : rgb;
          return JSON.stringify({
            chosen: node.dataset.ayqGround,
            resolved: node.dataset.ayqGroundResolved,
            pane: style.getPropertyValue('--ayq-pane').trim(),
            accent: style.getPropertyValue('--ayq-accent').trim(),
            painted: style.backgroundColor,
            titleBar: hex,
          });
        })()`),
      ),
    ) as {
      chosen: string;
      resolved: string;
      pane?: string;
      accent?: string;
      painted?: string;
      titleBar?: string;
    };

    if (seen.chosen !== ground) {
      return `choosing ${ground} left the window on ${seen.chosen || 'nothing'}`;
    }
    if (seen.resolved !== 'light' && seen.resolved !== 'dark') {
      return `${ground} resolved to ${seen.resolved || 'nothing'}`;
    }
    if (ground !== 'system' && seen.resolved !== ground) {
      return `${ground} resolved to ${seen.resolved}`;
    }
    const want = AYQ_TOKENS[seen.resolved as AyqGroundResolved];
    if (seen.pane !== want.surface.pane) {
      return `${ground} drew its panes ${seen.pane} rather than ${want.surface.pane}`;
    }
    if (seen.accent !== want.identity.accent) {
      return `${ground} carries the accent ${seen.accent}`;
    }
    if (!seen.painted || seen.painted === 'rgba(0, 0, 0, 0)') {
      return `${ground} painted nothing`;
    }
    // The bar is the rail's surface, live, and the native controls followed.
    if (seen.titleBar !== want.surface.rail) {
      return `${ground} drew the title bar ${seen.titleBar} rather than the rail's ${want.surface.rail}`;
    }
    if (titleBarPainted !== seen.resolved) {
      return `${ground} left the window controls painted for ${titleBarPainted ?? 'nothing'}`;
    }
    process.stdout.write(
      `[ayq-smoke] ground ${ground} -> ${seen.resolved}, panes ${seen.pane}, ` +
        `accent ${seen.accent}, painted ${seen.painted}\n`,
    );
  }

  // Left on dark for the launch that comes after.
  await window.webContents.executeJavaScript(
    'document.querySelector(\'[data-ayq-ground-option="dark"]\').click(); true',
  );
  await new Promise(resolve => setTimeout(resolve, 600));
  return '';
}

/** The ground the window opened in, on a later launch. */
async function groundKept(window: BrowserWindow): Promise<string> {
  await openDestination(window, 'settings');
  await window.webContents.executeJavaScript(
    'document.querySelector(\'[data-ayq-screen-tab="appearance"]\')?.click(); true',
  );
  const deadline = Date.now() + 60_000;
  let seen = '';
  while (Date.now() < deadline) {
    seen = String(
      await window.webContents.executeJavaScript(
        "document.querySelector('[data-ayq-ground]')?.dataset.ayqGround || ''",
      ),
    );
    if (seen !== '') break;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  return seen;
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
    state = await dataset(window, 'ayqState');
    if (state !== '') break;
    await new Promise(resolve => setTimeout(resolve, 250));
  }

  // A fresh AYQ holds nothing: no demo account, no invented entries. The run
  // that does not import is the one that can prove it.
  let emptyOk = true;
  if (process.env.AYQ_SMOKE_REQUIRE_EMPTY === '1') {
    const total = await dataset(window, 'ayqLedgerTotal');
    const rows = await dataset(window, 'ayqLedgerRows');
    emptyOk = total === '0' && rows === '0';
    process.stdout.write(
      `[ayq-smoke] empty budget: ${total} transactions, ${rows} rows -> ` +
        `${emptyOk ? 'EMPTY' : 'NOT EMPTY'}\n`,
    );
  }

  // Before the capture, so the window in the artifact shows the outcome.
  const importOk = smokeImport === '' || (await checkImport(window));

  // Categorising, through the column that shows it. `--categorise` files the
  // newest transaction on this launch; `--expect-category` asserts on a later
  // launch that it is still filed — which is a restart, not a redraw.
  const toFile = process.env.AYQ_SMOKE_CATEGORISE ?? '';
  const toExpect = process.env.AYQ_SMOKE_EXPECT_CATEGORY ?? '';
  let categoryOk = true;

  if (toFile !== '') {
    categoryShown = await categoriseNewest(window, toFile);
    categoryOk = categoryShown === toFile;
    process.stdout.write(
      `[ayq-smoke] categorised the newest transaction as ${toFile} -> ` +
        `${categoryOk ? `shown as ${categoryShown}` : `FAILED (${categoryShown})`}\n`,
    );
  }

  if (toExpect !== '') {
    categoryShown = await shownCategory(window);
    const kept = categoryShown === toExpect;
    categoryOk = categoryOk && kept;
    process.stdout.write(
      `[ayq-smoke] after restart the newest transaction reads ` +
        `${categoryShown || '(nothing)'} -> ${kept ? 'KEPT' : 'LOST'}\n`,
    );
  }

  // Spending had a workspace of its own before the accepted design; 04 A20's
  // rail has no such destination, and Reports — which is where the question
  // belongs — is not built. So there is nothing here to open, and nothing that
  // pretends there is.
  let upcoming = '';
  let planSheet = '';

  // Plan: the worksheet, and one category's monthly plan set through it.
  const sheetSpec = process.env.AYQ_SMOKE_PLAN_SHEET ?? '';
  let planOk = true;
  if (sheetSpec !== '') {
    planSheet = await planShown(window, sheetSpec);
    process.stdout.write(
      `[ayq-smoke] plan:\n${planSheet || '(the view showed nothing)'}\n`,
    );
    planOk =
      planSheet !== '' &&
      !planSheet.startsWith('could not') &&
      !planSheet.startsWith('the plan read back');
    await openRegister(window);
  }

  // Upcoming: the forecast, and a planned payment added through the form the
  // way a person adds one. `--expect-plan` on a later launch is the other half
  // — a record that outlived the process that created it.
  const planSpec = process.env.AYQ_SMOKE_PLAN ?? '';
  const expectPlan = process.env.AYQ_SMOKE_EXPECT_PLAN ?? '';
  const acceptMatch = process.env.AYQ_SMOKE_MATCH === '1';
  let upcomingOk = true;

  // Asked for, or not asked for, and the report says which. A run that was
  // never asked must not be able to pass as one that held: an installed
  // application writes nothing to the console, so "the step exited zero" is the
  // only other evidence there would be, and it says nothing about this at all.
  const conformanceAsked = process.env.AYQ_SMOKE_CONFORMANCE === '1';
  let conformance = 'not asked';
  if (conformanceAsked) {
    const wrong = await conformanceShown(window);
    conformance = wrong === '' ? 'held' : wrong;
    if (wrong !== '') {
      process.stdout.write(`[ayq-smoke] 03 r004 conformance FAILED: ${wrong}\n`);
      upcomingOk = false;
    } else {
      process.stdout.write('[ayq-smoke] 03 r004 conformance: held\n');
    }
  }
  if (planSpec !== '' || expectPlan !== '' || acceptMatch) {
    const verdict = await upcomingShown(window, planSpec, acceptMatch);
    upcoming = verdict.wrong === '' ? verdict.dump : verdict.wrong;
    process.stdout.write(
      `[ayq-smoke] upcoming:\n${
        verdict.wrong === ''
          ? verdict.dump || '(the view showed nothing)'
          : `FAILED: ${verdict.wrong}`
      }\n`,
    );
    // The check says whether it holds. It is not inferred from the wording of
    // what it returned, which is how a failure nobody had thought to list used
    // to pass as a screen dump.
    upcomingOk = upcomingOk && verdict.wrong === '' && verdict.dump !== '';
    if (expectPlan !== '') {
      const kept = verdict.dump.includes(expectPlan);
      upcomingOk = upcomingOk && kept;
      process.stdout.write(
        `[ayq-smoke] after restart the plan lists ${expectPlan} -> ` +
          `${kept ? 'KEPT' : 'LOST'}\n`,
      );
    }
    await openRegister(window);
  }

  // Reading further back than the first page, through the control that offers
  // it. The ledger draws the newest few hundred of a budget that may hold
  // thousands, and a button that does not actually fetch more is worse than no
  // button, because the screen then quietly claims that is all there is.
  let paged = '';
  if (process.env.AYQ_SMOKE_SHOW_MORE === '1') {
    paged = await showMore(window);
    process.stdout.write(`[ayq-smoke] show more: ${paged}\n`);
  }
  const pagedOk =
    process.env.AYQ_SMOKE_SHOW_MORE !== '1' ||
    /^(\d+) rows, then (?!\1\b)/.test(paged);

  // Accounts, coverage and reconciliation (03 §8).
  const accountsAsked = process.env.AYQ_SMOKE_ACCOUNTS ?? '';
  let accountsState = 'not asked';
  let accountsOk = true;
  if (accountsAsked !== '') {
    const wrong = await accountsShown(window, accountsAsked);
    accountsState = wrong === '' ? `held (${accountsAsked})` : wrong;
    accountsOk = wrong === '';
    process.stdout.write(
      `[ayq-smoke] the Accounts screen: ${
        accountsOk ? `held (${accountsAsked})` : `FAILED: ${wrong}`
      }\n`,
    );
  }

  // The Register, on a budget big enough for the question to be real.
  const registerAsked = process.env.AYQ_SMOKE_REGISTER === '1';
  let register = 'not asked';
  let registerOk = true;
  if (registerAsked) {
    const wrong = await registerShown(window);
    register = wrong === '' ? 'held' : wrong;
    registerOk = wrong === '';
    process.stdout.write(
      `[ayq-smoke] the Register: ${registerOk ? 'held' : `FAILED: ${wrong}`}\n`,
    );
  }

  // Reports: not built, and nothing on it that could be read as an answer.
  const reportsAsked = process.env.AYQ_SMOKE_REPORTS === '1';
  let reports = 'not asked';
  let reportsOk = true;
  if (reportsAsked) {
    const wrong = await reportsShown(window);
    reports = wrong === '' ? 'held' : wrong;
    reportsOk = wrong === '';
    process.stdout.write(
      `[ayq-smoke] Reports: ${reportsOk ? 'held' : `FAILED: ${wrong}`}\n`,
    );
    await openRegister(window);
  }

  // Gathering rows, and the bar that states the scope before acting (04 A36).
  const bulkAsked = process.env.AYQ_SMOKE_BULK === '1';
  let bulk = 'not asked';
  let bulkOk = true;
  if (bulkAsked) {
    const wrong = await bulkShown(window);
    bulk = wrong === '' ? 'held' : wrong;
    bulkOk = wrong === '';
    process.stdout.write(
      `[ayq-smoke] bulk: ${bulkOk ? 'held' : `FAILED: ${wrong}`}\n`,
    );
  }

  // Review and Settings: the two decisions of 03 §4.1, and what Settings owns.
  const reviewAsked = process.env.AYQ_SMOKE_REVIEW === '1';
  let review = 'not asked';
  let reviewOk = true;
  if (reviewAsked) {
    const wrong = await reviewShown(window);
    review = wrong === '' ? 'held' : wrong;
    reviewOk = wrong === '';
    process.stdout.write(
      `[ayq-smoke] Review: ${reviewOk ? 'held' : `FAILED: ${wrong}`}\n`,
    );
    await openRegister(window);
  }

  // Today: what you have, how long it lasts, what is waiting on you (04 A21).
  const todayAsked = process.env.AYQ_SMOKE_TODAY === '1';
  let today = 'not asked';
  let todayOk = true;
  if (todayAsked) {
    const wrong = await todayShown(window);
    today = wrong === '' ? 'held' : wrong;
    todayOk = wrong === '';
    process.stdout.write(
      `[ayq-smoke] Today: ${todayOk ? 'held' : `FAILED: ${wrong}`}\n`,
    );
  }

  // §4.1, §4.4, §5: Unknown said out loud, and the balance the owner states
  // being exactly the balance the account then has.
  const balanceAsked = process.env.AYQ_SMOKE_BALANCE === '1';
  let balance = 'not asked';
  let balanceOk = true;
  if (balanceAsked) {
    const wrong = await balanceShown(window);
    balance = wrong === '' ? 'held' : wrong;
    balanceOk = wrong === '';
    process.stdout.write(
      `[ayq-smoke] the balance: ${balanceOk ? 'held' : `FAILED: ${wrong}`}\n`,
    );
  }

  // 12: which build this is, and what the copy button may carry.
  const aboutAsked = process.env.AYQ_SMOKE_ABOUT === '1';
  let about = 'not asked';
  let aboutOk = true;
  if (aboutAsked) {
    const wrong = await aboutShown(window);
    about = wrong === '' ? 'held' : wrong;
    aboutOk = wrong === '';
    process.stdout.write(
      `[ayq-smoke] About: ${aboutOk ? 'held' : `FAILED: ${wrong}`}\n`,
    );
  }

  // 04 A38 and 03 §12: a backup made, two bad sets refused, the backup restored.
  const backupAsked = process.env.AYQ_SMOKE_BACKUP === '1';
  let backup = 'not asked';
  let backupOk = true;
  if (backupAsked) {
    const wrong = await backupShown(window).catch((error: unknown) =>
      error instanceof Error ? error.message : String(error),
    );
    backup = wrong === '' ? 'held' : wrong;
    backupOk = wrong === '';
    process.stdout.write(
      `[ayq-smoke] Data & Backup: ${backupOk ? 'held' : `FAILED: ${wrong}`}\n`,
    );
  }

  // 9 §9.1 and 10 §10.3: what history is allowed to suggest, and what it is
  // allowed to do with the suggestion.
  const suggestAsked = process.env.AYQ_SMOKE_SUGGEST === '1';
  let suggest = 'not asked';
  let suggestOk = true;
  if (suggestAsked) {
    const wrong = await suggestionsShown(window);
    suggest = wrong === '' ? 'held' : wrong;
    suggestOk = wrong === '';
    process.stdout.write(
      `[ayq-smoke] suggestions: ${suggestOk ? 'held' : `FAILED: ${wrong}`}\n`,
    );
  }

  // The shell: the rail, its order, one scroller, and what stays put while the
  // rows move (04 A20, A22).
  const shellAsked = process.env.AYQ_SMOKE_SHELL === '1';
  let shell = 'not asked';
  let shellOk = true;
  if (shellAsked) {
    const wrong = await shellShown(window);
    shell = wrong === '' ? 'held' : wrong;
    shellOk = wrong === '';
    process.stdout.write(
      `[ayq-smoke] the shell: ${shellOk ? 'held' : `FAILED: ${wrong}`}\n`,
    );
  }

  // The three grounds, and the setting outliving the process that chose it.
  // Asked for or not, and the report says which: an installed application
  // writes nothing to a console, so "the step exited zero" would otherwise be
  // the whole of the evidence, and it says nothing about this at all.
  const groundsAsked = process.env.AYQ_SMOKE_GROUNDS === '1';
  const expectGround = process.env.AYQ_SMOKE_EXPECT_GROUND ?? '';
  let grounds = 'not asked';
  let groundsOk = true;
  if (groundsAsked) {
    const wrong = await groundsShown(window);
    grounds = wrong === '' ? 'held' : wrong;
    groundsOk = wrong === '';
    process.stdout.write(
      `[ayq-smoke] the three grounds: ${groundsOk ? 'held' : `FAILED: ${wrong}`}\n`,
    );
  }
  if (expectGround !== '') {
    const kept = await groundKept(window);
    const held = kept === expectGround;
    grounds = held ? `kept ${kept}` : `kept ${kept || '(nothing)'}`;
    groundsOk = groundsOk && held;
    process.stdout.write(
      `[ayq-smoke] after restart the ground reads ${kept || '(nothing)'} -> ` +
        `${held ? 'KEPT' : 'LOST'}\n`,
    );
  }
  if (groundsAsked || expectGround !== '') {
    await openRegister(window);
  }

  if (process.env.AYQ_SMOKE_GEOMETRY === '1') {
    const geometry = await window.webContents.executeJavaScript(`(() => {
      const bar = document.querySelector('.bar');
      const title = document.querySelector('.bar h1');
      const box = bar ? bar.getBoundingClientRect() : null;
      const head = title ? title.getBoundingClientRect() : null;
      return JSON.stringify({
        scrollY: window.scrollY,
        innerHeight: window.innerHeight,
        bar: box ? { top: box.top, height: box.height } : null,
        title: head ? { top: head.top, height: head.height } : null,
        bodyScrollHeight: document.body.scrollHeight,
      });
    })()`);
    process.stdout.write(`[ayq-smoke] geometry: ${geometry}\n`);
  }

  const engineHost = await dataset(window, 'ayqEngineHost');
  const body = await ledgerDump(window);
  const said = await problemShown(window);

  if (shot) {
    const image = await window.webContents.capturePage();
    mkdirSync(dirname(shot), { recursive: true });
    const { writeFileSync } = await import('node:fs');
    writeFileSync(shot, image.toPNG());
  }

  const hostOk = requiredHost === '' || engineHost === requiredHost;
  const expectedWindow = process.env.AYQ_SMOKE_EXPECT_WINDOW ?? '';
  const windowOk = expectedWindow === '' || expectedWindow === windowOpenedFrom;
  process.stdout.write(
    `[ayq-smoke] window: opened at the ${windowOpenedFrom}${
      expectedWindow === '' ? '' : `, expected ${expectedWindow}`
    }\n`,
  );
  const passed =
    windowOk &&
    state === 'ready' &&
    hostOk &&
    emptyOk &&
    importOk &&
    categoryOk &&
    upcomingOk &&
    planOk &&
    groundsOk &&
    shellOk &&
    registerOk &&
    accountsOk &&
    todayOk &&
    reviewOk &&
    bulkOk &&
    reportsOk &&
    balanceOk &&
    aboutOk &&
    backupOk &&
    suggestOk &&
    pagedOk;

  // A packaged Windows application is a GUI subsystem binary: nothing it writes
  // to stdout reaches the console that started it. So the outcome is also
  // written where the run that launched it can read it — which is the only way
  // an installed build can be checked automatically.
  const report = process.env.AYQ_SMOKE_REPORT;
  if (report) {
    mkdirSync(dirname(report), { recursive: true });
    writeFileSync(
      report,
      `${JSON.stringify(
        {
          passed,
          window: windowOpenedFrom,
          windowOk,
          state,
          engineHost,
          requiredHost,
          hostOk,
          emptyOk,
          importOk,
          categoryOk,
          categoryShown,
          upcomingOk,
          upcoming,
          conformance,
          planOk,
          planSheet,
          grounds,
          groundsOk,
          shell,
          shellOk,
          register,
          registerOk,
          accounts: accountsState,
          accountsOk,
          today,
          todayOk,
          review,
          reviewOk,
          bulk,
          bulkOk,
          reports,
          reportsOk,
          balance,
          balanceOk,
          about,
          aboutOk,
          backup,
          backupOk,
          suggest,
          suggestOk,
          pagedOk,
          imports: importRounds,
          dataDir,
        },
        null,
        2,
      )}\n`,
      'utf8',
    );
  }

  process.stdout.write(`\n[ayq-smoke] renderer state: ${state || 'timeout'}\n`);
  process.stdout.write(
    `[ayq-smoke] engine host: ${engineHost || 'unreported'}\n`,
  );
  if (requiredHost !== '') {
    process.stdout.write(
      `[ayq-smoke] required host: ${requiredHost} -> ${hostOk ? 'MATCH' : 'MISMATCH'}\n`,
    );
  }
  if (said !== '')
    process.stdout.write(`[ayq-smoke] the screen says: ${said}\n`);
  process.stdout.write(`[ayq-smoke] ledger:\n${body}\n`);

  // The verdicts again, at the very end. The ledger dump above is five hundred
  // lines long, and a failure whose reason is printed before it is a reason
  // nobody reading the tail of a log will ever see.
  process.stdout.write(
    `[ayq-smoke] verdicts: state=${state || 'timeout'} host=${
      hostOk ? 'ok' : 'wrong'
    } import=${importOk ? 'ok' : 'failed'} category=${
      categoryOk ? 'ok' : 'failed'
    } upcoming=${upcomingOk ? 'ok' : 'failed'} plan=${
      planOk ? 'ok' : 'failed'
    } grounds=${grounds} shell=${shell} register=${register} accounts=${accountsState} today=${today} review=${review} reports=${reports} balance=${balance} about=${about} backup=${backup} suggest=${suggest} window=${windowOk ? windowOpenedFrom : 'wrong'}\n`,
  );

  // Held open on request, so a second launch can be started while this one is
  // still running and the lock has something to stand aside for. Without it the
  // two launches never overlap and the acceptance proves nothing.
  const hold = Number(process.env.AYQ_SMOKE_HOLD_MS ?? '0');
  if (hold > 0) {
    process.stdout.write(`[ayq-smoke] holding the window for ${hold}ms\n`);
    await new Promise(resolve => setTimeout(resolve, hold));
  }

  rememberWindow(window);
  engine?.stop();
  app.exit(passed ? 0 : 1);
}

app.on('second-instance', () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

void app.whenReady().then(() => {
  mkdirSync(dataDir, { recursive: true });
  engine = startEngine();

  ipcMain.handle(AYQ_IPC_CHANNEL, (_event, request: AyqRequest) =>
    ask(request),
  );

  const window = createWindow();
  mainWindow = window;
  process.stdout.write(`[ayq] window created, budget data dir: ${dataDir}\n`);

  if (process.env.AYQ_SMOKE === '1') {
    // Caught, not left to become an unhandled rejection. A smoke run that
    // throws halfway through used to stop where it stood and hold the window
    // open until the CI step's own timeout killed it — ten minutes to learn
    // nothing. The reason is printed and the run fails, which is what a
    // failure is for.
    window.webContents.once('did-finish-load', () => {
      void runSmoke(window).catch((error: unknown) => {
        process.stdout.write(
          `[ayq-smoke] the run itself failed: ${
            error instanceof Error ? (error.stack ?? error.message) : String(error)
          }\n`,
        );
        engine?.stop();
        app.exit(1);
      });
    });
  }
});

app.on('window-all-closed', () => {
  engine?.stop();
  app.quit();
});
