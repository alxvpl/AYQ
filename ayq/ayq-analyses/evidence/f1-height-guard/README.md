# F1 — the chart's height guard replaces the area budget (directive 025 §2)

Governance: directive 025 (resumed under 027 and ChatGPT's 028 ACCEPT), overnight
009 §8 and 024 F1-C1 / F1-C2; `AYQ_ANALYSES_DESIGN_SYSTEM` r005 §8.2. Every
snapshot used was synthetic (the A1 fixture, or its accounts and coverage with
an exact number of invented counterparties); every launch was the real built
application over its own scratch `--user-data-dir`, measured as its own process
tree (working set, private bytes, and Windows' GPU Process Memory counters for
those PIDs). The installed application's store was not touched. Method as in
`../overnight-t1-t3/README.md` (T3).

Machine: AMD Ryzen 7 9700X, 61.6 GB RAM, AMD Radeon RX 7600 XT, Windows 11 Pro
10.0.26200; the application renders through ANGLE Direct3D 11 with an
accelerated 2D canvas.

## Why

T3 measured the memory cliff at a canvas **height** of 16 384 device pixels —
the GPU's largest texture — and guarded with an **area** budget (4096²), as 004
prescribed. The area proxy over-restricted wide windows (59 rows at the owner's
viewport) and left narrow ones exposed (a 1 100-pixel window at 100 % could
still draw a canvas taller than 16 384 pixels).

## The change

`src/geometry.ts`: `SAFE_CANVAS_AREA` / `canvasWithinSafeBudget` are replaced by
`SAFE_CANVAS_HEIGHT = 16 384`, `safeHeightLimit(reported)` — the smaller of
16 384 and the GPU's reported largest texture, 16 384 when nothing usable is
reported — and `canvasWithinSafeHeight(cssHeight, dpr, limit)`, which takes the
limit as a parameter. The device height is the backing store as allocated:
`floor(cssHeight × dpr)` (the canvas's size is an integer attribute; the
measured canvases agree — a 1 221-pixel frame at 175 % gives a 2 136-pixel
canvas, not 2 137). `src/ui/result.tsx` reads the limit once from WebGL
(`MAX_TEXTURE_SIZE`, context released at once) and refuses the chart when
either the unchanged raster limit or the height limit is exceeded, with the
accepted `chart.tooLarge` sentence. No area cap. No new string.

**Maximum texture size on this machine**: 16 384 — WebGL 1 and WebGL 2 in the
application's own renderer (`MAX_TEXTURE_SIZE` 16 384, `MAX_RENDERBUFFER_SIZE`
16 384). Chromium's `SystemInfo` does not expose it; the renderer reads it
itself, with no permission and no process-model change.

## Where the chart stops (the real built application)

| window, device scale | last row drawn | canvas | after driving: working set / private / video memory | first row refused |
|---|---|---|---|---|
| default, 100 % | 371 | 1 209 × 16 372 | 490 / 972 / 429 MB | 372 |
| default, 175 % | 211 | 2 136 × 16 331 | 448 / 1 144 / 738 MB | 212 |
| default, 200 % | 185 | 2 442 × 16 376 | 446 / 1 281 / 861 MB | 186 |
| default, 300 % (frame 1 145) | 123 | 3 435 × 16 380 | 423 / 1 634 / 1 202 MB | 124 |
| minimum window 1 100 × 720, 100 % (frame 973) | 371 | 973 × 16 372 | 493 / 796 / 236 MB | 372 (390 also refused) |
| owner's viewport 2 194 × 1 234, 175 % (frame 2 067) | **211** (T3: 59) | 3 617 × 16 331 | 457 / 2 237 / 1 729 MB | 212 |

The threshold no longer depends on the window's width. Viewports other than the
default were emulated through the DevTools Protocol, as the r004 scrollbar
trace did.

## The narrow-window gap, before and after

Minimum window, 100 %, 390 rows. **T3**: drawn as a 973 × 17 208 canvas —
taller than 16 384 — with the off-GPU signature (dedicated video memory 46 MB,
GPU process working set up to 330 MB). **F1**: refused; the table complete.

## The owner's viewport, before and after

2 194 × 1 234 at 175 %: T3 drew 59 rows and refused 60; F1 draws 59, 60 and 211
rows and refuses 212.

## Baseline (005)

The frozen synthetic-input baseline, all accounts, dates typed into the fields:
Period A 2026-02-01 – 2026-02-28 (3 rows) and Period B 2025-01-01 – 2025-12-31
(1 row) draw at 100 % (1 224 × 180, 1 224 × 140) and 175 % (2 161 × 315,
2 161 × 245).

## Repeated redraw at the largest admitted charts (method of 007 §5.4)

One cycle: comparison Previous period, comparison None, preset This year,
preset Last month, detail pane opened, Escape; the tree sampled after each.
Pre-set criterion: last five cycles within ±5 % of their mean and a
least-squares slope under 1 %/cycle.

| run | working set, MB, cycles 1–12 | private bytes, MB, cycles 1–12 | video memory | pre-set criterion |
|---|---|---|---|---|
| owner's viewport, 175 %, This year 211 rows (3 617 × 16 331) | 433, 466, 469, 468, 470, 471, 463, 463, 463, 463, 464, 464 | 1 197, 1 233, 1 235, 1 232, 1 233, 1 233, 1 225, 1 225, 1 224, 1 224, 1 225, 1 225 | 810–811 MB | both met |
| default, 300 %, This year 123 rows (3 435 × 16 380) | 421, 425, 449, 448, 451, 451, 445, 441, 443, 442, 442, 443 | 1 239, 1 243, 1 106, 1 105, 1 108, 1 109, 1 103, 1 098, 1 100, 1 099, 1 098, 1 099 | 780–783 MB | both met |
| default, 100 %, This year 371 rows (1 209 × 16 372) | 472, 486, 486, 482, 486, 488, 483, 480, 480, 481, 481, 483 | 718, 671, 628, 623, 625, 626, 621, 617, 617, 618, 619, 664 | 176–257 MB | working set met; private bytes not met (last-cycle swing 617 → 664; whole-run slope −0.65 %/cycle, falling) |

No run shows memory continuing to rise below the limit; everything admitted
stays on the GPU. Observation for the joint leads, not a failure: below the
limit, video memory still grows with canvas area — the largest admitted chart
at the owner's viewport held 0.8 GB of video memory steadily over 12 redraws,
and 1.7 GB in one sample after the sweep's own driving.

## Suite

`test/chart-guard.test.ts`: the raster-limit tests unchanged; the limit is
16 384, lowered to a smaller reported texture and never raised; the height is
truncated as allocated; 211 rows draw and 212 are refused at 175 %; the chart
draws to 371 / 211 / 185 / 123 rows at 100 / 175 / 200 / 300 % at every window
width; a smaller limit (8 192) refuses earlier; no admitted canvas is taller
than the limit however narrow the window; the 005 baseline still draws; the
component reads WebGL's `MAX_TEXTURE_SIZE` and guards with it. `npm test`:
178 tests, 178 pass; typecheck pass.
