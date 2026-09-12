// A document for the screens that have not been brought over to Fluent yet.
//
// Those screens are imperative renderers that draw into an element they are
// given. This provides the element, inside the page the product ships, so a
// test that finds something in it has found what the product draws.
//
// jsdom is a test dependency and only a test dependency. The renderer's own
// sources still import nothing but each other, React and Fluent;
// `ayq-boundary.test.ts` reads `src/` and would say so if that changed.

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { JSDOM } from 'jsdom';

const here = dirname(fileURLToPath(import.meta.url));
const page = join(here, '..', 'src', 'ayq-client.html');

export type AyqShellElements = {
  /** Where a screen draws. */
  body: HTMLElement;
};

/** Loads the shipped page and puts its document where the renderer looks. */
export async function ayqOpenShell(): Promise<AyqShellElements> {
  const html = await readFile(page, 'utf8');
  const dom = new JSDOM(html, { url: 'https://ayq.invalid/' });
  const { window } = dom;

  const globals = globalThis as unknown as Record<string, unknown>;
  globals.window = window;
  globals.document = window.document;
  for (const name of [
    'Event',
    'HTMLElement',
    'HTMLButtonElement',
    'HTMLSelectElement',
    'HTMLInputElement',
    'Node',
  ]) {
    globals[name] = (window as unknown as Record<string, unknown>)[name];
  }

  const root = window.document.getElementById('ayq-root');
  if (root === null) {
    throw new Error('the page AYQ ships has nowhere to draw');
  }
  const body = window.document.createElement('div');
  body.dataset.ayqLegacy = 'test';
  root.append(body);

  return { body: body as unknown as HTMLElement };
}

/** Clicks something, the way a person does: a real event on a real element. */
export function ayqClick(element: Element | null, what: string): void {
  if (element === null) throw new Error(`nothing to click for ${what}`);
  (element as HTMLElement).dispatchEvent(
    new (globalThis as unknown as { Event: typeof Event }).Event('click', {
      bubbles: true,
    }),
  );
}

/**
 * A stand-in engine on `window.ayq`, and a log of what was asked of it.
 *
 * The renderer's only door outwards is the bridge, so this is the whole of the
 * boundary a renderer test needs to control. Requests are recorded exactly as
 * they were sent, because what a screen asks the engine for is as much a part
 * of the contract as what it draws.
 */
export type AyqBridgeLog = {
  requests: Array<Record<string, unknown>>;
};

export function ayqStubBridge(
  answer: (request: Record<string, unknown>) => unknown,
): AyqBridgeLog {
  const log: AyqBridgeLog = { requests: [] };
  const holder = globalThis as unknown as {
    window: { ayq?: unknown };
  };
  holder.window.ayq = {
    request(request: Record<string, unknown>) {
      log.requests.push(request);
      const result = answer(request);
      return Promise.resolve(
        result === undefined
          ? { id: request.id, ok: false, kind: 'error', message: 'no answer' }
          : { id: request.id, ok: true, kind: request.kind, result },
      );
    },
  };
  return log;
}

/** Lets whatever the click started finish before the assertion reads it. */
export async function ayqSettled(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0));
}
