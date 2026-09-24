// The renderer's only door outwards.
//
// Everything the AYQ interface can ever ask of the engine goes through here.
// If `window.ayq` is missing, the page is running outside the AYQ host — that
// is a real failure and is reported as one, never papered over with a stand-in
// answer.

import type {
  AyqBridge,
  AyqErrorCode,
  AyqRequestBody,
  AyqResponse,
} from './ayq-ipc-contract.ts';
import { ayqErrorText } from './ayq-reasons.ts';

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

/**
 * What a screen receives: the engine's answer, and for a failure the
 * catalogue's sentence for its code (04 A24).
 *
 * The engine's own English (`detail`) is dropped here, at the one door, so
 * no screen can put it on the window — every `onFailure(answer.message)` in
 * the renderer says what the catalogue says.
 */
export type AyqAnswer =
  | Exclude<AyqResponse, { ok: false }>
  | {
      id: string;
      ok: false;
      kind: 'error';
      code: AyqErrorCode;
      message: string;
    };

export async function ayqAsk(body: AyqRequestBody): Promise<AyqAnswer> {
  const bridge = window.ayq;
  if (!bridge) {
    throw new Error(
      'No AYQ bridge on this page. The renderer is not running inside the ' +
        'AYQ Electron host, and there is no other way to reach the engine.',
    );
  }
  const answer = await bridge.request({ ...body, id: nextId() });
  if (answer.ok) return answer;
  return {
    id: answer.id,
    ok: false,
    kind: 'error',
    code: answer.code,
    message: ayqErrorText(answer),
  };
}
