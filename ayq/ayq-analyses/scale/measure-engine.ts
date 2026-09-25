// Engine-side numbers at scale (directive 039 W2): validation time, time to
// first result, time to recompute on a context change, memory — for every
// shape of scale/generate.ts, on this machine, in Node. Each figure is the
// median of three runs. The headline of every first result is checked
// against an independent naive sum, so a wrong figure at scale would be
// caught here rather than read as "slow".
//
// Run with: npm run scale (bundles this file and runs it under --expose-gc).

import { performance } from 'node:perf_hooks';
import { analyse } from '../src/engine.js';
import { defaultContext, presetPeriod } from '../src/context.js';
import { validateSnapshot } from '../src/validate.js';
import type { AnalysisContext, AyqAnalyticalSnapshot } from '../src/types.js';
import { SHAPES, generate, type Shape } from './generate.js';

declare const gc: (() => void) | undefined;

function median(samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function timed<T>(runs: number, work: () => T): { ms: number; value: T } {
  const samples: number[] = [];
  let value!: T;
  for (let i = 0; i < runs; i += 1) {
    const t0 = performance.now();
    value = work();
    samples.push(performance.now() - t0);
  }
  return { ms: median(samples), value };
}

function mb(bytes: number): string {
  return (bytes / 1_048_576).toFixed(1);
}

/** The headline as r004 §8.8 defines it, summed the naive way: identified counterparties, money out, in scope. */
function naiveHeadline(snapshot: AyqAnalyticalSnapshot, context: AnalysisContext): bigint {
  const accounts = new Set(context.accountKeys);
  const categories = new Set(context.categoryKeys);
  let total = 0n;
  for (const tx of snapshot.transactions) {
    if (tx.bookingDate < context.fromDate || tx.bookingDate > context.toDate) continue;
    if (!accounts.has(tx.accountKey)) continue;
    const category = tx.category.state === 'categorised' ? tx.category.categoryId : null;
    if (!categories.has(category)) continue;
    if (tx.counterparty.state !== 'identified') continue;
    if (tx.amount.amount < 0) total += BigInt(-tx.amount.amount);
  }
  return total;
}

interface Row {
  shape: Shape;
  bytes: number;
  parseMs: number;
  validateMs: number;
  firstResultMs: number;
  comparisonMs: number;
  yearMs: number;
  oneAccountMs: number;
  rows: number;
  heapMb: number;
  rssMb: number;
  headlineAgrees: boolean;
}

function measure(shape: Shape): Row {
  const built = generate(shape);
  const text = JSON.stringify(built);
  const bytes = Buffer.byteLength(text, 'utf8');

  const parse = timed(3, () => JSON.parse(text) as unknown);
  const validate = timed(3, () => validateSnapshot(parse.value));
  const snapshot = validate.value;

  const context = defaultContext(snapshot);
  const first = timed(3, () => analyse(snapshot, context));
  const comparison = timed(3, () => analyse(snapshot, { ...context, comparison: 'previous' }));
  const year = presetPeriod(snapshot, 'lastYear');
  const lastYear = timed(3, () => analyse(snapshot, { ...context, fromDate: year.fromDate, toDate: year.toDate }));
  const oneAccount = timed(3, () => analyse(snapshot, { ...context, accountKeys: [context.accountKeys[0]] }));

  const headlineAgrees = first.value.totalMinor === naiveHeadline(snapshot, context);

  gc?.();
  const memory = process.memoryUsage();
  return {
    shape,
    bytes,
    parseMs: parse.ms,
    validateMs: validate.ms,
    firstResultMs: first.ms,
    comparisonMs: comparison.ms,
    yearMs: lastYear.ms,
    oneAccountMs: oneAccount.ms,
    rows: first.value.rows.length,
    heapMb: memory.heapUsed / 1_048_576,
    rssMb: memory.rss / 1_048_576,
    headlineAgrees,
  };
}

const only = process.argv.slice(2);
const shapes = only.length > 0 ? SHAPES.filter(shape => only.includes(shape.name)) : SHAPES;

console.log(`node ${process.version} · ${process.arch} · ${new Date().toISOString()}`);
console.log('');
console.log('| shape | accounts | counterparties | transactions | years | JSON MB | parse ms | validate ms | first result ms | +comparison ms | last year ms | one account ms | rows | heap MB | rss MB | headline |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const shape of shapes) {
  const row = measure(shape);
  console.log(
    `| ${shape.name} | ${shape.accounts} | ${shape.counterparties} | ${shape.transactions} | ${shape.years} | ${mb(row.bytes)} | ${row.parseMs.toFixed(0)} | ${row.validateMs.toFixed(0)} | ${row.firstResultMs.toFixed(0)} | ${row.comparisonMs.toFixed(0)} | ${row.yearMs.toFixed(0)} | ${row.oneAccountMs.toFixed(0)} | ${row.rows} | ${row.heapMb.toFixed(0)} | ${row.rssMb.toFixed(0)} | ${row.headlineAgrees ? 'agrees' : 'DIFFERS'} |`,
  );
  if (!row.headlineAgrees) process.exitCode = 1;
}
