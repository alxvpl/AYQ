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
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  utilityProcess,
} from 'electron';

import {
  AYQ_IPC_CHANNEL,
  type AyqImportSummary,
  type AyqPickedFile,
  type AyqRequest,
  type AyqResponse,
} from '../../ayq-client/src/ayq-ipc-contract.ts';

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

async function ask(request: AyqRequest): Promise<AyqResponse> {
  // The one request the host answers itself, because it is about this window
  // and not about the budget. Everything else is relayed untouched.
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
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

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
  // Electron gives every application a File/Edit/View/Window menu whether or
  // not it has anything to put in one. AYQ does not: every action it offers is
  // on the page. An empty menu bar is a row of the window's height spent on
  // four words that lead nowhere, and on Windows it sits above the content.
  Menu.setApplicationMenu(null);

  // A desktop window, sized for the shell it holds: a navigation column and a
  // ledger with six columns beside it. 900x700 was the size of a page, and it
  // left the transactions table narrower than the window it was drawn in.
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 640,
    minHeight: 480,
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
  await window.webContents.executeJavaScript(
    'document.body.dataset.ayqImportState = ""; ' +
      'document.getElementById("ayq-import").click(); true',
  );

  const deadline = Date.now() + 240_000;
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
  const chose = String(
    await window.webContents.executeJavaScript(`(() => {
      const row = document.querySelector('.grid tbody tr');
      if (!row) return 'no rows';
      const select = row.querySelector('.col-category select');
      if (!select) return 'no control';
      const option = [...select.options].find(
        candidate => candidate.textContent === ${JSON.stringify(name)},
      );
      if (!option) return 'no such category';
      select.dataset.ayqTyped = '1';
      select.value = option.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return 'chosen';
    })()`),
  );
  if (chose !== 'chosen') return chose;

  const deadline = Date.now() + 60_000;
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
  return String(
    await window.webContents.executeJavaScript(`(() => {
      const select = document.querySelector('.grid tbody tr .col-category select');
      if (!select) return '';
      if (select.dataset.ayqTyped === '1') return '';
      const option = select.selectedOptions[0];
      return option ? option.textContent : '';
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
 * Opens the Spending view and reads back what it says.
 *
 * Through the tab a person clicks, and read from the rendered table rather than
 * from any state the renderer kept — the same rule as the category control. If
 * the screen does not show the breakdown, it did not happen.
 */
async function spendingShown(window: BrowserWindow): Promise<string> {
  await window.webContents.executeJavaScript(
    'document.querySelector(\'[data-ayq-tab="spending"]\').click(); true',
  );

  const deadline = Date.now() + 60_000;
  let shown = '';
  while (Date.now() < deadline) {
    shown = String(
      await window.webContents.executeJavaScript(`(() => {
        const figures = [...document.querySelectorAll('.figures .figure')].map(one => {
          const label = one.querySelector('.figure-label');
          const value = one.querySelector('.figure-value');
          return (label ? label.textContent : '') + ' ' + (value ? value.textContent : '');
        });
        if (figures.length === 0) return '';
        const rows = [...document.querySelectorAll('.grid tbody tr')].map(row => {
          const cell = name => row.querySelector('.col-' + name);
          const bar = cell('share') && cell('share').querySelector('.share-bar');
          return [
            cell('payee') ? cell('payee').innerText.trim() : '',
            bar ? bar.title : '',
            cell('count') ? cell('count').innerText.trim() : '',
            cell('amount') ? cell('amount').innerText.trim() : '',
          ].join(' | ');
        });
        return figures.join('   ') + '\\n' + rows.join('\\n');
      })()`),
    );
    if (shown !== '') break;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  return shown;
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
async function conformanceShown(window: BrowserWindow): Promise<string> {
  await window.webContents.executeJavaScript(
    'document.querySelector(\'[data-ayq-tab="upcoming"]\').click(); true',
  );

  const ready = async (): Promise<boolean> =>
    (await window.webContents.executeJavaScript(
      "!!document.querySelector('[data-ayq-forecast]')",
    )) === true;

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline && !(await ready())) {
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (!(await ready())) return 'the forecast never appeared';

  const seen = (await window.webContents.executeJavaScript(`(() => {
    const rows = [...document.querySelectorAll('.grid tbody tr[data-ayq-record]')];
    const forRecord = id => rows.filter(row => row.dataset.ayqRecord === id);
    const tagged = (list, tag) =>
      list.filter(row => row.innerText.toLowerCase().includes(tag)).length;
    const arrears = forRecord('plan-conf-overdue');
    const detected = forRecord('plan-conf-detected');
    const twin = forRecord('plan-conf-twin');
    return {
      arrears: arrears.length,
      arrearsOverdue: tagged(arrears, 'overdue'),
      detected: detected.length,
      detectedOverdue: tagged(detected, 'overdue'),
      detectedSuggested: tagged(detected, 'suggested'),
      twin: twin.length,
      offered: Number(
        document.querySelector('[data-ayq-matches]')?.dataset.ayqMatches || 0,
      ),
    };
  })()`)) as Record<string, number>;

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
  if (seen.offered < 1) return 'no match was offered; 03 §7.16 says one should be';
  if (seen.twin < 1) {
    return 'the subscription was matched away; 03 §7.16 says nobody chose yet';
  }
  return '';
}

async function upcomingShown(
  window: BrowserWindow,
  addSpec: string,
  acceptMatch: boolean,
): Promise<string> {
  await window.webContents.executeJavaScript(
    'document.querySelector(\'[data-ayq-tab="upcoming"]\').click(); true',
  );

  const ready = async (): Promise<boolean> =>
    (await window.webContents.executeJavaScript(
      "!!document.querySelector('[data-ayq-forecast]')",
    )) === true;

  let deadline = Date.now() + 60_000;
  while (Date.now() < deadline && !(await ready())) {
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (!(await ready())) return '';

  if (addSpec !== '') {
    const [name, amount, frequency, startDate] = addSpec.split('|');
    const filled = String(
      await window.webContents.executeJavaScript(`(() => {
        const add = document.getElementById('ayq-plan-new');
        if (!add) return 'no button';
        add.click();
        const field = which =>
          document.querySelector('[data-ayq-plan-field="' + which + '"]');
        const set = (which, value) => {
          const control = field(which);
          if (!control) return false;
          control.value = value;
          control.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        };
        if (!set('name', ${JSON.stringify(name)})) return 'no name field';
        if (!set('amount', ${JSON.stringify(amount)})) return 'no amount field';
        if (!set('frequency', ${JSON.stringify(frequency)})) return 'no frequency field';
        if (!set('startDate', ${JSON.stringify(startDate)})) return 'no date field';
        const save = document.getElementById('ayq-plan-save');
        if (!save) return 'no save button';
        save.click();
        return 'saved';
      })()`),
    );
    if (filled !== 'saved') return `could not add the payment: ${filled}`;

    // Waited for in the table, which is drawn from what the engine answered.
    deadline = Date.now() + 60_000;
    let listed = false;
    while (Date.now() < deadline && !listed) {
      listed =
        (await window.webContents.executeJavaScript(`(() => {
          const rows = [...document.querySelectorAll('.grid tbody tr[data-ayq-record]')];
          return rows.some(row => row.innerText.includes(${JSON.stringify(name)}));
        })()`)) === true;
      if (!listed) await new Promise(resolve => setTimeout(resolve, 250));
    }
    if (!listed) {
      const said = await problemShown(window);
      return `the payment was not listed after saving${said === '' ? '' : ` — the screen said: ${said}`}`;
    }
  }

  if (acceptMatch) {
    // The match AYQ found and would not make on its own. It has to be offered,
    // and accepting it has to take the payment out of what is still expected.
    const offered = Number(
      await window.webContents.executeJavaScript(
        "Number(document.querySelector('[data-ayq-matches]')?.dataset.ayqMatches || 0)",
      ),
    );
    if (offered < 1) return 'no match was offered to accept';

    const clicked = await window.webContents.executeJavaScript(`(() => {
      const yes = document.querySelector('[data-ayq-match-accept]');
      if (!yes) return false;
      yes.click();
      return true;
    })()`);
    if (clicked !== true) return 'the offered match had nothing to accept';

    deadline = Date.now() + 60_000;
    let left = offered;
    while (Date.now() < deadline && left >= offered) {
      left = Number(
        await window.webContents.executeJavaScript(
          "Number(document.querySelector('[data-ayq-matches]')?.dataset.ayqMatches || 0)",
        ),
      );
      if (left >= offered) await new Promise(resolve => setTimeout(resolve, 250));
    }
    if (left >= offered) return 'accepting the match changed nothing';
    process.stdout.write(
      `[ayq-smoke] matches offered: ${offered}, left after accepting one: ${left}\n`,
    );
  }

  return String(
    await window.webContents.executeJavaScript(`(() => {
      const figures = [...document.querySelectorAll('.figures .figure')].map(one => {
        const label = one.querySelector('.figure-label');
        const value = one.querySelector('.figure-value');
        return (label ? label.textContent : '') + ' ' + (value ? value.textContent : '');
      });
      const rows = [...document.querySelectorAll('.grid tbody tr')].slice(0, 12).map(row =>
        [...row.querySelectorAll('td')].map(cell => cell.innerText.trim()).join(' | '),
      );
      return figures.join('   ') + '\\n' + rows.join('\\n');
    })()`),
  );
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
  await window.webContents.executeJavaScript(
    'document.querySelector(\'[data-ayq-tab="plan"]\').click(); true',
  );

  const ready = async (): Promise<boolean> =>
    (await window.webContents.executeJavaScript(
      "!!document.querySelector('[data-ayq-plan-sheet]')",
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
        const row = [...document.querySelectorAll('.grid tbody tr')].find(one => {
          const cell = one.querySelector('.col-payee');
          return cell && cell.innerText.trim() === ${JSON.stringify(category)};
        });
        if (!row) return 'no such category on the sheet';
        const field = row.querySelector('input.plan-input');
        if (!field) return 'that row has no plan to set';
        if (field.disabled) return 'this month cannot be planned in';
        field.value = ${JSON.stringify(amount)};
        field.dispatchEvent(new Event('blur'));
        return 'typed';
      })()`),
    );
    if (typed !== 'typed') return `could not set the plan: ${typed}`;

    // Read from the Left column, which is the engine's arithmetic over what it
    // stored. A plan that did not store leaves it at zero.
    const want = `€ ${Number(amount).toLocaleString('nl-NL', {
      minimumFractionDigits: 2,
    })}`;
    deadline = Date.now() + 60_000;
    let shown = '';
    while (Date.now() < deadline) {
      shown = String(
        await window.webContents.executeJavaScript(`(() => {
          const row = [...document.querySelectorAll('.grid tbody tr')].find(one => {
            const cell = one.querySelector('.col-payee');
            return cell && cell.innerText.trim() === ${JSON.stringify(category)};
          });
          if (!row) return '';
          const cells = row.querySelectorAll('.col-amount');
          return cells.length >= 3 ? cells[2].innerText.trim() : '';
        })()`),
      );
      if (shown.replace(/\u00a0/g, ' ') === want) break;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    if (shown.replace(/\u00a0/g, ' ') !== want) {
      const said = await problemShown(window);
      return `the plan read back as ${shown || '(nothing)'} rather than ${want}${
        said === '' ? '' : ` — the screen said: ${said}`
      }`;
    }
  }

  return String(
    await window.webContents.executeJavaScript(`(() => {
      const month = document.querySelector('[data-ayq-plan-month]');
      const figures = [...document.querySelectorAll('.figures .figure')].map(one => {
        const label = one.querySelector('.figure-label');
        const value = one.querySelector('.figure-value');
        return (label ? label.textContent : '') + ' ' + (value ? value.textContent : '');
      });
      const rows = [...document.querySelectorAll('.grid tbody tr')].slice(0, 12).map(row =>
        [...row.querySelectorAll('td')].map(cell => {
          const field = cell.querySelector('input');
          return field ? field.value : cell.innerText.trim();
        }).join(' | '),
      );
      return (month ? month.dataset.ayqPlanMonth : '') + '\\n' +
        figures.join('   ') + '\\n' + rows.join('\\n');
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
  const rows = async (): Promise<number> =>
    Number(
      await window.webContents.executeJavaScript(
        "document.querySelectorAll('.grid tbody tr').length",
      ),
    );

  const before = await rows();
  const pressed = await window.webContents.executeJavaScript(`(() => {
    const button = [...document.querySelectorAll('.count button')].find(
      one => one.textContent === 'Show more',
    );
    if (!button) return false;
    button.click();
    return true;
  })()`);
  if (pressed !== true) return `no button, with ${before} rows shown`;

  const deadline = Date.now() + 60_000;
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
  return String(
    await window.webContents.executeJavaScript(`(() => {
      const lines = [...document.querySelectorAll('.grid tbody tr')].map(row => {
        const cell = name => row.querySelector('.col-' + name);
        const select = cell('category') && cell('category').querySelector('select');
        const chosen = select && select.selectedOptions[0]
          ? select.selectedOptions[0].textContent
          : '';
        return [
          cell('date') ? cell('date').innerText.trim() : '',
          cell('payee') ? cell('payee').innerText.trim() : '',
          chosen,
          cell('account') ? cell('account').innerText.trim() : '',
          cell('amount') ? cell('amount').innerText.trim() : '',
        ].join(' | ');
      });
      const count = document.querySelector('.count');
      if (count) lines.push(count.innerText.trim());
      return lines.join('\\n');
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
  try {
    const first = await importOnce(window);
    const second = await importOnce(window);
    importRounds.push(first, second);

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
    report('2', second);

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
      second.imported === 0 &&
      second.duplicates === first.prepared &&
      second.transactionCountAfter === first.transactionCountAfter &&
      ledgerTotal === second.transactionCountAfter &&
      // The rows drawn, not the rows there are: the ledger shows a page at a
      // time, so demanding it draw all of them was an assumption that held only
      // while every fixture was smaller than a page.
      ledgerRows > 0 &&
      ledgerRows <= ledgerTotal;

    process.stdout.write(
      `[ayq-smoke] duplicate protection: ${held ? 'HOLDS' : 'FAILED'}\n`,
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

  // Asked before the ledger is read back, because it leaves another view open;
  // the run returns to the transactions afterwards so the dump is of those.
  let spending = '';
  let upcoming = '';
  let planSheet = '';
  if (process.env.AYQ_SMOKE_SPENDING === '1') {
    spending = await spendingShown(window);
    process.stdout.write(
      `[ayq-smoke] spending:\n${spending || '(the view showed nothing)'}\n`,
    );
    await window.webContents.executeJavaScript(
      'document.querySelector(\'[data-ayq-tab="transactions"]\').click(); true',
    );
    await new Promise(resolve => setTimeout(resolve, 1_000));
  }
  const spendingOk = process.env.AYQ_SMOKE_SPENDING !== '1' || spending !== '';

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
    await window.webContents.executeJavaScript(
      'document.querySelector(\'[data-ayq-tab="transactions"]\').click(); true',
    );
    await new Promise(resolve => setTimeout(resolve, 1_000));
  }

  // Upcoming: the forecast, and a planned payment added through the form the
  // way a person adds one. `--expect-plan` on a later launch is the other half
  // — a record that outlived the process that created it.
  const planSpec = process.env.AYQ_SMOKE_PLAN ?? '';
  const expectPlan = process.env.AYQ_SMOKE_EXPECT_PLAN ?? '';
  const acceptMatch = process.env.AYQ_SMOKE_MATCH === '1';
  let upcomingOk = true;

  if (process.env.AYQ_SMOKE_CONFORMANCE === '1') {
    const wrong = await conformanceShown(window);
    if (wrong !== '') {
      process.stdout.write(`[ayq-smoke] 03 r004 conformance FAILED: ${wrong}\n`);
      upcomingOk = false;
    } else {
      process.stdout.write('[ayq-smoke] 03 r004 conformance: held\n');
    }
  }
  if (planSpec !== '' || expectPlan !== '' || acceptMatch) {
    upcoming = await upcomingShown(window, planSpec, acceptMatch);
    process.stdout.write(
      `[ayq-smoke] upcoming:\n${upcoming || '(the view showed nothing)'}\n`,
    );
    upcomingOk =
      upcomingOk &&
      upcoming !== '' &&
      !upcoming.startsWith('could not') &&
      !upcoming.startsWith('no match') &&
      !upcoming.startsWith('the offered match') &&
      !upcoming.startsWith('accepting the match') &&
      !upcoming.startsWith('the payment was not listed');
    if (expectPlan !== '') {
      const kept = upcoming.includes(expectPlan);
      upcomingOk = upcomingOk && kept;
      process.stdout.write(
        `[ayq-smoke] after restart the plan lists ${expectPlan} -> ` +
          `${kept ? 'KEPT' : 'LOST'}\n`,
      );
    }
    await window.webContents.executeJavaScript(
      'document.querySelector(\'[data-ayq-tab="transactions"]\').click(); true',
    );
    await new Promise(resolve => setTimeout(resolve, 1_000));
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
  const passed =
    state === 'ready' &&
    hostOk &&
    emptyOk &&
    importOk &&
    categoryOk &&
    spendingOk &&
    upcomingOk &&
    planOk &&
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
          state,
          engineHost,
          requiredHost,
          hostOk,
          emptyOk,
          importOk,
          categoryOk,
          categoryShown,
          spendingOk,
          upcomingOk,
          upcoming,
          planOk,
          planSheet,
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

  // Held open on request, so a second launch can be started while this one is
  // still running and the lock has something to stand aside for. Without it the
  // two launches never overlap and the acceptance proves nothing.
  const hold = Number(process.env.AYQ_SMOKE_HOLD_MS ?? '0');
  if (hold > 0) {
    process.stdout.write(`[ayq-smoke] holding the window for ${hold}ms\n`);
    await new Promise(resolve => setTimeout(resolve, hold));
  }

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
    window.webContents.once('did-finish-load', () => void runSmoke(window));
  }
});

app.on('window-all-closed', () => {
  engine?.stop();
  app.quit();
});
