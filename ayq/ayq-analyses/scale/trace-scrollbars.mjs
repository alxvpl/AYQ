// Observation B of 037 (directive 039 W3): locate the nested vertical
// scrollbars. The real built application is launched over a scratch
// --user-data-dir seeded with a generated snapshot, then asked through the
// DevTools Protocol, at several window sizes and result lengths, which
// elements actually scroll vertically: computed overflow-y, scrollHeight
// against clientHeight, and whether a vertical scrollbar is present
// (offsetWidth − clientWidth on a block that overflows). Nothing is fixed.
//
// Usage: node scale/trace-scrollbars.mjs

import { build } from 'esbuild';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import electron from 'electron';
import { buildApplication } from '../build-lib.mjs';

const PORT = 9334;
const APP = resolve('dist-test', 'app');
await buildApplication(APP);
await build({
  entryPoints: ['scale/generate.ts'],
  outfile: 'dist-test/scale/generate.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external: ['node:*'],
});
const { generate } = await import(pathToFileURL(resolve('dist-test', 'scale', 'generate.mjs')).href);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function cdp(pageWs) {
  const ws = new WebSocket(pageWs);
  await new Promise((ok, no) => {
    ws.onopen = ok;
    ws.onerror = no;
  });
  let id = 0;
  const pending = new Map();
  ws.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.id !== undefined && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
  };
  const send = (method, params = {}) =>
    new Promise(r => {
      id += 1;
      pending.set(id, r);
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async expression => {
    const reply = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (reply.result?.exceptionDetails) throw new Error(JSON.stringify(reply.result.exceptionDetails).slice(0, 400));
    return reply.result?.result?.value;
  };
  return { send, evaluate, close: () => ws.close() };
}

async function pageTarget() {
  for (let i = 0; i < 300; i += 1) {
    try {
      const list = await fetch(`http://127.0.0.1:${PORT}/json`).then(r => r.json());
      const page = list.find(t => t.type === 'page' && t.url.startsWith('file:'));
      if (page) return { ws: page.webSocketDebuggerUrl, targetId: page.id };
    } catch {
      // not up yet
    }
    await sleep(100);
  }
  throw new Error('no page target');
}

const SCROLL_SURVEY = `(() => {
  const out = [];
  for (const el of document.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    const overflowY = cs.overflowY;
    const scrolls = el.scrollHeight > el.clientHeight + 1 && (overflowY === 'auto' || overflowY === 'scroll');
    if (!scrolls) continue;
    const sel = el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).join('.') : '') + (el.id ? '#' + el.id : '');
    out.push({ sel: sel.slice(0, 80), overflowY, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight, verticalBar: el.offsetWidth - el.clientWidth - (parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth)) });
  }
  const html = document.documentElement, body = document.body;
  out.push({ sel: 'html', overflowY: getComputedStyle(html).overflowY, scrollHeight: html.scrollHeight, clientHeight: html.clientHeight, verticalBar: window.innerWidth - html.clientWidth });
  out.push({ sel: 'body', overflowY: getComputedStyle(body).overflowY, scrollHeight: body.scrollHeight, clientHeight: body.clientHeight, verticalBar: 0 });
  return { inner: [window.innerWidth, window.innerHeight], dpr: window.devicePixelRatio, rows: document.querySelectorAll('table.rows tbody tr').length, chart: document.querySelector('.chart')?.offsetHeight ?? null, elements: out };
})()`;

const clickMenuItem = label => `(async () => {
  document.querySelector('.period-control button').click();
  await new Promise(r => setTimeout(r, 80));
  [...document.querySelectorAll('[role=menuitem]')].find(o => o.textContent.trim() === '${label}').click();
  await new Promise(r => setTimeout(r, 600));
})()`;

const shapes = (process.env.SCROLL_SHAPES ?? 'few,S2,A50').split(',').map(name => {
  const preset = {
    few: { accounts: 2, counterparties: 8, transactions: 400, years: 2, nameLength: [8, 24] },
    S2: { accounts: 5, counterparties: 500, transactions: 10_000, years: 3, nameLength: [8, 24] },
    A50: { accounts: 50, counterparties: 300, transactions: 10_000, years: 3, nameLength: [8, 24] },
  }[name];
  // "A<n>" builds a shape with n accounts and a modest result, to find the account count at which the flyout overflows.
  const match = /^A(\d+)$/.exec(name);
  return { name, ...(preset ?? { accounts: Number(match[1]), counterparties: 60, transactions: 2_000, years: 2, nameLength: [8, 24] }) };
});
/** The states a screen can be in besides the bare result: the detail pane open, the coverage flyout open. */
const STATES = {
  bare: `(async () => {})()`,
  'detail pane open': `(async () => { document.querySelector('table.rows tbody tr')?.click(); await new Promise(r => setTimeout(r, 500)); })()`,
  'coverage flyout open': `(async () => { document.querySelector('.context-coverage button')?.click(); await new Promise(r => setTimeout(r, 500)); })()`,
};
const UNDO = `(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await new Promise(r => setTimeout(r, 300)); })()`;
const windows = (process.env.SCROLL_WINDOWS ?? '1360x860,1100x720,1920x1080').split(',').map(pair => pair.split('x').map(Number));

for (const shape of shapes) {
  const store = resolve('dist-test', `scroll-store-${shape.name}`);
  rmSync(store, { recursive: true, force: true });
  mkdirSync(store, { recursive: true });
  writeFileSync(resolve(store, 'active-snapshot.json'), JSON.stringify(generate(shape)));
  writeFileSync(resolve(store, 'active-snapshot.meta.json'), JSON.stringify({ fileName: `${shape.name}.json` }));
  const child = spawn(String(electron), [`--user-data-dir=${store}`, `--remote-debugging-port=${PORT}`, resolve(APP, 'main.js')], { stdio: 'ignore' });
  let page;
  try {
    const target = await pageTarget();
    page = await cdp(target.ws);
    await page.send('Runtime.enable');
    for (let i = 0; i < 300; i += 1) {
      if (await page.evaluate(`document.querySelector('.headline') !== null`)) break;
      await sleep(100);
    }
    for (const [w, h] of windows) {
      // The viewport is emulated at each size (the layout viewport is what
      // decides which container overflows); the window itself is not moved.
      await page.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 0, mobile: false });
      await sleep(600);
      for (const period of ['Last month', 'This year']) {
        await page.evaluate(clickMenuItem(period));
        for (const [state, enter] of Object.entries(STATES)) {
          await page.evaluate(enter);
          const survey = await page.evaluate(SCROLL_SURVEY);
          const scrollers = survey.elements.filter(e => e.scrollHeight > e.clientHeight + 1);
          console.log(`${shape.name} · ${w}×${h} · ${period} · ${state} · rows ${survey.rows} · chart ${survey.chart}px → ${scrollers.length} scroller(s): ${scrollers.map(e => `${e.sel} (${e.overflowY}, ${e.scrollHeight}/${e.clientHeight}, bar ${Math.round(e.verticalBar)}px)`).join('; ') || 'none'}`);
          await page.evaluate(UNDO);
          await page.evaluate(`(async () => { document.body.click(); await new Promise(r => setTimeout(r, 200)); })()`);
        }
      }
    }
  } finally {
    page?.close();
    try {
      execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } catch {
      // gone
    }
    await sleep(1500);
    rmSync(store, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  }
}
