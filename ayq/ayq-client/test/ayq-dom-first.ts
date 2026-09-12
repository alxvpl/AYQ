// A DOM, installed before React is.
//
// This exists because of one line in React's own change-event handling:
//
//   isInputEventSupported = isEventSupported('input') && ...
//
// It runs when `react-dom` is *loaded*, reads the global `document`, and caches
// the answer for the life of the process. Loaded without a document, React
// concludes the browser has no `input` event and falls back to a polyfill that
// watches `keydown` and `selectionchange` — so `onChange` never fires for a text
// input, however the value is set. Every other handler works, which is what made
// this look like a quirk of one control rather than a missing document.
//
// So the window is created here, with no React anywhere in this module's own
// imports, and this module is loaded first: `build-tests.mjs` injects it at the
// top of every test bundle. `ayqOpenWindow` then opens the window each test
// actually uses; this one exists only so that React finds a DOM on the way in.

import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://ayq.invalid/',
});

const globals = globalThis as unknown as Record<string, unknown>;
globals.window = dom.window;
globals.document = dom.window.document;

/** The window React was loaded against. Not the one a test draws into. */
export const ayqLoadingWindow = dom.window;
