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
