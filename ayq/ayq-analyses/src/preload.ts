// AYQ Analyses — the narrow preload surface.
//
// The renderer receives a typed, parsed and validated payload, and the name
// of the file it came from as display text. It gets no filesystem, Node,
// database or AYQ-store access, no directory listing and no path of any kind.

import { contextBridge, ipcRenderer } from 'electron';
import type { ActiveSnapshot, ReplaceOutcome } from './active-snapshot.js';

export type { ActiveSnapshot, SnapshotIdentity } from './active-snapshot.js';

export type SnapshotLoadResult = { status: 'cancelled' } | ReplaceOutcome;

/** Read-only presentation context, supplied once by the main process. */
export interface PresentationContext {
  locale: string;
}

export interface AyqAnalysesBridge {
  /** The active copy at launch, revalidated (r002 §6.2). */
  activeSnapshot(): Promise<ActiveSnapshot>;
  /** The system dialog; a chosen file becomes the active copy only once proven (r002 §11.5). */
  openSnapshot(): Promise<SnapshotLoadResult>;
  /** Deletes the active copy and its retained name together (r002 §11.6). */
  removeSnapshot(): Promise<{ removed: boolean }>;
  presentationContext(): Promise<PresentationContext>;
  /** Opens the read-only Third-party licenses / Notices window (DS r007 §11.4). Nothing crosses back. */
  openNotices(): Promise<void>;
}

const api: AyqAnalysesBridge = {
  activeSnapshot: () => ipcRenderer.invoke('analyses:active-snapshot'),
  openSnapshot: () => ipcRenderer.invoke('analyses:open-snapshot'),
  removeSnapshot: () => ipcRenderer.invoke('analyses:remove-snapshot'),
  presentationContext: () => ipcRenderer.invoke('analyses:presentation-context'),
  openNotices: () => ipcRenderer.invoke('analyses:open-notices'),
};

contextBridge.exposeInMainWorld('ayqAnalyses', api);
