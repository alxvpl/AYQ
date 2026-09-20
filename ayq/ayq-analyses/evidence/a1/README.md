# A1 installed-application evidence

Thirteen screenshots of the installed Windows application, each reached from a
synthetic fixture under `../../test/fixtures/a1/`, captured on 2026-09-20 from
the final A1 candidate. Every value in them is invented: no real banking or
personally identifying financial data may ever be placed in this directory
(03 §6, AYQ §12).

This directory is not part of the packaged application. `package.json` ships
only `dist/**/*` and `package.json`, so nothing here reaches an installer.

## Capture record

**All thirteen `.png` files are present, and all thirteen were taken from one
installed build — the exact final candidate.** Each is the real window of the
NSIS-installed build, running on Windows, on the Product Owner's machine
(021 §5–§6; 011 §2, §9; 012 §2). None is a browser rendering, a dev-server
window, a CI rendering or `win-unpacked` used in place of the installer. No
image from an earlier candidate survives: the set was recaptured in full after
the last source change.

| | |
|---|---|
| platform | Windows 11 Pro 10.0.26200, x64, 3840 × 2160 display at 175 % |
| Node / npm | v24.21.0 / 11.19.0 (Electron 43.4.0 runtime, electron-builder 26.8.1) |
| branch HEAD the installer was built from | `37deeb7e410fddadce7a146f27fe8f90afdfcff3` (`claude/ayq-analyses-a1-correction`; the commit that adds these images and this record changes no source) |
| `npm test` | **94 tests, 94 pass, 0 fail** |
| `npm run typecheck` | pass |
| `npm run build` | pass |
| `npm run package` | pass — NSIS installer produced |
| installer | `release/AYQ Analyses-0.1.0-windows-x64-setup.exe`, 139 212 955 bytes |
| installer SHA-256 | `8A31A45704D6BBDBA337E7B339C31E4179DF56A277FD8CBFB263E9F07877A38E` |
| installed to | `%LOCALAPPDATA%\Programs\ayq-analyses\AYQ Analyses.exe` (per-user, silent `/S`, exit 0, over the previous candidate; registered as *AYQ Analyses 0.1.0*) |
| installed `resources/app.asar` SHA-256 | `B2D9493E28A196CF3EE7A9A71680E7C2FEC877EAB637A99956C5030535C94D97` (identical to `release/win-unpacked/resources/app.asar`) |
| application icon, accepted source | `build/AYQ_ANALYSES.png`, 1254 × 1254 RGB, 967 192 bytes, SHA-256 `3f2b6a7705a56bdb93752354fc01f05cde4a5b5eca6e167ca69ca7c4166037dc` — the bytes 022 names, verified by hash before use |
| application icon, derived container | `build/icon.ico`, 79 017 bytes, SHA-256 `00ff61685b0855376395128f9fa1ca3f473262372f10b058844a3b2bab473c1b`; sizes 16, 24, 32, 48, 64, 128, 256, each a PNG-compressed opaque entry resized from the source by `build/make-icon.ps1` — no recolour, gradient, redraw or transparency |
| code signing | none configured; the installer is unsigned |

### Capture method, the same for every image

1. The installed executable was launched from its installed path and driven
   through the desktop — the application's own **Load snapshot…** button, its
   own Windows file dialog with the fixture's full path typed into *File name*,
   its own Comparison select, date inputs, rows, exclusion links, coverage
   button and rail. The desktop was driven by the Claude Code computer-use
   tooling (mouse and keyboard events into the real window); nothing of that
   tooling is a dependency of this package and nothing of it is in the
   installer.
2. Each image was written by a 40-line PowerShell script that finds the
   `AYQ Analyses` top-level window by class and title, calls
   `PrintWindow(hwnd, PW_RENDERFULLCONTENT)` on it and trims the result to the
   window's DWM frame bounds. The image is therefore the whole application
   window — title bar to status bar — at the window's physical pixel size, and
   is unaffected by any other window on the desktop. No crop of a pane, no
   scaling, no retouching. The script is a development-time aid kept outside
   the repository; it reads the window and writes a PNG and does nothing else.
3. The window is the application's default size (1360 × 860 logical, 2361 ×
   1497 physical at 175 %). It was not enlarged; at this size every image holds
   the context bar, the headline with its scope line, the exclusion line
   (where the fixture produces one) and the first table rows, and 10 and 11
   also the detail pane with its rows, all in one frame (021 §5; 012 §2).
4. Before each capture no control held keyboard focus, so no native focus
   or segment-selection highlight of a date input is in any image (the
   selection highlight of a Chromium date segment is the control's own and
   is not an application token). Where a select had just been used, the
   empty body of the screen was clicked first.
5. Every fixture loaded is one of the synthetic files under
   `../../test/fixtures/a1/`. No real snapshot was opened at any point.

### Image 12 — how the dates were entered

The period 1 – 30 June 2025 was entered with ordinary typing, digit by digit,
into the application's own date inputs (r05 §5, PC6c): the day segment of the
*from* input was clicked and `0 1 0 6 2 0 2 5` typed, one key at a time, the
input advancing from day to month to year as Chromium does; then Enter. The
same for the *to* input with `3 0 0 6 2 0 2 5`, then Enter. Each field became
the context's only on Enter (blur commits the same way); no keystroke reached
the context, and the field showed every intermediate value while it was typed.
No arrow-key stepping, no paste and no programmatic value was used. Comparison
was then set to **Previous period** with the select, and the body clicked to
clear focus before capture.

### What each image shows, as captured

Common to all thirteen: **no menu row** under the title bar; the accepted
mark in the title bar (and, on the desktop at the time, in the taskbar);
no Fluent default blue anywhere — the primary button is dark with mint text
(01, 02), focus and selection are mint; the coverage indicator is a visible
outline button with a trailing chevron (03 – 13 wherever a snapshot is
loaded).

| # | verified on the installed application |
|---|---|
| 01 | Launch: Explore, **No data loaded**, dark **Load snapshot…** button with mint text, rail with the five unavailable destinations, empty status bar. |
| 02 | `a1-invalid-broken-reversal.json` refused: **This snapshot cannot be read** with the internal-inconsistency sentence; dark **Load another snapshot…** button; no result, no status. |
| 03 | `a1-result.json`, Previous period: **€246.25**; Previous €186.00, Change +€60.25; the preset trigger reads **Last month** and no second copy of the range is printed beside the dates; comparison dates 1 Jan – 31 Jan 2026 under the select; both exclusion counts (€100.00 / €33.00); chart and table agree (€120.00 / €107.50 / €18.75); the sort arrow beside *Money out* is in the column's own ink (neutral). |
| 04 | `a1-coverage-limited.json`: **€115.00** over the requested dates; end-side sentence (Card account through 10 Feb 2026) first, start-side sentence (Everyday account from 5 Feb 2026) second; the coverage button reads *Data through 10 Feb 2026 · limited* with the date in the ordinary foreground and ` · limited` in the attention tone. |
| 05 | `a1-empty.json`: **No matching transactions.** and nothing about reliability. |
| 06 | `a1-insufficient.json`: **No data for this period.** with each account's interval; the coverage button reads *No data for this period*. |
| 07 | `a1-comparison-unavailable-currency.json`, Previous period: **€120.00** stands; *Comparison unavailable — the comparison period is in USD*. |
| 08 | `a1-unsupported-multicurrency.json`: the two-currency sentence (EUR and USD); no figure, no chart, no table; the exclusion line keeps its count without an amount. |
| 09 | `a1-reconciliation-difference.json`, coverage flyout open: snapshot age, both intervals, *Card account — Matches the statement*, *Everyday account — Differs from the statement by €15.00* (the magnitude; the signed difference stays in the structured result), and the note beneath. |
| 10 | `a1-reversal-detail.json`, Superstore row: the pane lists the refund at -€99.00 under Superstore with *Reverses 20 Jan 2026, €99.00, Superstore* (the original's own positive money-out) and *The original falls outside 1 Feb 2026 – 28 Feb 2026.*; the Amount column is right-aligned and every column shares one set of edges with the header. |
| 11 | `a1-not-identified.json`, **Counterparty not identified** selected: exactly the two transactions, Counterparty position empty, *No category set* on each; no column runs into its neighbour. |
| 12 | `a1-result.json`, 1 – 30 Jun 2025 typed as described above, Previous period: the trigger reads **Custom…**; **€30.00**; **Previous: €0.00**, **Change: +€30.00**; comparison dates 1 May – 31 May 2025. |
| 13 | **Fixed costs** selected in the rail: one centred line, **Not in this version.** |

The P3 wording for a reversal whose original has no canonical counterparty
(`Reverses {date}, {amount}`) is not reached by any of the thirteen fixtures
and, per 011 §9, has no fourteenth image; it is verified deterministically in
`test/evidence.test.ts`.

### Two defects the installed window showed that the tests could not

Both were seen on the candidate built at `a37220c88`, fixed at `37deeb7e4`,
and the whole set of images was then taken from the build of `37deeb7e4`:

- the coverage button lost the space before `· limited` — the button's flex
  layout put the date and the marker into separate items — so the label is
  now one inline run (`coverage.tsx`, `styles.css`);
- the detail pane's five columns were sized per row, so the header and the
  rows did not share column edges; the date and amount tracks are now fixed
  and the three text columns split the rest (`styles.css`).

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
| 09 | `09_coverage_flyout_reconciliation_difference__a1-reconciliation-difference.png` | `a1-reconciliation-difference.json` | 1 – 28 Feb 2026 | all | all | None | Load the fixture, open the coverage button. One account differs from its statement by €15.00, with the note beneath. |
| 10 | `10_reversal_detail__a1-reversal-detail.png` | `a1-reversal-detail.json` | 1 – 28 Feb 2026 | all | all | None | Load the fixture, select the **Superstore** row. The refund appears under Superstore, names the original by date, positive amount and counterparty, and says the original falls outside the period. |
| 11 | `11_not_identified_evidence__a1-not-identified.png` | `a1-not-identified.json` | 1 – 28 Feb 2026 | all | all | None | Load the fixture, select **Counterparty not identified**. The pane lists exactly those two transactions, with the Counterparty position left empty. |
| 12 | `12_comparison_zero__a1-result.png` | `a1-result.json` | 1 – 30 Jun 2025 | all | all | Previous period | Load the fixture, type the period 1 – 30 June 2025 digit by digit into the date inputs (see above) and set Comparison to **Previous period**. May 2025 is fully covered and holds nothing: **Previous: €0.00** and **Change: +€30.00**. |
| 13 | `13_not_in_this_version__a1-result.png` | `a1-result.json` | — | — | — | — | Load the fixture, then select **Fixed costs** in the rail. One centred line: **Not in this version.** |

## Expected figures

The exact figures behind rows 03, 04, 12 and the exclusion counts are stated
independently in `../../test/fixtures/a1/truth-manifest.json`, which is
hand-authored from the fixture construction and is what regression case 26
checks the engine against. A screenshot that disagrees with the manifest is a
defect in the application, not in the manifest.
