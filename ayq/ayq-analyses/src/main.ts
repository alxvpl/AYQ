// AYQ Analyses — Electron main process.
//
// The operating-system dialog lives here; so does reading and validating the
// file. Only a bounded typed payload crosses the preload boundary.
//
// Every launch begins unloaded (009 §3). The active snapshot is session state:
// nothing is read at startup to restore it, and no analytical context survives
// a launch. A1 therefore keeps no snapshot archive at all.

import { app, BrowserWindow, dialog, ipcMain, Menu } from 'electron';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAndValidateSnapshot } from './validate.js';
import { METRIC, SURFACE } from './ui/tokens.js';
import type { SnapshotLoadResult } from './preload.js';

const here = dirname(fileURLToPath(import.meta.url));

const CHANNEL_OPEN = 'analyses:open-snapshot';
const CHANNEL_PRESENTATION = 'analyses:presentation-context';

/** Read once, at start, as presentation context and nothing more. */
let interfaceLocale = 'en';

async function openSnapshot(window: BrowserWindow | null): Promise<SnapshotLoadResult> {
  const result = window
    ? await dialog.showOpenDialog(window, {
        title: 'Load AYQ snapshot',
        properties: ['openFile'],
        filters: [{ name: 'AYQ snapshot', extensions: ['json'] }],
      })
    : await dialog.showOpenDialog({
        title: 'Load AYQ snapshot',
        properties: ['openFile'],
        filters: [{ name: 'AYQ snapshot', extensions: ['json'] }],
      });

  if (result.canceled || result.filePaths.length === 0) return { status: 'cancelled' };

  let text: string;
  try {
    text = await readFile(result.filePaths[0], 'utf8');
  } catch (error) {
    // The path and the system error stay here: the renderer is told only that
    // the file does not match the snapshot format it can read.
    console.error('Could not read the selected file:', error);
    return { status: 'invalid', reason: 'unknown' };
  }

  const validated = parseAndValidateSnapshot(text);
  if (validated.ok) return { status: 'loaded', snapshot: validated.snapshot };

  console.error(`Snapshot refused (${validated.reason}): ${validated.detail}`);
  return { status: 'invalid', reason: validated.reason };
}

function registerIpc(): void {
  ipcMain.handle(CHANNEL_OPEN, event => openSnapshot(BrowserWindow.fromWebContents(event.sender)));
  ipcMain.handle(CHANNEL_PRESENTATION, () => ({ locale: interfaceLocale }));
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    title: 'AYQ Analyses',
    width: METRIC.window.width,
    height: METRIC.window.height,
    // The window never shrinks below the width at which the context bar,
    // the table and the detail pane still hold together (A2 decision K-8).
    minWidth: METRIC.window.minWidth,
    minHeight: METRIC.window.minHeight,
    show: false,
    backgroundColor: SURFACE.ground,
    webPreferences: {
      preload: join(here, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.once('ready-to-show', () => window.show());
  void window.loadFile(join(here, 'index.html'));
  return window;
}

app.whenReady().then(() => {
  interfaceLocale = app.getLocale() || 'en';
  // No application menu (r05 §2, PC1): the default File / Edit / View /
  // Window row is not part of the accepted shell and exposes reload,
  // developer tools and zoom that A1 has no use for. Editing inside inputs
  // is Chromium's own on Windows and needs no menu.
  Menu.setApplicationMenu(null);
  registerIpc();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
