# A2 design foundation — installed-application evidence

Thirteen screenshots of the installed Windows application after the A2 design
foundation, each reached from a synthetic fixture under
`../../test/fixtures/a1/`, captured on 2026-09-20. The set repeats the A1
evidence plan so the two candidates can be laid side by side: the same
fixtures, the same states, the same interactions. Every value in them is
invented: no real banking or personally identifying financial data may ever be
placed in this directory (03 §6, AYQ §12).

This directory is not part of the packaged application.

## What A2 changed on screen

- **Accent.** Electric Violet, the jointly accepted three-token ramp (A2
  exchange 006 §8): `#7E5AF0` as fill (active-destination bar, selected-row
  bar, focus ring, chart bars), `#6647E8` for accent text on light, `#9580FF`
  for the primary button's label and the active rail item on the dark ground.
  Electric Mint appears nowhere. A1_PRESENTATION r05 §1/§3 are superseded on
  the accent alone (003 §1; 006 §1); everything else in r05 stands.
- **Rail.** Dark — the one dark neutral the primary button already uses —
  with icon-above-label tiles; the active destination carries a bar of fill
  and a label in the on-dark value; unavailable destinations are muted.
- **Selection.** A neutral wash with a bar of fill on the selected row; hover
  is a lighter wash.
- **Focus.** The fill as a 2 px ring on every focusable element.
- **Keyboard.** The rail is one Tab stop: Up/Down/Home/End move along the
  tiles and open the destination; Esc closes the detail pane.
- **Window.** Never below 1100 × 720. Default size unchanged.
- **Attention tone** deepened from the A1 build value (which measured 4.24:1
  on white) to 5.47:1, so the coverage sentences and the `· limited` marker
  meet text contrast.
- **Chart.** Bars take the fill. Nothing else about the chart changed.

All of it flows from one token module, `src/ui/tokens.ts`; the stylesheet
holds no colour of its own (`test/tokens.test.ts`).

## Capture record

**All thirteen `.png` files are present and were taken from one installed
build.** Each is the real window of the NSIS-installed build, running on
Windows, on the Product Owner's machine. None is a browser rendering, a
dev-server window, a CI rendering or `win-unpacked` used in place of the
installer.

| | |
|---|---|
| platform | Windows 11 Pro 10.0.26200, x64, 3840 × 2160 display at 175 % |
| Node / npm | v24.21.0 / 11.19.0 (Electron 43.4.0 runtime, electron-builder 26.8.1) |
| branch HEAD the installer was built from | `2c4f27fbe918448290e3c0ae0ae50f7c20dcd6be` (`claude/ayq-analyses-a2-foundation`; the installer was packaged from a working tree whose source is byte-identical to that commit — the commit that adds these images and this record changes no source) |
| `npm test` | **100 tests, 100 pass, 0 fail** |
| `npm run typecheck` | pass |
| `npm run build` | pass |
| `npm run package` | pass — NSIS installer produced |
| installer | `release/AYQ Analyses-0.1.0-windows-x64-setup.exe`, 139 215 819 bytes |
| installer SHA-256 | `CD9EE6CD9703ABA43C555E0A47F22D9445E3BBCF9E036EFB47951A1EB73E1B57` |
| installed to | `%LOCALAPPDATA%\Programs\ayq-analyses\AYQ Analyses.exe` (per-user, silent `/S`, exit 0, over the A1 candidate) |
| installed `resources/app.asar` SHA-256 | `B83D98AF9AE503AFBCFF733759A51445A1F876A8EEED504DAA9FE24E05F58E6D` |
| application icon | unchanged: `build/icon.ico` derived from `build/AYQ_ANALYSES.png` (SHA-256 `3f2b6a77…037dc`); not recoloured from the ramp (005) |
| code signing | none configured; the installer is unsigned |

### Capture method, the same for every image

1. The installed executable was launched from its installed path and driven
   through the desktop — its own **Load snapshot…** button, its own Windows
   file dialog with the fixture's full path typed into *File name*, its own
   Comparison select, date inputs, rows, exclusion links, coverage button and
   rail. The desktop was driven by the Claude Code computer-use tooling
   (mouse and keyboard events into the real window); nothing of that tooling
   is a dependency of this package.
2. Each image was written by a 40-line PowerShell script that finds the
   `AYQ Analyses` top-level window by class and title, calls
   `PrintWindow(hwnd, PW_RENDERFULLCONTENT)` on it and trims the result to the
   window's DWM frame bounds. The image is the whole application window at the
   window's physical pixel size, unaffected by any other window on the
   desktop. No crop, no scaling, no retouching. The script is a
   development-time aid kept outside the repository.
3. The window is the application's default size (1360 × 860 logical, 2361 ×
   1497 physical at 175 %). Every image holds the context bar, the headline
   with its scope line, the exclusion line (where the fixture produces one)
   and the first table rows, and 10 and 11 also the detail pane, in one frame.
4. Image 12's period, 1 – 30 June 2025, was typed digit by digit into the
   date inputs (day segment clicked, `0 1 0 6 2 0 2 5`, Enter; then
   `3 0 0 6 2 0 2 5`, Enter), then Comparison set to **Previous period** and
   the body clicked to clear focus.
5. Image 13 was reached **by keyboard**: with the rail's active tile focused,
   one ArrowDown moved to *Fixed costs* and opened it. The focus ring on that
   tile is therefore in the image, as evidence of the one-Tab-stop rail.
6. Image 09 shows the coverage button with its focus ring while the flyout is
   open: opening the flyout returns focus to the button that opened it, and
   the ring is the fill on every focusable element. It was not suppressed.
7. Every fixture loaded is one of the synthetic files under
   `../../test/fixtures/a1/`. No real snapshot was opened at any point.

### What each image shows, as captured

Common to all thirteen: no menu row; the accepted mark in the title bar; the
dark rail with six icon-above-label tiles, *Explore* marked by a violet bar
and a violet label; no Electric Mint and no Fluent default blue anywhere; the
coverage indicator as an outline button with a chevron wherever a snapshot is
loaded.

| # | verified on the installed application |
|---|---|
| 01 | Launch: **No data loaded**, dark **Load snapshot…** button with the on-dark violet label. |
| 02 | `a1-invalid-broken-reversal.json` refused: **This snapshot cannot be read** in the one red; dark **Load another snapshot…** button. |
| 03 | `a1-result.json`, Previous period: **€246.25**; Previous €186.00, Change +€60.25; trigger **Last month**; violet bars; neutral sort arrow. |
| 04 | `a1-coverage-limited.json`: **€115.00**; both coverage sentences and the `· limited` marker in the deepened attention tone. |
| 05 | `a1-empty.json`: **No matching transactions.** |
| 06 | `a1-insufficient.json`: **No data for this period.** with each account's interval. |
| 07 | `a1-comparison-unavailable-currency.json`, Previous period: **€120.00**; *Comparison unavailable — the comparison period is in USD*. |
| 08 | `a1-unsupported-multicurrency.json`: the two-currency sentence; no figure, chart or table. |
| 09 | `a1-reconciliation-difference.json`, flyout open: *Everyday account — Differs from the statement by €15.00*; the button's focus ring in the fill. |
| 10 | `a1-reversal-detail.json`, Superstore selected: the row in the neutral wash with a violet bar; *Reverses 20 Jan 2026, €99.00, Superstore*. |
| 11 | `a1-not-identified.json`, **Counterparty not identified** selected: the two transactions, *No category set* on each. |
| 12 | `a1-result.json`, 1 – 30 Jun 2025 typed, Previous period: trigger **Custom…**; **€30.00**; **Previous: €0.00**, **Change: +€30.00**. |
| 13 | **Fixed costs** reached by ArrowDown from Explore: one centred line, **Not in this version.**; the focused tile ringed in the fill. |

## The evidence plan

Identical to `../a1/README.md` § "The evidence plan, as executed", executed
once more on this candidate.
