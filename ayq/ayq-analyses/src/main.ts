// AYQ Analyses — Electron main process.
//
// The operating-system dialog lives here; so does reading and validating the
// file. Only a bounded typed payload crosses the preload boundary.
//
// Every launch begins unloaded (009 §3). The active snapshot is session state:
// nothing is read at startup to restore it, and no analytical context survives
// a launch. A1 therefore keeps no snapshot archive at all.

import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAndValidateSnapshot } from './validate.js';
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
    width: 1360,
    height: 860,
    minWidth: 980,
    minHeight: 660,
    show: false,
    backgroundColor: '#f6f7f9',
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
  registerIpc();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
