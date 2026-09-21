# r004 — the chart guard, the attention tone, the bounded flyout

The three corrections of `AYQ_ANALYSES_DESIGN_SYSTEM` r004 and 040 §3,
delivered as one installed Windows candidate on 2026-09-21. No images: each
fix was proven on the real built application through the DevTools Protocol
over a scratch `--user-data-dir` seeded with generated snapshots
(`../../scale/`), and by the suite. The installed application's own store
was not read, copied, moved or deleted; its existence and write time were
checked before and after the update, nothing else.

## 1. The chart guard — r004 §8.2

`chart.tooLarge` — "This result is too large to show as a chart. The table
still shows the complete result."

Threshold, by measurement on this Electron (`scale` probe, 2026-09-21): a
canvas draws up to a side of **65 535** device pixels and an area of
**268 435 456** (16 384²); one pixel more on either and it exists but draws
nothing. `src/geometry.ts` carries both as `MAX_CANVAS_SIDE` /
`MAX_CANVAS_AREA` with `canvasFitsRaster(cssWidth, cssHeight, dpr)`; the
chart decides before it draws — from its frame's width, its rows' height and
`window.devicePixelRatio` — and re-decides on every resize. At 175 % the
chart draws to 850 rows and states the sentence from 851; at 100 % to 1 488;
at 200 % to 743; at 300 % to 495 (`test/chart-guard.test.ts`).

On the real application (`dist-test/scale/guard-probe`): S2 (161 rows)
canvas 2 136 × 12 481, painted; S3 (540 rows) 2 136 × 41 664, painted; S5
(1 377 rows) **no canvas, the sentence in its place**, process tree 1 378 MB.
Below the threshold nothing changed: a 540-row chart still costs 4.1 GB,
which remains the chart workstream's (r004 §13, §15).

## 2. The attention tone — r004 §4

`STATE.attention` = `#925500` (was `#9a5a00`). The conformance suite measures
it on every surface the role is drawn on — the ground, the pane, and Fluent's
rest / hover / pressed / selected surfaces of the outline coverage button —
the lowest governing, gate 4.5:1:

| surface | value | ratio |
|---|---|---|
| white / outline button rest | `#ffffff` | 5.96:1 |
| ground (coverage sentences, context bar) | `#f6f7f9` | 5.56:1 |
| outline button hover | `#f5f5f5` | 5.47:1 |
| outline button selected | `#ebebeb` | 5.00:1 |
| outline button pressed | `#e0e0e0` | **4.52:1** |

Accepted: no surface below threshold. The former `todo` test is gone; the
tone's value is pinned and the three figures r004 §4.1 records (5.96 / 5.47
/ 4.52) are asserted to two decimals.

## 3. The coverage flyout — 040 §3

`Popover` positioning `{ position: 'below', align: 'end', autoSize: 'height' }`
and `.coverage-flyout { max-height: calc(100vh - 24px); overflow-y: auto; }`.
No new string, no other change in behaviour.

`scale/trace-scrollbars.mjs`, 24 and 50 accounts, viewport 1360 × 860 /
1100 × 720 / 1920 × 1080, Last month and This year, flyout open:

| before (ad7419858) | after |
|---|---|
| `main.body` scrolls **and `html` scrolls** (document 999–2 440 px): two bars on the window edge | `main.body` scrolls; the flyout scrolls **in itself** (clamped to 729 / 572 / 1 001 px of the 860 / 720 / 1080 viewports); `html` does not scroll: one bar on the window edge |

## The candidate

| | |
|---|---|
| source | the commit adding this directory |
| `npm test` | **165 tests, 165 pass, 0 fail, 0 todo** |
| typecheck / build / package | pass |
| installer | `release/AYQ Analyses-0.1.0-windows-x64-setup.exe`, 139 230 493 bytes |
| installer SHA-256 | `ED1ACB478487E6B5077AA8EF79612B60C8F217C905312B8CE9E352317236C551` |
| copy for the owner | `C:\Users\alxv\Downloads\AYQ Analyses-0.1.0-windows-x64-setup.exe`, same hash |
| installed | per-user, silent `/S`, exit 0, 2026-09-21 23:11:30 local, over the 032 candidate; `resources/app.asar` SHA-256 `8571668F4FD362DEC920F9360692B958BB2658CA19993F5208E53C6D6962C91D` |
| the owner's store | `active-snapshot.json` and its meta existed before the update and after it, with the same write time (09:48:29) and no temporary file; the application was launched after the update and opened its window. What it shows was not looked at. |
| code signing | none configured; unsigned |
