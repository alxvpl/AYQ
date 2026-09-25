// Application-side numbers at scale (directive 039 W2): the real built
// application, launched over a scratch --user-data-dir whose store holds a
// generated snapshot, driven and timed through the Chrome DevTools Protocol
// on a debugging port that only this scratch instance opens. Nothing here
// goes near the installed application's own store.
//
// Reports, per shape: time from process start to the first result on screen,
// time to redraw on a context change (comparison on; This year; one account;
// a row's detail pane), the renderer's JS heap, and the working set of the
// whole process tree. Each redraw figure is the median of three.
//
// Usage: node scale/measure-app.mjs [SHAPE ...]   (defaults to S2 S3 S4 LONG YEARS)

import { build } from 'esbuild';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import electron from 'electron';
import { buildApplication } from '../build-lib.mjs';

const PORT = 9333;
const APP = resolve('dist-test', 'app');
const shapesWanted = process.argv.length > 2 ? process.argv.slice(2) : ['S2', 'S3', 'S4', 'LONG', 'YEARS'];

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
const { SHAPES, generate } = await import(pathToFileURL(resolve('dist-test', 'scale', 'generate.mjs')).href);

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
    if (reply.result?.exceptionDetails) throw new Error(reply.result.exceptionDetails.text + ' ' + (reply.result.exceptionDetails.exception?.description ?? ''));
    return reply.result?.result?.value;
  };
  return { send, evaluate, close: () => ws.close() };
}

async function pageTarget() {
  for (let i = 0; i < 300; i += 1) {
    try {
      const list = await fetch(`http://127.0.0.1:${PORT}/json`).then(r => r.json());
      const page = list.find(t => t.type === 'page' && t.url.startsWith('file:'));
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      // not up yet
    }
    await sleep(100);
  }
  throw new Error('no page target');
}

/**
 * The working set of the whole process tree. The scratch instance is the only
 * `electron.exe` on the machine (the installed application runs as
 * `AYQ Analyses.exe`), so its tree is every electron process.
 */
function workingSetMb(label = '') {
  const out = execFileSync(
    'powershell',
    [
      '-NoProfile',
      '-Command',
      "$p = Get-CimInstance Win32_Process -Filter \"Name='electron.exe'\"; $p | ForEach-Object { [Console]::Error.WriteLine('    ' + $_.ProcessId + ' ' + [math]::Round($_.WorkingSetSize/1MB) + ' MB ' + (($_.CommandLine -split ' ' | Where-Object { $_ -like '--type=*' }) -join '')) }; [math]::Round(($p | Measure-Object WorkingSetSize -Sum).Sum / 1MB)",
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', process.env.SCALE_TRACE ? 'inherit' : 'ignore'] },
  );
  if (process.env.SCALE_TRACE) console.error('  working set after', label, out.trim(), 'MB');
  return Number.parseInt(out.trim(), 10);
}

/** A DOM change measured from inside the page: runs `act`, resolves with ms when `until` becomes true. */
function redrawScript(act, until) {
  return `new Promise(resolve => {
    const t0 = performance.now();
    const done = () => { if (${until}) { observer.disconnect(); resolve(performance.now() - t0); } };
    const observer = new MutationObserver(done);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    (${act})();
    setTimeout(() => { observer.disconnect(); resolve(-1); }, 15000);
  })`;
}

const clickOption = (comboLabel, optionText) => `async () => {
  const combo = [...document.querySelectorAll('[role=combobox]')].find(c => c.getAttribute('aria-label') === '${comboLabel}');
  combo.click();
  await new Promise(r => setTimeout(r, 50));
  const option = [...document.querySelectorAll('[role=option]')].find(o => o.textContent.trim() === '${optionText}');
  option.click();
}`;

const clickMenuItem = label => `async () => {
  const trigger = document.querySelector('.period-control button');
  trigger.click();
  await new Promise(r => setTimeout(r, 50));
  const item = [...document.querySelectorAll('[role=menuitem]')].find(o => o.textContent.trim() === '${label}');
  item.click();
}`;

/** Three samples of a redraw, each from the same starting state: act, measure, then undo. */
async function median3(page, act, until, undo) {
  const samples = [];
  for (let i = 0; i < 3; i += 1) {
    samples.push(await page.evaluate(redrawScript(act, until)));
    if (process.env.SCALE_TRACE) console.error('  sample', i, samples[i]);
    await undo();
    await sleep(300);
  }
  return samples.sort((a, b) => a - b)[1];
}

async function measure(shape) {
  const store = resolve('dist-test', `scale-store-${shape.name}`);
  rmSync(store, { recursive: true, force: true });
  mkdirSync(store, { recursive: true });
  const text = JSON.stringify(generate(shape));
  writeFileSync(resolve(store, 'active-snapshot.json'), text);
  writeFileSync(resolve(store, 'active-snapshot.meta.json'), JSON.stringify({ fileName: `${shape.name}.json` }));

  const t0 = performance.now();
  const child = spawn(String(electron), [`--user-data-dir=${store}`, `--remote-debugging-port=${PORT}`, resolve(APP, 'main.js')], {
    stdio: 'ignore',
  });
  let page;
  if (process.env.SCALE_TRACE) console.error('  main pid', child.pid);
  try {
    page = await cdp(await pageTarget());
    await page.send('Runtime.enable');
    await page.send('Performance.enable');
    // First result: the headline figure on screen.
    let firstResultMs = -1;
    for (let i = 0; i < 1200; i += 1) {
      const headline = await page.evaluate(`document.querySelector('.headline')?.textContent ?? null`);
      if (headline) {
        firstResultMs = performance.now() - t0;
        break;
      }
      await sleep(100);
    }
    const sincePageStart = await page.evaluate('performance.now()');
    const rows = await page.evaluate(`document.querySelectorAll('table.rows tbody tr').length`);
    const workingAtRest = workingSetMb('first result');

    const hasComparison = `document.querySelector('.comparison') !== null`;
    const periodIs = label => `document.querySelector('.period-control button').textContent.trim() === '${label}'`;
    const comparisonMs = await median3(page, clickOption('Comparison', 'Previous period'), hasComparison, () =>
      page.evaluate(redrawScript(clickOption('Comparison', 'None'), `document.querySelector('.comparison') === null`)),
    );

    workingSetMb('comparison samples');
    const yearMs = await median3(page, clickMenuItem('This year'), periodIs('This year'), () =>
      page.evaluate(redrawScript(clickMenuItem('Last month'), periodIs('Last month'))),
    );
    await page.evaluate(redrawScript(clickMenuItem('This year'), periodIs('This year')));
    await sleep(800);
    const rowsThisYear = await page.evaluate(`document.querySelectorAll('table.rows tbody tr').length`);
    await page.evaluate(redrawScript(clickMenuItem('Last month'), periodIs('Last month')));

    workingSetMb('period samples');
    const escape = async () => {
      await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    };
    const detailMs = await median3(
      page,
      `() => { document.querySelector('table.rows tbody tr').click(); }`,
      `document.querySelector('.detail-pane') !== null`,
      escape,
    );

    const metrics = await page.send('Performance.getMetrics');
    const heap = metrics.result.metrics.find(m => m.name === 'JSHeapUsedSize')?.value ?? 0;
    const nodes = metrics.result.metrics.find(m => m.name === 'Nodes')?.value ?? 0;
    const working = workingSetMb('detail samples');

    return {
      shape: shape.name,
      json: (Buffer.byteLength(text) / 1_048_576).toFixed(1),
      firstResultMs: Math.round(firstResultMs),
      sincePageStartMs: Math.round(sincePageStart),
      rows,
      rowsThisYear,
      comparisonMs: Math.round(comparisonMs),
      yearMs: Math.round(yearMs),
      detailMs: Math.round(detailMs),
      heapMb: Math.round(heap / 1_048_576),
      domNodes: nodes,
      workingSetMb: working,
      workingAtRestMb: workingAtRest,
    };
  } finally {
    page?.close();
    try {
      execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } catch {
      // already gone
    }
    await sleep(1500);
    rmSync(store, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  }
}

console.log(`electron ${JSON.stringify(process.versions.node)} host node · ${new Date().toISOString()}`);
console.log('| shape | JSON MB | first result ms (from spawn) | ms since page start | rows (last month) | rows (this year) | +comparison ms | This year ms | detail pane ms | renderer heap MB | DOM nodes | process tree MB at first result | process tree MB after driving |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const name of shapesWanted) {
  const shape = SHAPES.find(s => s.name === name);
  if (!shape) continue;
  const r = await measure(shape);
  console.log(
    `| ${r.shape} | ${r.json} | ${r.firstResultMs} | ${r.sincePageStartMs} | ${r.rows} | ${r.rowsThisYear} | ${r.comparisonMs} | ${r.yearMs} | ${r.detailMs} | ${r.heapMb} | ${r.domNodes} | ${r.workingAtRestMb} | ${r.workingSetMb} |`,
  );
}
