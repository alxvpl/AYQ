# A1 installed-application evidence

Thirteen screenshots of the installed Windows application, each reached from a
synthetic fixture under `../../test/fixtures/a1/`, captured on 2026-09-20.
Every value in them is invented: no real banking or personally identifying financial data may ever be
placed in this directory (03 §6, AYQ §12).

This directory is not part of the packaged application. `package.json` ships
only `dist/**/*` and `package.json`, so nothing here reaches an installer.

## Capture record

**All thirteen `.png` files are present.** Each is the real window of the
NSIS-installed build, running on Windows, on the Product Owner's machine
(011 §2, §9; 012 §2). None is a browser rendering, a dev-server window, a CI
rendering or `win-unpacked` used in place of the installer.

| | |
|---|---|
| platform | Windows 11 Pro 10.0.26200, x64, display scale 175 % |
| Node / npm | v24.21.0 / 11.19.0 (Electron 43.4.0 runtime, electron-builder 26.8.1) |
| corrected branch HEAD the installer was built from | `885057628` (`claude/ayq-analyses-a1-correction`; the commit that adds these images and this record changes no source) |
| `npm test` | **84 tests, 84 pass, 0 fail** |
| `npm run typecheck` | pass |
| `npm run build` | pass |
| `npm run package` | pass — NSIS installer produced |
| installer | `release/AYQ Analyses-0.1.0-windows-x64-setup.exe`, 139 022 633 bytes |
| installer SHA-256 | `3F37D87F314B8AD628BE89626FB2AAEF2893C61E74190B4A7CF4FA7AB29DCEBD` |
| installed to | `%LOCALAPPDATA%\Programs\ayq-analyses\AYQ Analyses.exe` (per-user, silent `/S`, exit 0; registered as *AYQ Analyses 0.1.0*, Start-menu shortcut present) |
| installed `resources/app.asar` SHA-256 | `DA8C7E73DE5DC3FA44819E61FD73D5525A6C54CB346FB6964C6678B316FEB37E` |
| code signing | none configured; the installer is unsigned |

### Capture method, the same for every image

1. The installed executable was launched from its installed path and driven
   through the desktop — the application's own **Load snapshot…** button, its
   own Windows file dialog with the fixture's full path typed into *File name*,
   its own Comparison select, date inputs, rows, exclusion links, coverage
   indicator and rail. The desktop was driven by the Claude Code computer-use
   tooling (mouse and keyboard events into the real window); nothing of that
   tooling is a dependency of this package and nothing of it is in the
   installer.
2. Each image was written by a 40-line PowerShell script that takes the main
   window of the `AYQ Analyses` process, calls
   `PrintWindow(hwnd, PW_RENDERFULLCONTENT)` on it and trims the result to the
   window's DWM frame bounds. The image is therefore the whole application
   window — title bar to status bar — at the window's physical pixel size, and
   is unaffected by any other window on the desktop. No crop of a pane, no
   scaling, no retouching. The script is a development-time aid kept outside
   the repository; it reads the window and writes a PNG and does nothing else.
3. The window is the application's default size (1360 × 860 logical, 2361 ×
   1497 physical at 175 %). It was not enlarged; at this size images 03, 10
   and 11 already hold the context bar, the headline with its scope line, the
   exclusion line (where the fixture produces one), the first table rows and,
   in 10 and 11, the detail pane with its rows, all in one frame (012 §2).
4. Every fixture loaded is one of the synthetic files under
   `../../test/fixtures/a1/`. No real snapshot was opened at any point.

### What each image shows, as captured

| # | verified on the installed application |
|---|---|
| 01 | Launch: Explore, **No data loaded**, rail with the five unavailable destinations, empty status bar. |
| 02 | `a1-invalid-broken-reversal.json` refused: **This snapshot cannot be read** with the internal-inconsistency sentence; no result, no status. |
| 03 | `a1-result.json`, Previous period: **€246.25**; Previous €186.00, Change +€60.25; comparison dates 1 Jan – 31 Jan 2026 under the select; both exclusion counts (€100.00 / €33.00); chart and table agree (€120.00 / €107.50 / €18.75). |
| 04 | `a1-coverage-limited.json`: **€115.00** over the requested dates; end-side sentence (Card account through 10 Feb 2026) first, start-side sentence (Everyday account from 5 Feb 2026) second; indicator reads *Data through 10 Feb 2026 · limited*. |
| 05 | `a1-empty.json`: **No matching transactions.** and nothing about reliability. |
| 06 | `a1-insufficient.json`: **No data for this period.** with each account's interval; indicator reads *No data for this period*. |
| 07 | `a1-comparison-unavailable-currency.json`, Previous period: **€120.00** stands; *Comparison unavailable — the comparison period is in USD*. |
| 08 | `a1-unsupported-multicurrency.json`: the two-currency sentence (EUR and USD); no figure, no chart, no table; the exclusion line keeps its count without an amount. |
| 09 | `a1-reconciliation-difference.json`, coverage flyout open: snapshot age, both intervals, *Card account — Matches the statement*, *Everyday account — Differs from the statement by -€15.00* (the exact signed difference, statement minus ledger), and the note beneath. |
| 10 | `a1-reversal-detail.json`, Superstore row: the pane lists the refund at -€99.00 under Superstore with *Reverses 20 Jan 2026, -€99.00, Superstore* and *The original falls outside 1 Feb 2026 – 28 Feb 2026.* |
| 11 | `a1-not-identified.json`, **Counterparty not identified** selected: exactly the two transactions, Counterparty position empty, *No category set* on each. |
| 12 | `a1-result.json`, 1 – 30 Jun 2025, Previous period: **€30.00**; **Previous: €0.00**, **Change: +€30.00**; comparison dates 1 May – 31 May 2025. |
| 13 | **Fixed costs** selected in the rail: one centred line, **Not in this version.** |

The P3 wording for a reversal whose original has no canonical counterparty
(`Reverses {date}, {amount}`) is not reached by any of the thirteen fixtures
and, per 011 §9, has no fourteenth image; it is verified deterministically in
`test/evidence.test.ts`.

### Two defects the installed window showed that the tests could not

Both were fixed at `885057628`, before the images were taken, and are reported
in the pull request so the joint leads can dispose of them:

- the rail and the status bar ended at content height on the empty screens
  (the shell's parent had no height);
- the longest bar's printed figure was clipped at the chart's right edge.

## The evidence plan, as executed

Unless a row says otherwise, the context is the one A1 resets to after a
successful load: period `Last month` resolved against the snapshot's own
`generatedAt` (all fixtures are generated `2026-03-05T06:00:00Z`, so that is
1 – 28 February 2026), comparison `None`, all accounts, all categories
including Uncategorised.

| # | file | fixture | period | accounts | category | comparison | interaction |
|---|---|---|---|---|---|---|---|
| 01 | `01_no_snapshot__none.png` | none | — | — | — | — | Launch the application. It opens on Explore with **No data loaded**. |
| 02 | `02_invalid_snapshot__a1-invalid-broken-reversal.png` | `a1-invalid-broken-reversal.json` | — | — | — | — | **Load snapshot…**, choose the fixture. The snapshot is refused and no analytical result appears. |
| 03 | `03_result__a1-result.png` | `a1-result.json` | 1 – 28 Feb 2026 | all | all | Previous period | Load the fixture, set Comparison to **Previous period**. Headline €246.25, three counterparties, both exclusion counts. |
| 04 | `04_coverage_limited__a1-coverage-limited.png` | `a1-coverage-limited.json` | 1 – 28 Feb 2026 | all | all | None | Load the fixture. The result stands over the requested dates with both the end-side and the start-side sentence. |
| 05 | `05_empty_population__a1-empty.png` | `a1-empty.json` | 1 – 28 Feb 2026 | all | all | None | Load the fixture. **No matching transactions.** and nothing about reliability. |
| 06 | `06_insufficient__a1-insufficient.png` | `a1-insufficient.json` | 1 – 28 Feb 2026 | all | all | None | Load the fixture. **No data for this period.** with each account's coverage interval. |
| 07 | `07_comparison_unavailable__a1-comparison-unavailable-currency.png` | `a1-comparison-unavailable-currency.json` | 1 – 28 Feb 2026 | all | all | Previous period | Load the fixture, set Comparison to **Previous period**. The euro result stands; the comparison states the currency reason. |
| 08 | `08_unsupported__a1-unsupported-multicurrency.png` | `a1-unsupported-multicurrency.json` | 1 – 28 Feb 2026 | all | all | None | Load the fixture. No figure, no chart, no table; the exclusion line keeps its count without an amount. |
| 09 | `09_coverage_flyout_reconciliation_difference__a1-reconciliation-difference.png` | `a1-reconciliation-difference.json` | 1 – 28 Feb 2026 | all | all | None | Load the fixture, open the coverage indicator. One account differs from its statement by -€15.00 (statement minus ledger), with the note beneath. |
| 10 | `10_reversal_detail__a1-reversal-detail.png` | `a1-reversal-detail.json` | 1 – 28 Feb 2026 | all | all | None | Load the fixture, select the **Superstore** row. The refund appears under Superstore, names the original, and says the original falls outside the period. |
| 11 | `11_not_identified_evidence__a1-not-identified.png` | `a1-not-identified.json` | 1 – 28 Feb 2026 | all | all | None | Load the fixture, select **Counterparty not identified**. The pane lists exactly those two transactions, with the Counterparty position left empty. |
| 12 | `12_comparison_zero__a1-result.png` | `a1-result.json` | 1 – 30 Jun 2025 | all | all | Previous period | Load the fixture, set the period to 1 – 30 June 2025 and Comparison to **Previous period**. May 2025 is fully covered and holds nothing: **Previous: €0.00** and **Change: +€30.00**. |
| 13 | `13_not_in_this_version__a1-result.png` | `a1-result.json` | — | — | — | — | Load the fixture, then select **Fixed costs** in the rail. One centred line: **Not in this version.** |

## Expected figures

The exact figures behind rows 03, 04, 12 and the exclusion counts are stated
independently in `../../test/fixtures/a1/truth-manifest.json`, which is
hand-authored from the fixture construction and is what regression case 26
checks the engine against. A screenshot that disagrees with the manifest is a
defect in the application, not in the manifest.
