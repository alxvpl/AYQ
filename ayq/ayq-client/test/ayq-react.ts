// A window to render AYQ's own interface into, outside Electron.
//
// The components are the shipped ones and React is the shipped React; what is
// invented here is the window they are drawn in, and the engine behind the
// bridge. Nothing about the components is stubbed, so a test that finds a
// token on the screen has found the token the product uses.

import { JSDOM } from 'jsdom';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ReactNode } from 'react';

export type AyqWindow = {
  dom: JSDOM;
  container: HTMLElement;
  root: Root;
  /** What the renderer asked the engine for, in order. */
  asked: Array<Record<string, unknown>>;
  /** Tells the window the operating system has changed its mind. */
  setSystemDark(dark: boolean): void;
  render(tree: ReactNode): Promise<void>;
  close(): Promise<void>;
};

type Answer = (request: Record<string, unknown>) => unknown;

/**
 * Opens a window, with a stand-in engine behind the bridge.
 *
 * `matchMedia` is provided because jsdom has none and "follow the system"
 * (04 A23) is a question put to it — a test that could not answer that
 * question could not exercise the third ground at all.
 */
export async function ayqOpenWindow(answer: Answer): Promise<AyqWindow> {
  // Not `pretendToBeVisual`: it starts an animation-frame loop that outlives
  // the test file and keeps Node from exiting. React needs the two functions,
  // not the loop, so they are provided over timers.
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://ayq.invalid/',
  });
  const { window } = dom;

  let dark = false;
  const listeners = new Set<(event: { matches: boolean }) => void>();
  (window as unknown as Record<string, unknown>).matchMedia = (
    query: string,
  ) => ({
    media: query,
    matches: query.includes('dark') ? dark : false,
    addEventListener: (_name: string, listener: (event: { matches: boolean }) => void) =>
      listeners.add(listener),
    removeEventListener: (
      _name: string,
      listener: (event: { matches: boolean }) => void,
    ) => listeners.delete(listener),
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => true,
    onchange: null,
  });

  const asked: Array<Record<string, unknown>> = [];
  (window as unknown as Record<string, unknown>).ayq = {
    request(request: Record<string, unknown>) {
      asked.push(request);
      const result = answer(request);
      return Promise.resolve(
        result === undefined
          ? { id: request.id, ok: false, kind: 'error', message: 'no answer' }
          : { id: request.id, ok: true, kind: request.kind, result },
      );
    },
  };

  const globals = globalThis as unknown as Record<string, unknown>;
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  globals.window = window;
  globals.document = window.document;
  // Node has its own `navigator`, and it is read-only. React reads the
  // document's one, so the jsdom window's is put where it will be found.
  Object.defineProperty(globals, 'navigator', {
    value: window.navigator,
    configurable: true,
    writable: true,
  });
  const frame = (callback: (time: number) => void): unknown =>
    setTimeout(() => callback(Date.now()), 0);
  const cancelFrame = (handle: unknown): void =>
    clearTimeout(handle as ReturnType<typeof setTimeout>);
  (window as unknown as Record<string, unknown>).requestAnimationFrame = frame;
  (window as unknown as Record<string, unknown>).cancelAnimationFrame = cancelFrame;
  globals.requestAnimationFrame = frame;
  globals.cancelAnimationFrame = cancelFrame;
  for (const name of [
    'Event',
    'CustomEvent',
    'MouseEvent',
    'KeyboardEvent',
    'Node',
    'HTMLElement',
    'HTMLButtonElement',
    'HTMLInputElement',
    'HTMLSelectElement',
    'getComputedStyle',
    'DOMRect',
  ]) {
    globals[name] = (window as unknown as Record<string, unknown>)[name];
  }

  const container = window.document.createElement('div');
  window.document.body.append(container);
  const root = createRoot(container as unknown as Element);

  return {
    dom,
    container: container as unknown as HTMLElement,
    root,
    asked,
    setSystemDark(next: boolean) {
      dark = next;
      for (const listener of listeners) listener({ matches: next });
    },
    async render(tree: ReactNode) {
      await act(async () => {
        root.render(tree);
      });
    },
    async close() {
      await act(async () => {
        root.unmount();
      });
      window.close();
    },
  };
}

/** Presses something the way a person does. */
export async function ayqPress(element: Element | null): Promise<void> {
  if (element === null) throw new Error('there was nothing there to press');
  await act(async () => {
    (element as HTMLElement).click();
  });
}
