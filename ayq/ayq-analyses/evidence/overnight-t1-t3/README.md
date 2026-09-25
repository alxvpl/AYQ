# Overnight revision bundle (directive 004 + 005 + 006) — T1 to T3

Governance: `AYQ_ANALYSES_DESIGN_SYSTEM` r005, `A1_SPECIFICATION` r004 (snapshot
contract r003 frozen as the A1 synthetic-input baseline), `02_ARCHITECTURE`
r007, `03_DATA` r017. Work item `overnight-revision-bundle-2026-09-22`,
EXCHANGE 004 (directive), 005 (T3 baseline periods), 006 (base 8178a66e).
Every snapshot used was generated from a seeded generator or is the contract's
own synthetic fixture; nothing here has ever been near a bank, and the
installed application's own store was not touched.

Machine: AMD Ryzen 7 9700X (8c/16t), 61.6 GB RAM, AMD Radeon RX 7600 XT,
Windows 11 Pro 10.0.26200, Node v24.21.0.

## T1 — the shared snapshot validator is linear

No user-facing change.

`ayq/ayq-analytical-contract/src/validate.ts` looked each transaction's
position up with `transactionOrder.indexOf(transaction)` inside the loop over
every transaction, and again for the two transfer-pair issues — O(n²) whether
or not a transaction is a reversal or a transfer (040 §2). The position is now
carried from the loop (`entries()`), and a transfer pair keeps the positions of
its members instead of searching for them.

Contract meaning is unchanged. An issue still names a transaction by its
position in `transactionOrder` — the transactions that passed their own
checks, in input order — exactly as before. That position differs from the
raw input index whenever an earlier transaction was refused or duplicated;
this was already so at the base, is preserved here character for character,
and is recorded as a finding rather than changed (issue paths are part of what
T1 must not change).

### Same issues, same order, same paths, codes and messages

A differential corpus (outside the repository) validated at the base
`8178a66e` and after the change: 3 010 snapshots — the contract fixture broken
by hand on exactly the two changed code paths (dangling reversal, self
reversal, three and four sides to a pair, an inconsistent pair, and both with a
refused and a duplicated transaction before them so that the order index and
the raw index diverge), 3 000 seeded random mutations of the fixture
(reversals, pair keys, duplicate keys, refused amounts, non-records, swaps,
deletions, sign and account changes), and three generated scale snapshots
(10 000, 10 000 and 50 000 transactions) with 105 injected errors each. 804
cases reach the changed lines (514 unresolved originals, 136 self reversals,
67 pairs of more than two, 224 inconsistent pairs). Both runs produced the
same 925 853-byte result: 348 valid, 9 786 issues, SHA-256
`aa795455454ad1453cc38a325c2e05d3abfeab13121ef362616e78346b85bca6`.

### The shape, before and after

Validation of the contract fixture plus n ordinary transactions (median of
five, three at the base above 80 000):

| transactions | base ms | T1 ms |
|---|---|---|
| 10 000 | 37.8 | 28.7 |
| 20 000 | 93.6 | 57.2 |
| 40 000 | 264.3 | 119.2 |
| 80 000 | 870.3 | 244.1 |
| 160 000 | 2 903.8 | 497.8 |

| 4× the transactions | base | T1 |
|---|---|---|
| 10 000 → 40 000 | 6.98× the time | 4.15× |
| 20 000 → 80 000 | 9.30× | 4.27× |
| 40 000 → 160 000 | 10.99× | 4.18× |

The existing engine-side harness (`npm run scale`, directive 039 W2, median of
three, every headline checked against a naive sum), base → T1:

| shape | transactions | validate ms, base | validate ms, T1 | headline |
|---|---|---|---|---|
| S1 | 1 000 | 4 | 4 | agrees |
| S2 | 10 000 | 49 | 40 | agrees |
| S3 | 50 000 | 381 | 182 | agrees |
| S4 | 100 000 | 1 227 | 319 | agrees |
| S5 | 250 000 | 6 540 | 865 | agrees |
| A50 | 10 000 | 41 | 37 | agrees |
| C20k | 50 000 | 391 | 179 | agrees |
| LONG | 20 000 | 96 | 67 | agrees |
| YEARS | 50 000 | 380 | 163 | agrees |

Every other column of that harness (parse, first result, comparison, rows,
memory) is unchanged within noise; the engine was already linear.

### The guard against the quadratic scan returning

Two tests in `ayq/ayq-analytical-contract/test/contract.test.ts`, inside the
package's `npm test` and therefore its CI workflow; neither is a wall-clock
threshold (C1):

- structural: `validate.ts` contains no `indexOf`, `lastIndexOf`,
  `findIndex`, `findLastIndex`, `includes`, `find` or `findLast` on
  `transactionOrder` or `transactionList`;
- proportional: the fixture plus 40 000 and plus 160 000 transactions both
  validate, and the larger takes less than eight times as long as the smaller
  (best of three, interleaved). Linear measures ≈ 4×; the base measures ≈ 11×.

Run against the base validator (the same test file in a scratch copy of the
package with the base `src/`), both fail: the structural test finds the three
`transactionOrder.indexOf(` calls, and the proportional test reports "4× the
transactions took 10.7× as long". Against T1 both pass (proportional ≈ 2.5 s
of the suite).

### Suites

| suite | result |
|---|---|
| `ayq-analytical-contract` `npm test` | 33 tests, 33 pass (31 before + the two guards); typecheck pass |
| `ayq-analyses` `npm test` | 165 tests, 165 pass; typecheck pass |
| `ayq-desktop` `test/ayq-snapshot.test.ts` — the producer's contract tests, on the real engine under Electron | 10 tests, 10 pass; `npm run build` and typecheck pass |

The producer test is the only AYQ desktop test that imports the contract
(`ayq-desktop/src/ayq-snapshot.ts` and `ayq-main.ts` use the validator; both
compile in the passing build). Its engine ran with the CI-built Electron-ABI
`better-sqlite3` 12.11.1 binding of the installed AYQ Personal Finances,
verified by `verify-native.mjs` (ABI 148), because the binding cannot be
rebuilt on this machine.

## T2 — a shortened chart label never looks like the whole name

User question (004 §1): when a counterparty name is shortened in the chart,
can I tell that it has been shortened rather than mistake the visible text for
the full name?

### What the owner saw (037 Observation A), reproduced

On the application before this change, the chart never shortened a name: it
drew every name whole, right-aligned against the axis, in a gutter that
ECharts' `containLabel` had sized too small, so a long name ran off the
canvas's **left** edge and lost its beginning — the part the owner recognises —
with no mark at all. Measured on the real built application (every string the
chart draws recorded at `fillText`, with its measured width), 175 %:

| synthetic case | rows | labels whose start is cut off at the canvas edge | ellipses |
|---|---|---|---|
| shared prefix (A1 fixture, two names sharing a 51-character prefix, beside "Superstore") | 3 | 2 (by 25 px and 8 px: they begin "rthwind" and "orthwind") | 0 |
| S2, ordinary names (8–28 characters) | 161 | 2 | 0 |
| LONG, names of 60–120 characters | 392 | 45 | 0 |

Two causes, both in ECharts 5.5.1: its `containLabel` measures a label in
plain sans-serif (Arial: 213.4 px for the text that is drawn at 228.2 px in the
font it actually draws with, `12px "Microsoft YaHei"`, its Windows default),
and above forty rows it measures only one label in ⌈n/40⌉. See
`t2_01_before_shared_prefix_start_cut.png`, `t2_03_before_long_names_start_cut.png`.

### The change

`src/geometry.ts` `CATEGORY_AXIS_LABEL`: the category-axis label is at most
240 CSS px (about forty characters of 12 px type), shortened at its end with
`overflow: 'truncate'` and exactly one U+2026, never wrapped; its size, family
and margin are ECharts' own defaults, named so they can be measured.
`categoryLabelGutter` sizes the room left of the axis as the widest label as
drawn over every row (capped at the label width), measured in the renderer
with a canvas in that same font; `grid.left` takes it instead of
`containLabel`. The width is chart-only geometry. Nothing else moves: amount
labels, tooltip, headline, table, detail pane, catalogue and colours are
unchanged, and the x axis draws no labels, so no other side of the grid
depended on `containLabel`.

### After, on the real built application

| synthetic case | device scale | rows | drawn whole | shortened, ending in one U+2026, a prefix of the full name | start cut at the canvas edge |
|---|---|---|---|---|---|
| shared prefix | 100 % · 175 % · 300 % | 3 | 1 ("Superstore") | 2 | 0 |
| S2, ordinary names | 100 % · 175 % · 300 % | 161 | 161 | 0 | 0 |
| LONG | 100 % · 175 % · 300 % | 392 | 0 | 392 (widest drawn 238 px) | 0 |

In every run the drawn labels, top to bottom, are the table's rows in the
table's order; the headline is unchanged (€246.25, €24,733.27, €55,560.34
before and after); one amount label per bar, as before; and clicking each of
the first three rows opens the detail pane headed with that row's full name.

The shared-prefix case (C3): "Northwind Regional Energy Cooperative
Association — Amsterdam Noord" (€120.00) and "… — Rotterdam Zuid" (€18.75) are
both drawn as "Northwind Regional Energy Cooperati…", as two separate bars (at
33 px and 131 px) with "Superstore" (€107.50) between them, and remain two
table rows with their full names; each opens its own detail pane. **Residual,
recorded and not solved here:** two end-shortened labels can read identically;
the bar's position, its amount and the table tell them apart. See
`t2_02_after_shared_prefix_ellipsis.png`, `t2_04_after_long_names_ellipsis.png`.

### Suite

`test/chart-labels.test.ts` (part of `npm test`): the label form (end only,
one U+2026, 240 px, never wrapped); the family is ECharts' own Windows default,
read from its source; the gutter holds the widest label over every row,
including one at a row `containLabel` would not have sampled; ECharts' own
`truncateText` with this configuration keeps ordinary names whole and gives a
long name its beginning plus one ellipsis, and marks both shared-prefix names;
only the category axis uses it, and the table cell and detail heading still
print `row.displayName`. `npm test`: 171 tests, 171 pass; typecheck pass.

## T3 — a safe-render budget below the raster limit

User question (004 §1): can the chart avoid unsafe resource use while the
complete analytical answer remains available in the table?

### What was measured before the budget

The real built application at `4b8faa44e` (T2, no budget) over a scratch
`--user-data-dir`, on synthetic snapshots with an exact number of counterparty
rows in the default period (the A1 fixture's accounts and coverage, n
counterparties with one February 2026 card payment each, validated by the
contract before use); 1 360 × 860 window, device scale forced with
`--force-device-scale-factor`. Memory is only this instance's own process tree,
walked from its PID (working set and private bytes per process, and Windows'
`GPU Process Memory` dedicated and shared counters for those PIDs); "after
driving" is after comparison on and off and the detail pane opened and closed
twice. Other `electron.exe` processes on the machine were neither counted nor
touched. The application renders on the GPU (ANGLE Direct3D 11, AMD Radeon RX
7600 XT; accelerated 2D canvas, from the DevTools `SystemInfo` domain).

| scale | rows | canvas, device px | area, Mpx | first result: tree working set / private | after driving: tree working set / private | GPU process after driving: working set / private | dedicated VRAM after driving |
|---|---|---|---|---|---|---|---|
| 100 % | 80 | 1 209 × 3 568 | 4.3 | 385 / 350 MB | 421 / 400 MB | 127 / 221 MB | 92 MB |
| 100 % | 160 | 1 209 × 7 088 | 8.6 | 393 / 464 MB | 440 / 555 MB | 113 / 342 MB | 144 MB |
| 100 % | 240 | 1 209 × 10 608 | 12.8 | 404 / 507 MB | 469 / 824 MB | 114 / 581 MB | 290 MB |
| 100 % | 320 | 1 209 × 14 128 | 17.1 | 425 / 669 MB | 482 / 924 MB | 113 / 670 MB | 419 MB |
| 100 % | 400 | 1 209 × 17 648 | 21.3 | 779 / 694 MB | 1 627 / 1 568 MB | 1 123 / 1 176 MB | 40 MB |
| 100 % | 540 | 1 209 × 23 808 | 28.8 | 909 / 823 MB | 2 046 / 1 984 MB | 1 470 / 1 519 MB | 40 MB |
| 100 % | 700 | 1 209 × 30 848 | 37.3 | 905 / 819 MB | 2 512 / 2 447 MB | 1 864 / 1 910 MB | 40 MB |
| 100 % | 900 | 1 209 × 39 648 | 47.9 | 1 035 / 945 MB | 3 088 / 3 029 MB | 2 359 / 2 413 MB | 40 MB |
| 175 % | 40 | 2 136 × 3 164 | 6.8 | 500 / 458 MB | 516 / 479 MB | 117 / 263 MB | 210 MB |
| 175 % | 80 | 2 136 × 6 244 | 13.3 | 386 / 516 MB | 422 / 735 MB | 116 / 543 MB | 333 MB |
| 175 % | 120 | 2 136 × 9 324 | 19.9 | 393 / 624 MB | 419 / 929 MB | 116 / 741 MB | 455 MB |
| 175 % | 160 | 2 136 × 12 404 | 26.5 | 399 / 734 MB | 430 / 1 037 MB | 118 / 839 MB | 579 MB |
| 175 % | 200 | 2 136 × 15 484 | 33.1 | 404 / 840 MB | 456 / 1 108 MB | 117 / 883 MB | 701 MB |
| 175 % | 211 | 2 136 × 16 331 | 34.9 | 404 / 874 MB | 444 / 1 084 MB | 118 / 871 MB | 737 MB |
| 175 % | 212 | 2 136 × 16 408 | 35 | 886 / 921 MB | 2 367 / 2 449 MB | 1 836 / 2 031 MB | 122 MB |
| 175 % | 240 | 2 136 × 18 564 | 39.7 | 941 / 976 MB | 3 519 / 2 726 MB | 2 503 / 2 275 MB | 122 MB |
| 175 % | 280 | 2 136 × 21 644 | 46.2 | 1 025 / 1 046 MB | 2 983 / 3 072 MB | 2 357 / 2 559 MB | 111 MB |
| 175 % | 320 | 2 136 × 24 724 | 52.8 | 1 437 / 1 393 MB | 3 454 / 3 471 MB | 2 664 / 2 862 MB | 121 MB |
| 175 % | 400 | 2 136 × 30 884 | 66 | 1 525 / 1 550 MB | 4 049 / 4 133 MB | 3 276 / 3 471 MB | 111 MB |
| 175 % | 540 | 2 136 × 41 664 | 89 | 1 896 / 1 915 MB | 5 280 / 5 373 MB | 4 351 / 4 558 MB | 112 MB |
| 175 % | 700 | 2 136 × 53 984 | 115.3 | 1 858 / 1 872 MB | 9 299 / 6 764 MB | 6 897 / 5 791 MB | 112 MB |
| 300 % | 40 | 3 435 × 5 424 | 18.6 | 381 / 698 MB | 410 / 940 MB | 132 / 775 MB | 529 MB |
| 300 % | 80 | 3 435 × 10 704 | 36.8 | 386 / 864 MB | 420 / 1 208 MB | 118 / 1 018 MB | 851 MB |
| 300 % | 120 | 3 435 × 15 984 | 54.9 | 393 / 1 271 MB | 414 / 1 592 MB | 117 / 1 408 MB | 1 179 MB |
| 300 % | 160 | 3 435 × 21 264 | 73 | 1 679 / 1 868 MB | 6 073 / 4 705 MB | 4 497 / 4 076 MB | 259 MB |
| 300 % | 200 | 3 435 × 26 544 | 91.2 | 1 959 / 2 150 MB | 7 436 / 5 645 MB | 5 541 / 4 904 MB | 231 MB |
| 300 % | 240 | 3 435 × 31 824 | 109.3 | 2 244 / 2 436 MB | 8 799 / 6 594 MB | 6 586 / 5 742 MB | 231 MB |
| 300 % | 300 | 3 435 × 39 744 | 136.5 | 2 671 / 2 864 MB | 10 853 / 8 027 MB | 8 155 / 7 000 MB | 222 MB |

What the numbers say. Below a canvas height of 16 384 device pixels — the
GPU's largest texture — the chart lives in video memory, which grows with its
area (up to 1.2 GB at 300 %), and the process tree stays near 0.4–0.5 GB of
working set. One device pixel taller and the canvas leaves the GPU: dedicated
video memory falls (701 → 122 MB at 175 %) while the process tree grows by
gigabytes and keeps growing with each redraw. Bracketed at 175 %: **211 rows
(16 331 px tall) 444 MB working set after driving; 212 rows (16 408 px)
2 367 MB.** The same jump appears at 100 % between 320 and 400 rows and at
300 % between 120 and 160 rows — at the same height, not at the same area.
This is the multi-gigabyte growth 040 measured.

### The budget

`src/geometry.ts` `SAFE_CANVAS_AREA` = 16 777 216 device pixels (4 096², a
sixteenth of the 268 435 456 raster area) with `canvasWithinSafeBudget`; the
chart decides before drawing, and on every resize, that it is too large when
it exceeds either the unchanged raster limit or this budget, and then states
`chart.tooLarge` in its place. No new sentence; the table is untouched.

How it was chosen: the budget is an area (004 §6), and the jump is a height.
At the default window the smallest canvas that crosses 16 384 device pixels is
the 100 % one, 1 209 × 16 384 ≈ 19.8 Mpx; the budget sits below it with a
margin, at the round 4 096², so that at the default window no canvas it
admits, at any scale, is taller than 13 876 device pixels. Every chart drawn
under it, in both sweeps, measured at most 516 MB of working set and 872 MB of
private bytes after driving.

Where the sentence begins, frame 1 220 CSS px wide (the default window; the
same figures the suite asserts):

| device scale | chart draws to | `chart.tooLarge` from | before T3 (raster limit only) |
|---|---|---|---|
| 100 % | 311 rows | 312 rows | 1 489 rows |
| 175 % | 100 rows | 101 rows | 851 rows |
| 200 % | 77 rows | 78 rows | 744 rows |
| 300 % | 33 rows | 34 rows | 496 rows |

Because the budget is an area, the row threshold falls as the chart gets wider:
at the owner's own viewport (2 194 × 1 234 CSS px at 175 %, a chart frame of
about 2 055 CSS px) it is 59 rows (the sentence from 60); at 100 % 184 rows.
On the real window the frame measured 1 209 CSS px at 100 % (the sentence from
315 rows) and, at 300 %, where a 1 360 × 860 window does not fit a 3 840 × 2 160
screen, 1 145 CSS px (the sentence from 36) — which is why 312 rows at 100 % and
34 rows at 300 % still draw in the sweep below.

**Finding for the joint leads, not acted on.** The growth follows the canvas's
height, and an area budget can only approximate a height. It over-restricts
wide charts (above: 59 rows at the owner's viewport, where anything up to 211
rows would stay on the GPU) and cannot protect a canvas narrower than
16 777 216 / 16 384 = 1 024 device pixels — at 100 % a window narrower than
about 1 160 CSS px, which the 1 100 px minimum allows: there (a frame of about
961 CSS px, computed from the default window, not measured) a chart of 372–395
rows would still cross 16 384 px. A
limit on the canvas's height at 16 384 device pixels would match the mechanism
exactly; it is a different guard from the accepted one, so it is returned to
the leads rather than decided here.

### Baseline preservation gate (005)

The frozen synthetic-input baseline, `test/fixtures/a1/a1-result.json` (both
accounts covered 2025-01-01 – 2026-03-04), all accounts, the dates typed into
the two date fields of the real built application:

| device scale | Period A, 2026-02-01 – 2026-02-28 (last full month) | Period B, 2025-01-01 – 2025-12-31 (last full calendar year) |
|---|---|---|
| 100 % | 3 rows, chart drawn (canvas 1 224 × 180) | 1 row, chart drawn (1 224 × 140) |
| 175 % | 3 rows, chart drawn (2 161 × 315) | 1 row, chart drawn (2 161 × 245) |

**PASS.** The same gate runs in `npm test` on the real engine and fixture
(`chart-guard.test.ts`). The application's presets resolve against the
snapshot's own `generatedAt` (2026-03-05), so Last month is Period A; This year
(2026-01-01 – 2026-03-05, 3 rows) is not Period B.

### Repeated-redraw memory gate (C5)

A synthetic population at the largest chart the budget admits: at 175 %,
This year 100 rows (canvas 2 136 × 7 784 = 16.6 Mpx) and Last month 60 rows; at
100 %, This year 311 rows (1 209 × 13 732 = 16.6 Mpx) and Last month 200 rows.
One cycle: comparison Previous period, comparison None, preset This year,
preset Last month, open the detail pane, Escape; the tree sampled after each
cycle. The plateau criterion was fixed before the first run: over the last
five cycles, working set and private bytes each within ±5 % of their mean and
a least-squares slope under 1 % of that mean per cycle.

| run | working set, MB, cycles 1 → last | private bytes, MB | whole-run slope, working set / private | pre-set criterion |
|---|---|---|---|---|
| 175 %, 12 cycles | 416, 424, 442, 440, 441, 441, 438, 432, 432, 434, 433, 434 | 696, 627, 643, 576, 577, 576, 639, 634, 569, 635, 635, 636 | +0.12 % / −0.25 % per cycle | working set met; private bytes not met (one swing to 569: 8.5 % from the mean) |
| 175 %, 24 cycles | 412 … 438 (the last ten 435–438) | 694 … 635 (the last ten 632–635, one 657) | +0.06 % / −0.11 % | **both met** |
| 100 %, 12 cycles | 481, 483, 483, 480, 481, 483, 480, 475, 476, 476, 476, 474 | 781, 685, 682, 680, 724, 724, 677, 602, 717, 716, 671, 601 | −0.17 % / −1.06 % | working set met; private bytes not met (swings of ±9 %, falling) |

Dedicated video memory is flat in every run (205 MB at 175 %, 175 MB at 100 %),
and one canvas exists throughout. **No run shows memory continuing to rise**:
the working set levels off by the third cycle, and private bytes, where they
move, move around a level and downwards (first third 707 → last third 676 MB
at 100 %). The two shorter runs miss the pre-set ±5 % band on private bytes
only because of garbage-collection swings; the 24-cycle run meets it on both.
Read against 004 §6 — a plateau rather than continuing cycle-by-cycle growth —
the gate passes; all three runs are reported as they came out.

### The large-population run again, with the budget

The same sweep over the built application with T3 (`chart.tooLarge` wherever
the budget or the raster limit refuses the canvas), beside the same population
before the budget. In every case the table holds every row (the "table rows"
column is counted on screen).

| scale | rows | table rows | chart | after driving, with the budget: tree working set / private | GPU process working set | dedicated VRAM | the same population before the budget: tree working set / private |
|---|---|---|---|---|---|---|---|
| 100 % | 311 | 311 | drawn, 1 209 × 13 732 | 480 / 689 MB | 113 MB | 367 MB | — |
| 100 % | 312 | 312 | drawn, 1 209 × 13 776 | 481 / 758 MB | 114 MB | 246 MB | — |
| 100 % | 400 | 400 | `chart.tooLarge` | 628 / 524 MB | 199 MB | 46 MB | 1 627 / 1 568 MB |
| 100 % | 540 | 540 | `chart.tooLarge` | 736 / 632 MB | 227 MB | 46 MB | 2 046 / 1 984 MB |
| 100 % | 900 | 900 | `chart.tooLarge` | 920 / 811 MB | 301 MB | 46 MB | 3 088 / 3 029 MB |
| 175 % | 100 | 100 | drawn, 2 136 × 7 784 | 421 / 872 MB | 119 MB | 393 MB | — |
| 175 % | 101 | 101 | `chart.tooLarge` | 400 / 466 MB | 114 MB | 246 MB | — |
| 175 % | 211 | 211 | `chart.tooLarge` | 427 / 635 MB | 114 MB | 387 MB | 444 / 1 084 MB |
| 175 % | 212 | 212 | `chart.tooLarge` | 707 / 666 MB | 264 MB | 114 MB | 2 367 / 2 449 MB |
| 175 % | 240 | 240 | `chart.tooLarge` | 764 / 721 MB | 281 MB | 114 MB | 3 519 / 2 726 MB |
| 175 % | 320 | 320 | `chart.tooLarge` | 886 / 845 MB | 330 MB | 114 MB | 3 454 / 3 471 MB |
| 175 % | 540 | 540 | `chart.tooLarge` | 1 212 / 1 160 MB | 477 MB | 114 MB | 5 280 / 5 373 MB |
| 175 % | 700 | 700 | `chart.tooLarge` | 1 438 / 1 392 MB | 578 MB | 115 MB | 9 299 / 6 764 MB |
| 300 % | 33 | 33 | drawn, 3 435 × 4 500 | 396 / 838 MB | 117 MB | 473 MB | — |
| 300 % | 34 | 34 | drawn, 3 435 × 4 632 | 401 / 855 MB | 119 MB | 481 MB | — |
| 300 % | 80 | 80 | `chart.tooLarge` | 404 / 723 MB | 116 MB | 534 MB | 420 / 1 208 MB |
| 300 % | 160 | 160 | `chart.tooLarge` | 1 011 / 1 093 MB | 427 MB | 248 MB | 6 073 / 4 705 MB |
| 300 % | 300 | 300 | `chart.tooLarge` | 2 066 / 2 151 MB | 669 MB | 248 MB | 10 853 / 8 027 MB |

Every population the budget now refuses costs materially less: at 175 %
2 367 → 707 MB (212 rows), 5 280 → 1 212 MB (540), 9 299 → 1 438 MB (700);
at 100 % 3 088 → 920 MB (900); at 300 % 6 073 → 1 011 MB (160) and
10 853 → 2 066 MB (300), working set after driving.

**Second finding, outside T3, not acted on.** What remains at the largest
populations is not the chart: there is no chart canvas. It is the page itself —
the long table in its scrolling body — which crosses the same 16 384-device-
pixel height (dedicated video memory falls to 114–248 MB and the GPU process
grows, as it did for the chart): 1.4 GB at 700 rows at 175 %, 2.1 GB at 300
rows at 300 %. The table is the complete answer and is not the chart; how a
very long table is presented is a Design System and shell question (r005 §8),
not this bundle's.

### Suite

`test/chart-guard.test.ts` (part of `npm test`): the raster-limit tests are
unchanged; the wiring assertion now requires both checks before drawing; the
budget is 4 096² and a sixteenth of the raster area; the chart draws to 311 /
100 / 77 / 33 rows at 100 / 175 / 200 / 300 %; at the default window no canvas
the budget admits is taller than 16 384 device pixels at any scale from 100 to
300 %; the frozen synthetic-input baseline, run through the real engine,
gives Period A 3 rows and Period B 1 row, and both fit at 100 % and 175 %.
