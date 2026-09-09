// A document for the renderer to draw into, outside Electron.
//
// The page it loads is the shipped one — `src/ayq-client.html`, the same file
// the host serves — so a test that finds an element proves the element is in
// the product, and a shell that stops providing somewhere to draw fails here
// rather than on a Windows runner twenty minutes later.
//
// jsdom is a test dependency and only a test dependency. The renderer's own
// sources still import nothing but each other; `ayq-boundary.test.ts` reads
// `src/` and would say so if that changed.

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { JSDOM } from 'jsdom';

const here = dirname(fileURLToPath(import.meta.url));
const page = join(here, '..', 'src', 'ayq-client.html');

/** The elements the shell draws into, by the ids it looks them up with. */
export type AyqShellElements = {
  sections: HTMLElement;
  accounts: HTMLElement;
  title: HTMLElement;
  context: HTMLElement;
  body: HTMLElement;
  summary: HTMLElement;
  problem: HTMLElement;
  importButton: HTMLElement;
};

/**
 * Loads the shipped page and puts its document where the renderer looks.
 *
 * The renderer reads `document` as a global, which is what it has inside a
 * browser window; here that global is a jsdom one. Nothing is stubbed: the
 * elements, the classes and the events are real.
 */
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

  const need = (id: string): HTMLElement => {
    const found = window.document.getElementById(id);
    if (found === null) {
      throw new Error(`the shell has no #${id} for the renderer to draw into`);
    }
    return found as unknown as HTMLElement;
  };

  return {
    sections: need('ayq-sections'),
    accounts: need('ayq-accounts'),
    title: need('ayq-title'),
    context: need('ayq-context'),
    body: need('ayq-body'),
    summary: need('ayq-summary'),
    problem: need('ayq-problem'),
    importButton: need('ayq-import'),
  };
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
