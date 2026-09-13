import { contextBridge, ipcRenderer } from 'electron';
import type { ArchivedSnapshotSummary, AyqAnalyticalSnapshot } from './types.js';

export interface ArchivedSnapshotPayload {
  summary: ArchivedSnapshotSummary;
  snapshot: AyqAnalyticalSnapshot;
}

export interface AyqAnalysesBridge {
  importSnapshots(): Promise<ArchivedSnapshotPayload[]>;
  listSnapshots(): Promise<ArchivedSnapshotPayload[]>;
  appInfo(): Promise<{ version: string; archiveDirectory: string }>;
}

const api: AyqAnalysesBridge = {
  importSnapshots: () => ipcRenderer.invoke('analyses:import-snapshots'),
  listSnapshots: () => ipcRenderer.invoke('analyses:list-snapshots'),
  appInfo: () => ipcRenderer.invoke('analyses:app-info'),
};

contextBridge.exposeInMainWorld('ayqAnalyses', api);
