// AYQ Analyses — Electron main process.
//
// The operating-system dialog lives here; so does reading and validating the
// file, and the application's own copy of the active snapshot (r002 §6.1;
// 02_ARCHITECTURE r006 §7.12). Only a bounded typed payload crosses the
// preload boundary: the validated snapshot and the name of the file it came
// from — never a path, neither the source's nor the copy's.
//
// At launch the active copy is read and revalidated through the same contract
// validator a manual load uses. No analytical context survives a launch.

import { app, BrowserWindow, dialog, ipcMain, Menu } from 'electron';
import { readFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readActiveSnapshot, removeActiveSnapshot, replaceActiveSnapshot } from './active-snapshot.js';
import { METRIC, SURFACE } from './ui/tokens.js';
import type { SnapshotLoadResult } from './preload.js';

const here = dirname(fileURLToPath(import.meta.url));

const CHANNEL_ACTIVE = 'analyses:active-snapshot';
const CHANNEL_OPEN = 'analyses:open-snapshot';
const CHANNEL_REMOVE = 'analyses:remove-snapshot';
const CHANNEL_PRESENTATION = 'analyses:presentation-context';

/** Read once, at start, as presentation context and nothing more. */
let interfaceLocale = 'en';

/** The per-user directory holding the one active copy. The renderer never learns it. */
function activeDirectory(): string {
  return app.getPath('userData');
}

async function openSnapshot(window: BrowserWindow | null): Promise<SnapshotLoadResult> {
  const options = {
    title: 'Load AYQ snapshot',
    properties: ['openFile' as const],
    filters: [{ name: 'AYQ snapshot', extensions: ['json'] }],
  };
  const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);

  if (result.canceled || result.filePaths.length === 0) return { status: 'cancelled' };

  let bytes: Buffer;
  try {
    bytes = await readFile(result.filePaths[0]);
  } catch (error) {
    // The path and the system error stay here: the renderer is told only that
    // the file does not match the snapshot format it can read.
    console.error('Could not read the selected file:', (error as { code?: string }).code ?? 'error');
    return { status: 'invalid', reason: 'unknown' };
  }

  return replaceActiveSnapshot(activeDirectory(), bytes, basename(result.filePaths[0]));
}

function registerIpc(): void {
  ipcMain.handle(CHANNEL_ACTIVE, () => readActiveSnapshot(activeDirectory()));
  ipcMain.handle(CHANNEL_OPEN, event => openSnapshot(BrowserWindow.fromWebContents(event.sender)));
  ipcMain.handle(CHANNEL_REMOVE, async () => {
    try {
      await removeActiveSnapshot(activeDirectory());
      return { removed: true };
    } catch (error) {
      console.error('The snapshot copy could not be removed:', (error as { code?: string }).code ?? 'error');
      return { removed: false };
    }
  });
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
