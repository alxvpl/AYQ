// The whole of the renderer's access to the outside world.
//
// One function on `window.ayq`, forwarding one channel. With
// `contextIsolation` on and `nodeIntegration` off, this is not merely the
// intended path — it is the only one that exists inside the renderer.

import { contextBridge, ipcRenderer } from 'electron';

import {
  AYQ_IPC_CHANNEL,
  type AyqBridge,
  type AyqRequest,
  type AyqResponse,
} from '../../ayq-client/src/ayq-ipc-contract.ts';

const bridge: AyqBridge = {
  request: (request: AyqRequest): Promise<AyqResponse> =>
    ipcRenderer.invoke(AYQ_IPC_CHANNEL, request) as Promise<AyqResponse>,
};

contextBridge.exposeInMainWorld('ayq', bridge);
