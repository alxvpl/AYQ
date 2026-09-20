// AYQ Analyses — the narrow preload surface.
//
// The renderer receives a typed, parsed and validated payload. It gets no
// filesystem, Node, database or AYQ-store access, and no path of any kind.

import { contextBridge, ipcRenderer } from 'electron';
import type { AyqAnalyticalSnapshot } from './types.js';
import type { SnapshotInvalidReason } from './validate.js';

export type SnapshotLoadResult =
  | { status: 'cancelled' }
  | { status: 'loaded'; snapshot: AyqAnalyticalSnapshot }
  | { status: 'invalid'; reason: SnapshotInvalidReason };

/** Read-only presentation context, supplied once by the main process. */
export interface PresentationContext {
  locale: string;
}

export interface AyqAnalysesBridge {
  openSnapshot(): Promise<SnapshotLoadResult>;
  presentationContext(): Promise<PresentationContext>;
}

const api: AyqAnalysesBridge = {
  openSnapshot: () => ipcRenderer.invoke('analyses:open-snapshot'),
  presentationContext: () => ipcRenderer.invoke('analyses:presentation-context'),
};

contextBridge.exposeInMainWorld('ayqAnalyses', api);
