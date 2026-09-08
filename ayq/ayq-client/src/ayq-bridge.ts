// The renderer's only door outwards.
//
// Everything the AYQ interface can ever ask of the engine goes through here.
// If `window.ayq` is missing, the page is running outside the AYQ host — that
// is a real failure and is reported as one, never papered over with a stand-in
// answer.

import {
  type AyqBridge,
  type AyqRequest,
  type AyqResponse,
} from './ayq-ipc-contract.ts';

declare global {
  interface Window {
    ayq?: AyqBridge;
  }
}

let counter = 0;

/** A correlation id. Unique per renderer, which is all the host needs. */
function nextId(): string {
  counter += 1;
  return `ayq-${Date.now().toString(36)}-${counter}`;
}

export async function ayqAsk(
  kind: AyqRequest['kind'],
): Promise<AyqResponse> {
  const bridge = window.ayq;
  if (!bridge) {
    throw new Error(
      'No AYQ bridge on this page. The renderer is not running inside the ' +
        'AYQ Electron host, and there is no other way to reach the engine.',
    );
  }
  return bridge.request({ id: nextId(), kind });
}
