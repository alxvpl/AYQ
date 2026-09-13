import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSnapshot } from './validate.js';
import type { ArchivedSnapshotSummary, AyqAnalyticalSnapshot } from './types.js';

const here = dirname(fileURLToPath(import.meta.url));
const CHANNEL_IMPORT = 'analyses:import-snapshots';
const CHANNEL_LIST = 'analyses:list-snapshots';
const CHANNEL_INFO = 'analyses:app-info';

function archiveDirectory(): string {
  return join(app.getPath('userData'), 'snapshots');
}

function safeSnapshotFileName(snapshotId: string): string {
  if (/^[A-Za-z0-9._-]{1,160}$/.test(snapshotId)) return `${snapshotId}.json`;
  const digest = createHash('sha256').update(snapshotId).digest('hex').slice(0, 24);
  return `snapshot-${digest}.json`;
}

async function parseSnapshot(rawText: string, source: string): Promise<AyqAnalyticalSnapshot> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch (error) {
    throw new Error(`${source}: invalid JSON (${error instanceof Error ? error.message : String(error)})`);
  }
  return validateSnapshot(parsed);
}

async function archiveSnapshot(snapshot: AyqAnalyticalSnapshot, rawText: string): Promise<string> {
  const directory = archiveDirectory();
  await mkdir(directory, { recursive: true });
  const target = join(directory, safeSnapshotFileName(snapshot.meta.snapshotId));
  try {
    const existing = await readFile(target, 'utf8');
    if (existing === rawText) return target;
    const existingSnapshot = await parseSnapshot(existing, target);
    if (existingSnapshot.meta.snapshotId === snapshot.meta.snapshotId) {
      throw new Error(`snapshotId ${snapshot.meta.snapshotId} already exists with different content`);
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') throw error;
  }

  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(temporary, rawText, { encoding: 'utf8', flag: 'wx' });
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined);
  }
  return target;
}

async function loadArchive(): Promise<Array<{ summary: ArchivedSnapshotSummary; snapshot: AyqAnalyticalSnapshot }>> {
  const directory = archiveDirectory();
  await mkdir(directory, { recursive: true });
  const names = (await readdir(directory)).filter(name => name.toLowerCase().endsWith('.json'));
  const loaded: Array<{ summary: ArchivedSnapshotSummary; snapshot: AyqAnalyticalSnapshot }> = [];
  for (const name of names) {
    const path = join(directory, name);
    try {
      const raw = await readFile(path, 'utf8');
      const snapshot = await parseSnapshot(raw, path);
      loaded.push({
        summary: {
          snapshotId: snapshot.meta.snapshotId,
          generatedAt: snapshot.meta.generatedAt,
          contractVersion: snapshot.meta.contractVersion,
          path,
        },
        snapshot,
      });
    } catch (error) {
      console.error(`Ignoring invalid archived snapshot ${path}:`, error);
    }
  }
  return loaded.sort((a, b) => a.snapshot.meta.generatedAt.localeCompare(b.snapshot.meta.generatedAt));
}

async function importSnapshots(): Promise<Array<{ summary: ArchivedSnapshotSummary; snapshot: AyqAnalyticalSnapshot }>> {
  const result = await dialog.showOpenDialog({
    title: 'Import AYQ analytical snapshot',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'AYQ snapshot', extensions: ['json'] }],
  });
  if (result.canceled) return [];

  for (const path of result.filePaths) {
    const info = await stat(path);
    if (!info.isFile()) throw new Error(`${path} is not a file`);
    const raw = await readFile(path, 'utf8');
    const snapshot = await parseSnapshot(raw, path);
    await archiveSnapshot(snapshot, raw);
  }
  return loadArchive();
}

function registerIpc(): void {
  ipcMain.handle(CHANNEL_IMPORT, () => importSnapshots());
  ipcMain.handle(CHANNEL_LIST, () => loadArchive());
  ipcMain.handle(CHANNEL_INFO, () => ({ version: app.getVersion(), archiveDirectory: archiveDirectory() }));
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
  registerIpc();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
